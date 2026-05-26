import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Sun, Moon, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { customerApi } from '../lib/api';
import type { CustomerLink } from '../lib/api';
import type { Proposal, PartType } from '../types';
import { parseLayout } from '../types/layout';
import clsx from 'clsx';

const THEME_KEY = 'customer_theme';

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };
function makeFmt(currency: string) {
  const sym = CURRENCY_SYMBOLS[currency] ?? '£';
  return (n: number) => `${sym}${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function calcTotals(proposal: Proposal) {
  const rawByType: Record<PartType, number> = { Hardware: 0, Software: 0, Monthly: 0, Annual: 0 };
  proposal.parts.forEach(p => {
    const t = (p.partType ?? 'Hardware') as PartType;
    rawByType[t] += p.unitPrice * p.quantity;
  });

  // Distribute markup silently into hardware/software — never expose % to customer
  const markupMult = 1 + (proposal.markupPct / 100);
  const byType: Record<PartType, number> = {
    Hardware: rawByType.Hardware * markupMult,
    Software: rawByType.Software * markupMult,
    Monthly:  rawByType.Monthly,
    Annual:   rawByType.Annual,
  };

  let consultSell = 0;
  proposal.phases.forEach(ph => ph.tasks.forEach(t => {
    consultSell += t.days * t.dayRate * (t.rateMultiplier ?? 1);
  }));
  const pm = consultSell * 0.2;
  const consultTotal = consultSell + pm;

  // Apply consultancy discount if set
  const discType = proposal.consultancyDiscountType;
  const discAmt  = proposal.consultancyDiscountAmount ?? 0;
  let consultDiscountValue = 0;
  if (discAmt > 0 && discType && consultTotal > 0) {
    consultDiscountValue = discType === 'monetary'
      ? Math.min(discAmt, consultTotal)
      : consultTotal * (discAmt / 100);
  }
  const consultNet = consultTotal - consultDiscountValue;

  const upfrontNet = byType.Hardware + byType.Software + consultNet;
  const grandTotal = upfrontNet; // excludes recurring (shown separately)

  return { byType, consultSell, pm, consultTotal, consultDiscountValue, consultNet, upfrontNet, grandTotal };
}

const TYPE_LABELS: [PartType, string][] = [
  ['Hardware', 'Hardware'],
  ['Software', 'Software'],
  ['Monthly',  'Monthly Subscriptions'],
  ['Annual',   'Annual Subscriptions'],
];

interface SignFormData { signerName: string; notes: string }

export function CustomerProposalView() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [proposal, setProposal]   = useState<Proposal | null>(null);
  const [link, setLink]           = useState<CustomerLink | null>(null);
  const [layoutRaw, setLayoutRaw] = useState<string | undefined>(undefined);
  const [branding, setBranding]   = useState<{ logoB64: string | null; primaryColor: string; companyName: string }>({
    logoB64: null, primaryColor: '#2B3990', companyName: 'MSP SalesPro',
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem(THEME_KEY) === 'dark');
  const [signForm, setSignForm] = useState<SignFormData>({ signerName: '', notes: '' });
  const [signing, setSigning]   = useState(false);
  const [signError, setSignError]   = useState<string | null>(null);
  const [signResult, setSignResult] = useState<{ status: string; signedAt: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    customerApi.getPublic(token)
      .then(({ proposal: p, link: l, layoutRaw: lr, branding: b }) => {
        setProposal(p); setLink(l);
        if (lr !== undefined) setLayoutRaw(lr);
        if (b) setBranding(b);
        if (!localStorage.getItem(THEME_KEY)) setDarkMode(l.defaultTheme === 'dark');
      })
      .catch(() => setError('This link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  const toggleTheme = () => setDarkMode(d => {
    const next = !d;
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    return next;
  });

  const handleSign = async (status: 'approved' | 'rejected') => {
    if (!token) return;
    if (!signForm.signerName.trim()) { setSignError('Please enter your name before signing.'); return; }
    setSigning(true); setSignError(null);
    try {
      await customerApi.sign(token, { status, notes: signForm.notes, signerName: signForm.signerName });
      setSignResult({ status, signedAt: new Date().toISOString() });
      if (link) setLink({ ...link, approvalStatus: status, signedAt: new Date().toISOString(), signedByName: signForm.signerName });
    } catch { setSignError('Failed to submit your response. Please try again.'); }
    finally { setSigning(false); }
  };

  // ─── Theme tokens ────────────────────────────────────────────────────────────
  const bg    = darkMode ? 'bg-slate-900 text-slate-100' : 'bg-gray-50 text-gray-900';
  const card  = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const th    = darkMode ? 'text-slate-400 border-slate-700' : 'text-gray-400 border-gray-200';
  const divider = darkMode ? 'divide-slate-700' : 'divide-gray-100';
  const rowHover = darkMode ? 'hover:bg-slate-700/40' : 'hover:bg-gray-50';
  const subHead  = darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-gray-50 text-gray-600';

  if (loading) return (
    <div className={clsx('min-h-screen flex items-center justify-center', bg)}>
      <Loader2 size={32} className="animate-spin text-brand-500" />
    </div>
  );

  if (error || !proposal || !link) return (
    <div className={clsx('min-h-screen flex items-center justify-center', bg)}>
      <div className="text-center p-8">
        <XCircle size={48} className="text-red-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Link Not Found</h1>
        <p className={clsx('text-sm', muted)}>{error ?? 'This proposal link is invalid or has expired.'}</p>
      </div>
    </div>
  );

  const totals  = calcTotals(proposal);
  const fmt     = makeFmt(proposal.currency);
  const layout  = parseLayout(layoutRaw);
  const primary = layout.header.primaryColor ?? branding.primaryColor;
  const companyName = layout.header.companyName ?? branding.companyName;
  const logo    = layout.header.showLogo ? branding.logoB64 : null;
  const visibleSections = layout.sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);

  return (
    <div className={clsx('min-h-screen', bg)}>

      {/* ── Top header bar ─────────────────────────────────────────────────── */}
      <header className={clsx('border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10', card)}>
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt={companyName} className="h-8 object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: primary }}>
              <span className="text-white font-bold text-xs">{companyName.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          <div>
            <div className="font-bold text-sm">{companyName}</div>
            <div className={clsx('text-xs', muted)}>{layout.header.tagline ?? 'Proposal Review'}</div>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className={clsx('p-2 rounded-lg border transition-colors', darkMode ? 'border-slate-600 hover:bg-slate-700' : 'border-gray-300 hover:bg-gray-100')}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* ── Already-signed banner ──────────────────────────────────────────── */}
        {link.approvalStatus !== 'pending' && (
          <div className={clsx(
            'rounded-xl border p-4 flex items-start gap-3',
            link.approvalStatus === 'approved'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800',
          )}>
            {link.approvalStatus === 'approved'
              ? <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
              : <XCircle    size={20} className="text-red-500 flex-shrink-0 mt-0.5" />}
            <div>
              <div className="font-semibold capitalize">{link.approvalStatus}</div>
              {link.signedByName && <div className="text-sm mt-0.5">Signed by {link.signedByName}</div>}
              {link.signedAt     && <div className="text-xs mt-0.5 opacity-75">{fmtDate(link.signedAt)}</div>}
              {link.signerNotes  && <div className="text-sm mt-2 italic">"{link.signerNotes}"</div>}
            </div>
          </div>
        )}

        {/* ── Layout-driven sections ─────────────────────────────────────────── */}
        {visibleSections.map(section => {
          switch (section.id) {

            // ── Cover ───────────────────────────────────────────────────────
            case 'cover':
              return (
                <div key="cover" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  {/* Coloured accent strip at top */}
                  <div className="h-1.5 w-full" style={{ backgroundColor: primary }} />
                  <div className="p-6 flex items-start gap-5">
                    {logo && (
                      <img src={logo} alt={companyName} className="h-14 object-contain flex-shrink-0 mt-1" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h1 className="text-2xl font-bold mb-1 leading-tight">{proposal.projectName}</h1>
                      <div className={clsx('text-sm mb-3', muted)}>
                        Prepared for <span className="font-medium text-inherit">{proposal.client}</span>
                        {proposal.clientContact && ` · ${proposal.clientContact}`}
                      </div>
                      <div className={clsx('grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm pt-3 border-t', darkMode ? 'border-slate-700' : 'border-gray-100')}>
                        {proposal.accountManager && (
                          <>
                            <span className={muted}>Account Manager</span>
                            <span className="font-medium">{proposal.accountManager}</span>
                          </>
                        )}
                        {proposal.ticketRef && (
                          <>
                            <span className={muted}>Reference</span>
                            <span className="font-medium">{proposal.ticketRef}</span>
                          </>
                        )}
                        <span className={muted}>Date</span>
                        <span className="font-medium">
                          {new Date(proposal.dateCreated).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </span>
                        <span className={muted}>Currency</span>
                        <span className="font-medium">{proposal.currency}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );

            // ── Executive Summary ────────────────────────────────────────────
            case 'summary':
              if (!proposal.objectives && !proposal.businessRequirements && !proposal.justification) return null;
              return (
                <div key="summary" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className={clsx('px-6 py-3 border-b text-sm font-semibold', th)}>Executive Summary</div>
                  <div className="px-6 py-4 space-y-4">
                    {proposal.objectives && (
                      <div>
                        <div className={clsx('text-xs font-semibold uppercase tracking-wide mb-1', muted)}>Objectives</div>
                        <p className="text-sm leading-relaxed">{proposal.objectives}</p>
                      </div>
                    )}
                    {proposal.businessRequirements && (
                      <div>
                        <div className={clsx('text-xs font-semibold uppercase tracking-wide mb-1', muted)}>Business Requirements</div>
                        <p className="text-sm leading-relaxed">{proposal.businessRequirements}</p>
                      </div>
                    )}
                    {proposal.justification && (
                      <div>
                        <div className={clsx('text-xs font-semibold uppercase tracking-wide mb-1', muted)}>Justification</div>
                        <p className="text-sm leading-relaxed">{proposal.justification}</p>
                      </div>
                    )}
                    {proposal.constraints && (
                      <div>
                        <div className={clsx('text-xs font-semibold uppercase tracking-wide mb-1', muted)}>Constraints</div>
                        <p className="text-sm leading-relaxed">{proposal.constraints}</p>
                      </div>
                    )}
                    {proposal.assumptions && (
                      <div>
                        <div className={clsx('text-xs font-semibold uppercase tracking-wide mb-1', muted)}>Assumptions</div>
                        <p className="text-sm leading-relaxed">{proposal.assumptions}</p>
                      </div>
                    )}
                  </div>
                </div>
              );

            // ── Commercial Summary + Bill of Materials ───────────────────────
            case 'commercial': {
              const hasParts = proposal.parts.length > 0;
              return (
                <div key="commercial" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className={clsx('px-6 py-3 border-b text-sm font-semibold', th)}>Commercial Summary</div>

                  {/* Category summary table */}
                  <div className="px-6 pt-4 pb-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={clsx('border-b', darkMode ? 'border-slate-700' : 'border-gray-200')}>
                          <th className={clsx('text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wide', th)}>Category</th>
                          <th className={clsx('text-right py-2 text-xs font-semibold uppercase tracking-wide', th)}>Total</th>
                        </tr>
                      </thead>
                      <tbody className={clsx('divide-y', divider)}>
                        {TYPE_LABELS.map(([type, label]) => {
                          const val = totals.byType[type];
                          if (!val) return null;
                          const isRecurring = type === 'Monthly' || type === 'Annual';
                          const suffix = type === 'Monthly' ? '/mo' : type === 'Annual' ? '/yr' : '';
                          return (
                            <tr key={type} className={rowHover}>
                              <td className="py-2.5 pr-4">{label}</td>
                              <td className="py-2.5 text-right font-medium">
                                {fmt(val)}{suffix}
                                {isRecurring && <span className={clsx('ml-1 text-xs', muted)}>(recurring)</span>}
                              </td>
                            </tr>
                          );
                        })}
                        {totals.consultNet > 0 && (
                          <tr className={rowHover}>
                            <td className="py-2.5 pr-4">Professional Services</td>
                            <td className="py-2.5 text-right font-medium">{fmt(totals.consultNet)}</td>
                          </tr>
                        )}
                        {totals.consultDiscountValue > 0 && (
                          <tr className={rowHover}>
                            <td className={clsx('py-2 pr-4 text-sm italic', muted)}>
                              Consultancy discount
                              {proposal.consultancyDiscountType === 'percentage' ? ` (${proposal.consultancyDiscountAmount}%)` : ''}
                            </td>
                            <td className="py-2 text-right text-sm text-red-500">−{fmt(totals.consultDiscountValue)}</td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className={clsx('border-t', darkMode ? 'border-slate-600' : 'border-gray-300')}>
                          <td className={clsx('pt-3 pb-1.5 pr-4 text-sm', muted)}>Net Total (excl. VAT)</td>
                          <td className={clsx('pt-3 pb-1.5 text-right text-sm', muted)}>{fmt(totals.grandTotal)}</td>
                        </tr>
                        <tr>
                          <td className={clsx('py-1.5 pr-4 text-sm', muted)}>VAT (20%)</td>
                          <td className={clsx('py-1.5 text-right text-sm', muted)}>{fmt(totals.grandTotal * 0.20)}</td>
                        </tr>
                        <tr className={clsx('border-t font-bold', darkMode ? 'border-slate-600' : 'border-gray-300')}>
                          <td className="pt-3 pb-2 pr-4">Total (incl. VAT)</td>
                          <td className="pt-3 pb-2 text-right text-base" style={{ color: primary }}>{fmt(totals.grandTotal * 1.20)}</td>
                        </tr>
                        {(totals.byType.Monthly > 0 || totals.byType.Annual > 0) && (
                          <tr>
                            <td colSpan={2} className={clsx('pb-2 text-xs', muted)}>
                              * Recurring costs above are shown net of VAT and excluded from the total
                            </td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  </div>

                  {/* Bill of Materials — grouped by type */}
                  {hasParts && (
                    <div className={clsx('border-t mt-2', darkMode ? 'border-slate-700' : 'border-gray-200')}>
                      <div className={clsx('px-6 py-2.5 text-xs font-semibold uppercase tracking-wide', muted)}>
                        Bill of Materials
                      </div>
                      {TYPE_LABELS.map(([type, label]) => {
                        const items = proposal.parts.filter(p => (p.partType ?? 'Hardware') === type);
                        if (items.length === 0) return null;
                        const typeTotal = items.reduce((s, p) => s + p.unitPrice * p.quantity, 0);
                        return (
                          <div key={type}>
                            {/* Type sub-header */}
                            <div className={clsx('px-6 py-2 text-xs font-semibold flex items-center justify-between', subHead)}>
                              <span>{label}</span>
                              <span>{fmt(typeTotal)}{type === 'Monthly' ? '/mo' : type === 'Annual' ? '/yr' : ''}</span>
                            </div>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className={clsx('text-xs', th)}>
                                  <th className="px-6 py-2 text-left font-medium">Description</th>
                                  <th className="px-4 py-2 text-left font-medium hidden sm:table-cell">SKU</th>
                                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                                  <th className="px-6 py-2 text-right font-medium">Unit</th>
                                  <th className="px-6 py-2 text-right font-medium">Total</th>
                                </tr>
                              </thead>
                              <tbody className={clsx('divide-y', divider)}>
                                {items.map(p => (
                                  <tr key={p.id} className={rowHover}>
                                    <td className="px-6 py-2.5 font-medium">{p.description}</td>
                                    <td className={clsx('px-4 py-2.5 hidden sm:table-cell', muted)}>{p.sku ?? '—'}</td>
                                    <td className="px-4 py-2.5 text-right">{p.quantity}</td>
                                    <td className={clsx('px-6 py-2.5 text-right', muted)}>{fmt(p.unitPrice)}</td>
                                    <td className="px-6 py-2.5 text-right font-semibold">{fmt(p.unitPrice * p.quantity)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // ── Professional Services — phase/task breakdown ─────────────────
            case 'consultancy': {
              if (proposal.phases.length === 0) return null;
              const phasesWithTasks = proposal.phases.filter(ph => ph.tasks.length > 0);
              if (phasesWithTasks.length === 0) return null;

              const grandConsult = phasesWithTasks.reduce((s, ph) =>
                s + ph.tasks.reduce((ts, t) => ts + t.days * t.dayRate * (t.rateMultiplier ?? 1), 0), 0
              );
              const pmTotal = grandConsult * 0.2;

              return (
                <div key="consultancy" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className={clsx('px-6 py-3 border-b text-sm font-semibold', th)}>Professional Services</div>

                  {phasesWithTasks.map((phase, pi) => {
                    const phaseTotal = phase.tasks.reduce((s, t) => s + t.days * t.dayRate * (t.rateMultiplier ?? 1), 0);
                    return (
                      <div key={phase.id} className={clsx(pi > 0 ? 'border-t' : '', darkMode ? 'border-slate-700' : 'border-gray-200')}>
                        {/* Phase header */}
                        <div className={clsx('px-6 py-2.5 flex items-center justify-between', subHead)}>
                          <span className="text-xs font-semibold">{phase.name}</span>
                          <span className="text-xs font-semibold">{fmt(phaseTotal)}</span>
                        </div>
                        {/* Tasks */}
                        <table className="w-full text-sm">
                          <thead>
                            <tr className={clsx('text-xs', th)}>
                              <th className="px-6 py-2 text-left font-medium">Task</th>
                              <th className="px-4 py-2 text-left font-medium hidden sm:table-cell">Role</th>
                              <th className="px-6 py-2 text-right font-medium">Value</th>
                            </tr>
                          </thead>
                          <tbody className={clsx('divide-y', divider)}>
                            {phase.tasks.map(task => {
                              const value = task.days * task.dayRate * (task.rateMultiplier ?? 1);
                              return (
                                <tr key={task.id} className={rowHover}>
                                  <td className="px-6 py-2.5 font-medium">{task.name}</td>
                                  <td className={clsx('px-4 py-2.5 hidden sm:table-cell', muted)}>{task.role}</td>
                                  <td className="px-6 py-2.5 text-right font-semibold">{fmt(value)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}

                  {/* Totals footer */}
                  <div className={clsx('border-t px-6 py-3 space-y-1.5', darkMode ? 'border-slate-700' : 'border-gray-200')}>
                    <div className={clsx('flex justify-between text-sm', muted)}>
                      <span>Project Management (20%)</span>
                      <span>{fmt(pmTotal)}</span>
                    </div>
                    {totals.consultDiscountValue > 0 && (
                      <div className={clsx('flex justify-between text-sm', muted)}>
                        <span className="italic">
                          Discount{proposal.consultancyDiscountType === 'percentage' ? ` (${proposal.consultancyDiscountAmount}%)` : ''}
                        </span>
                        <span className="text-red-500">−{fmt(totals.consultDiscountValue)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold">
                      <span>Total Professional Services</span>
                      <span style={{ color: primary }}>{fmt(totals.consultNet)}</span>
                    </div>
                  </div>
                </div>
              );
            }

            // ── Billing Milestones ───────────────────────────────────────────
            case 'milestones':
              if (!proposal.milestones || proposal.milestones.length === 0) return null;
              return (
                <div key="milestones" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className={clsx('px-6 py-3 border-b text-sm font-semibold', th)}>Billing Milestones</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={clsx('border-b', darkMode ? 'border-slate-700' : 'border-gray-100')}>
                        <th className={clsx('text-left px-6 py-2.5 text-xs font-semibold uppercase tracking-wide', th)}>Milestone</th>
                        <th className={clsx('text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide', th)}>Due Date</th>
                        <th className={clsx('text-right px-6 py-2.5 text-xs font-semibold uppercase tracking-wide', th)}>Amount</th>
                      </tr>
                    </thead>
                    <tbody className={clsx('divide-y', divider)}>
                      {proposal.milestones.map((m, i) => (
                        <tr key={i} className={rowHover}>
                          <td className="px-6 py-2.5">{m.name}</td>
                          <td className={clsx('px-4 py-2.5 text-right', muted)}>{m.dueDate ?? '—'}</td>
                          <td className="px-6 py-2.5 text-right font-semibold">{fmt(totals.grandTotal * (m.percentage / 100))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );

            // ── Statement of Work ────────────────────────────────────────────
            case 'sow':
              if (!proposal.sowContent) return null;
              return (
                <div key="sow" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className={clsx('px-6 py-3 border-b text-sm font-semibold', th)}>Statement of Work</div>
                  <div className="px-6 py-4">
                    <pre className={clsx('text-sm whitespace-pre-wrap font-sans leading-relaxed', muted)}>
                      {proposal.sowContent}
                    </pre>
                  </div>
                </div>
              );

            // ── Terms & Conditions ───────────────────────────────────────────
            case 'terms':
              if (!section.content) return null;
              return (
                <div key="terms" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className={clsx('px-6 py-3 border-b text-sm font-semibold', th)}>Terms &amp; Conditions</div>
                  <div className="px-6 py-4">
                    <pre className={clsx('text-sm whitespace-pre-wrap font-sans leading-relaxed', muted)}>
                      {section.content}
                    </pre>
                  </div>
                </div>
              );

            default: return null;
          }
        })}

        {/* ── Sign-off form ──────────────────────────────────────────────────── */}
        {link.approvalStatus === 'pending' && !signResult && (
          <div className={clsx('rounded-2xl border overflow-hidden', card)}>
            <div className="px-6 py-4" style={{ background: `linear-gradient(135deg, ${primary}ee, ${primary}99)` }}>
              <div className="text-white font-bold text-base">Sign off this Proposal</div>
              <div className="text-white/70 text-xs mt-0.5">
                Review the proposal above and approve or reject below. Your response will be recorded.
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              {signError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{signError}</div>
              )}
              <div>
                <label className={clsx('block text-sm font-medium mb-1', darkMode ? 'text-slate-300' : 'text-gray-700')}>
                  Your name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={clsx(
                    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500',
                    darkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900',
                  )}
                  placeholder="Full name"
                  value={signForm.signerName}
                  onChange={e => setSignForm(f => ({ ...f, signerName: e.target.value }))}
                />
              </div>
              <div>
                <label className={clsx('block text-sm font-medium mb-1', darkMode ? 'text-slate-300' : 'text-gray-700')}>
                  Notes / comments (optional)
                </label>
                <textarea
                  rows={3}
                  className={clsx(
                    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none',
                    darkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900',
                  )}
                  placeholder="Any comments or conditions..."
                  value={signForm.notes}
                  onChange={e => setSignForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleSign('approved')}
                  disabled={signing}
                  className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {signing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                  Approve
                </button>
                <button
                  onClick={() => handleSign('rejected')}
                  disabled={signing}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {signing ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Sign result ────────────────────────────────────────────────────── */}
        {signResult && (
          <div className={clsx(
            'rounded-2xl border p-6 text-center',
            signResult.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200',
          )}>
            {signResult.status === 'approved'
              ? <CheckCircle size={40} className="text-green-600 mx-auto mb-3" />
              : <XCircle    size={40} className="text-red-500 mx-auto mb-3" />}
            <div className="font-bold text-lg capitalize mb-1">{signResult.status}</div>
            <div className="text-sm text-gray-600">
              Your response has been recorded at {fmtDate(signResult.signedAt)}.
            </div>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div className={clsx('text-center text-xs py-4 flex items-center justify-center gap-3', muted)}>
          {logo && <img src={logo} alt={companyName} className="h-4 object-contain opacity-50" />}
          <span>
            {layout.footer.text
              ? layout.footer.text
              : `${companyName} · This proposal is for ${proposal.client} only`}
            {layout.footer.showDate && (
              <span className="ml-2">· {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            )}
          </span>
        </div>

      </main>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Sun, Moon, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { customerApi } from '../lib/api';
import type { CustomerLink } from '../lib/api';
import type { Proposal } from '../types';
import { parseLayout } from '../types/layout';
import clsx from 'clsx';

const THEME_KEY = 'customer_theme';

function fmt(n: number) {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function calcTotals(proposal: Proposal) {
  let partsSell = 0;
  proposal.parts.forEach(p => { partsSell += p.unitPrice * p.quantity; });
  let consultSell = 0;
  proposal.phases.forEach(ph => ph.tasks.forEach(t => {
    consultSell += t.days * t.dayRate * (t.rateMultiplier ?? 1);
  }));
  const markup = partsSell * (proposal.markupPct / 100);
  const pm = consultSell * 0.2;
  const grandTotal = partsSell + markup + consultSell + pm;
  return { partsSell, markup, consultSell, pm, grandTotal };
}

interface SignFormData {
  signerName: string;
  notes: string;
}

export function CustomerProposalView() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [link, setLink] = useState<CustomerLink | null>(null);
  const [layoutRaw, setLayoutRaw] = useState<string | undefined>(undefined);
  const [branding, setBranding] = useState<{ logoB64: string | null; primaryColor: string; companyName: string }>({
    logoB64: null, primaryColor: '#2B3990', companyName: 'ITRM',
  });

  // Theme
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem(THEME_KEY) === 'dark';
  });

  // Sign form
  const [signForm, setSignForm] = useState<SignFormData>({ signerName: '', notes: '' });
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signResult, setSignResult] = useState<{ status: string; signedAt: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    customerApi.getPublic(token)
      .then(({ proposal: p, link: l, layoutRaw: lr, branding: b }) => {
        setProposal(p);
        setLink(l);
        if (lr !== undefined) setLayoutRaw(lr);
        if (b) setBranding(b);
        // Set theme from link default if not already stored
        if (!localStorage.getItem(THEME_KEY)) {
          setDarkMode(l.defaultTheme === 'dark');
        }
      })
      .catch(() => setError('This link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  const toggleTheme = () => {
    setDarkMode(d => {
      const next = !d;
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
      return next;
    });
  };

  const handleSign = async (status: 'approved' | 'rejected') => {
    if (!token) return;
    if (!signForm.signerName.trim()) {
      setSignError('Please enter your name before signing.');
      return;
    }
    setSigning(true);
    setSignError(null);
    try {
      await customerApi.sign(token, {
        status,
        notes: signForm.notes,
        signerName: signForm.signerName,
      });
      setSignResult({ status, signedAt: new Date().toISOString() });
      // Refresh link state
      if (link) setLink({ ...link, approvalStatus: status, signedAt: new Date().toISOString(), signedByName: signForm.signerName });
    } catch {
      setSignError('Failed to submit your response. Please try again.');
    } finally {
      setSigning(false);
    }
  };

  const bg = darkMode ? 'bg-slate-900 text-slate-100' : 'bg-gray-50 text-gray-900';
  const card = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const th = darkMode ? 'text-slate-400 border-slate-700' : 'text-gray-400 border-gray-200';

  if (loading) {
    return (
      <div className={clsx('min-h-screen flex items-center justify-center', bg)}>
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  if (error || !proposal || !link) {
    return (
      <div className={clsx('min-h-screen flex items-center justify-center', bg)}>
        <div className="text-center p-8">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Link Not Found</h1>
          <p className={clsx('text-sm', muted)}>{error ?? 'This proposal link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  const totals = calcTotals(proposal);
  const layout = parseLayout(layoutRaw);
  const visibleSections = layout.sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);

  // Resolved branding values (layout overrides branding settings)
  const headerColor = layout.header.primaryColor ?? branding.primaryColor;
  const companyName = layout.header.companyName ?? branding.companyName;

  return (
    <div className={clsx('min-h-screen', bg)}>
      {/* Header */}
      <header className={clsx('border-b px-6 py-4 flex items-center justify-between', card)}>
        <div className="flex items-center gap-3">
          {layout.header.showLogo && branding.logoB64 ? (
            <img src={branding.logoB64} alt={companyName} className="h-8 object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: headerColor }}>
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

        {/* Signed banner */}
        {link.approvalStatus !== 'pending' && (
          <div className={clsx(
            'rounded-xl border p-4 flex items-start gap-3',
            link.approvalStatus === 'approved'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          )}>
            {link.approvalStatus === 'approved'
              ? <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
              : <XCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            }
            <div>
              <div className="font-semibold capitalize">{link.approvalStatus}</div>
              {link.signedByName && <div className="text-sm mt-0.5">Signed by {link.signedByName}</div>}
              {link.signedAt && <div className="text-xs mt-0.5 opacity-75">{fmtDate(link.signedAt)}</div>}
              {link.signerNotes && <div className="text-sm mt-2 italic">"{link.signerNotes}"</div>}
            </div>
          </div>
        )}

        {/* Sections driven by layout */}
        {visibleSections.map(section => {
          switch (section.id) {
            case 'cover':
              return (
                <div key="cover" className={clsx('rounded-2xl border p-6', card)}>
                  <h1 className="text-2xl font-bold mb-1">{proposal.projectName}</h1>
                  <div className={clsx('text-sm', muted)}>
                    {proposal.client}
                    {proposal.accountManager && ` · Account Manager: ${proposal.accountManager}`}
                  </div>
                  {proposal.ticketRef && (
                    <div className={clsx('text-xs mt-1', muted)}>Reference: {proposal.ticketRef}</div>
                  )}
                </div>
              );

            case 'summary':
              if (!proposal.objectives && !proposal.businessRequirements && !proposal.justification) return null;
              return (
                <div key="summary" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className="px-6 py-3 border-b font-semibold text-sm" style={{ borderColor: 'inherit' }}>
                    <span className={th}>Executive Summary</span>
                  </div>
                  <div className="px-6 py-4 space-y-4">
                    {proposal.objectives && (
                      <div>
                        <div className={clsx('text-xs font-semibold uppercase tracking-wide mb-1', muted)}>Objectives</div>
                        <p className="text-sm">{proposal.objectives}</p>
                      </div>
                    )}
                    {proposal.businessRequirements && (
                      <div>
                        <div className={clsx('text-xs font-semibold uppercase tracking-wide mb-1', muted)}>Business Requirements</div>
                        <p className="text-sm">{proposal.businessRequirements}</p>
                      </div>
                    )}
                    {proposal.justification && (
                      <div>
                        <div className={clsx('text-xs font-semibold uppercase tracking-wide mb-1', muted)}>Justification</div>
                        <p className="text-sm">{proposal.justification}</p>
                      </div>
                    )}
                  </div>
                </div>
              );

            case 'commercial':
              return (
                <div key="commercial" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className="px-6 py-4" style={{ background: `linear-gradient(to right, ${headerColor}dd, ${headerColor}88)` }}>
                    <div className="text-white font-bold text-base">Commercial Summary</div>
                  </div>
                  <div className="px-6 py-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={clsx('border-b', darkMode ? 'border-slate-700' : 'border-gray-200')}>
                          <th className={clsx('text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wide', th)}>Category</th>
                          <th className={clsx('text-right py-2 text-xs font-semibold uppercase tracking-wide', th)}>Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                        {totals.partsSell > 0 && (
                          <tr>
                            <td className="py-2 pr-4">Parts &amp; Licenses</td>
                            <td className="py-2 text-right font-medium">{fmt(totals.partsSell + totals.markup)}</td>
                          </tr>
                        )}
                        {totals.consultSell > 0 && (
                          <tr>
                            <td className="py-2 pr-4">Professional Services</td>
                            <td className="py-2 text-right font-medium">{fmt(totals.consultSell + totals.pm)}</td>
                          </tr>
                        )}
                        <tr className={clsx('border-t font-bold', darkMode ? 'border-slate-600' : 'border-gray-300')}>
                          <td className="py-2.5 pr-4">Grand Total</td>
                          <td className="py-2.5 text-right text-lg">{fmt(totals.grandTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );

            case 'consultancy': {
              if (proposal.phases.length === 0) return null;
              // Roll up totals per resource role across all phases
              const roleMap: Record<string, number> = {};
              proposal.phases.forEach(ph => ph.tasks.forEach(t => {
                const val = t.days * t.dayRate * (t.rateMultiplier ?? 1);
                roleMap[t.role] = (roleMap[t.role] ?? 0) + val;
              }));
              const roles = Object.entries(roleMap).sort((a, b) => b[1] - a[1]);
              const consultTotal = roles.reduce((s, [, v]) => s + v, 0);
              return (
                <div key="consultancy" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className={clsx('px-6 py-3 border-b', th, 'font-semibold text-sm')}>Professional Services</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={clsx('border-b text-xs font-semibold uppercase tracking-wide', darkMode ? 'border-slate-700 text-slate-500' : 'border-gray-100 text-gray-400')}>
                        <th className="px-6 py-2.5 text-left">Resource Type</th>
                        <th className="px-6 py-2.5 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className={clsx('divide-y', darkMode ? 'divide-slate-700' : 'divide-gray-50')}>
                      {roles.map(([role, value]) => (
                        <tr key={role} className={clsx(darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-gray-50')}>
                          <td className="px-6 py-3 font-medium">{role}</td>
                          <td className="px-6 py-3 text-right">{fmt(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className={clsx('border-t font-semibold', darkMode ? 'border-slate-600' : 'border-gray-200')}>
                        <td className="px-6 py-3">Total Professional Services</td>
                        <td className="px-6 py-3 text-right">{fmt(consultTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            }

            case 'milestones':
              if (!proposal.milestones || proposal.milestones.length === 0) return null;
              return (
                <div key="milestones" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className={clsx('px-6 py-3 border-b', th, 'font-semibold text-sm')}>Billing Milestones</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={clsx('border-b', darkMode ? 'border-slate-700' : 'border-gray-100')}>
                        <th className={clsx('text-left px-6 py-2.5 text-xs font-semibold uppercase tracking-wide', th)}>Milestone</th>
                        <th className={clsx('text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide', th)}>Due Date</th>
                        <th className={clsx('text-right px-6 py-2.5 text-xs font-semibold uppercase tracking-wide', th)}>Amount</th>
                      </tr>
                    </thead>
                    <tbody className={clsx('divide-y', darkMode ? 'divide-slate-700' : 'divide-gray-50')}>
                      {proposal.milestones.map((m, i) => {
                        const amount = totals.grandTotal * (m.percentage / 100);
                        return (
                          <tr key={i}>
                            <td className="px-6 py-2.5">{m.name}</td>
                            <td className={clsx('px-4 py-2.5 text-right', muted)}>{m.dueDate ?? '—'}</td>
                            <td className="px-6 py-2.5 text-right font-semibold">{fmt(amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );

            case 'sow':
              if (!proposal.sowContent) return null;
              return (
                <div key="sow" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className={clsx('px-6 py-3 border-b font-semibold text-sm', th)}>Statement of Work</div>
                  <div className="px-6 py-4">
                    <pre className={clsx('text-sm whitespace-pre-wrap font-sans leading-relaxed', muted)}>
                      {proposal.sowContent}
                    </pre>
                  </div>
                </div>
              );

            case 'terms':
              if (!section.content) return null;
              return (
                <div key="terms" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className={clsx('px-6 py-3 border-b font-semibold text-sm', th)}>Terms &amp; Conditions</div>
                  <div className="px-6 py-4">
                    <pre className={clsx('text-sm whitespace-pre-wrap font-sans leading-relaxed', muted)}>
                      {section.content}
                    </pre>
                  </div>
                </div>
              );

            default:
              return null;
          }
        })}

        {/* Signature section */}
        {link.approvalStatus === 'pending' && !signResult && (
          <div className={clsx('rounded-2xl border overflow-hidden', card)}>
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-900 to-purple-700">
              <div className="text-white font-bold text-base">Sign off this Proposal</div>
              <div className="text-indigo-200 text-xs mt-0.5">
                Review the proposal above and approve or reject below. Your response will be recorded.
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              {signError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {signError}
                </div>
              )}
              <div>
                <label className={clsx('block text-sm font-medium mb-1', darkMode ? 'text-slate-300' : 'text-gray-700')}>
                  Your name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={clsx(
                    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500',
                    darkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
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
                    darkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'
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

        {/* Sign result */}
        {signResult && (
          <div className={clsx(
            'rounded-2xl border p-6 text-center',
            signResult.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          )}>
            {signResult.status === 'approved'
              ? <CheckCircle size={40} className="text-green-600 mx-auto mb-3" />
              : <XCircle size={40} className="text-red-500 mx-auto mb-3" />
            }
            <div className="font-bold text-lg capitalize mb-1">{signResult.status}</div>
            <div className="text-sm text-gray-600">
              Your response has been recorded at {fmtDate(signResult.signedAt)}.
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={clsx('text-center text-xs py-4', muted)}>
          {layout.footer.text
            ? layout.footer.text
            : `Powered by ${companyName} PreSales Portal · This link is for ${proposal.client} only`}
          {layout.footer.showDate && (
            <span className="ml-2">· Generated {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          )}
        </div>

      </main>
    </div>
  );
}

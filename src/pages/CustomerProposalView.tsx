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
  return (n: number) => `${sym}${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
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

function partsByType(proposal: Proposal, type: PartType) {
  return proposal.parts.filter(p => (p.partType ?? 'Hardware') === type);
}

const TYPE_LABEL: Record<PartType, string> = {
  Hardware: 'Hardware', Software: 'Software',
  Monthly: 'Monthly Subscriptions', Annual: 'Annual Subscriptions',
};

// ─── Simple markdown renderer ─────────────────────────────────────────────────

function renderMarkdown(content: string, muted: string) {
  return content.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-3" />;
    if (line.startsWith('### ')) return <h4 key={i} className="font-bold text-sm mt-4 mb-1">{line.slice(4)}</h4>;
    if (line.startsWith('## '))  return <h3 key={i} className="font-bold text-base mt-5 mb-2">{line.slice(3)}</h3>;
    if (line.startsWith('# '))   return <h2 key={i} className="font-bold text-lg mt-6 mb-2">{line.slice(2)}</h2>;
    if (line.match(/^[-*] /))    return <p key={i} className={clsx('text-sm pl-4 before:content-["•"] before:mr-2', muted)}>{line.slice(2)}</p>;
    const clean = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
    return <p key={i} className="text-sm leading-relaxed mb-1" dangerouslySetInnerHTML={{ __html: clean }} />;
  });
}

interface SignFormData { signerName: string; notes: string }

export function CustomerProposalView() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [proposal, setProposal]     = useState<Proposal | null>(null);
  const [link, setLink]             = useState<CustomerLink | null>(null);
  const [layoutRaw, setLayoutRaw]   = useState<string | undefined>(undefined);
  const [branding, setBranding]     = useState<{ logoB64: string | null; primaryColor: string; companyName: string }>({
    logoB64: null, primaryColor: '#2B3990', companyName: 'ITRM',
  });
  const [darkMode, setDarkMode]     = useState(() => localStorage.getItem(THEME_KEY) === 'dark');
  const [signForm, setSignForm]     = useState<SignFormData>({ signerName: '', notes: '' });
  const [signing, setSigning]       = useState(false);
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
    if (!token || !signForm.signerName.trim()) { setSignError('Please enter your name before signing.'); return; }
    setSigning(true); setSignError(null);
    try {
      await customerApi.sign(token, { status, notes: signForm.notes, signerName: signForm.signerName });
      setSignResult({ status, signedAt: new Date().toISOString() });
      if (link) setLink({ ...link, approvalStatus: status, signedAt: new Date().toISOString(), signedByName: signForm.signerName });
    } catch { setSignError('Failed to submit. Please try again.'); }
    finally { setSigning(false); }
  };

  // ── Theme tokens ──────────────────────────────────────────────────────────────
  const bg      = darkMode ? 'bg-[#0d1117] text-slate-100' : 'bg-gray-50 text-gray-900';
  const card    = darkMode ? 'bg-[#161b22] border-slate-700' : 'bg-white border-gray-200';
  const muted   = darkMode ? 'text-slate-400' : 'text-gray-500';
  const divider = darkMode ? 'border-slate-700' : 'border-gray-100';
  const rowAlt  = darkMode ? 'bg-slate-800/40' : 'bg-gray-50/60';

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

  const totals   = calcTotals(proposal);
  const fmt      = makeFmt(proposal.currency);
  const layout   = parseLayout(layoutRaw);
  const visible  = layout.sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);
  const primary  = layout.header.primaryColor ?? branding.primaryColor;
  const compName = layout.header.companyName  ?? branding.companyName;
  const logo     = layout.header.showLogo ? branding.logoB64 : null;
  const today    = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

  // Coloured table header used throughout to match PDF style
  const THead = ({ cols }: { cols: { label: string; right?: boolean }[] }) => (
    <thead>
      <tr style={{ backgroundColor: primary }}>
        {cols.map((c, i) => (
          <th key={i} className={clsx('px-4 py-2 text-xs font-semibold text-white', c.right ? 'text-right' : 'text-left')}>
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );

  return (
    <div className={clsx('min-h-screen', bg)}>

      {/* ── Nav bar ─────────────────────────────────────────────────────────── */}
      <header className={clsx('sticky top-0 z-20 border-b px-6 py-3 flex items-center justify-between backdrop-blur', card)}>
        <div className="flex items-center gap-3">
          {logo
            ? <img src={logo} alt={compName} className="h-7 object-contain" />
            : <div className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: primary }}>
                {compName.slice(0, 2).toUpperCase()}
              </div>
          }
          <span className="font-semibold text-sm">{compName}</span>
        </div>
        <button
          onClick={toggleTheme}
          className={clsx('p-2 rounded-lg border transition-colors', darkMode ? 'border-slate-600 hover:bg-slate-700' : 'border-gray-300 hover:bg-gray-100')}
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6 print:max-w-none print:px-0">

        {/* ── Signed banner ─────────────────────────────────────────────────── */}
        {link.approvalStatus !== 'pending' && (
          <div className={clsx('rounded-xl border p-4 flex items-start gap-3',
            link.approvalStatus === 'approved'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 text-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-800')}>
            {link.approvalStatus === 'approved'
              ? <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
              : <XCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />}
            <div>
              <div className="font-semibold capitalize">{link.approvalStatus}</div>
              {link.signedByName && <div className="text-sm mt-0.5">Signed by {link.signedByName}</div>}
              {link.signedAt && <div className="text-xs mt-0.5 opacity-75">{fmtDate(link.signedAt)}</div>}
              {link.signerNotes && <div className="text-sm mt-2 italic">"{link.signerNotes}"</div>}
            </div>
          </div>
        )}

        {/* ── Layout-driven sections ────────────────────────────────────────── */}
        {visible.map(section => {
          switch (section.id) {

            // ── Cover ──────────────────────────────────────────────────────────
            case 'cover':
              return (
                <div key="cover" className="rounded-2xl overflow-hidden border border-transparent"
                  style={{ background: '#0a1030' }}>
                  <div className="px-10 py-10 flex flex-col items-start">
                    {/* Logo */}
                    {logo && (
                      <img src={logo} alt={compName} className="h-12 object-contain mb-8 brightness-0 invert" />
                    )}
                    {!logo && (
                      <div className="text-xs font-bold tracking-widest uppercase mb-8" style={{ color: primary }}>
                        {compName}
                      </div>
                    )}
                    {layout.header.tagline && (
                      <div className="text-xs tracking-widest uppercase text-slate-400 mb-4">{layout.header.tagline}</div>
                    )}
                    <h1 className="text-3xl font-bold text-white mb-3 leading-tight max-w-2xl">{proposal.projectName}</h1>
                    {/* Coloured divider matching PDF */}
                    <div className="w-16 h-0.5 mb-6 rounded-full" style={{ backgroundColor: primary }} />
                    <div className="text-lg text-slate-200 mb-1">{proposal.client}</div>
                    {proposal.accountManager && (
                      <div className="text-sm text-slate-400">Account Manager: {proposal.accountManager}</div>
                    )}
                    <div className="text-sm text-slate-400 mt-1">Date: {today}</div>
                    {(proposal.reference || proposal.ticketRef) && (
                      <div className="text-sm text-slate-400">
                        Reference: {proposal.reference ?? proposal.ticketRef}
                      </div>
                    )}
                  </div>
                </div>
              );

            // ── Executive Summary ──────────────────────────────────────────────
            case 'summary':
              if (!proposal.objectives && !proposal.businessRequirements && !proposal.justification) return null;
              return (
                <div key="summary" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  {/* Coloured section header matches PDF h1 style */}
                  <div className="px-6 py-3 border-b" style={{ borderColor: primary, borderBottomWidth: 2 }}>
                    <h2 className="font-bold text-sm" style={{ color: primary }}>Executive Summary</h2>
                  </div>
                  <div className="px-6 py-5 space-y-5">
                    {[
                      { label: 'Objectives',            value: proposal.objectives },
                      { label: 'Business Requirements', value: proposal.businessRequirements },
                      { label: 'Justification',         value: proposal.justification },
                      { label: 'Constraints',           value: proposal.constraints },
                      { label: 'Assumptions',           value: proposal.assumptions },
                    ].filter(r => r.value).map(r => (
                      <div key={r.label}>
                        <div className={clsx('text-xs font-bold uppercase tracking-wider mb-1', muted)}>{r.label}</div>
                        <p className="text-sm leading-relaxed">{r.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );

            // ── Commercial Summary ─────────────────────────────────────────────
            case 'commercial': {
              const hwTotal = partsByType(proposal, 'Hardware').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
              const swTotal = partsByType(proposal, 'Software').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
              const moTotal = partsByType(proposal, 'Monthly').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
              const anTotal = partsByType(proposal, 'Annual').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
              const consTotal = totals.consultSell + totals.pm;
              const oneYrTco = (hwTotal + swTotal) + totals.markup + moTotal * 12 + anTotal + consTotal;
              const rows = [
                { label: 'Hardware (one-off)',        value: hwTotal,     show: hwTotal > 0 },
                { label: 'Software (one-off)',         value: swTotal,     show: swTotal > 0 },
                { label: 'Monthly subscriptions',      value: moTotal,     show: moTotal > 0, suffix: '/mo' },
                { label: 'Annual subscriptions',       value: anTotal,     show: anTotal > 0, suffix: '/yr' },
                { label: 'Professional Services',      value: consTotal,   show: consTotal > 0 },
              ].filter(r => r.show);

              return (
                <div key="commercial" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className="px-6 py-3 border-b" style={{ borderColor: primary, borderBottomWidth: 2 }}>
                    <h2 className="font-bold text-sm" style={{ color: primary }}>Commercial Summary</h2>
                  </div>
                  <table className="w-full text-sm">
                    <THead cols={[{ label: 'Category' }, { label: 'Amount', right: true }]} />
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.label} className={i % 2 === 1 ? rowAlt : ''}>
                          <td className={clsx('px-4 py-2.5 border-b', divider)}>{r.label}</td>
                          <td className={clsx('px-4 py-2.5 text-right border-b', divider)}>
                            {fmt(r.value)}{r.suffix ?? ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#1e2a6e' }}>
                        <td className="px-4 py-2.5 font-bold text-white">Upfront Total (ex. recurring)</td>
                        <td className="px-4 py-2.5 text-right font-bold text-white text-base">{fmt(totals.grandTotal)}</td>
                      </tr>
                      {(moTotal > 0 || anTotal > 0) && (
                        <tr style={{ backgroundColor: '#2d3a8c' }}>
                          <td className="px-4 py-2 font-semibold text-white text-sm">1-Year TCO</td>
                          <td className="px-4 py-2 text-right font-semibold text-white">{fmt(oneYrTco)}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              );
            }

            // ── Bill of Materials ──────────────────────────────────────────────
            case 'commercial':
              return null; // already handled above; BOM is rendered as part of commercial flow

            // ── Professional Services ──────────────────────────────────────────
            case 'consultancy': {
              if (proposal.phases.length === 0) return null;
              const roleMap: Record<string, number> = {};
              proposal.phases.forEach(ph => ph.tasks.forEach(t => {
                const val = t.days * t.dayRate * (t.rateMultiplier ?? 1);
                roleMap[t.role] = (roleMap[t.role] ?? 0) + val;
              }));
              const roles = Object.entries(roleMap).sort((a, b) => b[1] - a[1]);
              const consTotal = roles.reduce((s, [, v]) => s + v, 0) * 1.2; // includes PM
              return (
                <div key="consultancy" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className="px-6 py-3 border-b" style={{ borderColor: primary, borderBottomWidth: 2 }}>
                    <h2 className="font-bold text-sm" style={{ color: primary }}>Professional Services</h2>
                  </div>
                  <table className="w-full text-sm">
                    <THead cols={[{ label: 'Resource Type' }, { label: 'Value', right: true }]} />
                    <tbody>
                      {roles.map(([role, value], i) => (
                        <tr key={role} className={i % 2 === 1 ? rowAlt : ''}>
                          <td className={clsx('px-4 py-2.5 border-b font-medium', divider)}>{role}</td>
                          <td className={clsx('px-4 py-2.5 text-right border-b', divider)}>{fmt(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#1e2a6e' }}>
                        <td className="px-4 py-2.5 font-bold text-white">Total Professional Services</td>
                        <td className="px-4 py-2.5 text-right font-bold text-white">{fmt(consTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            }

            // ── Billing Milestones ─────────────────────────────────────────────
            case 'milestones':
              if (!proposal.milestones?.length) return null;
              return (
                <div key="milestones" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className="px-6 py-3 border-b" style={{ borderColor: primary, borderBottomWidth: 2 }}>
                    <h2 className="font-bold text-sm" style={{ color: primary }}>Billing Milestones</h2>
                  </div>
                  <table className="w-full text-sm">
                    <THead cols={[{ label: 'Milestone' }, { label: 'Due Date' }, { label: 'Amount', right: true }]} />
                    <tbody>
                      {proposal.milestones.map((m, i) => (
                        <tr key={m.id} className={i % 2 === 1 ? rowAlt : ''}>
                          <td className={clsx('px-4 py-2.5 border-b', divider)}>{m.name}</td>
                          <td className={clsx('px-4 py-2.5 border-b', divider, muted)}>{m.dueDate ?? '—'}</td>
                          <td className={clsx('px-4 py-2.5 text-right border-b font-semibold', divider)}>
                            {fmt(totals.grandTotal * (m.percentage / 100))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );

            // ── Bill of Materials (parts) ──────────────────────────────────────
            // Rendered as part of commercial section context — also available as standalone
            // if a future layout section 'bom' is added. For now, render below commercial.

            // ── Statement of Work ──────────────────────────────────────────────
            case 'sow':
              if (!proposal.sowContent) return null;
              return (
                <div key="sow" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className="px-6 py-3 border-b" style={{ borderColor: primary, borderBottomWidth: 2 }}>
                    <h2 className="font-bold text-sm" style={{ color: primary }}>Statement of Work</h2>
                  </div>
                  <div className="px-6 py-5 leading-relaxed">
                    {renderMarkdown(proposal.sowContent, muted)}
                  </div>
                </div>
              );

            // ── Terms & Conditions ─────────────────────────────────────────────
            case 'terms':
              if (!section.content) return null;
              return (
                <div key="terms" className={clsx('rounded-2xl border overflow-hidden', card)}>
                  <div className="px-6 py-3 border-b" style={{ borderColor: primary, borderBottomWidth: 2 }}>
                    <h2 className="font-bold text-sm" style={{ color: primary }}>Terms &amp; Conditions</h2>
                  </div>
                  <div className="px-6 py-5 leading-relaxed">
                    {renderMarkdown(section.content, muted)}
                  </div>
                </div>
              );

            default:
              return null;
          }
        })}

        {/* ── Bill of Materials (always rendered after commercial if parts exist) ── */}
        {visible.some(s => s.id === 'commercial') && proposal.parts.length > 0 && (
          <div className={clsx('rounded-2xl border overflow-hidden', card)}>
            <div className="px-6 py-3 border-b" style={{ borderColor: primary, borderBottomWidth: 2 }}>
              <h2 className="font-bold text-sm" style={{ color: primary }}>Bill of Materials</h2>
            </div>
            {(['Hardware', 'Software', 'Monthly', 'Annual'] as PartType[]).map(type => {
              const items = partsByType(proposal, type);
              if (!items.length) return null;
              return (
                <div key={type}>
                  <div className={clsx('px-6 py-1.5 text-xs font-bold uppercase tracking-wider', darkMode ? 'bg-slate-700/40 text-slate-400' : 'bg-gray-50 text-gray-400')}>
                    {TYPE_LABEL[type]}
                  </div>
                  <table className="w-full text-sm">
                    <THead cols={[
                      { label: 'Description' }, { label: 'SKU' },
                      { label: 'Qty', right: true }, { label: 'Unit Price', right: true }, { label: 'Total', right: true },
                    ]} />
                    <tbody>
                      {items.map((p, i) => (
                        <tr key={p.id} className={i % 2 === 1 ? rowAlt : ''}>
                          <td className={clsx('px-4 py-2 border-b', divider)}>{p.description}</td>
                          <td className={clsx('px-4 py-2 border-b text-xs', divider, muted)}>{p.sku || '—'}</td>
                          <td className={clsx('px-4 py-2 border-b text-right', divider)}>{p.quantity}</td>
                          <td className={clsx('px-4 py-2 border-b text-right', divider)}>{fmt(p.unitPrice)}</td>
                          <td className={clsx('px-4 py-2 border-b text-right font-semibold', divider)}>{fmt(p.unitPrice * p.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Signature section ─────────────────────────────────────────────── */}
        {link.approvalStatus === 'pending' && !signResult && (
          <div className={clsx('rounded-2xl border overflow-hidden', card)}>
            <div className="px-6 py-4" style={{ background: `linear-gradient(135deg, ${primary}ee, ${primary}88)` }}>
              <div className="text-white font-bold text-base">Sign off this Proposal</div>
              <div className="text-white/70 text-xs mt-0.5">
                Review the proposal above and approve or reject below. Your response will be recorded with a timestamp.
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
                  className={clsx('w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2', darkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900')}
                  style={{ '--tw-ring-color': primary } as React.CSSProperties}
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
                  className={clsx('w-full border rounded-lg px-3 py-2 text-sm focus:outline-none resize-none', darkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900')}
                  placeholder="Any comments or conditions..."
                  value={signForm.notes}
                  onChange={e => setSignForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => handleSign('approved')} disabled={signing}
                  className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {signing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />} Approve
                </button>
                <button onClick={() => handleSign('rejected')} disabled={signing}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {signing ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />} Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Sign result ───────────────────────────────────────────────────── */}
        {signResult && (
          <div className={clsx('rounded-2xl border p-8 text-center',
            signResult.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
            {signResult.status === 'approved'
              ? <CheckCircle size={48} className="text-green-600 mx-auto mb-4" />
              : <XCircle size={48} className="text-red-500 mx-auto mb-4" />}
            <div className="font-bold text-xl capitalize mb-2">{signResult.status}</div>
            <div className="text-sm text-gray-600">Response recorded at {fmtDate(signResult.signedAt)}.</div>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className={clsx('flex items-center justify-between text-xs py-4 border-t', muted, divider)}>
          <span>
            {layout.footer.text || `${compName} — Confidential`}
            {layout.footer.showDate && ` · ${today}`}
          </span>
          {logo && <img src={logo} alt={compName} className="h-5 object-contain opacity-50" />}
        </div>

      </main>
    </div>
  );
}

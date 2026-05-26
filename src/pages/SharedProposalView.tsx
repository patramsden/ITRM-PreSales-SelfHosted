import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { shareApi } from '../lib/api';
import { calcTotals } from '../utils/totals';
import type { Proposal } from '../types';

const fmt = (n: number, currency = 'GBP') =>
  `${currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-gray-100 dark:border-slate-700">
      <td className="py-2.5 pr-6 text-sm text-gray-600 dark:text-slate-400">{label}</td>
      <td className="py-2.5 text-sm font-medium text-gray-900 dark:text-slate-100 text-right">{value}</td>
    </tr>
  );
}

export function SharedProposalView() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError('Invalid share link'); setLoading(false); return; }
    shareApi.getPublic(token)
      .then(p => setProposal(p))
      .catch(() => setError('This share link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="max-w-sm mx-auto text-center p-8">
          <AlertCircle size={40} className="mx-auto mb-4 text-red-400" />
          <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-200 mb-2">Link not available</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">{error ?? 'Proposal not found.'}</p>
        </div>
      </div>
    );
  }

  const totals = calcTotals(proposal);
  const hwTotal = proposal.parts.filter(p => p.partType === 'Hardware').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const swTotal = proposal.parts.filter(p => p.partType === 'Software').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const moTotal = proposal.parts.filter(p => p.partType === 'Monthly').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const anTotal = proposal.parts.filter(p => p.partType === 'Annual').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const c = proposal.currency;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-[#2B3990] py-5 px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/msp-logo.svg" alt="MSP SalesPro" className="h-8 brightness-0 invert" />
            <span className="text-white text-sm font-medium opacity-80">MSP SalesPro</span>
          </div>
          <span className="text-white text-xs opacity-60">Proposal Preview</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-8 py-10 space-y-8">
        {/* Heading */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{proposal.projectName}</h1>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500 dark:text-slate-400">
            <span>Client: <strong className="text-gray-700 dark:text-slate-300">{proposal.client}</strong></span>
            {proposal.accountManager && (
              <span>Account Manager: <strong className="text-gray-700 dark:text-slate-300">{proposal.accountManager}</strong></span>
            )}
            <span>Status: <strong className="text-gray-700 dark:text-slate-300">{proposal.status}</strong></span>
          </div>
        </div>

        {/* Commercial summary */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-4">Commercial Summary</h2>
          <table className="w-full">
            <tbody>
              {hwTotal > 0 && <SummaryRow label="Hardware" value={fmt(hwTotal, c)} />}
              {swTotal > 0 && <SummaryRow label="Software" value={fmt(swTotal, c)} />}
              {moTotal > 0 && <SummaryRow label="Monthly (recurring)" value={fmt(moTotal, c)} />}
              {anTotal > 0 && <SummaryRow label="Annual (recurring)" value={fmt(anTotal, c)} />}
              {totals.consultancySell > 0 && <SummaryRow label="Consultancy" value={fmt(totals.consultancySell, c)} />}
              <tr className="bg-[#2B3990] text-white rounded-lg">
                <td className="py-3 px-0 text-sm font-bold rounded-l-lg pl-2">Grand Total</td>
                <td className="py-3 px-0 text-sm font-bold text-right rounded-r-lg pr-2">{fmt(totals.grandTotal, c)}</td>
              </tr>
              <tr>
                <td className="py-2 text-sm text-gray-500 dark:text-slate-400">Gross Margin</td>
                <td className="py-2 text-sm font-medium text-gray-900 dark:text-slate-100 text-right">{fmtPct(totals.marginPct)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Consultancy phases */}
        {proposal.phases.length > 0 && (
          <section className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-4">Consultancy Phases</h2>
            <div className="space-y-5">
              {proposal.phases.map(phase => (
                <div key={phase.id}>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">{phase.name}</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-slate-700">
                        <th className="text-left py-1.5 text-xs font-medium text-gray-500 dark:text-slate-400">Task</th>
                        <th className="text-left py-1.5 text-xs font-medium text-gray-500 dark:text-slate-400">Role</th>
                        <th className="text-right py-1.5 text-xs font-medium text-gray-500 dark:text-slate-400">Days</th>
                        <th className="text-right py-1.5 text-xs font-medium text-gray-500 dark:text-slate-400">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phase.tasks.map(task => (
                        <tr key={task.id} className="border-b border-gray-50 dark:border-slate-700/50">
                          <td className="py-2 text-gray-800 dark:text-slate-200">{task.name}</td>
                          <td className="py-2 text-gray-500 dark:text-slate-400">{task.role}</td>
                          <td className="py-2 text-right text-gray-800 dark:text-slate-200">{task.days}</td>
                          <td className="py-2 text-right font-medium text-gray-900 dark:text-slate-100">{fmt(task.days * task.dayRate, c)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Statement of Work */}
        {proposal.sowContent && (
          <section className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-4">Statement of Work</h2>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-gray-700 dark:text-slate-300 text-sm leading-relaxed">
              {proposal.sowContent}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-xs text-gray-400 dark:text-slate-500">
        Powered by MSP SalesPro · This document is confidential
      </footer>
    </div>
  );
}

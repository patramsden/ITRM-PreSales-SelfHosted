import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, PackageX } from 'lucide-react';
import type { Proposal } from '../../types';
import clsx from 'clsx';

interface Props { proposal: Proposal }

const WARN_DAYS = 14;

export function VendorQuoteExpiryBanner({ proposal }: Props) {
  const [expanded, setExpanded] = useState(true);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + WARN_DAYS);

  const hits: { partDesc: string; vendor: string; ref: string; expiry: Date; expired: boolean }[] = [];

  for (const part of proposal.parts) {
    for (const q of part.quotes) {
      if (!q.selected || !q.validUntil) continue;
      const exp = new Date(q.validUntil);
      exp.setHours(23, 59, 59, 999);
      if (exp <= cutoff) {
        hits.push({
          partDesc: part.description,
          vendor: q.vendor,
          ref: q.reference,
          expiry: exp,
          expired: exp < today,
        });
      }
    }
  }

  if (hits.length === 0) return null;

  const hasExpired = hits.some(h => h.expired);
  const border = hasExpired
    ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
    : 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20';

  return (
    <div className={clsx('border-b-2 transition-colors', border)}>
      <div
        className="flex items-center gap-3 px-8 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {hasExpired
          ? <PackageX size={18} className="text-red-500 flex-shrink-0" />
          : <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
            {hasExpired ? 'Expired Vendor Quotes' : 'Vendor Quotes Expiring Soon'}
          </span>
          <span className="text-xs text-gray-500 dark:text-slate-400 ml-2">
            {hits.length} selected quote{hits.length !== 1 ? 's' : ''} {hasExpired ? 'have expired or are' : 'are'} expiring within {WARN_DAYS} days — update pricing before export.
          </span>
        </div>
        {expanded ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="px-8 pb-4">
          <table className="w-full max-w-2xl text-xs">
            <thead>
              <tr className="text-gray-400 dark:text-slate-500">
                <th className="text-left pb-1.5 pr-4 font-medium">Part</th>
                <th className="text-left pb-1.5 pr-4 font-medium">Vendor</th>
                <th className="text-left pb-1.5 pr-4 font-medium">Reference</th>
                <th className="text-left pb-1.5 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {hits.map((h, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-4 font-medium text-gray-800 dark:text-slate-200 truncate max-w-[180px]">{h.partDesc}</td>
                  <td className="py-1.5 pr-4 text-gray-600 dark:text-slate-400">{h.vendor}</td>
                  <td className="py-1.5 pr-4 text-gray-500 dark:text-slate-500 font-mono">{h.ref}</td>
                  <td className={clsx('py-1.5 font-semibold', h.expired ? 'text-red-600' : 'text-amber-600')}>
                    {h.expired ? '⚠ ' : ''}{h.expiry.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

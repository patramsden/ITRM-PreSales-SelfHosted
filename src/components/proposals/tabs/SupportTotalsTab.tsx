/**
 * SupportTotalsTab — commercial summary for support / managed-service proposals.
 *
 * Shows MRR, ARR, TCV, onboarding, per-seat breakdown, add-on detail,
 * and term/discount info. Read-only; all editing happens in Support Contract tab.
 */
import { TrendingUp, Calendar, Users, Package, CreditCard, Info } from 'lucide-react';
import type { Proposal } from '../../../types';

interface Props {
  proposal: Proposal;
}

function fmtCurr(n: number, sym = '£'): string {
  return `${sym}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcDiscountedBase(price: number, discountPct: number): number {
  return price * (1 - discountPct / 100);
}

function calcMRR(sc: NonNullable<Proposal['supportContract']>): number {
  const base = calcDiscountedBase(sc.pricePerSeat, sc.termDiscountPct ?? 0);
  const full = base * sc.seats;
  const part = base * 0.5 * (sc.partTimeSeats ?? 0);
  const addons = (sc.addOns ?? []).reduce((s, a) =>
    s + (a.priceType === 'per_seat' ? a.price * sc.seats : a.price), 0);
  return full + part + addons;
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent
      ? 'bg-brand-600 border-brand-700 text-white'
      : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${accent ? 'text-brand-200' : 'text-gray-400 dark:text-slate-500'}`}>
        {label}
      </div>
      <div className={`text-2xl font-bold ${accent ? 'text-white' : 'text-gray-900 dark:text-slate-100'}`}>
        {value}
      </div>
      {sub && (
        <div className={`text-xs mt-1 ${accent ? 'text-brand-200' : 'text-gray-400 dark:text-slate-500'}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${muted ? 'opacity-60' : ''}`}>
      <span className="text-sm text-gray-600 dark:text-slate-400">{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-gray-900 dark:text-slate-100' : 'text-gray-800 dark:text-slate-200'}`}>
        {value}
      </span>
    </div>
  );
}

export function SupportTotalsTab({ proposal }: Props) {
  const sc = proposal.supportContract;

  if (!sc) {
    return (
      <div className="flex items-center gap-3 p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl text-sm text-amber-800 dark:text-amber-300 max-w-xl">
        <Info size={16} className="flex-shrink-0" />
        No support contract configured. Fill in the Support Contract tab first.
      </div>
    );
  }

  const sym = proposal.currency === 'USD' ? '$' : proposal.currency === 'EUR' ? '€' : '£';

  const discountedBase = calcDiscountedBase(sc.pricePerSeat, sc.termDiscountPct ?? 0);
  const mrr            = calcMRR(sc);
  const arr            = mrr * 12;
  const tcv            = mrr * sc.term;
  const onboarding     = sc.onboardingCost ?? 0;
  const year1Total     = arr + onboarding;

  const termLabel      = sc.term === 12 ? '1 Year' : sc.term === 36 ? '3 Years' : '5 Years';
  const hoursLabel     = sc.supportHours === 'standard' ? 'Mon–Fri 9am–5pm' : sc.supportHours === 'extended' ? 'Mon–Fri 8am–6pm' : 'Mon–Fri 7am–7pm';

  const addonsTotal    = (sc.addOns ?? []).reduce((s, a) =>
    s + (a.priceType === 'per_seat' ? a.price * sc.seats : a.price), 0);

  const baseMrrFull    = discountedBase * sc.seats;
  const baseMrrPart    = discountedBase * 0.5 * (sc.partTimeSeats ?? 0);

  return (
    <div className="max-w-4xl space-y-6">

      {/* ── Headline stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Monthly Recurring" value={fmtCurr(mrr, sym)} sub="MRR (inc. add-ons)" accent />
        <StatCard label="Annual Recurring"  value={fmtCurr(arr, sym)} sub="ARR" />
        <StatCard label={`Total Contract (${termLabel})`} value={fmtCurr(tcv, sym)} sub="TCV excl. onboarding" />
        <StatCard label="Onboarding (one-off)" value={fmtCurr(onboarding, sym)} sub="Added to Year 1" />
      </div>

      {/* ── Year 1 callout ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-2xl">
        <div className="flex items-center gap-3">
          <TrendingUp size={18} className="text-emerald-600 dark:text-emerald-400" />
          <div>
            <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Year 1 Total Revenue</div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">ARR + onboarding fee</div>
          </div>
        </div>
        <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{fmtCurr(year1Total, sym)}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── Contract details ────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-slate-700">
            <Calendar size={15} className="text-brand-500" />
            <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Contract Details</span>
          </div>
          <div className="px-5 pb-4 divide-y divide-gray-50 dark:divide-slate-700">
            <Row label="Client"          value={proposal.client} />
            <Row label="Contract Term"   value={termLabel} />
            <Row label="Billing Cycle"   value={sc.billingCycle.charAt(0).toUpperCase() + sc.billingCycle.slice(1)} />
            <Row label="Support Hours"   value={hoursLabel} />
            {sc.commencementDate && (
              <Row label="Start Date" value={new Date(sc.commencementDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} />
            )}
            {sc.site && <Row label="Site / Location" value={sc.site} />}
          </div>
        </div>

        {/* ── Per-seat breakdown ──────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-slate-700">
            <Users size={15} className="text-brand-500" />
            <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Per-Seat Breakdown</span>
          </div>
          <div className="px-5 pb-4 divide-y divide-gray-50 dark:divide-slate-700">
            <Row label="Base price / seat"
              value={`${fmtCurr(sc.pricePerSeat, sym)}/mo`}
              muted={!!(sc.termDiscountPct && sc.termDiscountPct > 0)}
            />
            {(sc.termDiscountPct ?? 0) > 0 && (
              <Row label={`Discounted price (${sc.termDiscountPct}% term discount)`}
                value={`${fmtCurr(discountedBase, sym)}/mo`}
                bold
              />
            )}
            <Row label={`Full-time seats (×${sc.seats})`} value={`${fmtCurr(baseMrrFull, sym)}/mo`} />
            {(sc.partTimeSeats ?? 0) > 0 && (
              <Row label={`Part-time seats (×${sc.partTimeSeats} @ 50%)`} value={`${fmtCurr(baseMrrPart, sym)}/mo`} />
            )}
            {addonsTotal > 0 && (
              <Row label="Add-ons total" value={`${fmtCurr(addonsTotal, sym)}/mo`} />
            )}
            <Row label="Monthly total (MRR)" value={`${fmtCurr(mrr, sym)}/mo`} bold />
          </div>
        </div>

        {/* ── Add-ons detail ──────────────────────────────────────────────── */}
        {(sc.addOns ?? []).length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-slate-700">
              <Package size={15} className="text-brand-500" />
              <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Add-ons</span>
            </div>
            <div className="px-5 pb-4 divide-y divide-gray-50 dark:divide-slate-700">
              {(sc.addOns ?? []).map(a => {
                const monthly = a.priceType === 'per_seat' ? a.price * sc.seats : a.price;
                return (
                  <Row
                    key={a.id}
                    label={a.name + (a.priceType === 'per_seat' ? ` (${fmtCurr(a.price, sym)}/seat × ${sc.seats})` : ' (flat)')}
                    value={`${fmtCurr(monthly, sym)}/mo`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* ── Payment schedule ────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-slate-700">
            <CreditCard size={15} className="text-brand-500" />
            <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">Payment Schedule</span>
          </div>
          <div className="px-5 pb-4 divide-y divide-gray-50 dark:divide-slate-700">
            {sc.billingCycle === 'monthly'   && <Row label="Monthly invoice"   value={fmtCurr(mrr, sym)} />}
            {sc.billingCycle === 'quarterly' && <Row label="Quarterly invoice" value={fmtCurr(mrr * 3, sym)} />}
            {sc.billingCycle === 'annually'  && <Row label="Annual invoice"    value={fmtCurr(mrr * 12, sym)} />}
            <Row label={`Year 1 (inc. £${onboarding.toFixed(2)} onboarding)`} value={fmtCurr(year1Total, sym)} bold />
            {sc.term > 12 && (
              <Row label={`Years 2–${sc.term === 36 ? 3 : 5} (per year)`} value={fmtCurr(arr, sym)} />
            )}
            <Row label={`Total Contract (${termLabel})`} value={fmtCurr(tcv + onboarding, sym)} bold />
          </div>
        </div>

      </div>
    </div>
  );
}

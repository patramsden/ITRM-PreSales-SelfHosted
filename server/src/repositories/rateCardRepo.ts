import { query } from '../shared/db';
import type { RateCard } from '../types/index';

function toRateCard(r: Record<string, unknown>): RateCard {
  return {
    id: r.id as string, role: r.role as string,
    costRate: Number(r.cost_rate), sellRate: Number(r.sell_rate),
    currency: r.currency as RateCard['currency'],
    effectiveFrom: (r.effective_from as Date).toISOString().split('T')[0],
    effectiveTo:   r.effective_to ? (r.effective_to as Date).toISOString().split('T')[0] : undefined,
    overtimeEnabled: r.overtime_enabled === true,
  };
}

export async function getAllRateCards(): Promise<RateCard[]> {
  return (await query('SELECT * FROM rate_cards ORDER BY role')).map(toRateCard);
}

export async function createRateCard(r: RateCard): Promise<void> {
  await query(
    `INSERT INTO rate_cards (id,role,cost_rate,sell_rate,currency,effective_from,effective_to,overtime_enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [r.id, r.role, r.costRate, r.sellRate, r.currency, r.effectiveFrom,
     r.effectiveTo ?? null, r.overtimeEnabled ?? false],
  );
}

export async function updateRateCard(id: string, r: RateCard): Promise<void> {
  await query(
    `UPDATE rate_cards SET role=$2,cost_rate=$3,sell_rate=$4,currency=$5,
       effective_from=$6,effective_to=$7,overtime_enabled=$8 WHERE id=$1`,
    [id, r.role, r.costRate, r.sellRate, r.currency, r.effectiveFrom,
     r.effectiveTo ?? null, r.overtimeEnabled ?? false],
  );
}

export async function deleteRateCard(id: string): Promise<void> {
  await query('DELETE FROM rate_cards WHERE id=$1', [id]);
}

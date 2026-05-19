import { query } from '../shared/db';
import type { Template, Part, ConsultancyPhase, ConsultancyTask } from '../types/index';

function toPart(r: Record<string, unknown>): Part {
  return {
    id: r.id as string, description: r.description as string,
    sku: (r.sku as string) ?? undefined, quantity: Number(r.quantity),
    unitCost: Number(r.unit_cost), unitPrice: Number(r.unit_price),
    partType: (r.part_type as Part['partType']) ?? 'Hardware', quotes: [],
  };
}
function toTask(r: Record<string, unknown>): ConsultancyTask {
  const m = Number(r.rate_multiplier ?? 1);
  return {
    id: r.id as string, name: r.name as string, role: (r.role as string) ?? '',
    days: Number(r.days), dayRate: Number(r.day_rate),
    unit: (r.unit as string) === 'hours' ? 'hours' : 'days',
    rateMultiplier: ([1, 1.5, 2].includes(m) ? m : 1) as 1 | 1.5 | 2,
  };
}

export async function getAllTemplates(): Promise<Template[]> {
  const rows = await query('SELECT * FROM templates ORDER BY name');
  if (!rows.length) return [];

  const ids  = rows.map(r => r.id as string);
  const ph   = (arr: unknown[]) => arr.map((_, i) => `$${i + 1}`).join(',');

  const parts  = await query(`SELECT * FROM template_parts  WHERE template_id IN (${ph(ids)}) ORDER BY sort_order`, ids);
  const phases = await query(`SELECT * FROM template_phases WHERE template_id IN (${ph(ids)}) ORDER BY sort_order`, ids);
  const phIds  = phases.map(r => r.id as string);
  const tasks  = phIds.length
    ? await query(`SELECT * FROM template_tasks WHERE phase_id IN (${ph(phIds)}) ORDER BY sort_order`, phIds)
    : [];

  return rows.map(row => {
    const tid = row.id as string;
    return {
      id: tid, name: row.name as string,
      description: (row.description as string) ?? undefined,
      ownerId: row.owner_id as string,
      dateCreated: (row.date_created as Date).toISOString().split('T')[0],
      parts:  parts.filter(p => p.template_id === tid).map(toPart),
      phases: phases.filter(ph => ph.template_id === tid).map(ph => ({
        id: ph.id as string, name: ph.name as string,
        tasks: tasks.filter(t => t.phase_id === ph.id).map(toTask),
      } as ConsultancyPhase)),
    };
  });
}

async function writeTemplateParts(t: Template): Promise<void> {
  await query('DELETE FROM template_parts  WHERE template_id=$1', [t.id]);
  await query('DELETE FROM template_phases WHERE template_id=$1', [t.id]);

  for (let i = 0; i < t.parts.length; i++) {
    const p = t.parts[i];
    await query(
      `INSERT INTO template_parts (id,template_id,description,sku,quantity,unit_cost,unit_price,part_type,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [p.id, t.id, p.description, p.sku ?? null, p.quantity, p.unitCost, p.unitPrice, p.partType ?? 'Hardware', i],
    );
  }
  for (let i = 0; i < t.phases.length; i++) {
    const ph = t.phases[i];
    await query('INSERT INTO template_phases (id,template_id,name,sort_order) VALUES ($1,$2,$3,$4)',
      [ph.id, t.id, ph.name, i]);
    for (let j = 0; j < ph.tasks.length; j++) {
      const task = ph.tasks[j];
      await query(
        `INSERT INTO template_tasks (id,phase_id,name,role,days,day_rate,unit,rate_multiplier,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [task.id, ph.id, task.name, task.role, task.days, task.dayRate,
         task.unit ?? 'days', task.rateMultiplier ?? 1, j],
      );
    }
  }
}

export async function createTemplate(t: Template): Promise<void> {
  await query('INSERT INTO templates (id,name,description,owner_id,date_created) VALUES ($1,$2,$3,$4,$5)',
    [t.id, t.name, t.description ?? null, t.ownerId, t.dateCreated]);
  await writeTemplateParts(t);
}

export async function updateTemplate(id: string, t: Template): Promise<void> {
  await query('UPDATE templates SET name=$2,description=$3 WHERE id=$1',
    [id, t.name, t.description ?? null]);
  await writeTemplateParts(t);
}

export async function deleteTemplate(id: string): Promise<void> {
  await query('DELETE FROM templates WHERE id=$1', [id]);
}

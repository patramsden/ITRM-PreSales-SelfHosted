import { getPool, query, generateProposalReference } from '../shared/db';
import type { Proposal, Part, VendorQuote, ConsultancyPhase, ConsultancyTask } from '../types/index';

// ─── Row → domain mappers ────────────────────────────────────────────────────

function toQuote(r: Record<string, unknown>): VendorQuote {
  return {
    id: r.id as string, vendor: (r.vendor as string) ?? '',
    reference: (r.reference as string) ?? '', cost: Number(r.cost),
    validUntil: r.valid_until ? (r.valid_until as Date).toISOString().split('T')[0] : '',
    notes: (r.notes as string) ?? undefined,
    selected: r.is_selected === true,
    attachmentName: (r.attachment_name as string) ?? undefined,
    attachmentMime: (r.attachment_mime as string) ?? undefined,
    attachmentData: (r.attachment_data as string) ?? undefined,
  };
}

function toPart(r: Record<string, unknown>, quotes: VendorQuote[]): Part {
  return {
    id: r.id as string, description: r.description as string,
    sku: (r.sku as string) ?? undefined, quantity: Number(r.quantity),
    unitCost: Number(r.unit_cost), unitPrice: Number(r.unit_price),
    partType: (r.part_type as Part['partType']) ?? 'Hardware', quotes,
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

function toProposal(r: Record<string, unknown>, parts: Part[], phases: ConsultancyPhase[]): Proposal {
  return {
    id: r.id as string, projectName: r.project_name as string,
    client: r.client as string, accountManager: (r.account_manager as string) ?? '',
    status: r.status as Proposal['status'], currency: r.currency as Proposal['currency'],
    dateCreated:  (r.date_created  as Date).toISOString().split('T')[0],
    dateModified: (r.date_modified as Date).toISOString().split('T')[0],
    ticketRef: (r.ticket_ref as string) ?? undefined,
    markupPct: Number(r.markup_pct),
    objectives:           (r.objectives           as string) ?? undefined,
    businessRequirements: (r.business_requirements as string) ?? undefined,
    justification:        (r.justification         as string) ?? undefined,
    constraints:          (r.constraints           as string) ?? undefined,
    assumptions:          (r.assumptions           as string) ?? undefined,
    notes:                (r.notes                 as string) ?? undefined,
    ownerId:         r.owner_id as string,
    collaboratorIds: JSON.parse((r.collaborator_ids as string) || '[]') as string[],
    sowContent:  (r.sow_content  as string) ?? undefined,
    plannerUrl:  (r.planner_url  as string) ?? undefined,
    templateId:  (r.template_id  as string) ?? undefined,
    trbStatus:   (r.trb_status   as Proposal['trbStatus']) ?? undefined,
    trbReviewNotes: (r.trb_review_notes as string) ?? undefined,
    trbReviewedBy:  (r.trb_reviewed_by  as string) ?? undefined,
    trbReviewedAt:  r.trb_reviewed_at ? (r.trb_reviewed_at as Date).toISOString() : undefined,
    fiveKStatus:    (r.five_k_status as Proposal['fiveKStatus']) ?? undefined,
    fiveKAttendees: JSON.parse((r.five_k_attendees as string) || '[]'),
    fiveKNotes:     (r.five_k_notes as string) ?? undefined,
    fiveKMeetingDate: r.five_k_meeting_date ? (r.five_k_meeting_date as Date).toISOString().split('T')[0] : undefined,
    milestones:       JSON.parse((r.milestones    as string) || '[]'),
    clientContact:    (r.client_contact   as string) ?? undefined,
    crmCompanyId:     (r.crm_company_id   as string) ?? undefined,
    useRateCardCost:  !!(r.use_rate_card_cost),
    lastModifiedBy:   (r.last_modified_by as string) ?? undefined,
    lastModifiedAt:   r.last_modified_at ? (r.last_modified_at as Date).toISOString() : undefined,
    reference:        (r.reference        as string) ?? undefined,
    trbApprovedFingerprint:   (r.trb_approved_fingerprint   as string) ?? undefined,
    fiveKApprovedFingerprint: (r.five_k_approved_fingerprint as string) ?? undefined,
    wonLostReason:        (r.won_lost_reason as string) ?? undefined,
    competitorName:       (r.competitor_name as string) ?? undefined,
    wonLostNote:          (r.won_lost_note   as string) ?? undefined,
    wonLostAt:            r.won_lost_at ? (r.won_lost_at as Date).toISOString() : undefined,
    expiresAt:            r.expires_at ? (r.expires_at as Date).toISOString().split('T')[0] : undefined,
    discountStatus:       (r.discount_status as Proposal['discountStatus']) ?? undefined,
    discountApprovedBy:   (r.discount_approved_by   as string) ?? undefined,
    discountApprovedAt:   r.discount_approved_at ? (r.discount_approved_at as Date).toISOString() : undefined,
    discountApprovalNote: (r.discount_approval_note as string) ?? undefined,
    atProjectId:          (r.at_project_id as string) ?? undefined,
    parts, phases,
  };
}

// ─── Bulk loader ──────────────────────────────────────────────────────────────

async function loadNested(proposalIds: string[]) {
  if (!proposalIds.length) return { parts: [], quotes: [], phases: [], tasks: [] };

  const placeholders = (arr: unknown[]) => arr.map((_, i) => `$${i + 1}`).join(',');

  const parts  = await query(`SELECT * FROM parts  WHERE proposal_id IN (${placeholders(proposalIds)}) ORDER BY sort_order`, proposalIds);
  const phases = await query(`SELECT * FROM phases WHERE proposal_id IN (${placeholders(proposalIds)}) ORDER BY sort_order`, proposalIds);

  const partIds  = parts.map(r => r.id  as string);
  const phaseIds = phases.map(r => r.id as string);

  const quotes = partIds.length
    ? await query(`SELECT * FROM vendor_quotes WHERE part_id  IN (${placeholders(partIds)})`,  partIds)
    : [];
  const tasks  = phaseIds.length
    ? await query(`SELECT * FROM tasks          WHERE phase_id IN (${placeholders(phaseIds)}) ORDER BY sort_order`, phaseIds)
    : [];

  return { parts, quotes, phases, tasks };
}

function assemble(
  row: Record<string, unknown>,
  parts: Record<string, unknown>[],
  quotes: Record<string, unknown>[],
  phases: Record<string, unknown>[],
  tasks: Record<string, unknown>[],
): Proposal {
  const pid = row.id as string;
  const assembledParts = parts
    .filter(p => p.proposal_id === pid)
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map(p => toPart(p, quotes.filter(q => q.part_id === p.id).map(toQuote)));
  const assembledPhases = phases
    .filter(ph => ph.proposal_id === pid)
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map(ph => ({
      id: ph.id as string, name: ph.name as string,
      tasks: tasks
        .filter(t => t.phase_id === ph.id)
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
        .map(toTask),
    } as ConsultancyPhase));
  return toProposal(row, assembledParts, assembledPhases);
}

// ─── Nested writer ────────────────────────────────────────────────────────────

async function writeNested(proposal: Proposal): Promise<void> {
  await query('DELETE FROM parts  WHERE proposal_id=$1', [proposal.id]);
  await query('DELETE FROM phases WHERE proposal_id=$1', [proposal.id]);

  for (let pi = 0; pi < proposal.parts.length; pi++) {
    const p = proposal.parts[pi];
    await query(
      `INSERT INTO parts (id,proposal_id,description,sku,quantity,unit_cost,unit_price,part_type,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [p.id, proposal.id, p.description, p.sku ?? null, p.quantity, p.unitCost, p.unitPrice, p.partType ?? 'Hardware', pi],
    );
    for (const q of p.quotes) {
      await query(
        `INSERT INTO vendor_quotes
           (id,part_id,vendor,reference,cost,valid_until,notes,is_selected,attachment_name,attachment_mime,attachment_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [q.id, p.id, q.vendor, q.reference, q.cost, q.validUntil || null,
         q.notes ?? null, q.selected, q.attachmentName ?? null, q.attachmentMime ?? null, q.attachmentData ?? null],
      );
    }
  }

  for (let phi = 0; phi < proposal.phases.length; phi++) {
    const ph = proposal.phases[phi];
    await query('INSERT INTO phases (id,proposal_id,name,sort_order) VALUES ($1,$2,$3,$4)',
      [ph.id, proposal.id, ph.name, phi]);
    for (let ti = 0; ti < ph.tasks.length; ti++) {
      const t = ph.tasks[ti];
      await query(
        `INSERT INTO tasks (id,phase_id,name,role,days,day_rate,unit,rate_multiplier,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [t.id, ph.id, t.name, t.role, t.days, t.dayRate, t.unit ?? 'days', t.rateMultiplier ?? 1, ti],
      );
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getAllProposals(): Promise<Proposal[]> {
  const rows = await query('SELECT * FROM proposals ORDER BY date_modified DESC');
  if (!rows.length) return [];
  const { parts, quotes, phases, tasks } = await loadNested(rows.map(r => r.id as string));
  return rows.map(r => assemble(r, parts, quotes, phases, tasks));
}

export async function getProposalById(id: string): Promise<Proposal | null> {
  const rows = await query('SELECT * FROM proposals WHERE id=$1', [id]);
  if (!rows.length) return null;
  const { parts, quotes, phases, tasks } = await loadNested([id]);
  return assemble(rows[0], parts, quotes, phases, tasks);
}

export async function createProposal(p: Proposal): Promise<Proposal> {
  const reference = await generateProposalReference(new Date(p.dateCreated));
  await query(
    `INSERT INTO proposals (id,project_name,client,account_manager,status,currency,
       date_created,date_modified,ticket_ref,markup_pct,objectives,business_requirements,
       justification,constraints,assumptions,notes,owner_id,collaborator_ids,sow_content,
       planner_url,template_id,trb_status,trb_review_notes,trb_reviewed_by,trb_reviewed_at,
       five_k_status,five_k_attendees,five_k_notes,five_k_meeting_date,
       client_contact,crm_company_id,milestones,reference,
       trb_approved_fingerprint,five_k_approved_fingerprint,
       won_lost_reason,competitor_name,won_lost_note,won_lost_at,
       expires_at,discount_status,discount_approved_by,discount_approved_at,discount_approval_note,
       at_project_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45)`,
    [p.id, p.projectName, p.client, p.accountManager ?? null, p.status, p.currency,
     p.dateCreated, p.dateModified, p.ticketRef ?? null, p.markupPct,
     p.objectives ?? null, p.businessRequirements ?? null, p.justification ?? null,
     p.constraints ?? null, p.assumptions ?? null, p.notes ?? null,
     p.ownerId, JSON.stringify(p.collaboratorIds), p.sowContent ?? null,
     p.plannerUrl ?? null, p.templateId ?? null, p.trbStatus ?? null,
     p.trbReviewNotes ?? null, p.trbReviewedBy ?? null,
     p.trbReviewedAt ? new Date(p.trbReviewedAt) : null, p.fiveKStatus ?? null,
     JSON.stringify(p.fiveKAttendees ?? []), p.fiveKNotes ?? null,
     p.fiveKMeetingDate ? new Date(p.fiveKMeetingDate) : null,
     p.clientContact ?? null, p.crmCompanyId ?? null, JSON.stringify(p.milestones ?? []),
     reference,
     p.trbApprovedFingerprint ?? null, p.fiveKApprovedFingerprint ?? null,
     p.wonLostReason ?? null, p.competitorName ?? null, p.wonLostNote ?? null,
     p.wonLostAt ? new Date(p.wonLostAt) : null,
     p.expiresAt ?? null,
     p.discountStatus ?? null, p.discountApprovedBy ?? null,
     p.discountApprovedAt ? new Date(p.discountApprovedAt) : null,
     p.discountApprovalNote ?? null, p.atProjectId ?? null],
  );
  await writeNested(p);
  return { ...p, reference };
}

export async function updateProposal(id: string, p: Proposal): Promise<void> {
  await query(
    `UPDATE proposals SET project_name=$2,client=$3,account_manager=$4,status=$5,currency=$6,
       date_created=$7,date_modified=$8,ticket_ref=$9,markup_pct=$10,objectives=$11,
       business_requirements=$12,justification=$13,constraints=$14,assumptions=$15,notes=$16,
       owner_id=$17,collaborator_ids=$18,sow_content=$19,planner_url=$20,template_id=$21,
       trb_status=$22,trb_review_notes=$23,trb_reviewed_by=$24,trb_reviewed_at=$25,
       five_k_status=$26,five_k_attendees=$27,five_k_notes=$28,five_k_meeting_date=$29,
       client_contact=$30,crm_company_id=$31,milestones=$32,
       trb_approved_fingerprint=$33,five_k_approved_fingerprint=$34,
       won_lost_reason=$35,competitor_name=$36,won_lost_note=$37,won_lost_at=$38,
       expires_at=$39,discount_status=$40,discount_approved_by=$41,
       discount_approved_at=$42,discount_approval_note=$43,at_project_id=$44
     WHERE id=$1`,
    [id, p.projectName, p.client, p.accountManager ?? null, p.status, p.currency,
     p.dateCreated, p.dateModified, p.ticketRef ?? null, p.markupPct,
     p.objectives ?? null, p.businessRequirements ?? null, p.justification ?? null,
     p.constraints ?? null, p.assumptions ?? null, p.notes ?? null,
     p.ownerId, JSON.stringify(p.collaboratorIds), p.sowContent ?? null,
     p.plannerUrl ?? null, p.templateId ?? null, p.trbStatus ?? null,
     p.trbReviewNotes ?? null, p.trbReviewedBy ?? null,
     p.trbReviewedAt ? new Date(p.trbReviewedAt) : null, p.fiveKStatus ?? null,
     JSON.stringify(p.fiveKAttendees ?? []), p.fiveKNotes ?? null,
     p.fiveKMeetingDate ? new Date(p.fiveKMeetingDate) : null,
     p.clientContact ?? null, p.crmCompanyId ?? null, JSON.stringify(p.milestones ?? []),
     p.trbApprovedFingerprint ?? null, p.fiveKApprovedFingerprint ?? null,
     p.wonLostReason ?? null, p.competitorName ?? null, p.wonLostNote ?? null,
     p.wonLostAt ? new Date(p.wonLostAt) : null,
     p.expiresAt ?? null,
     p.discountStatus ?? null, p.discountApprovedBy ?? null,
     p.discountApprovedAt ? new Date(p.discountApprovedAt) : null,
     p.discountApprovalNote ?? null, p.atProjectId ?? null],
  );
  await writeNested(p);
}

export async function deleteProposal(id: string): Promise<void> {
  await query('DELETE FROM proposals WHERE id=$1', [id]);
}

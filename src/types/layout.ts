export type SectionId =
  | 'cover'
  | 'summary'
  | 'commercial'
  | 'consultancy'
  | 'milestones'
  | 'sow'
  | 'terms';

export interface LayoutSection {
  id: SectionId;
  label: string;
  enabled: boolean;
  order: number;
  /** Only used for 'terms' section */
  content?: string;
}

export interface ProposalLayoutConfig {
  sections: LayoutSection[];
  header: {
    showLogo: boolean;
    /** Overrides branding.companyName when set */
    companyName?: string;
    /** Overrides branding.primaryColor when set — hex e.g. #2B3990 */
    primaryColor?: string;
    tagline?: string;
  };
  footer: {
    text?: string;
    showDate: boolean;
    showPageNumbers: boolean;
  };
}

export const DEFAULT_LAYOUT: ProposalLayoutConfig = {
  sections: [
    { id: 'cover',       label: 'Cover Page',             enabled: true,  order: 0 },
    { id: 'summary',     label: 'Executive Summary',      enabled: true,  order: 1 },
    { id: 'commercial',  label: 'Commercial Summary',     enabled: true,  order: 2 },
    { id: 'consultancy', label: 'Consultancy Breakdown',  enabled: true,  order: 3 },
    { id: 'milestones',  label: 'Billing Milestones',     enabled: false, order: 4 },
    { id: 'sow',         label: 'Statement of Work',      enabled: true,  order: 5 },
    { id: 'terms',       label: 'Terms & Conditions',     enabled: false, order: 6, content: '' },
  ],
  header: { showLogo: true },
  footer: { showDate: true, showPageNumbers: true },
};

export function parseLayout(raw: string | undefined): ProposalLayoutConfig {
  if (!raw) return DEFAULT_LAYOUT;
  try {
    const parsed = JSON.parse(raw) as Partial<ProposalLayoutConfig>;
    // Merge with defaults so new sections added in future releases still appear
    const sectionMap = new Map(DEFAULT_LAYOUT.sections.map(s => [s.id, { ...s }]));
    for (const s of parsed.sections ?? []) {
      const existing = sectionMap.get(s.id);
      if (existing) Object.assign(existing, s);
    }
    return {
      sections: Array.from(sectionMap.values()).sort((a, b) => a.order - b.order),
      header: { ...DEFAULT_LAYOUT.header, ...(parsed.header ?? {}) },
      footer: { ...DEFAULT_LAYOUT.footer, ...(parsed.footer ?? {}) },
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

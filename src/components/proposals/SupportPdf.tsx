/**
 * SupportPdf — generates a downloadable PDF for the IT Managed Service Agreement.
 *
 * Uses @react-pdf/renderer (same library as ProposalPdf) so the output is a
 * real vector PDF, not a browser print screenshot.
 *
 * Mirrors the 13-page document structure in SupportDocumentTab.
 */
import { useState } from 'react';
import {
  pdf, Document, Page, Text, View, Image, StyleSheet,
} from '@react-pdf/renderer';
import { FileDown, Loader2, AlertCircle } from 'lucide-react';
import type { Proposal, SupportContract, SupportScopeItem, ExtraDocSection } from '../../types';
import { htmlToPlainText } from '../ui/RichTextEditor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Branding {
  companyName: string;
  primaryColor: string;
  logo: string | null;
  subtitle?: string;
}

interface SupportPdfProps {
  proposal:       Proposal;
  branding:       Branding;
  boilerplate:    Record<string, string>;
  bpImages:       Record<string, string>;
  companyAddress: string;
  companyWebsite: string;
  companyPhone:   string;
  /** Pre-populated scope from the document tab (with defaults merged in) */
  scope:          SupportScopeItem[];
  /** Custom extra sections inserted between §8 and Schedule 1 */
  extraSections?: ExtraDocSection[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurr(n: number, sym: string): string {
  return `${sym}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return iso; }
}

function sym(currency: string): string {
  return currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
}

function calcDiscountedBase(price: number, pct: number): number {
  return price * (1 - pct / 100);
}

function calcMRR(sc: SupportContract): number {
  const base   = calcDiscountedBase(sc.pricePerSeat, sc.termDiscountPct ?? 0);
  const full   = base * sc.seats;
  const part   = base * 0.5 * (sc.partTimeSeats ?? 0);
  const addons = (sc.addOns ?? []).reduce((s, a) =>
    s + (a.priceType === 'per_seat' ? a.price * sc.seats : a.price), 0);
  return full + part + addons;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(primary: string) {
  const DARK  = '#1a1a2e';
  const MID   = '#374151';
  const LIGHT = '#6b7280';
  const RULE  = '#e2e8f0';
  const ALT   = '#f8fafc';

  return StyleSheet.create({
    // Pages
    coverPage: { backgroundColor: DARK, padding: 60, flex: 1, justifyContent: 'center' },
    page: { padding: '14mm 14mm 20mm 14mm', fontFamily: 'Helvetica', fontSize: 10, color: MID, flex: 1 },

    // Cover text
    coverBrand:   { fontSize: 11, color: '#9ba8d0', letterSpacing: 3, marginBottom: 40, fontFamily: 'Helvetica-Bold' },
    coverTitle:   { fontSize: 26, color: '#ffffff', fontFamily: 'Helvetica-Bold', marginBottom: 10, lineHeight: 1.3 },
    coverClient:  { fontSize: 14, color: '#c7d0f0', marginBottom: 5 },
    coverMeta:    { fontSize: 9.5, color: '#8b98c4', marginTop: 3 },
    coverDivider: { borderBottom: `2px solid ${primary}`, marginTop: 28, marginBottom: 28, width: 60 },
    coverFooter:  { position: 'absolute', bottom: 40, left: 60, right: 60, fontSize: 8, color: '#6b7280' },

    // Section headings
    h1: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: primary, marginBottom: 4, marginTop: 12 },
    h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: primary, marginTop: 14, marginBottom: 5 },
    h3: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 10, marginBottom: 4 },
    rule: { borderBottom: `1.5px solid ${primary}`, marginBottom: 10 },
    subRule: { borderBottom: `0.5px solid ${RULE}`, marginBottom: 8 },

    // Body text
    para:   { fontSize: 9.5, lineHeight: 1.6, marginBottom: 5, color: MID },
    bullet: { fontSize: 9.5, lineHeight: 1.6, marginBottom: 3, color: MID, marginLeft: 10 },
    small:  { fontSize: 8.5, color: LIGHT, fontStyle: 'italic', marginTop: 4 },
    label:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, width: 100 },
    value:  { fontSize: 9, color: MID, flex: 1 },

    // Tables
    tableHeader: { flexDirection: 'row', backgroundColor: primary },
    tableRow:    { flexDirection: 'row', borderBottom: `0.5px solid ${RULE}` },
    tableRowAlt: { flexDirection: 'row', backgroundColor: ALT, borderBottom: `0.5px solid ${RULE}` },
    tableWrap:   { border: `0.5px solid ${RULE}`, borderRadius: 2, marginBottom: 10, overflow: 'hidden' },
    thCell:      { padding: '4 6', color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
    tdCell:      { padding: '4 6', fontSize: 8.5, color: MID },
    tdCellRight: { padding: '4 6', fontSize: 8.5, color: MID, textAlign: 'right' },
    tdBold:      { padding: '4 6', fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK },
    tdBoldRight: { padding: '4 6', fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right' },
    totalsRow:   { flexDirection: 'row', backgroundColor: DARK },
    totalsCell:      { padding: '5 6', color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 9 },
    totalsCellRight: { padding: '5 6', color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 9, textAlign: 'right' },

    // Stat cards
    statGrid:  { flexDirection: 'row', gap: 6, marginBottom: 12 },
    statCard:  { flex: 1, border: `0.5px solid ${RULE}`, borderRadius: 4, padding: '8 10', backgroundColor: ALT },
    statAccent:{ flex: 1, borderRadius: 4, padding: '8 10', backgroundColor: primary },
    statLabel: { fontSize: 7.5, color: LIGHT, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
    statLabelLight: { fontSize: 7.5, color: '#dde6ff', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
    statValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: DARK },
    statValueLight: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#ffffff' },

    // Footer
    footer: {
      position: 'absolute', bottom: 14, left: 14, right: 14,
      flexDirection: 'row', justifyContent: 'space-between',
      fontSize: 7.5, color: '#9ca3af', borderTop: `0.5px solid ${RULE}`, paddingTop: 4,
    },

    // Signature boxes
    sigBox:  { flex: 1, marginHorizontal: 10 },
    sigLine: { borderBottom: `0.5px solid #9ca3af`, marginBottom: 3, minHeight: 20 },
    sigLabel:{ fontSize: 8, color: LIGHT },
  });
}

// ─── Text renderer — handles newlines and bullet points ───────────────────────

function renderText(text: string, styles: ReturnType<typeof makeStyles>) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <View key={i} style={{ marginBottom: 4 }} />;
    if (line.trim().startsWith('• ') || line.trim().startsWith('- ')) {
      return <Text key={i} style={styles.bullet}>{'•  '}{line.trim().replace(/^[•\-]\s*/, '')}</Text>;
    }
    return <Text key={i} style={styles.para}>{line}</Text>;
  });
}

// ─── Page footer (fixed) ──────────────────────────────────────────────────────

function PageFooter({ companyName }: { companyName: string }) {
  const styles = makeStyles('#000');
  return (
    <View style={styles.footer} fixed>
      <Text>{companyName} — IT Managed Service Agreement — Confidential</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionH({ num, title, styles }: { num: number | string; title: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <>
      <Text style={styles.h1}>{num}.  {title}</Text>
      <View style={styles.rule} />
    </>
  );
}

function SubH({ num, title, styles }: { num: string; title: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <Text style={styles.h3}>{num}  {title}</Text>
  );
}

// ─── PDF Document component ───────────────────────────────────────────────────

function SupportPdfDocument({
  proposal, branding, boilerplate, bpImages,
  companyAddress, companyWebsite, companyPhone, scope,
  extraSections = [],
}: SupportPdfProps) {
  const sc     = proposal.supportContract!;
  const S      = sym(proposal.currency);
  const styles = makeStyles(branding.primaryColor);

  const discountedBase = calcDiscountedBase(sc.pricePerSeat, sc.termDiscountPct ?? 0);
  const mrr            = calcMRR(sc);
  const arr            = mrr * 12;
  const tcv            = mrr * sc.term;
  const onboarding     = sc.onboardingCost ?? 0;
  const termLabel      = sc.term === 12 ? '1 Year' : sc.term === 36 ? '3 Years' : '5 Years';
  const docDate        = fmtDate(proposal.dateModified ?? new Date().toISOString());
  const author         = sc.contactName || proposal.accountManager || '';
  const preparedFor    = sc.clientContactName || proposal.clientContact || '';
  const noticePeriod   = sc.noticePeriod || '90';
  const paymentTerms   = sc.paymentTermsText || 'Monthly in advance';
  const yearCosts      = Array.from({ length: Math.ceil(sc.term / 12) }, (_, i) =>
    i === 0 ? arr + onboarding : arr);

  const hoursLabel = sc.supportHours === 'standard' ? 'Mon–Fri 9am–5pm'
    : sc.supportHours === 'extended' ? 'Mon–Fri 8am–6pm'
    : 'Mon–Fri 7am–7pm';

  const addonMRR = (sc.addOns ?? []).reduce((s, a) =>
    s + (a.priceType === 'per_seat' ? a.price * sc.seats : a.price), 0);

  return (
    <Document
      title={`${proposal.projectName} — IT Managed Service Agreement`}
      author={branding.companyName}
      subject="Managed IT Service Proposal"
    >

      {/* ── 1. Cover page ─────────────────────────────────────────── */}
      <Page size="A4" style={styles.coverPage}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 40 }}>
          {branding.logo
            ? <Image src={branding.logo} style={{ height: 56, objectFit: 'contain' }} />
            : <Text style={styles.coverBrand}>{branding.companyName.toUpperCase()}</Text>
          }
        </View>
        <Text style={styles.coverTitle}>Proposal for IT Managed{'\n'}Service Agreement</Text>
        <View style={styles.coverDivider} />
        <Text style={styles.coverClient}>{proposal.client}</Text>
        {author       && <Text style={styles.coverMeta}>Prepared by: {author}</Text>}
        {preparedFor  && <Text style={styles.coverMeta}>Prepared for: {preparedFor}</Text>}
        <Text style={styles.coverMeta}>Date: {docDate}</Text>
        <Text style={styles.coverMeta}>Contract term: {termLabel}</Text>

        <View style={styles.coverFooter}>
          {(companyWebsite || companyPhone || companyAddress) && (
            <Text>
              {[companyWebsite, companyPhone, companyAddress].filter(Boolean).join('  ·  ')}
            </Text>
          )}
          <Text style={{ marginTop: 4, fontSize: 7.5, color: '#555' }}>
            This document is confidential and for the named recipient only.
          </Text>
        </View>
      </Page>

      {/* ── 2. Confidential Information & Contact ─────────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={1} title="Confidential Information" styles={styles} />
        {renderText(htmlToPlainText(boilerplate.confidentialityNotice || ''), styles)}
        {bpImages.confidentialityNotice && (
          <Image src={bpImages.confidentialityNotice} style={{ maxHeight: 80, objectFit: 'contain', marginTop: 8 }} />
        )}

        <SubH num="1.1" title="Contact Information" styles={styles} />
        <Text style={[styles.para, { marginBottom: 8 }]}>For further information and discussion, please contact:</Text>

        {[
          ['Name',        sc.contactName],
          ['Designation', sc.contactTitle],
          ['Address',     sc.contactAddress],
          ['Phone',       sc.contactPhone],
          ['Mobile',      sc.contactMobile],
          ['Email',       sc.contactEmail],
        ].filter(([, v]) => v).map(([k, v]) => (
          <View key={k as string} style={{ flexDirection: 'row', marginBottom: 3 }}>
            <Text style={styles.label}>{k}:</Text>
            <Text style={styles.value}>{v}</Text>
          </View>
        ))}

        <PageFooter companyName={branding.companyName} />
      </Page>

      {/* ── 3. Company Introduction ───────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={2} title={`${branding.companyName} – An Introduction`} styles={styles} />
        {renderText(htmlToPlainText(boilerplate.intro || ''), styles)}
        {bpImages.intro && (
          <Image src={bpImages.intro} style={{ maxHeight: 100, objectFit: 'contain', marginTop: 10 }} />
        )}
        <PageFooter companyName={branding.companyName} />
      </Page>

      {/* ── 4. Background ────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={3} title={`${branding.companyName}'s Background`} styles={styles} />
        {renderText(htmlToPlainText(boilerplate.background || ''), styles)}
        {bpImages.background && (
          <Image src={bpImages.background} style={{ maxHeight: 100, objectFit: 'contain', marginTop: 10 }} />
        )}
        <PageFooter companyName={branding.companyName} />
      </Page>

      {/* ── 5. Staff ─────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={4} title="Staff, Qualifications and Experience" styles={styles} />
        {renderText(htmlToPlainText(boilerplate.staff || ''), styles)}
        {bpImages.staff && (
          <Image src={bpImages.staff} style={{ maxHeight: 100, objectFit: 'contain', marginTop: 10 }} />
        )}
        <PageFooter companyName={branding.companyName} />
      </Page>

      {/* ── 6. Certifications ────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={5} title="Certificates and Accreditations" styles={styles} />
        {renderText(htmlToPlainText(boilerplate.certifications || ''), styles)}
        {bpImages.certifications && (
          <Image src={bpImages.certifications} style={{ maxHeight: 120, objectFit: 'contain', marginTop: 10 }} />
        )}
        <PageFooter companyName={branding.companyName} />
      </Page>

      {/* ── 7. Service Requirements ──────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={6} title="Service Requirements" styles={styles} />
        {renderText(htmlToPlainText(boilerplate.serviceRequirements || ''), styles)}
        {bpImages.serviceRequirements && (
          <Image src={bpImages.serviceRequirements} style={{ maxHeight: 80, objectFit: 'contain', marginTop: 8 }} />
        )}
        <PageFooter companyName={branding.companyName} />
      </Page>

      {/* ── 8. Business Requirements ─────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={7} title="Business Requirements" styles={styles} />
        {renderText(htmlToPlainText(boilerplate.businessRequirements || ''), styles)}
        {bpImages.businessRequirements && (
          <Image src={bpImages.businessRequirements} style={{ maxHeight: 80, objectFit: 'contain', marginTop: 8 }} />
        )}
        <PageFooter companyName={branding.companyName} />
      </Page>

      {/* ── 9. Contractual Requirements + SLA table ──────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={8} title="Contractual Requirements" styles={styles} />
        {renderText(htmlToPlainText(boilerplate.contractualTerms || ''), styles)}
        {bpImages.contractualTerms && (
          <Image src={bpImages.contractualTerms} style={{ maxHeight: 80, objectFit: 'contain', marginTop: 8 }} />
        )}

        <SubH num="8.2" title="Service Level Agreement Summary" styles={styles} />
        <View style={styles.tableWrap}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thCell, { flex: 1.5 }]}>Priority</Text>
            <Text style={[styles.thCell, { flex: 3 }]}>Systems</Text>
            <Text style={[styles.thCell, { flex: 2 }]}>Target Resolution / Response</Text>
          </View>
          {[
            ['P1 – Critical',        'Servers, Network, Routers, Firewalls, Internet Services',       `${sc.slaCriticalHours      ?? 4} Working Hours`],
            ['P2 – Standard',        'Workstations, Printers, Scanners, Peripherals, Standard Software', `${sc.slaStandardHours    ?? 8} Working Hours`],
            ['P3 – Service Request', 'User Set-ups, Deletions, Permissions, Software Config',         `${sc.slaServiceRequestHours ?? 24} Working Hours`],
          ].map(([p, s, r], i) => (
            <View key={p} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.tdCell, { flex: 1.5 }]}>{p}</Text>
              <Text style={[styles.tdCell, { flex: 3 }]}>{s}</Text>
              <Text style={[styles.tdCell, { flex: 2 }]}>{r}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.small}>Note: This service does not cover new installations, projects or office relocations. These are charged on an ad-hoc basis.</Text>

        <PageFooter companyName={branding.companyName} />
      </Page>

      {/* ── Extra sections (between §8 and Schedule 1) ───────────── */}
      {extraSections.map(es => (
        <Page key={es.id} size="A4" style={styles.page}>
          <Text style={styles.h1}>{es.title || 'Additional Section'}</Text>
          <View style={styles.rule} />
          {renderText(htmlToPlainText(es.content || ''), styles)}
          {es.image && (
            <Image src={es.image} style={{ maxHeight: 120, objectFit: 'contain', marginTop: 10 }} />
          )}
          <PageFooter companyName={branding.companyName} />
        </Page>
      ))}

      {/* ── 10. Schedule 1 ───────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={9} title="Schedule 1" styles={styles} />

        <SubH num="9.1" title="Scope of Services" styles={styles} />
        <View style={styles.tableWrap}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thCell, { flex: 5 }]}>Type of Service</Text>
            <Text style={[styles.thCell, { flex: 1, textAlign: 'center' }]}>Included</Text>
          </View>
          {scope.map((item, i) => (
            <View key={item.id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.tdCell, { flex: 5 }]}>{item.service}</Text>
              <Text style={[styles.tdCell, { flex: 1, textAlign: 'center', color: item.included ? '#16a34a' : '#9ca3af' }]}>
                {item.included ? '✓' : '✗'}
              </Text>
            </View>
          ))}
        </View>

        <SubH num="9.2" title="Supported Users Covered Under this Agreement" styles={styles} />
        <View style={styles.tableWrap}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thCell, { flex: 3 }]}>Users / Service</Text>
            <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>Cost/User/Month</Text>
            <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>Total per Annum</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.tdCell, { flex: 3 }]}>{sc.seats} Users (full-time)</Text>
            <Text style={[styles.tdCellRight, { flex: 1.5 }]}>{fmtCurr(discountedBase, S)}</Text>
            <Text style={[styles.tdCellRight, { flex: 1.5 }]}>{fmtCurr(discountedBase * sc.seats * 12, S)}</Text>
          </View>
          {(sc.partTimeSeats ?? 0) > 0 && (
            <View style={styles.tableRowAlt}>
              <Text style={[styles.tdCell, { flex: 3 }]}>{sc.partTimeSeats} Users (part-time, 50%)</Text>
              <Text style={[styles.tdCellRight, { flex: 1.5 }]}>{fmtCurr(discountedBase * 0.5, S)}</Text>
              <Text style={[styles.tdCellRight, { flex: 1.5 }]}>{fmtCurr(discountedBase * 0.5 * (sc.partTimeSeats ?? 0) * 12, S)}</Text>
            </View>
          )}
          {(sc.addOns ?? []).map((a, i) => {
            const monthly = a.priceType === 'per_seat' ? a.price * sc.seats : a.price;
            return (
              <View key={a.id} style={(i + 1) % 2 === 0 ? styles.tableRowAlt : styles.tableRow}>
                <Text style={[styles.tdCell, { flex: 3 }]}>{a.name}</Text>
                <Text style={[styles.tdCellRight, { flex: 1.5 }]}>{a.priceType === 'per_seat' ? `${fmtCurr(a.price, S)}/seat` : 'Flat'}</Text>
                <Text style={[styles.tdCellRight, { flex: 1.5 }]}>{fmtCurr(monthly * 12, S)}</Text>
              </View>
            );
          })}
          <View style={styles.totalsRow}>
            <Text style={[styles.totalsCell, { flex: 3 }]}>Total Annual Cost</Text>
            <Text style={{ flex: 1.5 }} />
            <Text style={[styles.totalsCellRight, { flex: 1.5 }]}>{fmtCurr(arr, S)}</Text>
          </View>
        </View>

        <SubH num="9.3" title="Commercial Overview" styles={styles} />
        <View style={styles.tableWrap}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thCell, { flex: 3 }]}>Service</Text>
            <Text style={[styles.thCell, { flex: 1, textAlign: 'right' }]}>Users / Qty</Text>
            <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>Total per Annum</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.tdCell, { flex: 3 }]}>IT Managed Service — {hoursLabel}</Text>
            <Text style={[styles.tdCellRight, { flex: 1 }]}>{sc.seats + (sc.partTimeSeats ?? 0)}</Text>
            <Text style={[styles.tdCellRight, { flex: 1.5 }]}>{fmtCurr(arr - addonMRR * 12, S)}</Text>
          </View>
          {(sc.addOns ?? []).map((a, i) => (
            <View key={a.id} style={(i + 1) % 2 === 0 ? styles.tableRowAlt : styles.tableRow}>
              <Text style={[styles.tdCell, { flex: 3 }]}>{a.name}</Text>
              <Text style={[styles.tdCellRight, { flex: 1 }]}>
                {a.priceType === 'per_seat' ? String(sc.seats) : '1'}
              </Text>
              <Text style={[styles.tdCellRight, { flex: 1.5 }]}>
                {fmtCurr((a.priceType === 'per_seat' ? a.price * sc.seats : a.price) * 12, S)}
              </Text>
            </View>
          ))}
          {onboarding > 0 && (
            <View style={styles.tableRowAlt}>
              <Text style={[styles.tdCell, { flex: 3 }]}>Onboarding / Setup</Text>
              <Text style={[styles.tdCellRight, { flex: 1 }]}>1</Text>
              <Text style={[styles.tdCellRight, { flex: 1.5 }]}>{fmtCurr(onboarding, S)}</Text>
            </View>
          )}
          {yearCosts.map((cost, i) => (
            <View key={i} style={styles.totalsRow}>
              <Text style={[styles.totalsCell, { flex: 3 }]}>Year {i + 1} Total</Text>
              <Text style={{ flex: 1 }} />
              <Text style={[styles.totalsCellRight, { flex: 1.5 }]}>{fmtCurr(cost, S)}</Text>
            </View>
          ))}
        </View>

        <PageFooter companyName={branding.companyName} />
      </Page>

      {/* ── 11. Contractual Terms ─────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={10} title="Contractual Terms" styles={styles} />

        <Text style={styles.para}>
          {termLabel} with {noticePeriod} days written notice required prior to the end of the contract term.
        </Text>

        <SubH num="10.1" title="Payment Terms" styles={styles} />
        <Text style={styles.para}>
          Payment terms for all services included in this agreement are <Text style={{ fontFamily: 'Helvetica-Bold' }}>{paymentTerms}</Text>.
        </Text>

        {/* Financial summary cards */}
        <View style={[styles.statGrid, { marginTop: 14 }]}>
          <View style={styles.statAccent}>
            <Text style={styles.statLabelLight}>Monthly Recurring</Text>
            <Text style={styles.statValueLight}>{fmtCurr(mrr, S)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Annual Recurring</Text>
            <Text style={styles.statValue}>{fmtCurr(arr, S)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Contract ({termLabel})</Text>
            <Text style={styles.statValue}>{fmtCurr(tcv, S)}</Text>
          </View>
        </View>

        <PageFooter companyName={branding.companyName} />
      </Page>

      {/* ── 12. Service Contract ──────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={11} title="Service Contract" styles={styles} />

        <Text style={[styles.para, { fontStyle: 'italic' }]}>
          In conjunction with this IT Managed Service Agreement, the {branding.companyName} General Terms and
          Conditions of Business and supplementary Terms – IT Support Services.
        </Text>

        {[
          ['Contract Term',       termLabel],
          ['Commencement Date',   fmtDate(sc.commencementDate)],
          ['Account Manager',     proposal.accountManager],
          ['Site',                sc.site],
          ['Client Contact',      preparedFor],
          ['Payment Terms',       paymentTerms],
        ].filter(([, v]) => v).map(([k, v]) => (
          <View key={k as string} style={{ flexDirection: 'row', paddingVertical: 4, borderBottom: `0.5px solid #f0f4f8` }}>
            <Text style={styles.label}>{k}:</Text>
            <Text style={styles.value}>{v}</Text>
          </View>
        ))}

        <PageFooter companyName={branding.companyName} />
      </Page>

      {/* ── 13. Authorised Signatures ─────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <SectionH num={12} title="Authorised Signatures" styles={styles} />

        <Text style={styles.para}>
          The Client and the Company agree to work under this Agreement and abide by{' '}
          {branding.companyName}'s General Terms and Conditions of Business.
        </Text>

        <View style={{ flexDirection: 'row', marginTop: 30, gap: 40 }}>
          {[
            [`On behalf of ${branding.companyName}`, sc.contactName],
            [`On behalf of ${proposal.client}`, preparedFor],
          ].map(([header, name]) => (
            <View key={header as string} style={styles.sigBox}>
              <Text style={styles.h3}>{header as string}</Text>
              {[
                ['Signature', ''],
                ['Name', name as string ?? ''],
                ['Title', ''],
                ['Date', ''],
              ].map(([label, val]) => (
                <View key={label} style={{ marginBottom: 16 }}>
                  <View style={styles.sigLine}>
                    {val ? <Text style={{ fontSize: 9.5 }}>{val}</Text> : <Text> </Text>}
                  </View>
                  <Text style={styles.sigLabel}>{label}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {(companyWebsite || companyPhone || companyAddress) && (
          <View style={{ position: 'absolute', bottom: 28, left: 14, right: 14, borderTop: '0.5px solid #e2e8f0', paddingTop: 6 }}>
            <Text style={{ fontSize: 8, color: '#9ca3af' }}>
              {[companyWebsite, companyPhone, companyAddress].filter(Boolean).join('  ·  ')}
            </Text>
          </View>
        )}

        <PageFooter companyName={branding.companyName} />
      </Page>

    </Document>
  );
}

// ─── Download button ──────────────────────────────────────────────────────────

export interface SupportPdfDownloadProps extends SupportPdfProps {
  filename?: string;
}

export function DownloadSupportPdfButton({
  proposal, branding, boilerplate, bpImages,
  companyAddress, companyWebsite, companyPhone, scope,
  extraSections,
  filename,
}: SupportPdfDownloadProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const doc  = <SupportPdfDocument
        proposal={proposal} branding={branding} boilerplate={boilerplate}
        bpImages={bpImages} companyAddress={companyAddress}
        companyWebsite={companyWebsite} companyPhone={companyPhone}
        scope={scope} extraSections={extraSections}
      />;
      const blob = await pdf(doc).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename ?? `MSA_${proposal.client.replace(/[^a-z0-9]/gi, '_')}_${proposal.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
      >
        {loading
          ? <Loader2 size={14} className="animate-spin" />
          : <FileDown size={14} />
        }
        {loading ? 'Generating PDF…' : 'Export PDF'}
      </button>
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  );
}

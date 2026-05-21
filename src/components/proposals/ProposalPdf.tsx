import { useState } from 'react';
import {
  pdf,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { FileDown, Loader2, AlertCircle } from 'lucide-react';
import type { Proposal, PartType } from '../../types';
import { calcTotals } from '../../utils/totals';
import { useBranding } from '../../contexts/BrandingContext';

// ─── Currency ─────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };

function makeFmt(currency: string) {
  const sym = CURRENCY_SYMBOLS[currency] ?? '£';
  return (n: number) => `${sym}${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(primary: string) {
  return StyleSheet.create({
    coverPage: { backgroundColor: '#0a1030', padding: 60, flex: 1, justifyContent: 'center' },
    page:      { padding: 48, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a2e', flex: 1 },

    coverBrand:   { fontSize: 13, color: '#9ba8d0', letterSpacing: 3, marginBottom: 40, fontFamily: 'Helvetica-Bold' },
    coverTitle:   { fontSize: 30, color: '#ffffff', fontFamily: 'Helvetica-Bold', marginBottom: 12, lineHeight: 1.2 },
    coverClient:  { fontSize: 15, color: '#c7d0f0', marginBottom: 6 },
    coverMeta:    { fontSize: 10, color: '#8b98c4', marginTop: 4 },
    coverDivider: { borderBottom: `2px solid ${primary}`, marginTop: 32, marginBottom: 32, width: 60 },

    h1:             { fontSize: 18, fontFamily: 'Helvetica-Bold', color: primary, marginBottom: 14 },
    h2:             { fontSize: 13, fontFamily: 'Helvetica-Bold', color: primary, marginTop: 18, marginBottom: 8 },
    h3:             { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#374151', marginTop: 10, marginBottom: 6 },
    sectionDivider: { borderBottom: '1px solid #e2e8f0', marginBottom: 14 },

    tableHeader:  { flexDirection: 'row', backgroundColor: primary, borderRadius: 3 },
    tableRow:     { flexDirection: 'row', borderBottom: '1px solid #f0f4f8' },
    tableRowAlt:  { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottom: '1px solid #f0f4f8' },
    thCell:       { padding: '5 7', color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
    tdCell:       { padding: '4 7', fontSize: 8.5, color: '#374151' },
    tdRight:      { padding: '4 7', fontSize: 8.5, textAlign: 'right', color: '#374151' },

    totalsRow:       { flexDirection: 'row', backgroundColor: '#1e2a6e', borderRadius: 3, marginTop: 4 },
    totalsCell:      { padding: '6 7', color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 9.5 },
    totalsCellRight: { padding: '6 7', color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 9.5, textAlign: 'right' },

    para:    { fontSize: 10, lineHeight: 1.6, marginBottom: 6, color: '#374151' },
    bullet:  { fontSize: 10, lineHeight: 1.6, marginBottom: 4, color: '#374151', marginLeft: 12 },
    spacer:  { marginBottom: 8 },

    sectionLabel: {
      fontSize: 9, fontFamily: 'Helvetica-Bold', color: primary,
      textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, marginBottom: 6,
    },

    footer: {
      position: 'absolute', bottom: 24, left: 48, right: 48,
      flexDirection: 'row', justifyContent: 'space-between',
      fontSize: 8, color: '#9ca3af',
      borderTop: '1px solid #e2e8f0', paddingTop: 6,
    },
  });
}

// ─── SoW renderer — basic markdown support ────────────────────────────────────

function renderSow(sowContent: string, styles: ReturnType<typeof makeStyles>) {
  return sowContent.split('\n').map((line, i) => {
    if (!line.trim()) return <View key={i} style={styles.spacer} />;
    if (line.startsWith('### ')) return <Text key={i} style={styles.h3}>{line.slice(4)}</Text>;
    if (line.startsWith('## '))  return <Text key={i} style={styles.h2}>{line.slice(3)}</Text>;
    if (line.startsWith('# '))   return <Text key={i} style={styles.h1}>{line.slice(2)}</Text>;
    if (line.match(/^[-*] /))    return <Text key={i} style={styles.bullet}>{'• '}{line.slice(2)}</Text>;
    if (line.match(/^\d+\. /))   return <Text key={i} style={styles.bullet}>{line}</Text>;
    // strip remaining markdown markers for bold/italic before rendering
    const clean = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/__(.+?)__/g, '$1');
    return <Text key={i} style={styles.para}>{clean}</Text>;
  });
}

// ─── Part type label ──────────────────────────────────────────────────────────

const TYPE_LABEL: Record<PartType, string> = {
  Hardware: 'Hardware',
  Software: 'Software',
  Monthly:  'Monthly Sub',
  Annual:   'Annual Sub',
};

// ─── PDF Document ─────────────────────────────────────────────────────────────

interface DocProps {
  proposal: Proposal;
  companyName: string;
  primaryColor: string;
}

function ProposalPdfDocument({ proposal, companyName, primaryColor }: DocProps) {
  const styles  = makeStyles(primaryColor);
  const totals  = calcTotals(proposal);
  const fmt     = makeFmt(proposal.currency);
  const today   = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

  const hwTotal = proposal.parts.filter(p => (p.partType ?? 'Hardware') === 'Hardware').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const swTotal = proposal.parts.filter(p => p.partType === 'Software').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const moTotal = proposal.parts.filter(p => p.partType === 'Monthly').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const anTotal = proposal.parts.filter(p => p.partType === 'Annual').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const oneYrTco = totals.partsSell + totals.markupAmount + moTotal * 12 + totals.consultancySell;

  const footer = (
    <View style={styles.footer} fixed>
      <Text>{companyName} — Confidential</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );

  return (
    <Document title={proposal.projectName} author={companyName}>

      {/* ── Cover ── */}
      <Page size="A4" style={styles.coverPage}>
        <Text style={styles.coverBrand}>{companyName.toUpperCase()}</Text>
        <Text style={styles.coverTitle}>{proposal.projectName}</Text>
        <View style={styles.coverDivider} />
        <Text style={styles.coverClient}>{proposal.client}</Text>
        {proposal.accountManager && <Text style={styles.coverMeta}>Account Manager: {proposal.accountManager}</Text>}
        <Text style={styles.coverMeta}>Date: {today}</Text>
        <Text style={styles.coverMeta}>Reference: {proposal.ticketRef || proposal.id.slice(0, 8).toUpperCase()}</Text>
        <Text style={styles.coverMeta}>Status: {proposal.status}</Text>
      </Page>

      {/* ── Commercial Summary ── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Commercial Summary</Text>
        <View style={styles.sectionDivider} />

        <View style={{ marginBottom: 16 }}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thCell, { flex: 3 }]}>Category</Text>
            <Text style={[styles.thCell, { flex: 1, textAlign: 'right' }]}>Amount</Text>
          </View>
          {[
            { label: 'Hardware (one-off)',         value: hwTotal,                   show: hwTotal > 0 },
            { label: 'Software (one-off)',          value: swTotal,                   show: swTotal > 0 },
            { label: 'Monthly subscriptions',       value: moTotal,  suffix: '/mo',   show: moTotal > 0 },
            { label: 'Annual subscriptions',        value: anTotal,  suffix: '/yr',   show: anTotal > 0 },
            { label: 'Professional Services',       value: totals.consultancySell,    show: totals.consultancySell > 0 },
          ].filter(r => r.show).map((r, i) => (
            <View key={r.label} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.tdCell, { flex: 3 }]}>{r.label}</Text>
              <Text style={[styles.tdRight, { flex: 1 }]}>{fmt(r.value)}{r.suffix ?? ''}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <Text style={[styles.totalsCell, { flex: 3 }]}>Upfront Total (ex. recurring)</Text>
          <Text style={[styles.totalsCellRight, { flex: 1 }]}>{fmt(totals.grandTotal)}</Text>
        </View>
        {(moTotal > 0 || anTotal > 0) && (
          <View style={[styles.totalsRow, { marginTop: 4 }]}>
            <Text style={[styles.totalsCell, { flex: 3 }]}>1-Year TCO</Text>
            <Text style={[styles.totalsCellRight, { flex: 1 }]}>{fmt(oneYrTco)}</Text>
          </View>
        )}

        {footer}
      </Page>

      {/* ── Bill of Materials ── */}
      {proposal.parts.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Bill of Materials</Text>
          <View style={styles.sectionDivider} />

          {(['Hardware', 'Software', 'Monthly', 'Annual'] as PartType[]).map(type => {
            const items = proposal.parts.filter(p => (p.partType ?? 'Hardware') === type);
            if (items.length === 0) return null;
            return (
              <View key={type} style={{ marginBottom: 14 }} wrap={false}>
                <Text style={styles.sectionLabel}>{TYPE_LABEL[type]}</Text>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thCell, { flex: 3 }]}>Description</Text>
                  <Text style={[styles.thCell, { flex: 1.5 }]}>SKU</Text>
                  <Text style={[styles.thCell, { flex: 0.6, textAlign: 'right' }]}>Qty</Text>
                  <Text style={[styles.thCell, { flex: 1.2, textAlign: 'right' }]}>Unit Price</Text>
                  <Text style={[styles.thCell, { flex: 1.2, textAlign: 'right' }]}>Total</Text>
                </View>
                {items.map((p, i) => (
                  <View key={p.id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                    <Text style={[styles.tdCell, { flex: 3 }]}>{p.description}</Text>
                    <Text style={[styles.tdCell, { flex: 1.5, color: '#6b7280' }]}>{p.sku || '—'}</Text>
                    <Text style={[styles.tdRight, { flex: 0.6 }]}>{p.quantity}</Text>
                    <Text style={[styles.tdRight, { flex: 1.2 }]}>{fmt(p.unitPrice)}</Text>
                    <Text style={[styles.tdRight, { flex: 1.2 }]}>{fmt(p.unitPrice * p.quantity)}</Text>
                  </View>
                ))}
              </View>
            );
          })}

          {footer}
        </Page>
      )}

      {/* ── Consultancy ── */}
      {proposal.phases.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Professional Services</Text>
          <View style={styles.sectionDivider} />

          {proposal.phases.map(phase => (
            <View key={phase.id} style={{ marginBottom: 14 }} wrap={false}>
              <Text style={styles.h2}>{phase.name}</Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { flex: 3 }]}>Task</Text>
                <Text style={[styles.thCell, { flex: 2 }]}>Role</Text>
                <Text style={[styles.thCell, { flex: 0.8, textAlign: 'right' }]}>Days</Text>
                <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>Day Rate</Text>
                <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>Total</Text>
              </View>
              {phase.tasks.map((task, i) => (
                <View key={task.id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={[styles.tdCell, { flex: 3 }]}>{task.name}</Text>
                  <Text style={[styles.tdCell, { flex: 2 }]}>{task.role}</Text>
                  <Text style={[styles.tdRight, { flex: 0.8 }]}>{task.days}</Text>
                  <Text style={[styles.tdRight, { flex: 1.5 }]}>{fmt(task.dayRate)}{task.rateMultiplier && task.rateMultiplier > 1 ? ` ×${task.rateMultiplier}` : ''}</Text>
                  <Text style={[styles.tdRight, { flex: 1.5 }]}>{fmt(task.days * task.dayRate * (task.rateMultiplier ?? 1))}</Text>
                </View>
              ))}
            </View>
          ))}

          <View style={[styles.totalsRow, { marginTop: 8 }]}>
            <Text style={[styles.totalsCell, { flex: 3 }]}>Professional Services Total</Text>
            <Text style={[styles.totalsCellRight, { flex: 1 }]}>{fmt(totals.consultancySell)}</Text>
          </View>

          {footer}
        </Page>
      )}

      {/* ── Statement of Work ── */}
      {proposal.sowContent && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Statement of Work</Text>
          <View style={styles.sectionDivider} />
          {renderSow(proposal.sowContent, styles)}
          {footer}
        </Page>
      )}

    </Document>
  );
}

// ─── Download button ──────────────────────────────────────────────────────────

export function DownloadProposalPdfButton({ proposal, menuStyle = false }: { proposal: Proposal; menuStyle?: boolean }) {
  const { companyName, primaryColor } = useBranding();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const doc  = <ProposalPdfDocument proposal={proposal} companyName={companyName} primaryColor={primaryColor} />;
      const blob = await pdf(doc).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${proposal.projectName.replace(/[^a-z0-9]/gi, '_')}_${proposal.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF generation failed');
    } finally {
      setLoading(false);
    }
  };

  if (menuStyle) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer w-full disabled:opacity-60"
      >
        {loading
          ? <Loader2 size={15} className="animate-spin text-gray-400 flex-shrink-0" />
          : <FileDown size={15} className="text-red-500 flex-shrink-0" />
        }
        {loading ? 'Generating PDF…' : 'Export to PDF'}
        {error && <AlertCircle size={13} className="text-red-500 ml-auto" title={error} />}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-60"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
        {loading ? 'Generating…' : 'Export PDF'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

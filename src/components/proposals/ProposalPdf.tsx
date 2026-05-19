import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFDownloadLink,
} from '@react-pdf/renderer';
import type { Proposal } from '../../types';
import { calcTotals } from '../../utils/totals';

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Pages
  coverPage: {
    backgroundColor: '#0a1030',
    padding: 60,
    flex: 1,
    justifyContent: 'center',
  },
  page: {
    padding: 48,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a2e',
    flex: 1,
  },

  // Cover
  coverBrand: { fontSize: 14, color: '#9ba8d0', letterSpacing: 3, marginBottom: 40, fontFamily: 'Helvetica-Bold' },
  coverTitle: { fontSize: 32, color: '#ffffff', fontFamily: 'Helvetica-Bold', marginBottom: 12, lineHeight: 1.2 },
  coverClient: { fontSize: 16, color: '#c7d0f0', marginBottom: 6 },
  coverMeta: { fontSize: 11, color: '#8b98c4', marginTop: 4 },
  coverDivider: { borderBottom: '2px solid #2B3990', marginTop: 32, marginBottom: 32, width: 60 },

  // Headings
  h1: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#2B3990', marginBottom: 16 },
  h2: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#2B3990', marginTop: 20, marginBottom: 10 },
  sectionDivider: { borderBottom: '1px solid #e2e8f0', marginBottom: 16 },

  // Tables
  table: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#2B3990', borderRadius: 4 },
  tableRow: { flexDirection: 'row', borderBottom: '1px solid #f0f4f8' },
  tableRowAlt: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottom: '1px solid #f0f4f8' },
  thCell: { padding: '6 8', color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  tdCell: { padding: '5 8', fontSize: 9 },
  tdRight: { padding: '5 8', fontSize: 9, textAlign: 'right' },

  // Totals
  totalsRow: { flexDirection: 'row', backgroundColor: '#1e2a6e', borderRadius: 4, marginTop: 4 },
  totalsCell: { padding: '7 8', color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 10 },
  totalsCellRight: { padding: '7 8', color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 10, textAlign: 'right' },

  // SoW
  para: { fontSize: 10, lineHeight: 1.6, marginBottom: 8, color: '#374151' },

  // Misc
  footer: { position: 'absolute', bottom: 24, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#9ca3af' },
});

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

// ─── Document ─────────────────────────────────────────────────────────────────

export function ProposalPdfDocument({ proposal }: { proposal: Proposal }) {
  const totals = calcTotals(proposal);

  const hwTotal = proposal.parts.filter(p => p.partType === 'Hardware').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const swTotal = proposal.parts.filter(p => p.partType === 'Software').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const moTotal = proposal.parts.filter(p => p.partType === 'Monthly').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const anTotal = proposal.parts.filter(p => p.partType === 'Annual').reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const oneYrTco = totals.partsSell + totals.markupAmount + moTotal * 12 + totals.consultancySell;

  const generatedDate = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Document title={proposal.projectName} author="ITRM PreSales">

      {/* ── Cover page ── */}
      <Page size="A4" style={styles.coverPage}>
        <Text style={styles.coverBrand}>ITRM PRESALES</Text>
        <Text style={styles.coverTitle}>{proposal.projectName}</Text>
        <View style={styles.coverDivider} />
        <Text style={styles.coverClient}>{proposal.client}</Text>
        <Text style={styles.coverMeta}>Account Manager: {proposal.accountManager || '—'}</Text>
        <Text style={styles.coverMeta}>Date: {generatedDate}</Text>
        <Text style={styles.coverMeta}>Status: {proposal.status}</Text>
      </Page>

      {/* ── Commercial summary ── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Commercial Summary</Text>
        <View style={styles.sectionDivider} />

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thCell, { flex: 3 }]}>Category</Text>
            <Text style={[styles.thCell, { flex: 1, textAlign: 'right' }]}>Amount</Text>
          </View>
          {[
            { label: 'Hardware', value: hwTotal },
            { label: 'Software', value: swTotal },
            { label: 'Monthly (recurring)', value: moTotal },
            { label: 'Annual (recurring)', value: anTotal },
            { label: 'Consultancy', value: totals.consultancySell },
          ].map((r, i) => (
            <View key={r.label} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.tdCell, { flex: 3 }]}>{r.label}</Text>
              <Text style={[styles.tdRight, { flex: 1 }]}>{fmt(r.value)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <Text style={[styles.totalsCell, { flex: 3 }]}>Upfront Total</Text>
          <Text style={[styles.totalsCellRight, { flex: 1 }]}>{fmt(totals.grandTotal)}</Text>
        </View>
        <View style={[styles.totalsRow, { marginTop: 6 }]}>
          <Text style={[styles.totalsCell, { flex: 3 }]}>1-Year TCO</Text>
          <Text style={[styles.totalsCellRight, { flex: 1 }]}>{fmt(oneYrTco)}</Text>
        </View>
        <View style={[styles.totalsRow, { marginTop: 6 }]}>
          <Text style={[styles.totalsCell, { flex: 3 }]}>Gross Profit</Text>
          <Text style={[styles.totalsCellRight, { flex: 1 }]}>{fmt(totals.grandTotal - totals.partsCost - totals.consultancyCost)}</Text>
        </View>
        <View style={[styles.totalsRow, { marginTop: 6 }]}>
          <Text style={[styles.totalsCell, { flex: 3 }]}>Margin %</Text>
          <Text style={[styles.totalsCellRight, { flex: 1 }]}>{fmtPct(totals.marginPct)}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>ITRM PreSales — Confidential</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ── Consultancy phases ── */}
      {proposal.phases.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Consultancy Phases</Text>
          <View style={styles.sectionDivider} />

          {proposal.phases.map(phase => (
            <View key={phase.id} style={{ marginBottom: 16 }}>
              <Text style={styles.h2}>{phase.name}</Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { flex: 3 }]}>Task</Text>
                <Text style={[styles.thCell, { flex: 2 }]}>Role</Text>
                <Text style={[styles.thCell, { flex: 1, textAlign: 'right' }]}>Days</Text>
                <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>Day Rate</Text>
                <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>Total</Text>
              </View>
              {phase.tasks.map((task, i) => (
                <View key={task.id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={[styles.tdCell, { flex: 3 }]}>{task.name}</Text>
                  <Text style={[styles.tdCell, { flex: 2 }]}>{task.role}</Text>
                  <Text style={[styles.tdRight, { flex: 1 }]}>{task.days}</Text>
                  <Text style={[styles.tdRight, { flex: 1.5 }]}>{fmt(task.dayRate)}</Text>
                  <Text style={[styles.tdRight, { flex: 1.5 }]}>{fmt(task.days * task.dayRate)}</Text>
                </View>
              ))}
            </View>
          ))}

          <View style={styles.footer} fixed>
            <Text>ITRM PreSales — Confidential</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}

      {/* ── Statement of Work ── */}
      {proposal.sowContent && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Statement of Work</Text>
          <View style={styles.sectionDivider} />
          {proposal.sowContent.split('\n').filter(Boolean).map((line, i) => (
            <Text key={i} style={styles.para}>{line}</Text>
          ))}
          <View style={styles.footer} fixed>
            <Text>ITRM PreSales — Confidential</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  );
}

// ─── Download button ──────────────────────────────────────────────────────────

export function DownloadProposalPdfButton({ proposal, menuStyle = false }: { proposal: Proposal; menuStyle?: boolean }) {
  const fileName = `${proposal.projectName.replace(/[^a-z0-9]/gi, '_')}_${proposal.id.slice(0, 8)}.pdf`;

  return (
    <PDFDownloadLink
      document={<ProposalPdfDocument proposal={proposal} />}
      fileName={fileName}
    >
      {({ loading }) =>
        menuStyle ? (
          <span className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer w-full">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 flex-shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            {loading ? 'Preparing PDF…' : 'Export to PDF'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors cursor-pointer select-none">
            {loading ? 'Preparing PDF…' : 'Export PDF'}
          </span>
        )
      }
    </PDFDownloadLink>
  );
}

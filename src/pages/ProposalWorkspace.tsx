import { useState, lazy, Suspense, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ArrowLeft, Download, ExternalLink, Loader2, Clock, Share2, Copy, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../contexts/AuthContext';
import { getProposalRole, canEdit, canDelete, canAccessAdmin } from '../utils/permissions';
import { getExportBlockers } from '../utils/exportGuard';
import type { ExportBlocker } from '../utils/exportGuard';
import { ExportGuardModal } from '../components/proposals/ExportGuardModal';
// xlsx (~400 kB) and msal-browser are loaded on-demand only when the user triggers the action
const importExcel   = () => import('../utils/exportExcel').then(m => m.exportProposalToExcel);
const importPlanner = () => import('../utils/planner').then(m => m.convertToPlannerProject);
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ProjectSummaryTab } from '../components/proposals/tabs/ProjectSummaryTab';
import { PartsTab } from '../components/proposals/tabs/PartsTab';
// Heavier tabs are lazy-loaded so each becomes its own chunk
const ConsultancyTab = lazy(() => import('../components/proposals/tabs/ConsultancyTab').then(m => ({ default: m.ConsultancyTab })));
const BillingTab     = lazy(() => import('../components/proposals/tabs/BillingTab').then(m => ({ default: m.BillingTab })));
const ApprovalsTab   = lazy(() => import('../components/proposals/tabs/ApprovalsTab').then(m => ({ default: m.ApprovalsTab })));
const DiscountTab    = lazy(() => import('../components/proposals/tabs/DiscountTab').then(m => ({ default: m.DiscountTab })));
const SowTab         = lazy(() => import('../components/proposals/tabs/SowTab').then(m => ({ default: m.SowTab })));
const TotalsTab         = lazy(() => import('../components/proposals/tabs/TotalsTab').then(m => ({ default: m.TotalsTab })));
const SupportContractTab = lazy(() => import('../components/proposals/tabs/SupportContractTab').then(m => ({ default: m.SupportContractTab })));
import { TrbReviewBanner } from '../components/proposals/TrbReviewBanner';
import { VendorQuoteExpiryBanner } from '../components/proposals/VendorQuoteExpiryBanner';
import { ProposalExpiryBanner } from '../components/proposals/ProposalExpiryBanner';
import { CommentsThread } from '../components/proposals/CommentsThread';
import { VersionHistoryPanel } from '../components/proposals/VersionHistoryPanel';
import { ShareModal } from '../components/proposals/ShareModal';
import { versionApi, settingsApi } from '../lib/api';
import { parseLayout, DEFAULT_LAYOUT } from '../types/layout';
import type { ProposalLayoutConfig } from '../types/layout';
import clsx from 'clsx';

const DownloadProposalPdfButton = lazy(() =>
  import('../components/proposals/ProposalPdf').then(m => ({ default: m.DownloadProposalPdfButton }))
);

const PROJECT_TABS = ['Summary', 'Parts', 'Consultancy', 'Billing', 'Approvals', 'Discount', 'Statement of Work', 'Totals & Approval', 'Comments'] as const;
const SUPPORT_TABS = ['Summary', 'Support Contract', 'Billing', 'Approvals', 'Statement of Work', 'Totals & Approval', 'Comments'] as const;
type Tab = (typeof PROJECT_TABS)[number] | (typeof SUPPORT_TABS)[number];
type Tab = (typeof TABS)[number];

export function ProposalWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { proposals, updateProposal, deleteProposal } = useStore();
  const { currentUser } = useAuth();

  const proposal = proposals.find(p => p.id === id);
  useDocumentTitle(proposal?.projectName);
  const isSupport = proposal?.proposalType === 'support';
  const TABS = isSupport ? SUPPORT_TABS : PROJECT_TABS;
  const [activeTab, setActiveTab] = useState<Tab>('Summary');
  const [showDelete, setShowDelete] = useState(false);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportBlockers, setExportBlockers] = useState<ExportBlocker[]>([]);
  const [pendingExport, setPendingExport] = useState<(() => void) | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [layoutConfig, setLayoutConfig] = useState<ProposalLayoutConfig | null>(null);

  // Fetch layout config for PDF generation
  useEffect(() => {
    settingsApi.get()
      .then(s => setLayoutConfig(parseLayout(s['proposal.layout'])))
      .catch(() => setLayoutConfig(DEFAULT_LAYOUT));
  }, []);

  // Keep a ref to the latest proposal so the unmount cleanup can access it
  const proposalRef = useRef(proposal);
  useEffect(() => { proposalRef.current = proposal; }, [proposal]);

  // Save version snapshot when navigating away
  useEffect(() => {
    return () => {
      const p = proposalRef.current;
      if (p && canEdit(p, currentUser)) {
        versionApi.save(p.id).catch(() => {/* fire and forget */});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setShowExportMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  if (!proposal) {
    return (
      <div className="p-8 text-center text-gray-500">
        Proposal not found.{' '}
        <button className="text-brand-600 hover:underline" onClick={() => navigate('/proposals')}>Go back</button>
      </div>
    );
  }

  const role = getProposalRole(proposal, currentUser);
  const editable = canEdit(proposal, currentUser);
  const deletable = canDelete(proposal, currentUser);
  const isAdminUser = canAccessAdmin(currentUser);
  const rateCards           = useStore(s => s.rateCards);
  const discountMarkupFloor = useStore(s => s.discountMarkupFloor);

  const guardedExport = (action: () => void) => {
    const blockers = getExportBlockers(proposal, rateCards, discountMarkupFloor);
    if (blockers.length > 0) {
      setExportBlockers(blockers);
      setPendingExport(() => action);
      return;
    }
    action();
  };

  const handleDelete = () => {
    deleteProposal(proposal.id);
    navigate('/proposals');
  };

  const [plannerError, setPlannerError] = useState<string | null>(null);

  const handlePlanner = async () => {
    setPlannerLoading(true);
    setPlannerError(null);
    try {
      const convertToPlannerProject = await importPlanner();
      const url = await convertToPlannerProject(proposal);
      updateProposal(proposal.id, { plannerUrl: url }, currentUser?.name ?? currentUser?.email);
      window.open(url, '_blank');
    } catch (e) {
      setPlannerError(e instanceof Error ? e.message : 'Failed to create Planner plan');
    } finally {
      setPlannerLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-8 py-4">
        <div className="flex items-center gap-4 mb-3">
          <button
            onClick={() => navigate('/proposals')}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-400"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100 truncate">{proposal.projectName}</h1>
              {proposal.reference && (
                <span className="text-xs font-mono text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                  {proposal.reference}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 dark:text-slate-400">{proposal.client}</div>
            {proposal.lastModifiedBy && (
              <div className="text-xs text-gray-400 dark:text-slate-500">
                Last modified by {proposal.lastModifiedBy} · {proposal.lastModifiedAt ? new Date(proposal.lastModifiedAt).toLocaleString('en-GB') : ''}
              </div>
            )}
          </div>
          <StatusBadge status={proposal.status} />

          {/* Admin chip */}
          {role === 'admin' && (
            <span className="inline-flex items-center px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full border border-amber-200">
              Admin override
            </span>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1.5">

            {/* Export dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <Button
                variant="secondary" size="sm"
                onClick={() => setShowExportMenu(v => !v)}
              >
                <Download size={14} />
                Export
                <ChevronDown size={12} className={clsx('transition-transform', showExportMenu && 'rotate-180')} />
              </Button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-30 overflow-hidden py-1">
                  {/* PDF */}
                  <Suspense fallback={
                    <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-400">
                      <Loader2 size={14} className="animate-spin" /> Preparing PDF…
                    </div>
                  }>
                    <div onClick={(e) => {
                      const blockers = getExportBlockers(proposal, rateCards);
                      if (blockers.length > 0) {
                        e.preventDefault(); e.stopPropagation();
                        setExportBlockers(blockers);
                        setPendingExport(null); // PDF button handles its own click
                        setShowExportMenu(false);
                      } else {
                        setShowExportMenu(false);
                      }
                    }}>
                      <DownloadProposalPdfButton proposal={proposal} menuStyle layout={layoutConfig ?? DEFAULT_LAYOUT} />
                    </div>
                  </Suspense>
                  {/* Excel */}
                  <button
                    onClick={() => { guardedExport(() => { importExcel().then(fn => fn(proposal)); }); setShowExportMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 text-left"
                  >
                    <FileSpreadsheet size={15} className="text-green-600 flex-shrink-0" />
                    Export to Excel
                  </button>
                  {/* Planner */}
                  <button
                    onClick={() => { handlePlanner(); setShowExportMenu(false); }}
                    disabled={plannerLoading}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 text-left disabled:opacity-50"
                  >
                    {plannerLoading
                      ? <Loader2 size={15} className="animate-spin flex-shrink-0" />
                      : <ExternalLink size={15} className="text-blue-600 flex-shrink-0" />
                    }
                    {plannerLoading ? 'Creating plan…' : (proposal.plannerUrl ? 'Recreate in Planner' : 'Send to Planner')}
                  </button>
                  {proposal.plannerUrl && !plannerLoading && (
                    <a
                      href={proposal.plannerUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setShowExportMenu(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-slate-700 text-left"
                    >
                      <ExternalLink size={15} className="flex-shrink-0" />
                      Open existing plan
                    </a>
                  )}
                </div>
              )}
              {/* Planner error toast */}
              {plannerError && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl shadow-lg z-30 p-3 text-xs text-red-700 dark:text-red-300">
                  <strong>Planner export failed:</strong> {plannerError}
                  <button onClick={() => setPlannerError(null)} className="ml-2 underline">Dismiss</button>
                </div>
              )}
            </div>

            {/* Share */}
            <Button variant="secondary" size="sm" onClick={() => guardedExport(() => setShowShare(true))} title="Share">
              <Share2 size={14} /> Share
            </Button>

            {/* History */}
            <button
              onClick={() => setShowHistory(h => !h)}
              title="Version history"
              className={clsx(
                'p-2 rounded-lg border text-sm transition-colors',
                showHistory
                  ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400'
                  : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-400 dark:hover:border-slate-500'
              )}
            >
              <Clock size={14} />
            </button>

            {/* Clone */}
            <button
              onClick={() => {
                const newId = useStore.getState().cloneProposal(proposal.id);
                if (newId) navigate(`/proposals/${newId}`);
              }}
              title="Clone proposal"
              className="p-2 rounded-lg border bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-400 dark:hover:border-slate-500 transition-colors"
            >
              <Copy size={14} />
            </button>

            {/* Delete */}
            {deletable && (
              <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Read-only banner */}
        {!editable && (
          <div className="mb-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            You have read-only access to this proposal. Ask the owner to add you as a collaborator if you need to make changes.
          </div>
        )}

        {/* Tabs */}

        <div className="flex gap-0 border-b border-gray-200 dark:border-slate-700 -mb-px overflow-x-auto scrollbar-none">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === tab
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:border-gray-300 dark:hover:border-slate-600'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* TRB review banner */}
      <TrbReviewBanner proposal={proposal} editable={editable} onUpdate={u => updateProposal(proposal.id, u, currentUser?.name ?? currentUser?.email)} />
      {/* Vendor quote expiry banner */}
      <VendorQuoteExpiryBanner proposal={proposal} />
      {/* Proposal expiry banner */}
      <ProposalExpiryBanner proposal={proposal} />

      {/* Tab content */}
      <div className="flex-1 p-8 bg-gray-50 dark:bg-slate-900">
        <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>}>
          {activeTab === 'Summary' && (
            <ProjectSummaryTab proposal={proposal} editable={editable} onUpdate={u => updateProposal(proposal.id, u, currentUser?.name ?? currentUser?.email)} />
          )}
          {activeTab === 'Parts' && (
            <PartsTab proposal={proposal} editable={editable} onUpdate={u => updateProposal(proposal.id, u, currentUser?.name ?? currentUser?.email)} />
          )}
          {activeTab === 'Consultancy' && (
            <ConsultancyTab proposal={proposal} editable={editable} onUpdate={u => updateProposal(proposal.id, u, currentUser?.name ?? currentUser?.email)} />
          )}
          {activeTab === 'Billing' && (
            <BillingTab proposal={proposal} editable={editable} onUpdate={u => updateProposal(proposal.id, u, currentUser?.name ?? currentUser?.email)} />
          )}
          {activeTab === 'Support Contract' && (
            <SupportContractTab proposal={proposal} editable={editable} onUpdate={u => updateProposal(proposal.id, u, currentUser?.name ?? currentUser?.email)} />
          )}
          {activeTab === 'Approvals' && (
            <ApprovalsTab proposal={proposal} editable={editable} onUpdate={u => updateProposal(proposal.id, u, currentUser?.name)} />
          )}
          {activeTab === 'Discount' && (
            <DiscountTab proposal={proposal} editable={editable} onUpdate={u => updateProposal(proposal.id, u, currentUser?.name ?? currentUser?.email)} />
          )}
          {activeTab === 'Statement of Work' && (
            <SowTab proposal={proposal} editable={editable} onUpdate={u => updateProposal(proposal.id, u, currentUser?.name ?? currentUser?.email)} />
          )}
          {activeTab === 'Totals & Approval' && (
            <TotalsTab proposal={proposal} editable={editable} onUpdate={u => updateProposal(proposal.id, u, currentUser?.name ?? currentUser?.email)} />
          )}
          {/* Comments are always open — all authenticated users can post regardless of proposal role */}
          {activeTab === 'Comments' && currentUser && (
            <CommentsThread proposalId={proposal.id} currentUser={currentUser} editable={true} />
          )}
        </Suspense>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Proposal?"
        message={`Are you sure you want to delete "${proposal.projectName}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />

      {showHistory && (
        <VersionHistoryPanel proposal={proposal} onClose={() => setShowHistory(false)} />
      )}

      {showShare && (
        <ShareModal proposalId={proposal.id} onClose={() => setShowShare(false)} />
      )}

      {exportBlockers.length > 0 && (
        <ExportGuardModal
          blockers={exportBlockers}
          isAdmin={isAdminUser}
          onCancel={() => { setExportBlockers([]); setPendingExport(null); }}
          onForce={() => {
            const action = pendingExport;
            setExportBlockers([]);
            setPendingExport(null);
            if (action) action();
          }}
        />
      )}
    </div>
  );
}

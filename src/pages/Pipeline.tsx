import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { useStore } from '../store';
import { calcTotals } from '../utils/totals';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/Badge';
import type { Proposal, ProposalStatus } from '../types';

// ─── Date range filter ────────────────────────────────────────────────────────

type DateRange = '30d' | '3m' | '6m' | '12m' | 'ytd' | 'all';

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: 'all',  label: 'All time' },
  { value: '30d',  label: 'Last 30 days' },
  { value: '3m',   label: '3 months' },
  { value: '6m',   label: '6 months' },
  { value: '12m',  label: '12 months' },
  { value: 'ytd',  label: 'This year' },
];

function getCutoff(range: DateRange): Date | null {
  const now = new Date();
  switch (range) {
    case '30d': { const d = new Date(now); d.setDate(d.getDate() - 30);    return d; }
    case '3m':  { const d = new Date(now); d.setMonth(d.getMonth() - 3);   return d; }
    case '6m':  { const d = new Date(now); d.setMonth(d.getMonth() - 6);   return d; }
    case '12m': { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
    case 'ytd': { return new Date(now.getFullYear(), 0, 1); }
    default:    return null;
  }
}

// ─── Column config ────────────────────────────────────────────────────────────

interface ColumnConfig {
  status: ProposalStatus;
  label: string;
  accent: string;
  headerBg: string;
  badgeBg: string;
}

const COLUMNS: ColumnConfig[] = [
  { status: 'Draft',                label: 'Draft',                accent: 'border-gray-300 dark:border-gray-600',     headerBg: 'bg-gray-50 dark:bg-slate-700/60',          badgeBg: 'bg-gray-400'    },
  { status: 'In Progress',          label: 'In Progress',          accent: 'border-amber-300 dark:border-amber-700',   headerBg: 'bg-amber-50 dark:bg-amber-900/20',         badgeBg: 'bg-amber-500'   },
  { status: 'Approved',             label: 'Approved',             accent: 'border-blue-300 dark:border-blue-700',     headerBg: 'bg-blue-50 dark:bg-blue-900/20',           badgeBg: 'bg-blue-500'    },
  { status: 'With Account Manager', label: 'With Acct. Manager',   accent: 'border-violet-300 dark:border-violet-700', headerBg: 'bg-violet-50 dark:bg-violet-900/20',       badgeBg: 'bg-violet-500'  },
  { status: 'Won',                  label: 'Won',                  accent: 'border-green-300 dark:border-green-700',   headerBg: 'bg-green-50 dark:bg-green-900/20',         badgeBg: 'bg-green-500'   },
  { status: 'Lost',                 label: 'Lost',                 accent: 'border-red-300 dark:border-red-700',       headerBg: 'bg-red-50 dark:bg-red-900/20',             badgeBg: 'bg-red-500'     },
];

// ─── Currency format ──────────────────────────────────────────────────────────

const fmt = (n: number) => `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

// ─── Card ─────────────────────────────────────────────────────────────────────

function ProposalCard({ proposal, isDragging = false }: { proposal: Proposal; isDragging?: boolean }) {
  const navigate = useNavigate();
  const users = useStore(s => s.users);
  const owner = users.find(u => u.id === proposal.ownerId);
  const totals = calcTotals(proposal);
  const initials = owner
    ? owner.name.split(' ').map(n => n[0]).join('').slice(0, 2)
    : '?';

  return (
    <div
      onClick={() => !isDragging && navigate(`/proposals/${proposal.id}`)}
      className={clsx(
        'bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3.5 cursor-pointer',
        'hover:shadow-md hover:border-brand-300 dark:hover:border-brand-600 transition-all',
        isDragging && 'opacity-50 shadow-xl rotate-1',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-medium text-sm text-gray-900 dark:text-slate-100 leading-snug line-clamp-2 flex-1">
          {proposal.projectName}
        </div>
        <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initials}
        </div>
      </div>
      <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">{proposal.client}</div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-900 dark:text-slate-200">{fmt(totals.grandTotal)}</span>
        <StatusBadge status={proposal.status} />
      </div>
    </div>
  );
}

// ─── Sortable card wrapper ────────────────────────────────────────────────────

function SortableCard({ proposal }: { proposal: Proposal }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: proposal.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ProposalCard proposal={proposal} isDragging={isDragging} />
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({ config, proposals }: { config: ColumnConfig; proposals: Proposal[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: config.status });
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'flex flex-col rounded-xl border-2 transition-colors min-w-[220px] flex-1',
        config.accent,
        isOver && 'bg-brand-50 dark:bg-brand-900/10',
      )}
    >
      {/* Header */}
      <div className={clsx('px-3 py-2.5 rounded-t-lg flex items-center justify-between', config.headerBg)}>
        <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">{config.label}</span>
        <span className={clsx('text-white text-xs font-bold px-2 py-0.5 rounded-full', config.badgeBg)}>
          {proposals.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
        <SortableContext items={proposals.map(p => p.id)} strategy={verticalListSortingStrategy}>
          {proposals.map(p => (
            <SortableCard key={p.id} proposal={p} />
          ))}
        </SortableContext>
        {proposals.length === 0 && (
          <div className="text-center py-8 text-xs text-gray-400 dark:text-slate-500">
            Drop cards here
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pipeline page ────────────────────────────────────────────────────────────

export function Pipeline() {
  useDocumentTitle('Pipeline');
  const { proposals, updateProposal } = useStore();
  const [activeId, setActiveId]       = useState<string | null>(null);
  const [dateRange, setDateRange]     = useState<DateRange>('all');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const activeProposal = activeId ? proposals.find(p => p.id === activeId) : null;

  const filtered = useMemo(() => {
    const cutoff = getCutoff(dateRange);
    if (!cutoff) return proposals;
    return proposals.filter(p => new Date(p.dateModified) >= cutoff);
  }, [proposals, dateRange]);

  const grouped = (status: ProposalStatus) => filtered.filter(p => p.status === status);

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as string);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const newStatus = over.id as ProposalStatus;
    const proposal = proposals.find(p => p.id === active.id);
    if (proposal && proposal.status !== newStatus) {
      updateProposal(proposal.id, { status: newStatus });
    }
  };

  const hiddenCount = proposals.length - filtered.length;

  return (
    <div className="p-6 h-full flex flex-col">
      <PageHeader
        title="Pipeline"
        subtitle={
          dateRange === 'all'
            ? `${proposals.length} proposals across all stages`
            : `${filtered.length} of ${proposals.length} proposals${hiddenCount > 0 ? ` · ${hiddenCount} hidden by date filter` : ''}`
        }
      />

      {/* Date range selector */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        {DATE_RANGES.map(r => (
          <button
            key={r.value}
            onClick={() => setDateRange(r.value)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              dateRange === r.value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 flex-1 overflow-x-auto pb-4">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.status}
              config={col}
              proposals={grouped(col.status)}
            />
          ))}
        </div>
        <DragOverlay>
          {activeProposal && <ProposalCard proposal={activeProposal} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

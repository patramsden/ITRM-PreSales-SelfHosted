import clsx from 'clsx';
import type { ProposalStatus } from '../../types';

const statusColors: Record<ProposalStatus, string> = {
  'Draft':                'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300',
  'In Progress':          'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'Approved':             'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'With Account Manager': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  'Won':                  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Lost':                 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

interface Props {
  status: ProposalStatus;
  className?: string;
}

export function StatusBadge({ status, className }: Props) {
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', statusColors[status], className)}>
      {status}
    </span>
  );
}

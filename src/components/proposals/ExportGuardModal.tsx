import { AlertTriangle } from 'lucide-react';
import type { ExportBlocker } from '../../utils/exportGuard';
import { Button } from '../ui/Button';

interface Props {
  blockers: ExportBlocker[];
  onForce: () => void;    // admin override
  onCancel: () => void;
  isAdmin: boolean;
}

export function ExportGuardModal({ blockers, onForce, onCancel, isAdmin }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">Export blocked</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              This proposal cannot be exported until the following reviews are complete:
            </p>
          </div>
        </div>
        <ul className="space-y-2 mb-6">
          {blockers.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
              <span className="text-gray-700 dark:text-slate-300">
                <strong>{b.review}:</strong> {b.reason}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3">
          {isAdmin ? (
            <button
              onClick={onForce}
              className="text-sm text-red-600 hover:underline"
            >
              Override and export anyway
            </button>
          ) : (
            <span className="text-xs text-gray-400">Only admins can override</span>
          )}
          <Button onClick={onCancel}>Close</Button>
        </div>
      </div>
    </div>
  );
}

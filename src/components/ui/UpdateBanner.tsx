import { useState, useEffect, useRef } from 'react';
import { RefreshCw, X } from 'lucide-react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export function UpdateBanner() {
  const [show, setShow] = useState(false);
  const currentVersion = useRef<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${BASE}/api/version`, { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json() as { version: string };
        if (!version || version === 'dev') return;
        if (currentVersion.current === null) {
          currentVersion.current = version;
        } else if (currentVersion.current !== version) {
          setShow(true);
        }
      } catch { /* network error — ignore */ }
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-brand-600 text-white px-4 py-3 rounded-xl shadow-xl max-w-sm">
      <RefreshCw size={16} className="flex-shrink-0" />
      <div className="flex-1 text-sm">
        <div className="font-semibold">Update available</div>
        <div className="text-brand-200 text-xs">Refresh to get the latest version</div>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="px-3 py-1.5 bg-white text-brand-700 text-xs font-semibold rounded-lg hover:bg-brand-50 transition-colors"
      >
        Refresh
      </button>
      <button onClick={() => setShow(false)} className="text-brand-300 hover:text-white">
        <X size={14} />
      </button>
    </div>
  );
}

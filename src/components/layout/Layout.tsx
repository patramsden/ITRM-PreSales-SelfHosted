import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

const STORAGE_KEY = 'sidebar_collapsed';

function getInitialCollapsed(): boolean {
  // Auto-collapse on narrow screens; otherwise read persisted preference
  if (typeof window !== 'undefined' && window.innerWidth < 768) return true;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  // Auto-collapse/expand when viewport crosses 768px
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => {
      setCollapsed(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleToggle = () => {
    setCollapsed(v => {
      const next = !v;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-900">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      <main
        className="flex-1 overflow-auto min-w-0 transition-all duration-200"
        style={{ marginLeft: collapsed ? '3.5rem' : '14rem' }}
      >
        <Outlet />
      </main>
    </div>
  );
}

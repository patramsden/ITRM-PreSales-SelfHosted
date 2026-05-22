import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, BookTemplate, Package, CreditCard,
  Settings, ShieldCheck, Users, LogOut, Sun, Moon, Kanban, BookOpen,
} from 'lucide-react';
import { UserAvatar } from '../../pages/Profile';
import { useAuth, isPresalesAdmin } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useBranding } from '../../contexts/BrandingContext';
import { useStore } from '../../store';
import clsx from 'clsx';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, adminOnly: false },
  { to: '/pipeline', label: 'Pipeline', icon: Kanban, adminOnly: false },
  { to: '/proposals', label: 'Proposals', icon: FileText, adminOnly: false },
  { to: '/templates', label: 'Templates', icon: BookTemplate, adminOnly: false },
  { to: '/catalog', label: 'Catalog', icon: Package, adminOnly: false },
  { to: '/rate-cards', label: 'Rate Cards', icon: CreditCard, adminOnly: false },
  { to: '/clauses',    label: 'Clauses',    icon: BookOpen,   adminOnly: false },
  { to: '/users', label: 'Users', icon: Users, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings, adminOnly: false },
];

export function Sidebar() {
  const { currentUser, signIn, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { logo, primaryColor, companyName, subtitle } = useBranding();
  const users  = useStore(s => s.users);
  const navigate = useNavigate();

  return (
    <aside
      className="fixed inset-y-0 left-0 w-56 flex flex-col z-20 dark:bg-slate-950"
      style={{ backgroundColor: primaryColor }}
    >
      <div className="px-4 py-4 border-b border-white/10 dark:border-slate-700">
        <img
          src={logo ?? '/itrm-logo.svg'}
          alt={companyName}
          className="h-8 brightness-0 invert"
        />
        <div className="text-white/60 dark:text-slate-400 text-xs mt-1">{subtitle}</div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {nav.filter(item => !item.adminOnly || isPresalesAdmin(currentUser)).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
              )
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 dark:border-slate-700">
        {/* Dev-only switcher — hidden in production builds */}
        {import.meta.env.DEV && (
          <>
            <div className="text-white/50 text-xs mb-1.5 font-medium uppercase tracking-wider">
              Dev — signed in as
            </div>
            <select
              value={currentUser?.id ?? ''}
              onChange={e => signIn(e.target.value)}
              className="w-full bg-white/10 text-white text-xs rounded px-2 py-1.5 border border-white/20 focus:outline-none mb-2"
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </>
        )}

        {currentUser && (
          <div className="flex items-center gap-2">
            {/* Clicking the avatar or name navigates to profile */}
            <button onClick={() => navigate('/profile')} className="flex items-center gap-2 flex-1 min-w-0 text-left group">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.name}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-2 ring-white/20 group-hover:ring-white/50 transition-all" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/20 group-hover:bg-white/30 transition-colors flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-white text-xs font-medium truncate group-hover:text-white/90">{currentUser.name}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  {isPresalesAdmin(currentUser) && (
                    <ShieldCheck size={10} className="text-amber-400 flex-shrink-0" />
                  )}
                  <span className={clsx('text-xs', isPresalesAdmin(currentUser) ? 'text-amber-400' : 'text-white/60')}>
                    {currentUser.jobTitle || (isPresalesAdmin(currentUser) ? 'Admin' : 'User')}
                  </span>
                </div>
              </div>
            </button>
            <button
              onClick={toggle}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors flex-shrink-0"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={() => void logout()}
              title="Sign out"
              className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors flex-shrink-0"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

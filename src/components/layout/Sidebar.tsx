import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, BookTemplate, Package, CreditCard,
  Settings, ShieldCheck, Users, LogOut, Sun, Moon, Kanban, BookOpen,
  HelpCircle, ChevronLeft, ChevronRight, ScrollText,
} from 'lucide-react';
import { useAuth, isPresalesAdmin } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useBranding } from '../../contexts/BrandingContext';
import { useStore } from '../../store';
import clsx from 'clsx';

// adminOnly   = visible to admin, sales_admin, presales (isPresalesAdmin)
// strictAdmin = visible to admin role only (appRole === 'admin')
const nav = [
  { to: '/',          label: 'Dashboard', icon: LayoutDashboard, end: true,  adminOnly: false, strictAdmin: false },
  { to: '/pipeline',  label: 'Pipeline',  icon: Kanban,          end: false, adminOnly: false, strictAdmin: false },
  { to: '/proposals', label: 'Proposals', icon: FileText,         end: false, adminOnly: false, strictAdmin: false },
  { to: '/templates', label: 'Templates', icon: BookTemplate,     end: false, adminOnly: false, strictAdmin: false },
  { to: '/catalog',   label: 'Catalog',   icon: Package,          end: false, adminOnly: false, strictAdmin: false },
  { to: '/rate-cards',label: 'Rate Cards',icon: CreditCard,       end: false, adminOnly: false, strictAdmin: false },
  { to: '/clauses',   label: 'Clauses',   icon: BookOpen,         end: false, adminOnly: false, strictAdmin: false },
  { to: '/users',     label: 'Users',     icon: Users,            end: false, adminOnly: true,  strictAdmin: false },
  { to: '/logs',      label: 'Logs',      icon: ScrollText,       end: false, adminOnly: false, strictAdmin: true  },
  { to: '/settings',  label: 'Settings',  icon: Settings,         end: false, adminOnly: false, strictAdmin: false },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { currentUser, signIn, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { logo, primaryColor, companyName, subtitle } = useBranding();
  const users   = useStore(s => s.users);
  const navigate = useNavigate();

  const w = collapsed ? 'w-14' : 'w-56';

  return (
    <aside
      className={clsx('fixed inset-y-0 left-0 flex flex-col z-20 transition-all duration-200 dark:bg-slate-950', w)}
      style={{ backgroundColor: primaryColor }}
    >
      {/* Logo */}
      <div className={clsx('flex items-center border-b border-white/10 dark:border-slate-700 shrink-0',
        collapsed ? 'justify-center h-14 px-0' : 'px-4 py-4')}>
        {collapsed ? (
          <div className="w-7 h-7 rounded bg-white/20 flex items-center justify-center">
            <span className="text-white text-xs font-bold">
              {companyName?.slice(0, 1) ?? 'I'}
            </span>
          </div>
        ) : (
          <>
            <img src={logo ?? '/msp-logo.svg'} alt={companyName} className="h-8 brightness-0 invert" />
            <div className="text-white/60 dark:text-slate-400 text-xs mt-1 sr-only">{subtitle}</div>
          </>
        )}
      </div>

      {/* Nav items */}
      <nav className={clsx('flex-1 py-3 space-y-0.5 overflow-y-auto', collapsed ? 'px-1.5' : 'px-3')}>
        {nav.filter(item => {
          if (item.strictAdmin) return currentUser?.appRole === 'admin';
          if (item.adminOnly)   return isPresalesAdmin(currentUser);
          return true;
        }).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx(
                'flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
              )
            }
          >
            <Icon size={17} className="shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className={clsx('border-t border-white/10 dark:border-slate-700 shrink-0', collapsed ? 'px-1.5 py-3 space-y-1' : 'px-4 py-4 space-y-3')}>

        {/* Help link */}
        <NavLink
          to="/help"
          title={collapsed ? 'Help' : undefined}
          className={({ isActive }) =>
            clsx(
              'flex items-center rounded-lg text-sm font-medium transition-colors w-full',
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2',
              isActive
                ? 'bg-white/20 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
            )
          }
        >
          <HelpCircle size={17} className="shrink-0" />
          {!collapsed && <span>Help</span>}
        </NavLink>

        {/* Separator */}
        <div className="border-t border-white/10 dark:border-slate-700" />

        {/* Dev switcher */}
        {!collapsed && import.meta.env.DEV && (
          <>
            <div className="text-white/50 text-xs font-medium uppercase tracking-wider">
              Dev — signed in as
            </div>
            <select
              value={currentUser?.id ?? ''}
              onChange={e => signIn(e.target.value)}
              className="w-full bg-white/10 text-white text-xs rounded px-2 py-1.5 border border-white/20 focus:outline-none"
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </>
        )}

        {/* User row */}
        {currentUser && (
          <div className={clsx('flex items-center gap-1.5', collapsed && 'flex-col')}>
            <button
              onClick={() => navigate('/profile')}
              title={collapsed ? currentUser.name : undefined}
              className="flex items-center gap-2 flex-1 min-w-0 text-left group"
            >
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.name}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-2 ring-white/20 group-hover:ring-white/50 transition-all" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/20 group-hover:bg-white/30 transition-colors flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
              )}
              {!collapsed && (
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
              )}
            </button>
            <button
              onClick={toggle}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors flex-shrink-0"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            {!collapsed && (
              <button
                onClick={() => void logout()}
                title="Sign out"
                className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors flex-shrink-0"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={clsx(
            'flex items-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors text-xs font-medium',
            collapsed ? 'justify-center p-2 w-full' : 'gap-2 px-2 py-1.5 w-full',
          )}
        >
          {collapsed
            ? <ChevronRight size={14} />
            : <><ChevronLeft size={14} /><span>Collapse</span></>
          }
        </button>
      </div>
    </aside>
  );
}

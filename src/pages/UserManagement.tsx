import { useState } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  Plus, Edit2, Trash2, Save, X, ShieldCheck, Shield,
  Search, AlertTriangle, KeyRound, Smartphone, Copy, Check, RefreshCw,
} from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useStore } from '../store';
import { useAuth } from '../contexts/AuthContext';
import { canAccessAdmin } from '../utils/permissions';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { adminUserApi } from '../lib/api';
import type { User, AppRole } from '../types';
import { ROLE_LABELS } from '../utils/permissions';
import clsx from 'clsx';

// Departments are managed in Settings → Reference Data

const BLANK_USER: Omit<User, 'id'> & { password: string } = {
  name: '',
  email: '',
  department: 'PreSales',
  appRole: 'sales',
  authProvider: 'local',
  password: '',
};

const ALL_ROLES: AppRole[] = ['admin', 'sales_admin', 'presales', 'sales'];

import { UserAvatar } from './Profile';
// Use UserAvatar directly — it shows photo if present, initials otherwise

interface UserFormProps {
  value: Omit<User, 'id'> & { password?: string; newPassword?: string };
  onChange: (v: Omit<User, 'id'> & { password?: string; newPassword?: string }) => void;
  isSelf: boolean;
  departments: string[];
  isNew?: boolean;
}

function UserForm({ value, onChange, isSelf, departments, isNew }: UserFormProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Full Name *</label>
          <input
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={value.name}
            onChange={e => onChange({ ...value, name: e.target.value })}
            placeholder="e.g. Jane Smith"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email *</label>
          <input
            type="email"
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={value.email}
            onChange={e => onChange({ ...value, email: e.target.value })}
            placeholder="jane.smith@company.com"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Department</label>
          <input
            list="dept-list"
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={value.department ?? ''}
            onChange={e => onChange({ ...value, department: e.target.value })}
            placeholder="e.g. PreSales"
          />
          <datalist id="dept-list">
            {departments.map(d => <option key={d} value={d} />)}
          </datalist>
        </div>

        {/* Password field */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            {isNew ? 'Password *' : 'Reset Password'}
            {!isNew && <span className="text-gray-400 dark:text-slate-500 font-normal ml-1">(leave blank to keep current)</span>}
          </label>
          <input
            type="password"
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={isNew ? (value.password ?? '') : (value.newPassword ?? '')}
            onChange={e => isNew
              ? onChange({ ...value, password: e.target.value })
              : onChange({ ...value, newPassword: e.target.value })
            }
            placeholder={isNew ? 'Set initial password' : 'New password'}
            autoComplete="new-password"
          />
        </div>
      </div>

      {/* Application Role */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Application Role</label>
        <select
          value={value.appRole}
          onChange={e => onChange({ ...value, appRole: e.target.value as AppRole })}
          disabled={isSelf}
          className={clsx(
            'w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500',
            isSelf && 'opacity-50 cursor-not-allowed'
          )}
        >
          {ALL_ROLES.map(r => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        {isSelf && (
          <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
            <AlertTriangle size={11} /> You cannot modify your own role.
          </p>
        )}
        <div className="mt-2 text-xs text-gray-500 dark:text-slate-400 space-y-0.5">
          <div><span className="font-medium">Admin:</span> Full access — settings, user management, catalog, all proposals</div>
          <div><span className="font-medium">Sales Admin:</span> Can edit catalog; admin-override on proposals</div>
          <div><span className="font-medium">Pre-Sales:</span> Can create and edit proposals; no catalog/settings access</div>
          <div><span className="font-medium">Sales:</span> Read-only access to shared proposals</div>
        </div>
      </div>
    </div>
  );
}

export function UserManagement() {
  useDocumentTitle('Users');
  const { users, addUser, updateUser, deleteUser, lookups } = useStore();
  const departments = lookups.departments ?? [];
  const { currentUser } = useAuth();
  const isAdmin = canAccessAdmin(currentUser);

  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newUser, setNewUser] = useState<Omit<User, 'id'> & { password: string }>(BLANK_USER);
  const [editing, setEditing] = useState<(User & { newPassword?: string }) | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Admin security actions
  const [resetLinkFor, setResetLinkFor] = useState<User | null>(null);
  const [resetLinkUrl, setResetLinkUrl] = useState<string | null>(null);
  const [resetLinkLoading, setResetLinkLoading] = useState(false);
  const [resetLinkError, setResetLinkError] = useState<string | null>(null);
  const [resetLinkCopied, setResetLinkCopied] = useState(false);
  const [clearTotpId, setClearTotpId] = useState<string | null>(null);

  const handleGenerateResetLink = async (user: User) => {
    setResetLinkFor(user);
    setResetLinkUrl(null);
    setResetLinkError(null);
    setResetLinkLoading(true);
    try {
      const { resetUrl } = await adminUserApi.generateResetLink(user.id);
      setResetLinkUrl(resetUrl);
    } catch (e) {
      setResetLinkError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setResetLinkLoading(false);
    }
  };

  const handleClearTotp = async () => {
    if (!clearTotpId) return;
    try {
      await adminUserApi.clearTotp(clearTotpId);
      updateUser(clearTotpId, { ...users.find(u => u.id === clearTotpId)!, totpEnabled: false });
    } catch { /* ignore */ }
    setClearTotpId(null);
  };

  const filtered = users.filter(u =>
    !search.trim() ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.department ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const adminCount = users.filter(u => u.appRole === 'admin' || u.appRole === 'sales_admin').length;

  const handleCreate = () => {
    if (!newUser.name.trim() || !newUser.email.trim()) return;
    const { password: _pw, ...userData } = newUser;
    addUser({ ...userData, id: uuid() });
    setShowNew(false);
    setNewUser(BLANK_USER);
  };

  const handleSave = () => {
    if (!editing) return;
    const { newPassword: _np, ...userData } = editing;
    updateUser(editing.id, userData);
    setEditing(null);
  };

  const handleDelete = () => {
    if (deleteId) deleteUser(deleteId);
    setDeleteId(null);
  };

  const deleteTarget = users.find(u => u.id === deleteId);

  return (
    <div className="p-8">
      <PageHeader
        title="User Management"
        subtitle={`${users.length} users · ${adminCount} admin${adminCount !== 1 ? 's' : ''}`}
        actions={
          isAdmin
            ? <Button onClick={() => setShowNew(true)}><Plus size={16} /> Add User</Button>
            : undefined
        }
      />

      {!isAdmin && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          <Shield size={16} className="flex-shrink-0" />
          You have read-only access. Only Administrators can add or modify users.
        </div>
      )}

      {/* Search */}
      <div className="mb-5 relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Search by name, email or department…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* User list */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-200 dark:border-slate-700">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Department</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">2FA</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400 dark:text-slate-500">No users match your search.</td>
              </tr>
            )}
            {filtered.map(user => {
              const isSelf = user.id === currentUser?.id;
              const admin = user.appRole === 'admin';
              const roleLabel = ROLE_LABELS[user.appRole] ?? user.appRole;
              return (
                <tr key={user.id} className={clsx('hover:bg-gray-50 dark:hover:bg-slate-700/50', isSelf && 'bg-brand-50/40 dark:bg-brand-900/20')}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <UserAvatar user={user} size="md" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-slate-100 flex items-center gap-1.5">
                          {user.name}
                          {isSelf && (
                            <span className="text-xs text-brand-600 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded-full">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-gray-500 dark:text-slate-400">{user.email}</td>
                  <td className="px-4 py-3.5 text-gray-600 dark:text-slate-400">{user.department ?? '—'}</td>
                  <td className="px-4 py-3.5">
                    {admin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                        <ShieldCheck size={11} /> {roleLabel}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">
                        {roleLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {user.totpEnabled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-300">
                        <Smartphone size={10} /> Enabled
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing({ ...user })}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600"
                          title="Edit user"><Edit2 size={14} /></button>
                        {user.authProvider === 'local' && (
                          <button onClick={() => handleGenerateResetLink(user)}
                            className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-600"
                            title="Generate password reset link"><KeyRound size={14} /></button>
                        )}
                        {user.totpEnabled && (
                          <button onClick={() => setClearTotpId(user.id)}
                            className="p-1.5 rounded hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-400 hover:text-orange-500"
                            title="Remove 2FA for this user"><Smartphone size={14} /></button>
                        )}
                        <button onClick={() => !isSelf && setDeleteId(user.id)} disabled={isSelf}
                          className={clsx('p-1.5 rounded', isSelf ? 'text-gray-200 cursor-not-allowed' : 'hover:bg-red-50 text-gray-400 hover:text-red-500')}
                          title={isSelf ? "You can't delete yourself" : 'Delete user'}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add user modal */}
      <Modal open={showNew} onClose={() => { setShowNew(false); setNewUser(BLANK_USER); }} title="Add User">
        <UserForm value={newUser} onChange={v => setNewUser(v as typeof newUser)} isSelf={false} departments={departments} isNew />
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => { setShowNew(false); setNewUser(BLANK_USER); }}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!newUser.name.trim() || !newUser.email.trim()}>
            <Save size={14} /> Add User
          </Button>
        </div>
      </Modal>

      {/* Edit user modal */}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title="Edit User">
          <UserForm
            value={editing}
            onChange={v => setEditing({ ...editing, ...v })}
            isSelf={editing.id === currentUser?.id}
            departments={departments}
          />
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              <X size={14} /> Cancel
            </Button>
            <Button onClick={handleSave} disabled={!editing.name.trim() || !editing.email.trim()}>
              <Save size={14} /> Save Changes
            </Button>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        title="Remove User?"
        message={deleteTarget ? `Remove ${deleteTarget.name}? Their proposals remain but they lose access.` : 'Remove this user?'}
        confirmLabel="Remove" danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* Reset TOTP confirm */}
      <ConfirmDialog
        open={!!clearTotpId}
        title="Remove 2FA?"
        message="This will clear the user's two-factor authentication. They will be able to log in with password only until they re-enrol."
        confirmLabel="Remove 2FA" danger
        onConfirm={handleClearTotp}
        onCancel={() => setClearTotpId(null)}
      />

      {/* Password reset link modal */}
      <Modal open={!!resetLinkFor} onClose={() => { setResetLinkFor(null); setResetLinkUrl(null); }}
        title={`Reset password — ${resetLinkFor?.name}`}>
        <div className="space-y-4">
          {resetLinkLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <RefreshCw size={14} className="animate-spin" /> Generating link…
            </div>
          )}
          {resetLinkError && (
            <div className="text-sm text-red-600">{resetLinkError}</div>
          )}
          {resetLinkUrl && (
            <>
              <p className="text-sm text-gray-600 dark:text-slate-300">
                Share this link securely with the user. It expires in <strong>24 hours</strong> and can only be used once.
              </p>
              <div className="bg-gray-50 dark:bg-slate-700 rounded-lg px-3 py-2.5 flex items-center gap-2">
                <span className="text-xs text-gray-600 dark:text-slate-300 font-mono break-all flex-1">{resetLinkUrl}</span>
                <button onClick={() => {
                  navigator.clipboard.writeText(resetLinkUrl);
                  setResetLinkCopied(true);
                  setTimeout(() => setResetLinkCopied(false), 2000);
                }} className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-400">
                  {resetLinkCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end mt-6">
          <Button variant="secondary" onClick={() => { setResetLinkFor(null); setResetLinkUrl(null); }}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}

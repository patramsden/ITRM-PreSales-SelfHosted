import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, Save, Loader2, CheckCircle, AlertCircle, Eye, EyeOff,
  KeyRound, Smartphone, ShieldCheck, User as UserIcon, Trash2,
} from 'lucide-react';
import { useAuth, isPresalesAdmin } from '../contexts/AuthContext';
import { profileApi, authApi, totpApi } from '../lib/api';
import { settingsApi } from '../lib/api';
import { useStore } from '../store';
import { Button } from '../components/ui/Button';
import { policyFromSettings, validatePassword } from '../utils/passwordPolicy';
import clsx from 'clsx';

// ─── Avatar component ─────────────────────────────────────────────────────────

export function UserAvatar({
  user, size = 'md', className,
}: {
  user: { name: string; avatar?: string; appRole?: string };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizeMap = { xs: 'w-6 h-6 text-xs', sm: 'w-8 h-8 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base', xl: 'w-24 h-24 text-2xl' };
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const isAdmin  = user.appRole === 'admin';

  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.name}
        className={clsx('rounded-full object-cover flex-shrink-0', sizeMap[size], className)}
      />
    );
  }
  return (
    <div className={clsx(
      'rounded-full flex items-center justify-center font-semibold flex-shrink-0',
      sizeMap[size],
      isAdmin
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
        : 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
      className,
    )}>
      {initials}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function SaveFeedback({ saving, saved, error }: { saving: boolean; saved: boolean; error: string | null }) {
  if (saving) return <span className="flex items-center gap-1.5 text-gray-500 text-sm"><Loader2 size={13} className="animate-spin" />Saving…</span>;
  if (saved)  return <span className="flex items-center gap-1.5 text-green-600 text-sm"><CheckCircle size={13} />Saved</span>;
  if (error)  return <span className="flex items-center gap-1.5 text-red-600 text-sm"><AlertCircle size={13} />{error}</span>;
  return null;
}

const inputCls = 'w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

// ─── Main component ───────────────────────────────────────────────────────────

export function Profile() {
  const { currentUser, refreshCurrentUser } = useAuth();
  const { lookups } = useStore();
  const navigate = useNavigate();
  const IS_DEV = import.meta.env.DEV;
  const departments = lookups.departments ?? [];

  const [activeTab, setActiveTab] = useState<'info' | 'password' | 'security'>('info');
  const avatarRef = useRef<HTMLInputElement>(null);

  // ── Info form ──────────────────────────────────────────────────────────────
  const [name,       setName]       = useState(currentUser?.name ?? '');
  const [department, setDepartment] = useState(currentUser?.department ?? '');
  const [jobTitle,   setJobTitle]   = useState(currentUser?.jobTitle ?? '');
  const [avatar,     setAvatar]     = useState<string | null>(currentUser?.avatar ?? null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSaved,  setInfoSaved]  = useState(false);
  const [infoError,  setInfoError]  = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name);
      setDepartment(currentUser.department ?? '');
      setJobTitle(currentUser.jobTitle ?? '');
      setAvatar(currentUser.avatar ?? null);
    }
  }, [currentUser]);

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_097_152) { setInfoError('Photo must be under 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => { setAvatar(reader.result as string); setAvatarChanged(true); setInfoError(null); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleInfoSave = async () => {
    if (!name.trim()) { setInfoError('Name is required'); return; }
    setInfoSaving(true); setInfoSaved(false); setInfoError(null);
    try {
      const updated = await profileApi.update({
        name: name.trim(),
        department: department.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        avatar: avatarChanged ? avatar : undefined,
        clearAvatar: avatarChanged && !avatar ? true : undefined,
      });
      if (updated) refreshCurrentUser(updated);
      setAvatarChanged(false);
      setInfoSaved(true); setTimeout(() => setInfoSaved(false), 3000);
    } catch (e) { setInfoError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setInfoSaving(false); }
  };

  // ── Password form ──────────────────────────────────────────────────────────
  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved,  setPwSaved]  = useState(false);
  const [pwError,  setPwError]  = useState<string | null>(null);
  const [policy,   setPolicy]   = useState(policyFromSettings({}));

  useEffect(() => {
    settingsApi.get().then(s => setPolicy(policyFromSettings(s as Record<string,string>))).catch(() => {});
  }, []);

  const policyErrors = next ? validatePassword(next, policy) : [];

  const handlePwSave = async () => {
    if (next !== confirm) { setPwError('Passwords do not match'); return; }
    const errs = validatePassword(next, policy);
    if (errs.length) { setPwError(errs[0]); return; }
    setPwSaving(true); setPwSaved(false); setPwError(null);
    try {
      await authApi.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setPwSaved(true); setTimeout(() => setPwSaved(false), 3000);
    } catch (e) { setPwError(e instanceof Error ? e.message : 'Failed'); }
    finally { setPwSaving(false); }
  };

  // ── TOTP ────────────────────────────────────────────────────────────────────
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [totpSetup,   setTotpSetup]   = useState<{ secret: string; formattedSecret: string; qrCode: string } | null>(null);
  const [totpCode,    setTotpCode]    = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError,   setTotpError]   = useState<string | null>(null);
  const [totpSuccess, setTotpSuccess] = useState(false);

  const canTotp = currentUser?.authProvider === 'local';

  useEffect(() => {
    if (canTotp) totpApi.status().then(r => setTotpEnabled(r.totpEnabled)).catch(() => {});
  }, [canTotp]);

  const handleTotpSetup = async () => {
    setTotpLoading(true); setTotpError(null);
    try { setTotpSetup(await totpApi.setup()); }
    catch (e) { setTotpError(e instanceof Error ? e.message : 'Setup failed'); }
    finally { setTotpLoading(false); }
  };

  const handleTotpEnable = async () => {
    if (!totpSetup) return;
    setTotpLoading(true); setTotpError(null);
    try {
      await totpApi.enable(totpSetup.secret, totpCode);
      setTotpEnabled(true); setTotpSetup(null); setTotpCode('');
      setTotpSuccess(true); setTimeout(() => setTotpSuccess(false), 3000);
    } catch (e) { setTotpError(e instanceof Error ? e.message : 'Invalid code'); }
    finally { setTotpLoading(false); }
  };

  const handleTotpDisable = async () => {
    if (!window.confirm('Are you sure you want to remove two-factor authentication?')) return;
    setTotpLoading(true); setTotpError(null);
    try { await totpApi.disable(); setTotpEnabled(false); }
    catch (e) { setTotpError(e instanceof Error ? e.message : 'Failed'); }
    finally { setTotpLoading(false); }
  };

  if (!currentUser) return null;

  const isAdmin = isPresalesAdmin(currentUser);

  return (
    <div className="p-8 max-w-2xl">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 mb-6 flex items-center gap-1">
        ← Back
      </button>

      {/* Profile header card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 mb-6 flex items-center gap-5">
        {/* Avatar with upload overlay */}
        <div className="relative flex-shrink-0 group">
          {avatar ? (
            <img src={avatar} alt={currentUser.name}
              className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-slate-700 shadow-md" />
          ) : (
            <div className={clsx(
              'w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold border-4 border-white dark:border-slate-700 shadow-md',
              isAdmin ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
            )}>
              {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          )}
          {/* Hover overlay */}
          <button
            onClick={() => avatarRef.current?.click()}
            className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            title="Upload photo"
          >
            <Camera size={22} className="text-white" />
          </button>
          <input ref={avatarRef} type="file" className="hidden"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleAvatarPick} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">{currentUser.name}</h1>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                <ShieldCheck size={11} /> Admin
              </span>
            )}
          </div>
          {currentUser.jobTitle && (
            <div className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{currentUser.jobTitle}</div>
          )}
          <div className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">{currentUser.email}</div>
          {currentUser.department && (
            <div className="text-xs text-gray-400 dark:text-slate-500 mt-1">{currentUser.department}</div>
          )}
          <button
            onClick={() => { setActiveTab('info'); avatarRef.current?.click(); }}
            className="text-xs text-brand-600 hover:underline mt-2 inline-block"
          >
            Change photo
          </button>
          {avatar && (
            <button
              onClick={() => { setAvatar(null); setAvatarChanged(true); }}
              className="text-xs text-red-400 hover:text-red-600 hover:underline mt-2 ml-3 inline-block"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="flex border-b border-gray-200 dark:border-slate-700">
          {(
            [
              { id: 'info'     as const, label: 'Personal Info', icon: UserIcon,   hidden: false },
              { id: 'password' as const, label: 'Password',      icon: KeyRound,   hidden: currentUser.authProvider !== 'local' },
              { id: 'security' as const, label: '2FA',           icon: Smartphone, hidden: !canTotp },
            ] satisfies { id: typeof activeTab; label: string; icon: React.ElementType; hidden: boolean }[]
          ).filter(t => !t.hidden).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={clsx(
                'flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
              )}
            >
              <tab.icon size={15} />{tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">

          {/* ── Personal Info ──────────────────────────────────────────────── */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Full Name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Your name" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Job Title</label>
                  <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} className={inputCls} placeholder="e.g. Senior Solutions Architect" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Department</label>
                  <input list="dept-list" value={department} onChange={e => setDepartment(e.target.value)} className={inputCls} placeholder="e.g. PreSales" />
                  <datalist id="dept-list">{departments.map(d => <option key={d} value={d} />)}</datalist>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Email address</label>
                  <input value={currentUser.email} readOnly className={clsx(inputCls, 'bg-gray-50 dark:bg-slate-800 text-gray-400 cursor-default')} />
                  <p className="text-xs text-gray-400 mt-1">Contact an administrator to change your email.</p>
                </div>
              </div>

              {/* Avatar section */}
              <div className="pt-2 border-t border-gray-100 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-slate-300">Profile Photo</div>
                    <div className="text-xs text-gray-400 mt-0.5">PNG, JPG or WebP · Max 2 MB</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {avatar && (
                      <button onClick={() => { setAvatar(null); setAvatarChanged(true); }}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600">
                        <Trash2 size={12} /> Remove
                      </button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => avatarRef.current?.click()}>
                      <Camera size={13} /> {avatar ? 'Change photo' : 'Upload photo'}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <SaveFeedback saving={infoSaving} saved={infoSaved} error={infoError} />
                <Button onClick={handleInfoSave} disabled={infoSaving || !name.trim()}>
                  <Save size={14} /> Save changes
                </Button>
              </div>
            </div>
          )}

          {/* ── Password ───────────────────────────────────────────────────── */}
          {activeTab === 'password' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Current password</label>
                <input type="password" value={current} onChange={e => setCurrent(e.target.value)} className={inputCls} placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">New password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={next} onChange={e => setNext(e.target.value)}
                    className={clsx(inputCls, 'pr-9')} placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {policyErrors.length > 0 && next && (
                  <ul className="mt-1.5 space-y-0.5">
                    {policyErrors.map(e => (
                      <li key={e} className="text-xs text-red-500 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />{e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Confirm new password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} placeholder="••••••••" />
                {confirm && confirm !== next && <p className="text-xs text-red-500 mt-1">Passwords do not match</p>}
              </div>
              <div className="flex items-center justify-between pt-2">
                <SaveFeedback saving={pwSaving} saved={pwSaved} error={pwError} />
                <Button onClick={handlePwSave}
                  disabled={pwSaving || !current || !next || !confirm || policyErrors.length > 0 || next !== confirm}>
                  <Save size={14} /> Update password
                </Button>
              </div>
            </div>
          )}

          {/* ── 2FA ────────────────────────────────────────────────────────── */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              {totpSuccess && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  <CheckCircle size={14} /> Two-factor authentication enabled.
                </div>
              )}
              {totpError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={14} /> {totpError}
                </div>
              )}

              {totpEnabled === null ? (
                <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" />Loading…</div>
              ) : totpEnabled ? (
                <div className="flex items-center justify-between p-4 rounded-xl border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-600" />
                    <div>
                      <div className="text-sm font-semibold text-green-800 dark:text-green-200">2FA is enabled</div>
                      <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">Your account is protected with an authenticator app</div>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleTotpDisable} disabled={totpLoading}>
                    {totpLoading ? <Loader2 size={13} className="animate-spin" /> : null} Remove 2FA
                  </Button>
                </div>
              ) : !totpSetup ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl border-2 border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/40">
                    <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Two-factor authentication is not set up</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      Protect your account with an app like Google Authenticator, Authy or Microsoft Authenticator.
                      You'll be asked for a code each time you sign in.
                    </div>
                  </div>
                  <Button onClick={handleTotpSetup} disabled={totpLoading}>
                    {totpLoading ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={14} />}
                    Set up two-factor authentication
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-brand-200 dark:border-brand-800 rounded-xl p-5 space-y-4">
                  <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Scan this QR code with your authenticator app</div>
                  <div className="flex gap-6 items-start">
                    <img src={totpSetup.qrCode} alt="QR code"
                      className="w-40 h-40 rounded-xl border border-gray-200 flex-shrink-0" />
                    <div className="space-y-3">
                      <div className="text-sm text-gray-600 dark:text-slate-300">
                        Open your authenticator app, tap <strong>+</strong> and scan the QR code. Or enter this key manually:
                      </div>
                      <code className="block text-sm font-mono bg-gray-100 dark:bg-slate-700 px-3 py-2 rounded-lg break-all select-all">
                        {totpSetup.formattedSecret}
                      </code>
                      <div className="text-sm text-gray-600 dark:text-slate-300">Then enter the 6-digit code to verify:</div>
                      <input
                        type="text" inputMode="numeric" autoFocus maxLength={6}
                        value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-40 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2.5 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="000000"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-slate-700">
                    <Button onClick={handleTotpEnable} disabled={totpLoading || totpCode.length !== 6}>
                      {totpLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                      Confirm & enable
                    </Button>
                    <Button variant="secondary" onClick={() => { setTotpSetup(null); setTotpCode(''); setTotpError(null); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useAuth, isPresalesAdmin } from '../contexts/AuthContext';
import { useStore } from '../store';
import { settingsApi, authApi, totpApi, serviceKeyApi } from '../lib/api';
import type { AppSettings } from '../lib/api';
import { LookupEditor } from '../components/ui/LookupEditor';
import { Button } from '../components/ui/Button';
import { useBranding } from '../contexts/BrandingContext';
import { policyFromSettings, validatePassword } from '../utils/passwordPolicy';
import {
  ShieldCheck, User, Info, List, Lock, Zap, KeyRound, Globe,
  Eye, EyeOff, Save, Loader2, CheckCircle, AlertCircle, Bell,
  CalendarCheck, Palette, ChevronRight, Smartphone, ShieldAlert,
  Plug, Copy, Check, RefreshCw, Trash2,
} from 'lucide-react';
import type { AppLookups } from '../store';
import clsx from 'clsx';

// ─── Tab definition ───────────────────────────────────────────────────────────

interface Tab { id: string; label: string; icon: React.ElementType; adminOnly: boolean }

const TABS: Tab[] = [
  { id: 'profile',      label: 'Profile',             icon: User,          adminOnly: false },
  { id: 'general',      label: 'General',             icon: List,          adminOnly: true  },
  { id: 'security',     label: 'Security',            icon: ShieldAlert,   adminOnly: true  },
  { id: 'branding',     label: 'Branding',            icon: Palette,       adminOnly: true  },
  { id: 'notifications',label: 'Notifications',       icon: Bell,          adminOnly: true  },
  { id: 'ai',           label: 'AI / SoW',            icon: Zap,           adminOnly: true  },
  { id: 'sso',          label: 'Single Sign-On',      icon: Globe,         adminOnly: true  },
  { id: 'planner',      label: 'Microsoft Planner',   icon: CalendarCheck, adminOnly: true  },
  { id: 'api',          label: 'API Access',          icon: Plug,          adminOnly: true  },
  { id: 'about',        label: 'About',               icon: Info,          adminOnly: false },
];

const LOOKUP_META: { key: keyof AppLookups; label: string; description: string; placeholder: string }[] = [
  { key: 'catalogCategories', label: 'Catalog Categories',
    description: 'Used when adding or editing items in the Product Catalog.',
    placeholder: 'e.g. Wireless, UPS, Cabling…' },
  { key: 'departments',       label: 'Departments',
    description: "Shown as suggestions when setting a user's department.",
    placeholder: 'e.g. DevOps, Legal, Support…' },
];

// ─── Shared sub-components ────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-1.5">
      <span className="w-32 text-sm text-gray-500 dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

function TextInput({ value, onChange, placeholder, readOnly }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean;
}) {
  return (
    <input value={value} onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder} readOnly={readOnly}
      className={clsx(inputCls, readOnly && 'bg-gray-50 dark:bg-slate-800 text-gray-400 cursor-default')} />
  );
}

function SecretInput({ value, onChange, placeholder, readOnly }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value}
        onChange={e => onChange?.(e.target.value)} placeholder={placeholder} readOnly={readOnly}
        className={clsx(inputCls, 'pr-9', readOnly && 'bg-gray-50 dark:bg-slate-800 text-gray-400 cursor-default')} />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function SaveBar({ saving, saved, error, onSave }: {
  saving: boolean; saved: boolean; error: string | null; onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-100 dark:border-slate-700">
      <div className="text-xs min-h-[18px]">
        {saving  && <span className="flex items-center gap-1.5 text-gray-500"><Loader2 size={13} className="animate-spin" />Saving…</span>}
        {!saving && saved && <span className="flex items-center gap-1.5 text-green-600"><CheckCircle size={13} />Saved</span>}
        {!saving && error && <span className="flex items-center gap-1.5 text-red-600"><AlertCircle size={13} />{error}</span>}
      </div>
      <Button onClick={onSave} disabled={saving}><Save size={14} />Save</Button>
    </div>
  );
}

// ─── Tab panels ───────────────────────────────────────────────────────────────

function ProfileTab({ isAdmin, currentUser, appSettings }: {
  isAdmin: boolean;
  currentUser: ReturnType<typeof useAuth>['currentUser'];
  appSettings: AppSettings;
}) {
  const IS_DEV = import.meta.env.DEV;
  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [pwError, setPwError]   = useState<string | null>(null);

  // TOTP state
  const [totpEnabled, setTotpEnabled]   = useState<boolean | null>(null);
  const [totpSetup, setTotpSetup]       = useState<{ secret: string; formattedSecret: string; qrCode: string } | null>(null);
  const [totpCode, setTotpCode]         = useState('');
  const [totpLoading, setTotpLoading]   = useState(false);
  const [totpError, setTotpError]       = useState<string | null>(null);
  const [totpSuccess, setTotpSuccess]   = useState(false);

  const policy = policyFromSettings(appSettings as Record<string, string>);
  const policyErrors = next ? validatePassword(next, policy) : [];
  const canChangePassword = currentUser?.authProvider === 'local';
  const canTotp = currentUser?.authProvider === 'local';

  useEffect(() => {
    if (canTotp) {
      totpApi.status().then(r => setTotpEnabled(r.totpEnabled)).catch(() => {});
    }
  }, [canTotp]);

  const handleSave = async () => {
    if (next !== confirm) { setPwError('Passwords do not match'); return; }
    const errs = validatePassword(next, policy);
    if (errs.length) { setPwError(errs[0]); return; }
    setSaving(true); setSaved(false); setPwError(null);
    try {
      await authApi.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) { setPwError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

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

  return (
    <div className="space-y-6">
      <SectionHeader icon={User} title="Your Profile" />
      {currentUser ? (
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          <Row label="Name"        value={currentUser.name} />
          <Row label="Email"       value={currentUser.email} />
          <Row label="Department"  value={currentUser.department ?? '—'} />
          <Row label="Auth"        value={currentUser.authProvider === 'saml' ? 'Single Sign-On (SAML)' : 'Local account'} />
          <Row label="Role"        value={
            <span className="flex items-center gap-1.5">
              {isAdmin && <ShieldCheck size={14} className="text-amber-500" />}
              <span className={isAdmin ? 'text-amber-600 font-medium' : 'text-gray-600 dark:text-slate-400'}>
                {isAdmin ? 'Administrator' : 'Standard User'}
              </span>
            </span>
          } />
        </div>
      ) : <p className="text-sm text-gray-500">Not signed in.</p>}

      {canChangePassword && (
      <>
        <SectionHeader icon={KeyRound} title="Change Password" />
        <div className="space-y-3">
          <FieldRow label="Current password">
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)} className={inputCls} placeholder="••••••••" />
          </FieldRow>
          <FieldRow label="New password">
            <input type="password" value={next} onChange={e => setNext(e.target.value)} className={inputCls} placeholder="••••••••" />
            {policyErrors.length > 0 && next && (
              <ul className="mt-1.5 space-y-0.5">
                {policyErrors.map(e => <li key={e} className="text-xs text-red-500 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />{e}</li>)}
              </ul>
            )}
          </FieldRow>
          <FieldRow label="Confirm new password">
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} placeholder="••••••••" />
          </FieldRow>
          <SaveBar saving={saving} saved={saved} error={pwError} onSave={handleSave} />
        </div>
      </>
    )}

    {/* TOTP */}
    {canTotp && (
      <>
        <SectionHeader icon={Smartphone} title="Two-Factor Authentication"
          subtitle="Protect your account with an authenticator app (Google Authenticator, Authy, etc.)" />

        {totpSuccess && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            <CheckCircle size={14} /> 2FA enabled successfully.
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
              <span className="text-sm font-semibold text-green-800 dark:text-green-200">2FA is enabled</span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleTotpDisable} disabled={totpLoading}>
              {totpLoading ? <Loader2 size={13} className="animate-spin" /> : null} Remove 2FA
            </Button>
          </div>
        ) : !totpSetup ? (
          <div className="flex items-center justify-between p-4 rounded-xl border-2 border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/40">
            <div>
              <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">2FA is not set up</div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Add an extra layer of security to your account</div>
            </div>
            <Button variant="secondary" size="sm" onClick={handleTotpSetup} disabled={totpLoading}>
              {totpLoading ? <Loader2 size={13} className="animate-spin" /> : null} Set up 2FA
            </Button>
          </div>
        ) : (
          <div className="border-2 border-brand-200 dark:border-brand-800 rounded-xl p-5 space-y-4">
            <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Scan with your authenticator app</div>
            <div className="flex gap-5 items-start">
              <img src={totpSetup.qrCode} alt="QR code" className="w-36 h-36 rounded-lg border border-gray-200 flex-shrink-0" />
              <div className="space-y-2">
                <div className="text-xs text-gray-500 dark:text-slate-400">
                  Scan the QR code, or enter this key manually:
                </div>
                <code className="block text-xs font-mono bg-gray-100 dark:bg-slate-700 px-2 py-1.5 rounded break-all">
                  {totpSetup.formattedSecret}
                </code>
                <div className="text-xs text-gray-500 dark:text-slate-400 pt-2">
                  Then enter the 6-digit code to confirm:
                </div>
                <input
                  type="text" inputMode="numeric" maxLength={6}
                  value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-36 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-center text-xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="000000"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-slate-700">
              <Button onClick={handleTotpEnable} disabled={totpLoading || totpCode.length !== 6}>
                {totpLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                Confirm & enable 2FA
              </Button>
              <Button variant="secondary" onClick={() => { setTotpSetup(null); setTotpCode(''); setTotpError(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </>
    )}
    </div>
  );
}

function GeneralTab({ lookups, updateLookup, isAdmin }: {
  lookups: AppLookups; updateLookup: (k: keyof AppLookups, v: string[]) => void; isAdmin: boolean;
}) {
  return (
    <div className="space-y-6">
      <SectionHeader icon={List} title="Reference Data" subtitle="Lookup lists used throughout the app" />
      <div className="space-y-6">
        {LOOKUP_META.map(({ key, label, description, placeholder }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">{label}</div>
                <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{description}</div>
              </div>
              <span className="text-xs text-gray-400">{(lookups[key] ?? []).length} value{(lookups[key] ?? []).length !== 1 ? 's' : ''}</span>
            </div>
            <LookupEditor values={lookups[key] ?? []} onChange={v => updateLookup(key, v)}
              placeholder={placeholder} readOnly={!isAdmin} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BrandingTab({ settings, onChange, isAdmin }: {
  settings: AppSettings; onChange: (s: AppSettings) => void; isAdmin: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const logoRef    = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);
  const { primaryColor: livePrimary } = useBranding();

  const color       = (settings['branding.primaryColor'] as string | undefined) ?? livePrimary;
  const logoData    = (settings['branding.logo']         as string | undefined) ?? null;
  const faviconData = (settings['branding.favicon']      as string | undefined) ?? null;
  const company     = (settings['branding.companyName']  as string | undefined) ?? '';
  const subtitle    = (settings['branding.subtitle']     as string | undefined) ?? '';

  const set = (k: keyof AppSettings, v: string) => onChange({ ...settings, [k]: v });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('branding.logo', reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('branding.favicon', reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      await settingsApi.update(settings);
      // Reload page to apply new branding
      window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Palette} title="Branding" subtitle="Logo, colours and company name used across the app and login page" />

      {!isAdmin && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <Lock size={12} /> Branding can only be changed by administrators.
        </div>
      )}

      {/* Company identity */}
      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="Company Name">
          <TextInput value={company} onChange={v => set('branding.companyName', v)}
            placeholder="ITRM" readOnly={!isAdmin} />
        </FieldRow>
        <FieldRow label="App Subtitle">
          <TextInput value={subtitle} onChange={v => set('branding.subtitle', v)}
            placeholder="PreSales" readOnly={!isAdmin} />
          <p className="text-xs text-gray-400 mt-1">Shown in the sidebar and on the login page.</p>
        </FieldRow>
      </div>

      {/* Primary colour */}
      <FieldRow label="Primary / Brand Colour">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={e => set('branding.primaryColor', e.target.value)}
            disabled={!isAdmin}
            className="h-10 w-16 rounded-lg border border-gray-300 dark:border-slate-600 cursor-pointer disabled:opacity-50 disabled:cursor-default p-0.5"
          />
          <TextInput value={color} onChange={v => set('branding.primaryColor', v)}
            placeholder="#2B3990" readOnly={!isAdmin} />
          <div className="w-10 h-10 rounded-lg border border-gray-200 flex-shrink-0" style={{ backgroundColor: color }} />
        </div>
        <p className="text-xs text-gray-400 mt-1">Used for the sidebar background, login page, and active states.</p>
      </FieldRow>

      {/* Logo upload */}
      <FieldRow label="Logo">
        <div className="flex items-start gap-4">
          {/* Preview */}
          <div className="w-24 h-16 rounded-lg flex items-center justify-center flex-shrink-0 border border-gray-200 dark:border-slate-600 overflow-hidden"
            style={{ backgroundColor: color }}>
            <img src={logoData ?? '/itrm-logo.svg'} alt="Logo preview"
              className="max-h-10 max-w-20 brightness-0 invert object-contain" />
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Upload an SVG or PNG logo. It will be displayed white (brightness inverted) on the coloured background.
              Recommended height: 32–48 px.
            </p>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <input ref={logoRef} type="file" className="hidden" accept="image/svg+xml,image/png,image/jpeg"
                  onChange={handleLogoUpload} />
                <Button variant="secondary" size="sm" onClick={() => logoRef.current?.click()}>
                  Upload logo
                </Button>
                {logoData && (
                  <Button variant="ghost" size="sm" onClick={() => set('branding.logo', '')}>
                    Reset to default
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </FieldRow>

      {/* Favicon upload */}
      <FieldRow label="Favicon">
        <div className="flex items-start gap-4">
          {/* Preview */}
          <div className="w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0 border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700">
            <img
              src={faviconData ?? '/favicon.svg'}
              alt="Favicon preview"
              className="w-8 h-8 object-contain"
            />
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Upload an ICO, PNG or SVG file. Recommended size: 32×32 or 64×64 px.
              Shown in browser tabs and bookmarks.
            </p>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <input ref={faviconRef} type="file" className="hidden"
                  accept="image/x-icon,image/png,image/svg+xml,image/vnd.microsoft.icon"
                  onChange={handleFaviconUpload} />
                <Button variant="secondary" size="sm" onClick={() => faviconRef.current?.click()}>
                  Upload favicon
                </Button>
                {faviconData && (
                  <Button variant="ghost" size="sm" onClick={() => set('branding.favicon', '')}>
                    Reset to default
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </FieldRow>

      {isAdmin && <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />}
    </div>
  );
}

function SecurityTab({ settings, onChange, isAdmin }: {
  settings: AppSettings; onChange: (s: AppSettings) => void; isAdmin: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const set = (k: keyof AppSettings, v: string) => onChange({ ...settings, [k]: v });

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try { await settingsApi.update(settings); setSaved(true); setTimeout(() => setSaved(false), 3000); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const minLen = parseInt((settings['security.pw.minLength'] as string) ?? '8', 10) || 8;

  const ToggleRow = ({ label, desc, settingKey }: { label: string; desc: string; settingKey: keyof AppSettings }) => {
    const enabled = settings[settingKey] === 'true';
    return (
      <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-slate-700 last:border-0">
        <div>
          <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{label}</div>
          <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{desc}</div>
        </div>
        <button type="button" disabled={!isAdmin} onClick={() => set(settingKey, enabled ? 'false' : 'true')}
          className={clsx('relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors',
            enabled ? 'bg-brand-500' : 'bg-gray-300 dark:bg-slate-600', !isAdmin && 'opacity-50 cursor-not-allowed')}>
          <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-4' : 'translate-x-0')} />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={ShieldAlert} title="Password Policy" subtitle="Applied when users change their password or a new password is set" adminOnly={!isAdmin} />

      <FieldRow label="Minimum length">
        <div className="flex items-center gap-3">
          <input type="number" min={6} max={64}
            value={minLen}
            onChange={e => set('security.pw.minLength', String(Math.max(6, parseInt(e.target.value) || 8)))}
            disabled={!isAdmin}
            className={clsx('w-24', inputCls, !isAdmin && 'bg-gray-50 dark:bg-slate-800 text-gray-400 cursor-default')} />
          <span className="text-sm text-gray-500 dark:text-slate-400">characters (min 6)</span>
        </div>
      </FieldRow>

      <div className="border border-gray-200 dark:border-slate-700 rounded-xl px-4 divide-y divide-gray-100 dark:divide-slate-700">
        <ToggleRow label="Require uppercase" desc="At least one uppercase letter (A–Z)"
          settingKey="security.pw.requireUppercase" />
        <ToggleRow label="Require lowercase" desc="At least one lowercase letter (a–z)"
          settingKey="security.pw.requireLowercase" />
        <ToggleRow label="Require number" desc="At least one digit (0–9)"
          settingKey="security.pw.requireNumber" />
        <ToggleRow label="Require special character" desc="At least one symbol (!@#$%^&*…)"
          settingKey="security.pw.requireSpecial" />
      </div>

      {isAdmin && <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />}
    </div>
  );
}

function AiTab({ settings, onChange, isAdmin }: {
  settings: AppSettings; onChange: (s: AppSettings) => void; isAdmin: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const provider = (settings['ai.provider'] ?? 'demo') as string;
  const set = (k: keyof AppSettings, v: string) => onChange({ ...settings, [k]: v });

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try { await settingsApi.update(settings); setSaved(true); setTimeout(() => setSaved(false), 3000); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Zap} title="AI / SoW Generator" subtitle="Configure the AI provider for Statement of Work generation" adminOnly={!isAdmin} />
      <FieldRow label="Provider">
        <select value={provider} onChange={e => set('ai.provider', e.target.value)} disabled={!isAdmin}
          className={clsx(inputCls, !isAdmin && 'bg-gray-50 dark:bg-slate-800 text-gray-400')}>
          <option value="demo">Demo / Disabled</option>
          <option value="azure">Azure OpenAI</option>
          <option value="anthropic">Anthropic (Claude)</option>
        </select>
      </FieldRow>
      {provider === 'azure' && (
        <div className="space-y-3 pl-4 border-l-2 border-blue-100 dark:border-blue-900">
          <FieldRow label="Endpoint URL">
            <TextInput value={(settings['ai.azure.endpoint'] ?? '') as string}
              onChange={v => set('ai.azure.endpoint', v)} placeholder="https://your-resource.openai.azure.com" readOnly={!isAdmin} />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Deployment"><TextInput value={(settings['ai.azure.deployment'] ?? '') as string}
              onChange={v => set('ai.azure.deployment', v)} placeholder="gpt-4o" readOnly={!isAdmin} /></FieldRow>
            <FieldRow label="API version"><TextInput value={(settings['ai.azure.apiVersion'] ?? '') as string}
              onChange={v => set('ai.azure.apiVersion', v)} placeholder="2024-08-01-preview" readOnly={!isAdmin} /></FieldRow>
          </div>
          <FieldRow label="API Key">
            <SecretInput value={(settings['ai.azure.key'] ?? '') as string}
              onChange={v => set('ai.azure.key', v)} placeholder="Leave blank for managed identity" readOnly={!isAdmin} />
          </FieldRow>
        </div>
      )}
      {provider === 'anthropic' && (
        <div className="space-y-3 pl-4 border-l-2 border-orange-100 dark:border-orange-900">
          <FieldRow label="API Key">
            <SecretInput value={(settings['ai.anthropic.key'] ?? '') as string}
              onChange={v => set('ai.anthropic.key', v)} placeholder="sk-ant-…" readOnly={!isAdmin} />
          </FieldRow>
        </div>
      )}
      {provider === 'demo' && (
        <p className="text-xs text-gray-400 italic">Select Azure OpenAI or Anthropic to enable live SoW generation.</p>
      )}
      {isAdmin && <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />}
    </div>
  );
}

function SsoTab({ settings, onChange, isAdmin }: {
  settings: AppSettings; onChange: (s: AppSettings) => void; isAdmin: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [certInput, setCertInput] = useState('');
  const enabled = settings['sso.enabled'] === 'true';
  const set = (k: keyof AppSettings, v: string) => onChange({ ...settings, [k]: v });

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      const patch: AppSettings = { ...settings };
      if (certInput.trim()) patch['sso.idpCert'] = certInput.trim();
      await settingsApi.update(patch);
      setCertInput('');
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Globe} title="Single Sign-On (SAML)" subtitle="Connect an enterprise Identity Provider" adminOnly={!isAdmin} />
      <div className={clsx('flex items-center justify-between p-4 rounded-xl border-2 transition-colors',
        enabled ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
                : 'border-gray-200 bg-gray-50 dark:border-slate-600 dark:bg-slate-700')}>
        <div>
          <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Enable SSO</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Shows "Sign in with SSO" on the login page</div>
        </div>
        <button type="button" disabled={!isAdmin} onClick={() => set('sso.enabled', enabled ? 'false' : 'true')}
          className={clsx('relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
            enabled ? 'bg-green-500' : 'bg-gray-300', !isAdmin && 'opacity-50 cursor-not-allowed')}>
          <span className={clsx('pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition duration-200 ease-in-out', enabled ? 'translate-x-5' : 'translate-x-0')} />
        </button>
      </div>
      <FieldRow label="App URL"><TextInput value={(settings['sso.appUrl'] ?? '') as string}
        onChange={v => set('sso.appUrl', v)} placeholder="https://your-app.azurestaticapps.net" readOnly={!isAdmin} /></FieldRow>
      <FieldRow label="IdP Entry Point (SSO URL)"><TextInput value={(settings['sso.entryPoint'] ?? '') as string}
        onChange={v => set('sso.entryPoint', v)} placeholder="https://your-idp.com/saml2/sso" readOnly={!isAdmin} /></FieldRow>
      <FieldRow label="SP Issuer / Entity ID"><TextInput value={(settings['sso.issuer'] ?? '') as string}
        onChange={v => set('sso.issuer', v)} placeholder="https://your-app.azurestaticapps.net" readOnly={!isAdmin} /></FieldRow>
      {isAdmin && (
        <FieldRow label="IdP Signing Certificate (PEM body, no headers)">
          <textarea rows={4} value={certInput} onChange={e => setCertInput(e.target.value)}
            placeholder={'Paste base64 certificate body to set or update.\nLeave blank to keep existing.'}
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Lock size={10} /> Stored server-side only.</p>
        </FieldRow>
      )}
      {settings['sso.appUrl'] && (
        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 text-xs text-gray-500 font-mono break-all">
          Callback URL: {settings['sso.appUrl'] as string}/api/auth/saml/callback
        </div>
      )}
      {isAdmin && <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />}
    </div>
  );
}

function NotificationsTab({ settings, onChange }: { settings: AppSettings; onChange: (s: AppSettings) => void }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const set = (k: keyof AppSettings, v: string) => onChange({ ...settings, [k]: v });

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try { await settingsApi.update(settings); setSaved(true); setTimeout(() => setSaved(false), 3000); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Bell} title="Notifications" subtitle="Send alerts to Slack or Teams when proposals are updated" />
      <FieldRow label="Slack Webhook URL">
        <TextInput value={(settings['notifications.slackWebhook'] ?? '') as string}
          onChange={v => set('notifications.slackWebhook', v)} placeholder="https://hooks.slack.com/services/…" />
      </FieldRow>
      <FieldRow label="Microsoft Teams Webhook URL">
        <TextInput value={(settings['notifications.teamsWebhook'] ?? '') as string}
          onChange={v => set('notifications.teamsWebhook', v)} placeholder="https://your-org.webhook.office.com/…" />
      </FieldRow>
      <p className="text-xs text-gray-400 dark:text-slate-500">Notifications sent when a proposal status changes. Both fields are optional.</p>
      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  );
}

function PlannerTab({ settings, onChange, isAdmin }: {
  settings: AppSettings; onChange: (s: AppSettings) => void; isAdmin: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const set = (k: keyof AppSettings, v: string) => onChange({ ...settings, [k]: v });
  const appOrigin = window.location.origin;

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try { await settingsApi.update(settings); setSaved(true); setTimeout(() => setSaved(false), 3000); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={CalendarCheck} title="Microsoft Planner"
        subtitle="Export consultancy phases as a Planner project — delegated permissions, no secret required"
        adminOnly={!isAdmin} />
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 text-xs text-blue-800 dark:text-blue-300 space-y-1.5">
        <div className="font-semibold">One-time Azure AD setup (~2 minutes, no secret or Tenant ID needed)</div>
        <ol className="list-decimal ml-4 space-y-0.5">
          <li>Go to <strong>Entra ID → App registrations → New registration</strong></li>
          <li>Name it anything (e.g. <em>ITRM Planner</em>). Leave account type as default.</li>
          <li>Under <strong>Redirect URI</strong> choose <strong>Single-page application (SPA)</strong> and enter:
            <code className="ml-1 bg-blue-100 dark:bg-blue-900 px-1 rounded break-all">{appOrigin}/auth-redirect.html</code>
          </li>
          <li><strong>API permissions → Add → Microsoft Graph → Delegated → <code>Tasks.ReadWrite</code></strong></li>
          <li>Copy the <strong>Application (client) ID</strong> from the Overview page into the field below. That's it — no secret, no Tenant ID.</li>
        </ol>
        <p className="mt-1">When a user exports to Planner they'll be prompted to sign in with their own Microsoft account once. All tasks are created as them.</p>
      </div>
      <FieldRow label="Client ID (Application ID)">
        <TextInput value={(settings['planner.clientId'] ?? '') as string}
          onChange={v => set('planner.clientId', v)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" readOnly={!isAdmin} />
      </FieldRow>
      <FieldRow label="Microsoft 365 Group ID">
        <TextInput value={(settings['planner.groupId'] ?? '') as string}
          onChange={v => set('planner.groupId', v)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" readOnly={!isAdmin} />
        <p className="text-xs text-gray-400 mt-1">The Object ID of the M365 Group that will own Planner plans. The exporting user must be a member. Find it in Entra ID → Groups → your group → Overview.</p>
      </FieldRow>
      {isAdmin && <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />}
    </div>
  );
}

function ApiAccessTab({ isAdmin }: { isAdmin: boolean }) {
  const [configured, setConfigured]   = useState<boolean | null>(null);
  const [newKey, setNewKey]           = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);
  const apiBase = typeof window !== 'undefined'
    ? `${window.location.origin}/api`
    : '/api';

  useEffect(() => {
    serviceKeyApi.status()
      .then(r => setConfigured(r.configured))
      .catch(() => setConfigured(false));
  }, []);

  const handleGenerate = async () => {
    if (!window.confirm(configured
      ? 'This will invalidate the existing key. Any scripts using it will need to be updated. Continue?'
      : 'Generate a new service API key?')) return;
    setLoading(true); setError(null); setNewKey(null);
    try {
      const r = await serviceKeyApi.generate();
      setNewKey(r.serviceApiKey);
      setConfigured(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  };

  const handleRevoke = async () => {
    if (!window.confirm('Revoke the service API key? All scripts using it will stop working.')) return;
    setLoading(true); setError(null);
    try {
      await serviceKeyApi.revoke();
      setConfigured(false); setNewKey(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  };

  const handleCopy = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Plug} title="API Access"
        subtitle="Service API key for automated scripts and integrations (e.g. bulk user provisioning)"
        adminOnly={!isAdmin} />

      {/* Status */}
      <div className={clsx(
        'flex items-center justify-between p-4 rounded-xl border-2',
        configured
          ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
          : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/40'
      )}>
        <div className="flex items-center gap-2">
          <div className={clsx('w-2 h-2 rounded-full', configured ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-500')} />
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
            {configured === null ? 'Checking…' : configured ? 'Service key is active' : 'No service key configured'}
          </span>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {configured && (
              <button onClick={handleRevoke} disabled={loading}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 px-2.5 py-1.5 rounded border border-red-200 hover:border-red-400 transition-colors">
                <Trash2 size={12} /> Revoke
              </button>
            )}
            <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={loading}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {configured ? 'Regenerate key' : 'Generate key'}
            </Button>
          </div>
        )}
      </div>

      {/* Newly generated key — shown once */}
      {newKey && (
        <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">Copy this key now</div>
              <div className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                This is the only time it will be shown. Store it securely — treat it like a password.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2">
            <code className="flex-1 text-xs font-mono text-gray-800 dark:text-slate-200 break-all select-all">{newKey}</code>
            <button onClick={handleCopy}
              className="flex-shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400">
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle size={14} />{error}
        </div>
      )}

      {/* Usage guide */}
      <div className="space-y-3 text-sm">
        <div className="font-semibold text-gray-700 dark:text-slate-300">How to use</div>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Pass the key as a Bearer token in the <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">Authorization</code> header.
          It grants full admin access — keep it secret and rotate it if compromised.
        </p>
        <div className="bg-gray-900 rounded-lg p-3 text-xs font-mono text-green-400 overflow-x-auto">
          <div className="text-gray-500 mb-1"># Create a user</div>
          <div>curl -X POST {apiBase}/users \</div>
          <div className="pl-4">-H "Authorization: Bearer YOUR_KEY" \</div>
          <div className="pl-4">-H "Content-Type: application/json" \</div>
          <div className="pl-4">-d '&#123;"id":"...","name":"Jane Smith","email":"jane@co.com","appRole":"user","authProvider":"local","password":"..."&#125;'</div>
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500">
          See <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">USER-PROVISIONING.md</code> in the repository for the full field reference and bulk import examples.
        </p>
      </div>
    </div>
  );
}

function AboutTab({ appSettings }: { appSettings: AppSettings }) {
  return (
    <div className="space-y-6">
      <SectionHeader icon={Info} title="About" />
      <div className="divide-y divide-gray-100 dark:divide-slate-700">
        <Row label="Application" value="ITRM PreSales" />
        <Row label="Version"     value="1.2.0" />
        <Row label="Auth"        value="Local + SAML" />
        <Row label="SoW AI"      value={
          appSettings['ai.provider'] === 'azure'     ? 'Azure OpenAI' :
          appSettings['ai.provider'] === 'anthropic' ? 'Claude (Anthropic)' : 'Demo mode'
        } />
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, adminOnly }: {
  icon: React.ElementType; title: string; subtitle?: string; adminOnly?: boolean;
}) {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
          <Icon size={18} className="text-brand-600 dark:text-brand-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-slate-200">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {adminOnly && (
        <span className="inline-flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
          <Lock size={12} />Admin only
        </span>
      )}
    </div>
  );
}

// ─── Main Settings page ───────────────────────────────────────────────────────

export function Settings() {
  const { currentUser } = useAuth();
  const { lookups, updateLookup } = useStore();
  const isAdmin = isPresalesAdmin(currentUser);
  const [activeTab, setActiveTab] = useState('profile');
  const [appSettings, setAppSettings] = useState<AppSettings>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    settingsApi.get()
      .then(s => { setAppSettings(s); setSettingsLoaded(true); })
      .catch(() => setSettingsLoaded(true));
  }, []);

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="p-8 h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Account and application configuration</p>
      </div>

      <div className="flex gap-6 max-w-5xl">
        {/* Left tab nav */}
        <nav className="w-52 flex-shrink-0">
          <ul className="space-y-0.5">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <li key={tab.id}>
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                      active
                        ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                        : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-200'
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon size={16} />
                      {tab.label}
                    </span>
                    {active && <ChevronRight size={14} className="text-brand-500 flex-shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Right content panel */}
        <div className="flex-1 min-w-0 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
          {activeTab === 'profile'       && <ProfileTab isAdmin={isAdmin} currentUser={currentUser} appSettings={appSettings} />}
          {activeTab === 'general'       && <GeneralTab lookups={lookups} updateLookup={updateLookup} isAdmin={isAdmin} />}
          {activeTab === 'security'      && settingsLoaded && <SecurityTab settings={appSettings} onChange={setAppSettings} isAdmin={isAdmin} />}
          {activeTab === 'branding'      && settingsLoaded && <BrandingTab settings={appSettings} onChange={setAppSettings} isAdmin={isAdmin} />}
          {activeTab === 'notifications' && settingsLoaded && <NotificationsTab settings={appSettings} onChange={setAppSettings} />}
          {activeTab === 'ai'            && settingsLoaded && <AiTab settings={appSettings} onChange={setAppSettings} isAdmin={isAdmin} />}
          {activeTab === 'sso'           && settingsLoaded && <SsoTab settings={appSettings} onChange={setAppSettings} isAdmin={isAdmin} />}
          {activeTab === 'planner'       && settingsLoaded && <PlannerTab settings={appSettings} onChange={setAppSettings} isAdmin={isAdmin} />}
          {activeTab === 'api'           && <ApiAccessTab isAdmin={isAdmin} />}
          {activeTab === 'about'         && <AboutTab appSettings={appSettings} />}
        </div>
      </div>
    </div>
  );
}

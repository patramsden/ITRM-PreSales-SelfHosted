import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { canAccessAdmin } from '../utils/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStore } from '../store';
import { api, settingsApi, authApi, totpApi, serviceKeyApi, apiKeysApi, crmApi, ssoApi } from '../lib/api';
import type { AppSettings, AtPicklistValue } from '../lib/api';
import { LookupEditor } from '../components/ui/LookupEditor';
import { Button } from '../components/ui/Button';
import { useBranding } from '../contexts/BrandingContext';
import { policyFromSettings, validatePassword } from '../utils/passwordPolicy';
import {
  ShieldCheck, User, Info, List, Lock, Zap, KeyRound, Globe,
  Eye, EyeOff, Save, Loader2, CheckCircle, AlertCircle, Bell,
  CalendarCheck, Palette, ChevronRight, Smartphone, ShieldAlert,
  Plug, Copy, Check, RefreshCw, Trash2, Plus, X, Building2, UserCheck, Upload, Clock, Mail,
  Layout, GripVertical, ChevronUp, ChevronDown as ChevronDownIcon,
  AlertTriangle, Database, Download, Tag, FileText,
} from 'lucide-react';
import { parseLayout } from '../types/layout';
import type { ProposalLayoutConfig, LayoutSection } from '../types/layout';
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
  { id: 'crm',          label: 'CRM',                 icon: Building2,     adminOnly: true  },
  { id: 'provisioning', label: 'Provisioning',        icon: UserCheck,     adminOnly: true  },
  { id: 'api',          label: 'API Access',          icon: Plug,          adminOnly: true  },
  { id: 'email',        label: 'Email',               icon: Mail,          adminOnly: true  },
  { id: 'layout',       label: 'Proposal Layout',     icon: Layout,        adminOnly: true  },
  { id: 'backup',        label: 'Backup & Restore',    icon: Database,      adminOnly: true  },
  { id: 'support-doc',  label: 'Support Document',    icon: FileText,      adminOnly: true  },
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
            placeholder="MSP SalesPro" readOnly={!isAdmin} />
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
            <img src={logoData ?? '/msp-logo.svg'} alt="Logo preview"
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
  const [encryptionConfigured, setEncryptionConfigured] = useState<boolean | null>(null);
  const set = (k: keyof AppSettings, v: string) => onChange({ ...settings, [k]: v });

  useEffect(() => {
    api.get<{ configured: boolean }>('settings/encryption-status')
      .then(r => setEncryptionConfigured(r.configured))
      .catch(() => setEncryptionConfigured(false));
  }, []);

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
      {encryptionConfigured === false && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-sm font-medium text-amber-800 dark:text-amber-300">Secrets stored in plain text</div>
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Set the <code className="font-mono">ENCRYPTION_KEY</code> environment variable (64 hex chars) to enable AES-256-GCM encryption for API keys and passwords at rest.
              Generate one with: <code className="font-mono">openssl rand -hex 32</code>
            </div>
          </div>
        </div>
      )}
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

      <SectionHeader icon={Clock} title="Session Timeout"
        subtitle="How long a user can be inactive before their session expires"
        adminOnly={!isAdmin} />

      <FieldRow label="Inactivity timeout (hours)">
        <div className="flex items-center gap-3">
          <input type="number" min={0.25} max={168} step={0.5}
            value={parseFloat((settings['security.sessionTimeoutHours'] ?? '8') as string) || 8}
            onChange={e => set('security.sessionTimeoutHours', String(Math.max(0.25, parseFloat(e.target.value) || 8)))}
            disabled={!isAdmin}
            className={clsx('w-28', inputCls, !isAdmin && 'bg-gray-50 dark:bg-slate-800 text-gray-400 cursor-default')} />
          <span className="text-sm text-gray-500 dark:text-slate-400">hours (default: 8)</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          The session is extended on every request — the timer resets whenever the user is active.
          Minimum 15 minutes. Changes take effect on the next login.
        </p>
      </FieldRow>

      <SectionHeader icon={Smartphone} title="Multi-Factor Authentication"
        subtitle="Applies to local accounts only — SSO users are authenticated by their identity provider"
        adminOnly={!isAdmin} />

      <div className="border border-gray-200 dark:border-slate-700 rounded-xl px-4 divide-y divide-gray-100 dark:divide-slate-700">
        <ToggleRow label="Require MFA for all local users"
          desc="Users without an authenticator app enrolled will be forced to set one up on their next login. SSO users are unaffected." settingKey="security.requireMfa" />
      </div>

      {settings['security.requireMfa'] === 'true' && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Any local user without 2FA will be prompted to enrol next time they log in.
            Admins are included — make sure you have an authenticator app ready before saving.
          </span>
        </div>
      )}

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

// ─── Certificate file upload ──────────────────────────────────────────────────

function CertFileUpload({ onCert }: { onCert: (body: string) => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [err, setErr]           = useState<string | null>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = (reader.result as string).trim();
      // Strip PEM headers/footers and any whitespace between base64 chunks
      const body = text
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g,   '')
        .replace(/\s+/g, '');
      if (!body) { setErr('Could not read certificate from file'); return; }
      setFileName(file.name);
      onCert(body);
    };
    reader.onerror = () => setErr('Failed to read file');
    reader.readAsText(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <div className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Upload certificate file</div>
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg cursor-pointer hover:border-brand-400 dark:hover:border-brand-500 transition-colors group"
      >
        <Upload size={16} className="text-gray-400 group-hover:text-brand-500 flex-shrink-0 transition-colors" />
        <div className="flex-1 min-w-0">
          {fileName
            ? <span className="text-xs text-green-600 dark:text-green-400 font-medium truncate block">{fileName} — loaded</span>
            : <span className="text-xs text-gray-400 dark:text-slate-500">Click or drag a <code>.cer</code>, <code>.crt</code> or <code>.pem</code> file here</span>
          }
        </div>
        {fileName && (
          <button type="button" onClick={e => { e.stopPropagation(); setFileName(null); onCert(''); }}
            className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0">
            Clear
          </button>
        )}
      </div>
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
      <input ref={inputRef} type="file" className="hidden"
        accept=".cer,.crt,.pem,.cert,application/x-x509-ca-cert,application/pkix-cert,application/pem-certificate-chain" onChange={handleChange} />
    </div>
  );
}

function SsoTab({ settings, onChange, isAdmin }: {
  settings: AppSettings; onChange: (s: AppSettings) => void; isAdmin: boolean;
}) {
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [certInput,   setCertInput]   = useState('');
  const [refreshing,  setRefreshing]  = useState(false);
  const [refreshMsg,  setRefreshMsg]  = useState<{ ok: boolean; text: string } | null>(null);
  const [certInfo,    setCertInfo]    = useState<{
    configured: boolean; certsCount?: number; thumbprints?: string[];
    metadataUrl: boolean; lastRefreshed: string | null;
  } | null>(null);
  const [certInfoLoading, setCertInfoLoading] = useState(false);

  const enabled = settings['sso.enabled'] === 'true';
  const set = (k: keyof AppSettings, v: string) => onChange({ ...settings, [k]: v });

  // Load cert fingerprint whenever this tab is shown
  useEffect(() => {
    setCertInfoLoading(true);
    ssoApi.certInfo()
      .then(setCertInfo)
      .catch(() => setCertInfo(null))
      .finally(() => setCertInfoLoading(false));
  }, []);

  const doMetadataRefresh = async (currentSettings: AppSettings) => {
    setRefreshing(true); setRefreshMsg(null);
    // Save first so the metadata URL is in the DB before we fetch
    try { await settingsApi.update(currentSettings); } catch { /* best effort */ }
    const r = await ssoApi.refreshMetadata();
    const epochMs = String(new Date(r.refreshedAt).getTime());
    setRefreshMsg({ ok: true, text: `Refreshed ${r.certsFound} cert${r.certsFound !== 1 ? 's' : ''} at ${new Date(r.refreshedAt).toLocaleString('en-GB')}` });
    // Store epoch ms so ensureFreshCert can parse it correctly
    onChange({ ...currentSettings, 'sso.certLastRefreshed': epochMs });
    ssoApi.certInfo().then(setCertInfo).catch(() => {});
    return r;
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null); setRefreshMsg(null);
    try {
      const patch: AppSettings = { ...settings };
      if (certInput.trim()) patch['sso.idpCert'] = certInput.trim();

      // If a metadata URL is set but no cert is cached yet, fetch it now as
      // part of saving — prevents the "saved settings but cert never stored" problem
      const needsAutoFetch = metadataUrl && !certConfigured && !certInput.trim();
      if (needsAutoFetch) {
        try {
          await doMetadataRefresh(patch);
          // doMetadataRefresh already saved; just clear certInput and mark saved
          setCertInput('');
          setSaved(true); setTimeout(() => setSaved(false), 3000);
          return;
        } catch (e) {
          // Refresh failed — still save the other settings, show a warning
          setRefreshMsg({ ok: false, text: `Settings saved but certificate fetch failed: ${e instanceof Error ? e.message : String(e)}` });
        }
      }

      await settingsApi.update(patch);
      setCertInput('');
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); setRefreshing(false); }
  };

  const handleRefreshMetadata = async () => {
    try {
      await doMetadataRefresh(settings);
    } catch (e) {
      setRefreshMsg({ ok: false, text: e instanceof Error ? e.message : 'Refresh failed' });
    } finally { setRefreshing(false); }
  };

  const appUrl      = (settings['sso.appUrl'] ?? '').trim();
  const callbackUrl = appUrl ? `${appUrl}/api/auth/saml/callback` : '<your-app-url>/api/auth/saml/callback';
  const metadataUrl = (settings['sso.metadataUrl'] ?? '').trim();
  const lastRefreshed = settings['sso.certLastRefreshed'];
  const certConfigured = settings['sso.idpCert.configured'] === 'true';

  return (
    <div className="space-y-6">
      <SectionHeader icon={Globe} title="Single Sign-On (SAML)" subtitle="Connect Microsoft Entra ID (Azure AD) or any SAML 2.0 identity provider" adminOnly={!isAdmin} />

      {/* ── Entra ID setup guide ─────────────────────────────────────────── */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 text-xs text-blue-800 dark:text-blue-300 space-y-3">
        <div className="font-semibold text-sm">Setting up with Microsoft Entra ID</div>
        <div>
          <div className="font-semibold mb-1">Step 1 — Create an Enterprise Application</div>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Open <strong>Microsoft Entra ID</strong> (portal.azure.com → Entra ID)</li>
            <li>Go to <strong>Enterprise Applications → New application → Create your own application</strong></li>
            <li>Name it (e.g. <em>MSP SalesPro</em>), choose <strong>"Non-gallery"</strong> and click Create</li>
          </ol>
        </div>
        <div>
          <div className="font-semibold mb-1">Step 2 — Configure SAML</div>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Open the app → <strong>Single sign-on → SAML → Edit Basic SAML Configuration</strong></li>
            <li>Set <strong>Identifier (Entity ID)</strong> to your App URL and <strong>Reply URL (ACS URL)</strong> to <code className="bg-blue-100 dark:bg-blue-900 px-0.5 rounded">{callbackUrl}</code></li>
            <li>Under <strong>Attributes &amp; Claims</strong> set the Name ID to <code className="bg-blue-100 dark:bg-blue-900 px-0.5 rounded">user.mail</code></li>
          </ol>
        </div>
        <div>
          <div className="font-semibold mb-1">Step 3 — Copy values below</div>
          <ul className="list-disc ml-4 space-y-0.5">
            <li><strong>IdP Entry Point</strong> → "Login URL" from the <em>Set up</em> section</li>
            <li><strong>SP Issuer</strong> → same as your Identifier (Entity ID)</li>
            <li><strong>Metadata URL</strong> → copy the <em>App Federation Metadata Url</em> from SAML Certificates — certificate rotation is then automatic</li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-1">Step 4 — Assign users</div>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Go to the application → <strong>Users and groups → Add user/group</strong></li>
            <li>Assigned users will be able to sign in; new users are auto-created via SAML JIT or SCIM provisioning</li>
          </ol>
        </div>
      </div>

      {/* ── Enable toggle ─────────────────────────────────────────────────── */}
      <div className={clsx('flex items-center justify-between p-4 rounded-xl border-2 transition-colors',
        enabled ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
                : 'border-gray-200 bg-gray-50 dark:border-slate-600 dark:bg-slate-700')}>
        <div>
          <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Enable SSO</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Shows "Sign in with SSO" on the login page. Configure all fields below before enabling.</div>
        </div>
        <button type="button" disabled={!isAdmin} onClick={() => set('sso.enabled', enabled ? 'false' : 'true')}
          className={clsx('relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
            enabled ? 'bg-green-500' : 'bg-gray-300', !isAdmin && 'opacity-50 cursor-not-allowed')}>
          <span className={clsx('pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition duration-200 ease-in-out', enabled ? 'translate-x-5' : 'translate-x-0')} />
        </button>
      </div>

      {/* ── Standard fields ──────────────────────────────────────────────── */}
      <FieldRow label="App URL">
        <TextInput value={(settings['sso.appUrl'] ?? '') as string}
          onChange={v => set('sso.appUrl', v)} placeholder="https://your-app.azurestaticapps.net" readOnly={!isAdmin} />
        <p className="text-xs text-gray-400 mt-1">The public root URL of this application. Used as the SAML Entity ID and to derive the callback URL.</p>
      </FieldRow>

      <FieldRow label="Callback URL (ACS URL)">
        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 text-xs text-gray-600 dark:text-slate-300 font-mono break-all select-all border border-gray-200 dark:border-slate-600">
          {callbackUrl}
        </div>
        <p className="text-xs text-gray-400 mt-1">Enter this as the <strong>Reply URL (Assertion Consumer Service URL)</strong> in Entra ID.</p>
      </FieldRow>

      <FieldRow label="IdP Entry Point (Login URL)">
        <TextInput value={(settings['sso.entryPoint'] ?? '') as string}
          onChange={v => set('sso.entryPoint', v)} placeholder="https://login.microsoftonline.com/{tenant-id}/saml2" readOnly={!isAdmin} />
        <p className="text-xs text-gray-400 mt-1">Found in Entra ID → <em>Set up {'{app name}'}</em> → <strong>Login URL</strong>.</p>
      </FieldRow>

      <FieldRow label="SP Issuer / Entity ID">
        <TextInput value={(settings['sso.issuer'] ?? '') as string}
          onChange={v => set('sso.issuer', v)} placeholder="https://your-app.azurestaticapps.net" readOnly={!isAdmin} />
        <p className="text-xs text-gray-400 mt-1">Must exactly match the <strong>Identifier (Entity ID)</strong> set in Entra ID — usually the same as App URL.</p>
      </FieldRow>

      <FieldRow label="SSO Logout URL (optional)">
        <TextInput value={(settings['sso.logoutUrl'] ?? '') as string}
          onChange={v => set('sso.logoutUrl', v)}
          placeholder="https://login.microsoftonline.com/{tenant-id}/saml2"
          readOnly={!isAdmin} />
        <p className="text-xs text-gray-400 mt-1">
          Found in Entra ID → <em>Set up {'{app name}'}</em> → <strong>Logout URL</strong>.
          When set, SSO users are redirected here after logging out so their Microsoft session is also cleared.
        </p>
      </FieldRow>

      {/* ── Metadata URL — auto certificate ──────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <FieldRow label="App Federation Metadata URL (recommended)">
              <TextInput value={metadataUrl}
                onChange={v => set('sso.metadataUrl', v)}
                placeholder="https://login.microsoftonline.com/{tenant-id}/federationmetadata/2007-06/federationmetadata.xml"
                readOnly={!isAdmin} />
            </FieldRow>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Found in Entra ID → your app → <strong>Single sign-on → SAML Certificates → App Federation Metadata Url</strong>.
          When set, certificates are fetched automatically and refreshed daily — no manual certificate management needed.
        </p>

        {/* Status + refresh button */}
        {metadataUrl && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-700/40 border border-gray-200 dark:border-slate-600">
            <div className="flex items-center gap-2 text-xs">
              {certConfigured
                ? <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
                : <AlertCircle size={13} className="text-amber-500 flex-shrink-0" />}
              <span className="text-gray-600 dark:text-slate-300">
                {certConfigured
                  ? lastRefreshed
                    ? `Certificate cached — last refreshed ${new Date(lastRefreshed).toLocaleString('en-GB')}`
                    : 'Certificate configured'
                  : 'No certificate cached yet — click Refresh to fetch'}
              </span>
            </div>
            {isAdmin && (
              <button type="button" onClick={handleRefreshMetadata} disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 border border-brand-300 dark:border-brand-700 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors disabled:opacity-50 whitespace-nowrap">
                {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Refresh now
              </button>
            )}
          </div>
        )}

        {refreshMsg && (
          <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg text-xs border',
            refreshMsg.ok
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400')}>
            {refreshMsg.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
            {refreshMsg.text}
          </div>
        )}
      </div>

      {/* ── Certificate fingerprint ──────────────────────────────────────── */}
      {isAdmin && (
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Certificate fingerprint (SHA-1)</span>
            {certInfoLoading && <Loader2 size={12} className="animate-spin text-gray-400" />}
          </div>
          <div className="px-4 py-3 space-y-2">
            {!certInfo || !certInfo.configured ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertCircle size={13} />
                {certInfoLoading ? 'Loading…' : 'No certificate configured — SSO logins will fail.'}
              </p>
            ) : (
              <>
                {certInfo.thumbprints?.map((tp, i) => (
                  <code key={i} className="block text-xs font-mono bg-gray-100 dark:bg-slate-800 px-3 py-2 rounded-lg text-gray-700 dark:text-slate-300 break-all select-all">
                    {tp}
                  </code>
                ))}
                {(certInfo.certsCount ?? 0) > 1 && (
                  <p className="text-xs text-gray-400">{certInfo.certsCount} certificates loaded (key rotation supported)</p>
                )}
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Verify this matches the thumbprint shown in{' '}
                  <strong>Entra ID → your app → Single sign-on → SAML Certificates → Thumbprint</strong>.
                  A mismatch causes <em>"Invalid document signature"</em> errors.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Manual certificate override ───────────────────────────────────── */}
      {isAdmin && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 select-none list-none flex items-center gap-1.5">
            <ChevronRight size={13} className="transition-transform group-open:rotate-90" />
            Manual certificate override
            {!metadataUrl && !certConfigured && (
              <span className="ml-1 text-amber-500">(required if no Metadata URL)</span>
            )}
          </summary>
          <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-100 dark:border-slate-700">
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Only needed if you prefer not to use the Metadata URL above. Upload a <code>.cer</code> / <code>.crt</code> / <code>.pem</code> file, or paste the Base64 certificate body directly.
            </p>

            {/* File upload */}
            <CertFileUpload onCert={setCertInput} />

            {/* Paste fallback */}
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Or paste the certificate body</div>
              <textarea rows={4} value={certInput} onChange={e => setCertInput(e.target.value)}
                placeholder={'Base64 body only — no -----BEGIN/END CERTIFICATE----- lines.\nLeave blank to keep the existing certificate.'}
                className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>

            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Lock size={10} /> Stored server-side only — never returned to the browser.
            </p>
          </div>
        </details>
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

// ─── CRM tab ──────────────────────────────────────────────────────────────────

function CrmTab({ settings, onChange, isAdmin }: {
  settings: AppSettings; onChange: (s: AppSettings) => void; isAdmin: boolean;
}) {
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState('');
  const [testing,     setTesting]     = useState(false);
  const [testResult,  setTestResult]  = useState<{ success: boolean; message: string; zoneUrl?: string; detectedZone?: string; username?: string; integrationCodeHint?: string } | null>(null);
  const [detecting,   setDetecting]   = useState(false);

  // Ticket export picklists (queue, priority, status, type)
  const [picklists,       setPicklists]       = useState<{
    queues: AtPicklistValue[]; priorities: AtPicklistValue[];
    statuses: AtPicklistValue[]; ticketTypes: AtPicklistValue[];
  } | null>(null);
  const [picklistLoading, setPicklistLoading] = useState(false);
  const [picklistError,   setPicklistError]   = useState<string | null>(null);

  // Ticket panel queue picker (separate load, all queues for checkbox selection)
  const [panelQueues,        setPanelQueues]        = useState<AtPicklistValue[]>([]);
  const [panelQueuesLoading, setPanelQueuesLoading] = useState(false);
  const [panelQueuesError,   setPanelQueuesError]   = useState<string | null>(null);

  // Opportunity auto-create — stage picklist
  const [oppStages,        setOppStages]        = useState<AtPicklistValue[] | null>(null);
  const [oppStagesLoading, setOppStagesLoading] = useState(false);
  const [oppStagesError,   setOppStagesError]   = useState<string | null>(null);

  const set = (k: keyof AppSettings, v: string) => onChange({ ...settings, [k]: v });

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null); setTestResult(null);
    try {
      const patch: AppSettings = { ...settings };
      if (secretInput.trim()) patch['crm.autotask.secret'] = secretInput.trim();
      await settingsApi.update(patch);
      setSecretInput('');
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDetectZone = async () => {
    const username = (settings['crm.autotask.username'] ?? '').trim();
    if (!username) { setError('Enter your Autotask username (email) first.'); return; }
    setDetecting(true); setError(null);
    try {
      const { zoneUrl } = await crmApi.detectZone(username);
      onChange({ ...settings, 'crm.autotask.zoneUrl': zoneUrl });
    } catch (e) { setError(e instanceof Error ? e.message : 'Zone detection failed'); }
    finally { setDetecting(false); }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try { setTestResult(await crmApi.testConnection()); }
    catch (e) { setTestResult({ success: false, message: e instanceof Error ? e.message : 'Test failed' }); }
    finally { setTesting(false); }
  };

  const loadPicklists = async () => {
    setPicklistLoading(true); setPicklistError(null);
    try {
      // Single batch request — fetches all four fields in one Autotask API call
      // instead of four concurrent calls that would hit the 3-thread rate limit.
      const batch = await crmApi.getPicklistsBatch('Tickets', ['queueID', 'priority', 'status', 'ticketType']);
      setPicklists({
        queues:      (batch['queueID']     ?? []).filter(v => v.isActive),
        priorities:  (batch['priority']    ?? []).filter(v => v.isActive),
        statuses:    (batch['status']      ?? []).filter(v => v.isActive),
        ticketTypes: (batch['ticketType']  ?? []).filter(v => v.isActive),
      });
    } catch (e) {
      setPicklistError(e instanceof Error ? e.message : 'Failed to load Autotask picklists');
    } finally {
      setPicklistLoading(false);
    }
  };

  const loadPanelQueues = async () => {
    setPanelQueuesLoading(true); setPanelQueuesError(null);
    try {
      const queues = await crmApi.getPicklist('Tickets', 'queueID');
      setPanelQueues(queues.filter(v => v.isActive));
    } catch (e) {
      setPanelQueuesError(e instanceof Error ? e.message : 'Failed to load queues from Autotask');
    } finally {
      setPanelQueuesLoading(false);
    }
  };

  const loadOppStages = async () => {
    setOppStagesLoading(true); setOppStagesError(null);
    try {
      const stages = await crmApi.getOpportunityStages();
      setOppStages(stages);
    } catch (e) {
      setOppStagesError(e instanceof Error ? e.message : 'Failed to load stages from Autotask');
    } finally {
      setOppStagesLoading(false);
    }
  };

  // Auto-load stages when the opportunity section is enabled and CRM is configured,
  // so the dropdown always shows the saved label rather than "Select a stage".
  useEffect(() => {
    if (
      settings['crm.autotask.opportunity.enabled'] === 'true' &&
      !oppStages && !oppStagesLoading &&
      (settings['crm.autotask.zoneUrl'] || settings['crm.autotask.secret.configured'] === 'true')
    ) {
      loadOppStages();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings['crm.autotask.opportunity.enabled']]);

  // Toggle a queue in the comma-separated crm.tickets.queueIds setting
  const togglePanelQueue = (queueId: number) => {
    const current = (settings['crm.tickets.queueIds'] ?? '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const idStr = String(queueId);
    const next = current.includes(idStr)
      ? current.filter(x => x !== idStr)
      : [...current, idStr];
    set('crm.tickets.queueIds', next.join(','));
  };

  const selectedPanelQueueIds = new Set(
    (settings['crm.tickets.queueIds'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  );

  const secretConfigured = settings['crm.autotask.secret.configured'] === 'true';

  return (
    <div className="space-y-6">
      <SectionHeader icon={Building2} title="CRM — Autotask"
        subtitle="Pull company and contact data directly from Autotask when creating proposals"
        adminOnly={!isAdmin} />

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 text-xs text-blue-800 dark:text-blue-300 space-y-1.5">
        <div className="font-semibold">Setup — Autotask API credentials</div>
        <ol className="list-decimal ml-4 space-y-0.5">
          <li>In Autotask, go to <strong>Admin → Resources / Users (HR) → API Users → New API User</strong></li>
          <li>Set a username (email format) and generate a secret. Note the <strong>Integration Code</strong> shown after creation.</li>
          <li>Give the API user the minimum security level required to read <strong>Companies</strong> and <strong>Contacts</strong>.</li>
          <li>Enter the username below and click <strong>Detect Zone</strong> — this auto-fills the API URL for your Autotask instance.</li>
        </ol>
      </div>

      <FieldRow label="Autotask Username (API user email)">
        <TextInput value={(settings['crm.autotask.username'] ?? '') as string}
          onChange={v => set('crm.autotask.username', v)}
          placeholder="api.user@yourcompany.com" readOnly={!isAdmin} />
      </FieldRow>

      <FieldRow label="API Zone URL">
        <div className="flex gap-2">
          <TextInput value={(settings['crm.autotask.zoneUrl'] ?? '') as string}
            onChange={v => set('crm.autotask.zoneUrl', v)}
            placeholder="https://webservices16.autotask.net" readOnly={!isAdmin} />
          {isAdmin && (
            <button type="button" onClick={handleDetectZone} disabled={detecting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-600 dark:text-brand-400 border border-brand-300 dark:border-brand-700 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors disabled:opacity-50 whitespace-nowrap">
              {detecting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Detect Zone
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">Your Autotask data centre URL. Click Detect Zone to auto-fill from your username.</p>
      </FieldRow>

      <FieldRow label="API Integration Code">
        <TextInput value={(settings['crm.autotask.integrationCode'] ?? '') as string}
          onChange={v => set('crm.autotask.integrationCode', v)}
          placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" readOnly={!isAdmin} />
        <p className="text-xs text-gray-400 mt-1">Shown when creating the API user in Autotask Admin.</p>
      </FieldRow>

      {isAdmin && (
        <FieldRow label="API Secret">
          <SecretInput value={secretInput} onChange={setSecretInput}
            placeholder={secretConfigured ? '••••••••  (configured — leave blank to keep)' : 'Paste API user secret'} />
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Lock size={10} /> Stored server-side only — never returned to the browser.</p>
        </FieldRow>
      )}

      {testResult && (
        <div className={clsx('px-3 py-2 rounded-lg text-sm border',
          testResult.success
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400')}>
          <div className="flex items-start gap-2">
            {testResult.success ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
          {(testResult.zoneUrl || testResult.username) && (
            <div className="mt-1.5 ml-5 text-xs opacity-70 space-y-0.5">
              {testResult.username          && <div>API User: <span className="font-mono">{testResult.username}</span></div>}
              {testResult.zoneUrl           && <div>Zone URL (stored): <span className="font-mono">{testResult.zoneUrl}</span></div>}
              {testResult.detectedZone      && <div>Zone URL (detected): <span className="font-mono">{testResult.detectedZone}</span></div>}
              {testResult.integrationCodeHint && <div>Integration Code: <span className="font-mono">{testResult.integrationCodeHint}</span></div>}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="flex items-center gap-3 pt-2">
          <button type="button" onClick={handleTest} disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 border border-brand-300 dark:border-brand-700 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50 transition-colors">
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Building2 size={13} />}
            Test Connection
          </button>
        </div>
      )}

      {/* ── Ticket Export Configuration ───────────────────────────── */}
      <div className="border-t border-gray-200 dark:border-slate-700 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-brand-600 dark:text-brand-400" />
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Ticket Export Configuration</div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Fields used when creating a Post Sale ticket from a Won proposal
              </div>
            </div>
          </div>
          {isAdmin && (
            <button type="button" onClick={loadPicklists} disabled={picklistLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 border border-brand-300 dark:border-brand-700 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50 transition-colors">
              {picklistLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {picklists ? 'Refresh' : 'Load options from Autotask'}
            </button>
          )}
        </div>

        {picklistError && (
          <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={13} className="shrink-0" />
            {picklistError}
          </div>
        )}

        {!picklists && !picklistLoading && (
          <p className="text-xs text-gray-400 dark:text-slate-500 italic">
            Click "Load options from Autotask" to populate the dropdowns with live values from your tenant.
            Without this step the ticket will use defaults (status: New, priority: Medium, first matching "Post Sale" queue).
          </p>
        )}

        {picklists && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Queue */}
            <FieldRow label="Queue">
              <select
                value={settings['crm.autotask.ticket.queueId'] ?? ''}
                onChange={e => set('crm.autotask.ticket.queueId', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
              >
                <option value="">— Auto-detect "Post Sale" queue —</option>
                {picklists.queues.map(v => (
                  <option key={v.value} value={String(v.value)}>{v.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">The Autotask queue to assign new tickets to.</p>
            </FieldRow>

            {/* Priority */}
            <FieldRow label="Priority">
              <select
                value={settings['crm.autotask.ticket.priorityId'] ?? ''}
                onChange={e => set('crm.autotask.ticket.priorityId', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
              >
                <option value="">— Default (Medium) —</option>
                {picklists.priorities.map(v => (
                  <option key={v.value} value={String(v.value)}>{v.label}</option>
                ))}
              </select>
            </FieldRow>

            {/* Status */}
            <FieldRow label="Initial Status">
              <select
                value={settings['crm.autotask.ticket.statusId'] ?? ''}
                onChange={e => set('crm.autotask.ticket.statusId', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
              >
                <option value="">— Default (New) —</option>
                {picklists.statuses.map(v => (
                  <option key={v.value} value={String(v.value)}>{v.label}</option>
                ))}
              </select>
            </FieldRow>

            {/* Ticket Type */}
            <FieldRow label="Ticket Type">
              <select
                value={settings['crm.autotask.ticket.ticketTypeId'] ?? ''}
                onChange={e => set('crm.autotask.ticket.ticketTypeId', e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
              >
                <option value="">— Not specified —</option>
                {picklists.ticketTypes.map(v => (
                  <option key={v.value} value={String(v.value)}>{v.label}</option>
                ))}
              </select>
            </FieldRow>
          </div>
        )}
      </div>

      {/* ── Ticket Panel Configuration ────────────────────────────────── */}
      <div className="border-t border-gray-200 dark:border-slate-700 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-brand-600 dark:text-brand-400" />
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Ticket Panel — Proposal Summary</div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Controls which queues and date range appear in the open-tickets panel on each proposal
              </div>
            </div>
          </div>
          {isAdmin && (
            <button type="button" onClick={loadPanelQueues} disabled={panelQueuesLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 border border-brand-300 dark:border-brand-700 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50 transition-colors">
              {panelQueuesLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {panelQueues.length > 0 ? 'Refresh queues' : 'Load queues from Autotask'}
            </button>
          )}
        </div>

        {panelQueuesError && (
          <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={13} className="shrink-0" /> {panelQueuesError}
          </div>
        )}

        {/* Days back */}
        <FieldRow label="Lookback period (days)">
          <div className="flex items-center gap-2 max-w-xs">
            <input
              type="number" min={1} max={365}
              value={settings['crm.tickets.daysBack'] ?? '90'}
              onChange={e => set('crm.tickets.daysBack', e.target.value)}
              disabled={!isAdmin}
              className="w-24 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
            />
            <span className="text-sm text-gray-500 dark:text-slate-400">days back from today</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Only tickets created within this window will appear. Default: 90.</p>
        </FieldRow>

        {/* Queue checkboxes */}
        <div className="mt-4">
          <div className="text-xs font-medium text-gray-600 dark:text-slate-400 mb-2">
            Queues to show
            {selectedPanelQueueIds.size > 0 && (
              <span className="ml-2 text-brand-600 dark:text-brand-400">{selectedPanelQueueIds.size} selected</span>
            )}
          </div>

          {panelQueues.length === 0 && !panelQueuesLoading && (
            <p className="text-xs text-gray-400 dark:text-slate-500 italic">
              Click "Load queues from Autotask" to see available queues.
              {selectedPanelQueueIds.size > 0 && ` (${selectedPanelQueueIds.size} queue IDs currently saved)`}
              {selectedPanelQueueIds.size === 0 && ' Without a selection the panel defaults to Account Management, Pre-Sales, and Post-Sale queues.'}
            </p>
          )}

          {panelQueues.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
              {panelQueues.map(q => {
                const checked = selectedPanelQueueIds.has(String(q.value));
                return (
                  <label
                    key={q.value}
                    className={clsx(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors',
                      checked
                        ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 text-brand-800 dark:text-brand-200'
                        : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-brand-300',
                      !isAdmin && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => isAdmin && togglePanelQueue(q.value)}
                      disabled={!isAdmin}
                      className="rounded accent-brand-600"
                    />
                    <span className="truncate">{q.label}</span>
                  </label>
                );
              })}
            </div>
          )}

          {selectedPanelQueueIds.size > 0 && isAdmin && (
            <button
              type="button"
              onClick={() => set('crm.tickets.queueIds', '')}
              className="mt-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Clear selection (revert to defaults)
            </button>
          )}
        </div>
      </div>

      {/* ── Opportunity Auto-Create ───────────────────────────────────── */}
      <div className="border-t border-gray-200 dark:border-slate-700 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-brand-600 dark:text-brand-400" />
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Opportunity Auto-Create</div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Automatically create an Autotask opportunity when a new proposal is saved with a linked CRM company
              </div>
            </div>
          </div>
          {/* Enable toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => isAdmin && set('crm.autotask.opportunity.enabled',
                settings['crm.autotask.opportunity.enabled'] === 'true' ? 'false' : 'true')}
              className={clsx(
                'w-10 h-5 rounded-full transition-colors relative cursor-pointer',
                settings['crm.autotask.opportunity.enabled'] === 'true'
                  ? 'bg-brand-600' : 'bg-gray-300 dark:bg-slate-600',
                !isAdmin && 'cursor-not-allowed opacity-60',
              )}
            >
              <div className={clsx(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                settings['crm.autotask.opportunity.enabled'] === 'true' ? 'translate-x-5' : 'translate-x-0.5',
              )} />
            </div>
            <span className="text-sm text-gray-700 dark:text-slate-300">
              {settings['crm.autotask.opportunity.enabled'] === 'true' ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {settings['crm.autotask.opportunity.enabled'] === 'true' && (
          <div className="space-y-5">
            {/* Stage loader */}
            <div className="flex items-center gap-3">
              <button type="button" onClick={loadOppStages} disabled={oppStagesLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 border border-brand-300 dark:border-brand-700 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50 transition-colors">
                {oppStagesLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {oppStages ? 'Refresh stages' : 'Load stages from Autotask'}
              </button>
              {oppStagesError && <span className="text-xs text-red-500">{oppStagesError}</span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Stage */}
              <FieldRow label="Opportunity Stage *">
                <select
                  value={settings['crm.autotask.opportunity.stageId'] ?? ''}
                  onChange={e => set('crm.autotask.opportunity.stageId', e.target.value)}
                  disabled={!isAdmin || oppStagesLoading}
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
                >
                  <option value="">— Select a stage (required) —</option>
                  {/* If stages haven't loaded yet but a value IS saved, show it as a placeholder option */}
                  {!oppStages && settings['crm.autotask.opportunity.stageId'] && (
                    <option value={settings['crm.autotask.opportunity.stageId']}>
                      Stage ID: {settings['crm.autotask.opportunity.stageId']} (loading label…)
                    </option>
                  )}
                  {(oppStages ?? []).map(v => (
                    <option key={v.value} value={String(v.value)}>{v.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {oppStagesLoading
                    ? 'Loading stages…'
                    : oppStages
                      ? `${oppStages.length} stages loaded`
                      : 'Stages load automatically when feature is enabled.'}
                </p>
              </FieldRow>

              {/* Probability */}
              <FieldRow label="Default Probability (%)">
                <input
                  type="number" min={0} max={100}
                  value={settings['crm.autotask.opportunity.probability'] ?? '50'}
                  onChange={e => set('crm.autotask.opportunity.probability', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
                />
                <p className="text-xs text-gray-400 mt-1">Win probability 0–100. Default: 50.</p>
              </FieldRow>

              {/* Close date offset */}
              <FieldRow label="Expected Close (days from today)">
                <input
                  type="number" min={1} max={730}
                  value={settings['crm.autotask.opportunity.closeDateDays'] ?? '30'}
                  onChange={e => set('crm.autotask.opportunity.closeDateDays', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
                />
                <p className="text-xs text-gray-400 mt-1">Sets the close date relative to today. Default: 30.</p>
              </FieldRow>

              {/* Title template */}
              <FieldRow label="Opportunity Title Template">
                <input
                  type="text"
                  value={settings['crm.autotask.opportunity.titleTemplate'] ?? '{projectName}'}
                  onChange={e => set('crm.autotask.opportunity.titleTemplate', e.target.value)}
                  disabled={!isAdmin}
                  placeholder="{projectName}"
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Supports <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">{'{'}</code>projectName{'}'},{' '}
                  <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">{'{'}</code>client{'}'},{' '}
                  <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">{'{'}</code>accountManager{'}'},{' '}
                  <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">{'{'}</code>reference{'}'}.
                </p>
              </FieldRow>

            </div>

            {/* Readiness checklist */}
            <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-3 space-y-1.5 text-xs">
              <p className="font-semibold text-gray-600 dark:text-slate-400 mb-2">Required for auto-create to work:</p>
              {[
                {
                  ok: !!settings['crm.autotask.opportunity.stageId'],
                  label: settings['crm.autotask.opportunity.stageId']
                    ? `Stage configured (ID: ${settings['crm.autotask.opportunity.stageId']})`
                    : 'Select and save an Opportunity Stage above',
                },
                {
                  ok: true,
                  label: 'The account manager on the proposal must match an active Resource in Autotask (first + last name). The opportunity will be owned by them.',
                },
                {
                  ok: true,
                  label: 'When creating a proposal, pick the client from the Autotask company picker (not just typed). The proposal must have a linked CRM company.',
                },
              ].map(({ ok, label }, i) => (
                <div key={i} className={clsx('flex items-start gap-1.5', ok ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400')}>
                  {ok ? <CheckCircle size={12} className="mt-0.5 shrink-0" /> : <AlertCircle size={12} className="mt-0.5 shrink-0" />}
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isAdmin && <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />}
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
          <li>Name it anything (e.g. <em>MSP SalesPro Planner</em>). Leave account type as default.</li>
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

// ─── Provisioning tab ─────────────────────────────────────────────────────────

function ProvisioningTab({ settings, onChange, isAdmin }: {
  settings: AppSettings; onChange: (s: AppSettings) => void; isAdmin: boolean;
}) {
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied,     setCopied]     = useState(false);

  const scimConfigured = settings['scim.token.configured'] === 'true';
  const appUrl         = (settings['sso.appUrl'] ?? '').trim();
  const scimEndpoint   = appUrl ? `${appUrl}/api/scim/v2` : `${window.location.origin}/api/scim/v2`;

  const handleGenerateToken = async () => {
    if (!window.confirm(scimConfigured
      ? 'This will replace the existing SCIM token. Entra ID will need to be updated with the new token. Continue?'
      : 'Generate a new SCIM bearer token?')) return;
    setGenerating(true); setError(null);
    // Generate a random token client-side and save it
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    setTokenInput(token);
    setGenerating(false);
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      const patch: AppSettings = { ...settings };
      if (tokenInput.trim()) patch['scim.token'] = tokenInput.trim();
      await settingsApi.update(patch);
      setTokenInput('');
      setSaved(true); setTimeout(() => setSaved(false), 3000);
      onChange({ ...settings, 'scim.token.configured': 'true' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={UserCheck} title="SCIM Provisioning"
        subtitle="Automatic user provisioning via Microsoft Entra ID (Azure AD)"
        adminOnly={!isAdmin} />

      {/* Setup guide */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 text-xs text-blue-800 dark:text-blue-300 space-y-3">
        <div className="font-semibold text-sm">Setting up Entra ID automatic provisioning</div>

        <div>
          <div className="font-semibold mb-1">Step 1 — Open your Enterprise Application</div>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>In <strong>Microsoft Entra ID</strong>, go to <strong>Enterprise Applications</strong> and open the app you created for SAML SSO (or create a new one).</li>
            <li>Click <strong>Provisioning</strong> in the left menu, then click <strong>Get started</strong>.</li>
          </ol>
        </div>

        <div>
          <div className="font-semibold mb-1">Step 2 — Configure provisioning</div>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Set <strong>Provisioning Mode</strong> to <strong>Automatic</strong>.</li>
            <li>Under <strong>Admin Credentials</strong>, enter:
              <ul className="list-disc ml-4 mt-0.5 space-y-0.5">
                <li><strong>Tenant URL:</strong> <code className="bg-blue-100 dark:bg-blue-900 px-0.5 rounded">{scimEndpoint}</code></li>
                <li><strong>Secret Token:</strong> the token generated below</li>
              </ul>
            </li>
            <li>Click <strong>Test Connection</strong> to verify, then <strong>Save</strong>.</li>
          </ol>
        </div>

        <div>
          <div className="font-semibold mb-1">Step 3 — Assign users or groups</div>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Go to <strong>Users and groups → Add user/group</strong> and assign the users or groups to provision.</li>
            <li>Return to <strong>Provisioning</strong> and click <strong>Start provisioning</strong>. Entra will push users on the next cycle (up to 40 minutes for first sync).</li>
            <li>Provisioned users are automatically created with <strong>Standard User</strong> access. Administrators can promote them in <strong>User Management</strong>.</li>
          </ol>
        </div>
      </div>

      {/* SCIM endpoint URL */}
      <div>
        <div className="text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">SCIM Tenant URL</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 dark:text-slate-300 break-all select-all">
            {scimEndpoint}
          </div>
          <button onClick={() => handleCopy(scimEndpoint)}
            className="flex-shrink-0 p-2 rounded-lg border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 transition-colors">
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">Enter this as the <strong>Tenant URL</strong> in Entra ID Provisioning settings.</p>
      </div>

      {/* Token status */}
      <div className={clsx(
        'flex items-center justify-between p-4 rounded-xl border-2',
        scimConfigured
          ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
          : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/40'
      )}>
        <div className="flex items-center gap-2">
          <div className={clsx('w-2 h-2 rounded-full', scimConfigured ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-500')} />
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
            {scimConfigured ? 'Bearer token configured' : 'No token configured'}
          </span>
        </div>
        {isAdmin && (
          <Button variant="secondary" size="sm" onClick={handleGenerateToken} disabled={generating}>
            {generating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {scimConfigured ? 'Regenerate token' : 'Generate token'}
          </Button>
        )}
      </div>

      {/* Newly generated token — shown until saved */}
      {tokenInput && (
        <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">Copy this token before saving</div>
              <div className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                After saving, this token will no longer be shown in full. Copy it now and paste it into Entra ID Provisioning → Secret Token.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2">
            <code className="flex-1 text-xs font-mono text-gray-800 dark:text-slate-200 break-all select-all">{tokenInput}</code>
            <button onClick={() => handleCopy(tokenInput)}
              className="flex-shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400">
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      {isAdmin && <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />}
    </div>
  );
}

function ApiAccessTab({ isAdmin }: { isAdmin: boolean }) {
  const [keys, setKeys]             = useState<import('../lib/api').ApiKeyInfo[] | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  // New-key creation form
  const [creating, setCreating]     = useState(false);
  const [newLabel, setNewLabel]     = useState('');
  const [createdKey, setCreatedKey] = useState<{ id: string; label: string; key: string } | null>(null);
  const [copied, setCopied]         = useState(false);
  // Per-key revoke in-flight
  const [revoking, setRevoking]     = useState<string | null>(null);

  const apiBase = typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api';

  const loadKeys = () => {
    setLoading(true);
    apiKeysApi.list()
      .then(setKeys)
      .catch(() => setKeys([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadKeys(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    setLoading(true); setError(null);
    try {
      const r = await apiKeysApi.create(newLabel.trim());
      setCreatedKey({ id: r.id, label: r.label, key: r.key });
      setNewLabel(''); setCreating(false);
      loadKeys();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create key'); }
    finally { setLoading(false); }
  };

  const handleRevoke = async (id: string, label: string) => {
    if (!window.confirm(`Revoke key "${label}"? Any scripts using it will stop working.`)) return;
    setRevoking(id); setError(null);
    try {
      await apiKeysApi.revoke(id);
      if (createdKey?.id === id) setCreatedKey(null);
      loadKeys();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to revoke key'); }
    finally { setRevoking(null); }
  };

  const handleCopy = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey.key);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Plug} title="API Access"
        subtitle="Service API keys for automated scripts, integrations and the MCP server"
        adminOnly={!isAdmin} />

      {/* Keys table */}
      <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
          <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            Active keys {keys !== null && `(${keys.length})`}
          </span>
          {isAdmin && (
            <Button variant="secondary" size="sm" onClick={() => { setCreating(c => !c); setNewLabel(''); setError(null); }}>
              <Plus size={13} /> New key
            </Button>
          )}
        </div>

        {/* Inline create form */}
        {creating && (
          <div className="flex items-center gap-2 px-4 py-3 bg-brand-50 dark:bg-brand-900/20 border-b border-brand-200 dark:border-brand-800">
            <input
              autoFocus
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="Key label, e.g. Copilot MCP, Reporting Script…"
              className="flex-1 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <Button size="sm" onClick={handleCreate} disabled={loading || !newLabel.trim()}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Create
            </Button>
            <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 rounded">
              <X size={15} />
            </button>
          </div>
        )}

        {loading && keys === null ? (
          <div className="py-8 flex justify-center">
            <Loader2 size={18} className="animate-spin text-gray-400" />
          </div>
        ) : keys?.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400 dark:text-slate-500">
            No API keys configured. Create one to enable integrations.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700">
                <th className="text-left px-4 py-2 font-medium">Label</th>
                <th className="text-left px-4 py-2 font-medium">Created</th>
                <th className="text-left px-4 py-2 font-medium">Last used</th>
                {isAdmin && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {keys?.map(k => (
                <tr key={k.id} className="border-b last:border-0 border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-slate-100">{k.label}</span>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-slate-500 font-mono ml-3.5">id: {k.id}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{fmtDate(k.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{k.lastUsed ? fmtDate(k.lastUsed) : <span className="italic">Never</span>}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevoke(k.id, k.label)}
                        disabled={revoking === k.id}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-200 hover:border-red-400 dark:border-red-800 dark:hover:border-red-600 transition-colors disabled:opacity-50 ml-auto"
                      >
                        {revoking === k.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                        Revoke
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={14} />{error}
        </div>
      )}

      {/* Newly created key — shown once */}
      {createdKey && (
        <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Copy "{createdKey.label}" now
              </div>
              <div className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                This is the only time the key will be shown. Store it securely — treat it like a password.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2">
            <code className="flex-1 text-xs font-mono text-gray-800 dark:text-slate-200 break-all select-all">{createdKey.key}</code>
            <button onClick={handleCopy}
              className="shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400">
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
          <button onClick={() => setCreatedKey(null)} className="text-xs text-amber-700 dark:text-amber-400 underline">
            I've saved it — dismiss
          </button>
        </div>
      )}

      {/* Usage guide */}
      <div className="space-y-3 text-sm">
        <div className="font-semibold text-gray-700 dark:text-slate-300">How to use</div>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Pass any key as a Bearer token in the <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">Authorization</code> header.
          All keys grant full admin access — keep them secret and revoke immediately if compromised.
        </p>
        <div className="bg-gray-900 rounded-lg p-3 text-xs font-mono text-green-400 overflow-x-auto">
          <div className="text-gray-500 mb-1"># Example: list proposals</div>
          <div>curl {apiBase}/proposals \</div>
          <div className="pl-4">-H "Authorization: Bearer YOUR_KEY"</div>
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500">
          See <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">DEVELOPER.md</code> in the repository for the full API reference.
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
        <Row label="Application" value="MSP SalesPro" />
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

// ─── Backup & Restore tab ─────────────────────────────────────────────────────

function BackupTab({ isAdmin }: { isAdmin: boolean }) {
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/backup`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `msp-salespro-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Download failed' });
    } finally { setDownloading(false); }
  };

  const handleRestore = async (file: File) => {
    if (!confirm('Restoring will REPLACE ALL current data. Are you sure?')) return;
    setRestoring(true); setResult(null);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/backup/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify(backup),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error((data.error as string) ?? 'Restore failed');
      const restoredCounts = data.restored as Record<string, number> | undefined;
      const summary = restoredCounts
        ? Object.entries(restoredCounts).map(([t, n]) => `${t}: ${n}`).join(', ')
        : '';
      setResult({ ok: true, msg: `Restore complete. ${summary}` });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Restore failed' });
    } finally { setRestoring(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <SectionHeader icon={Database} title="Backup & Restore"
        subtitle="Export all data and configuration to a JSON file, or restore from a previous backup"
        adminOnly={!isAdmin} />

      {/* Download */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200">Download Backup</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Creates a full JSON export of all proposals, users, settings, catalog, rate cards, templates, and customer links.
          </p>
        </div>
        <Button onClick={handleDownload} disabled={downloading || !isAdmin} variant="secondary">
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {downloading ? 'Preparing backup…' : 'Download backup'}
        </Button>
      </div>

      {/* Restore */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-800 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200">Restore from Backup</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              <strong>Warning:</strong> This will replace all current data with the backup contents. This action cannot be undone.
            </p>
          </div>
        </div>
        <label className={clsx('flex items-center gap-2 cursor-pointer', (!isAdmin || restoring) && 'opacity-50 pointer-events-none')}>
          <input type="file" accept=".json" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleRestore(f); e.target.value = ''; }}
            disabled={!isAdmin || restoring} />
          <Button variant="secondary" disabled={!isAdmin || restoring} onClick={() => {}}>
            {restoring ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {restoring ? 'Restoring…' : 'Choose backup file'}
          </Button>
        </label>
      </div>

      {result && (
        <div className={clsx('flex items-start gap-2 px-4 py-3 rounded-lg border text-sm',
          result.ok ? 'bg-green-50 dark:bg-green-900/20 border-green-200 text-green-700 dark:text-green-300'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-600 dark:text-red-400')}>
          {result.ok ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
          {result.msg}
        </div>
      )}
    </div>
  );
}

// ─── Email tab ────────────────────────────────────────────────────────────────

function EmailTab({ settings, onChange, isAdmin }: { settings: AppSettings; onChange: (s: AppSettings) => void; isAdmin: boolean }) {
  const set = (k: keyof AppSettings, v: string) => onChange({ ...settings, [k]: v });
  const provider = (settings['email.provider'] ?? 'smtp') as 'smtp' | 'graph';
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      await settingsApi.update(settings);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setTestMsg(null);
    try {
      const r = await api.post<{ success: boolean; message: string }>('settings/test-email', {});
      setTestMsg({ ok: r.success, msg: r.message });
    } catch (e) { setTestMsg({ ok: false, msg: e instanceof Error ? e.message : 'Test failed' }); }
    finally { setTesting(false); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Mail} title="Email" subtitle="Send password resets and proposal notifications via SMTP or Microsoft 365" adminOnly={!isAdmin} />

      <div className="space-y-5">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-800 dark:text-slate-200">Enable email sending</div>
            <div className="text-xs text-gray-400 dark:text-slate-500">Send emails for password resets and proposal approvals</div>
          </div>
          <button
            type="button"
            onClick={() => set('email.enabled', settings['email.enabled'] === 'true' ? 'false' : 'true')}
            disabled={!isAdmin}
            className={clsx(
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
              settings['email.enabled'] === 'true' ? 'bg-brand-500' : 'bg-gray-300 dark:bg-slate-600',
              !isAdmin && 'opacity-50 cursor-not-allowed',
            )}
          >
            <span className={clsx(
              'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200',
              settings['email.enabled'] === 'true' ? 'translate-x-5' : 'translate-x-0',
            )} />
          </button>
        </div>

        {/* Provider selector */}
        <div>
          <div className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Email Provider</div>
          <div className="grid grid-cols-2 gap-3">
            {([
              {
                id: 'smtp' as const,
                label: 'SMTP',
                sublabel: 'Classic email server (any provider)',
                icon: '📧',
              },
              {
                id: 'graph' as const,
                label: 'Microsoft 365',
                sublabel: 'Modern auth via Azure app registration — sends as the logged-in user',
                icon: '☁️',
              },
            ]).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => isAdmin && set('email.provider', opt.id)}
                disabled={!isAdmin}
                className={clsx(
                  'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors',
                  provider === opt.id
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-gray-200 dark:border-slate-600 hover:border-brand-300',
                  !isAdmin && 'cursor-not-allowed opacity-60',
                )}
              >
                <span className="text-xl mt-0.5 select-none">{opt.icon}</span>
                <div>
                  <div className={clsx('text-sm font-semibold', provider === opt.id ? 'text-brand-700 dark:text-brand-300' : 'text-gray-800 dark:text-slate-200')}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 leading-snug">{opt.sublabel}</div>
                </div>
                {provider === opt.id && (
                  <Check size={14} className="ml-auto mt-0.5 text-brand-600 dark:text-brand-400 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── SMTP fields ─────────────────────────────────────────────────── */}
        {provider === 'smtp' && (
          <div className="grid grid-cols-2 gap-4 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
            <div className="col-span-2">
              <FieldRow label="SMTP Host">
                <TextInput value={settings['email.host'] ?? ''} onChange={v => set('email.host', v)} placeholder="smtp.office365.com" readOnly={!isAdmin} />
              </FieldRow>
            </div>
            <FieldRow label="Port">
              <TextInput value={settings['email.port'] ?? '587'} onChange={v => set('email.port', v)} placeholder="587" readOnly={!isAdmin} />
            </FieldRow>
            <div className="flex items-center gap-3 pt-5">
              <input
                type="checkbox"
                id="email-secure"
                checked={settings['email.secure'] === 'true'}
                onChange={e => set('email.secure', e.target.checked ? 'true' : 'false')}
                disabled={!isAdmin}
                className="rounded border-gray-300 text-brand-600"
              />
              <label htmlFor="email-secure" className="text-sm text-gray-700 dark:text-slate-300">Use TLS (port 465)</label>
            </div>
            <div className="col-span-2">
              <FieldRow label="From Address">
                <TextInput value={settings['email.from'] ?? ''} onChange={v => set('email.from', v)} placeholder='MSP SalesPro <noreply@example.com>' readOnly={!isAdmin} />
              </FieldRow>
            </div>
            <FieldRow label="Username">
              <TextInput value={settings['email.user'] ?? ''} onChange={v => set('email.user', v)} placeholder="smtp-user@example.com" readOnly={!isAdmin} />
            </FieldRow>
            <FieldRow label="Password">
              <SecretInput
                value={settings['email.password'] ?? ''}
                onChange={v => set('email.password', v)}
                placeholder={settings['email.password.configured'] === 'true' ? '••••••••' : 'Enter SMTP password'}
                readOnly={!isAdmin}
              />
            </FieldRow>
          </div>
        )}

        {/* ── Microsoft 365 / Graph fields ────────────────────────────────── */}
        {provider === 'graph' && (
          <div className="space-y-4 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
            {/* Setup guidance */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-300 space-y-1.5">
              <div className="font-semibold">Azure AD App Registration setup</div>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Go to <strong>Azure Portal → Azure Active Directory → App registrations → New registration</strong></li>
                <li>Create the app, then go to <strong>API permissions → Add → Microsoft Graph → Application permissions</strong></li>
                <li>Add <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Mail.Send</code> (Application) and <strong>Grant admin consent</strong></li>
                <li>Go to <strong>Certificates &amp; secrets → New client secret</strong>, copy the value below</li>
                <li>Copy the <strong>Tenant ID</strong> and <strong>Client (Application) ID</strong> from the Overview page</li>
              </ol>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <FieldRow label="Tenant ID">
                  <TextInput
                    value={settings['email.graph.tenantId'] ?? ''}
                    onChange={v => set('email.graph.tenantId', v)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    readOnly={!isAdmin}
                  />
                </FieldRow>
              </div>
              <div className="col-span-2">
                <FieldRow label="Client (Application) ID">
                  <TextInput
                    value={settings['email.graph.clientId'] ?? ''}
                    onChange={v => set('email.graph.clientId', v)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    readOnly={!isAdmin}
                  />
                </FieldRow>
              </div>
              <div className="col-span-2">
                <FieldRow label="Client Secret">
                  <SecretInput
                    value={settings['email.graph.clientSecret'] ?? ''}
                    onChange={v => set('email.graph.clientSecret', v)}
                    placeholder={settings['email.graph.clientSecret.configured'] === 'true' ? '••••••••' : 'Paste client secret value…'}
                    readOnly={!isAdmin}
                  />
                </FieldRow>
              </div>
              <div className="col-span-2">
                <FieldRow label="Default Sender">
                  <TextInput
                    value={settings['email.graph.defaultSender'] ?? ''}
                    onChange={v => set('email.graph.defaultSender', v)}
                    placeholder="noreply@yourcompany.com"
                    readOnly={!isAdmin}
                  />
                </FieldRow>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                  Used for system emails (password resets etc). User-triggered emails send from the logged-in user's mailbox.
                  This mailbox must exist in your M365 tenant and the app must have Mail.Send permission.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Test + Save */}
        {isAdmin && (
          <div className="flex items-center gap-3 pt-2">
            <Button variant="secondary" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Send test email
            </Button>
            {testMsg && (
              <span className={clsx('text-sm', testMsg.ok ? 'text-green-600' : 'text-red-600')}>
                {testMsg.ok ? <CheckCircle size={14} className="inline mr-1" /> : <AlertCircle size={14} className="inline mr-1" />}
                {testMsg.msg}
              </span>
            )}
          </div>
        )}
      </div>

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  );
}

// ─── Layout tab ───────────────────────────────────────────────────────────────

function ToggleSwitch({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={clsx(
        'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors',
        enabled ? 'bg-brand-500' : 'bg-gray-300 dark:bg-slate-600',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  );
}

function LayoutTab({ settings, onChange, isAdmin }: { settings: AppSettings; onChange: (s: AppSettings) => void; isAdmin: boolean }) {
  const [layout, setLayout] = useState<ProposalLayoutConfig>(() => parseLayout(settings['proposal.layout']));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const updateLayout = (next: ProposalLayoutConfig) => setLayout(next);

  const updateSection = (idx: number, patch: Partial<LayoutSection>) => {
    const sections = layout.sections.map((s, i) => i === idx ? { ...s, ...patch } : s);
    updateLayout({ ...layout, sections });
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const sections = [...layout.sections];
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    // Swap order values
    const a = { ...sections[idx], order: sections[target].order };
    const b = { ...sections[target], order: sections[idx].order };
    sections[idx] = a;
    sections[target] = b;
    updateLayout({ ...layout, sections: sections.sort((x, y) => x.order - y.order) });
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      const next = { ...settings, 'proposal.layout': JSON.stringify(layout) };
      await settingsApi.update(next);
      onChange(next);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const sections = [...layout.sections].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <SectionHeader icon={Layout} title="Proposal Layout" subtitle="Control sections, order and branding for customer proposals and PDF exports" adminOnly={!isAdmin} />

      {/* Section order + visibility */}
      <div>
        <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">Sections</div>
        <div className="space-y-2">
          {sections.map((section, idx) => (
            <div key={section.id}>
              <div className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors',
                section.enabled
                  ? 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800'
                  : 'border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 opacity-60',
              )}>
                <GripVertical size={14} className="text-gray-300 dark:text-slate-600 flex-shrink-0" />
                <ToggleSwitch
                  enabled={section.enabled}
                  onChange={v => updateSection(idx, { enabled: v })}
                  disabled={!isAdmin}
                />
                <span className="flex-1 text-sm font-medium text-gray-800 dark:text-slate-200">{section.label}</span>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveSection(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(idx, 1)}
                      disabled={idx === sections.length - 1}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ChevronDownIcon size={14} />
                    </button>
                  </div>
                )}
              </div>
              {/* Terms content editor */}
              {section.id === 'terms' && section.enabled && (
                <div className="mt-1.5 ml-8">
                  <textarea
                    rows={6}
                    value={section.content ?? ''}
                    onChange={e => updateSection(idx, { content: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="Enter your terms and conditions text here…"
                    className={clsx(
                      'w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y',
                      !isAdmin && 'bg-gray-50 dark:bg-slate-800 text-gray-400 cursor-default',
                    )}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Header config */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-700">
          <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Header</span>
        </div>
        <div className="px-4 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-800 dark:text-slate-200">Show organisation logo</div>
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Displays the branding logo in the proposal header</div>
            </div>
            <ToggleSwitch
              enabled={layout.header.showLogo}
              onChange={v => updateLayout({ ...layout, header: { ...layout.header, showLogo: v } })}
              disabled={!isAdmin}
            />
          </div>
          <FieldRow label="Company name override">
            <TextInput
              value={layout.header.companyName ?? ''}
              onChange={v => updateLayout({ ...layout, header: { ...layout.header, companyName: v || undefined } })}
              placeholder="Leave blank to use branding setting"
              readOnly={!isAdmin}
            />
          </FieldRow>
          <FieldRow label="Primary colour override">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={layout.header.primaryColor ?? '#2B3990'}
                onChange={e => updateLayout({ ...layout, header: { ...layout.header, primaryColor: e.target.value } })}
                disabled={!isAdmin}
                className="w-9 h-9 rounded border border-gray-300 dark:border-slate-600 cursor-pointer disabled:cursor-not-allowed p-0.5"
              />
              <input
                type="text"
                value={layout.header.primaryColor ?? ''}
                onChange={e => updateLayout({ ...layout, header: { ...layout.header, primaryColor: e.target.value || undefined } })}
                placeholder="Leave blank to use branding setting (e.g. #2B3990)"
                readOnly={!isAdmin}
                className={clsx(inputCls, 'flex-1')}
              />
            </div>
          </FieldRow>
          <FieldRow label="Tagline / subtitle">
            <TextInput
              value={layout.header.tagline ?? ''}
              onChange={v => updateLayout({ ...layout, header: { ...layout.header, tagline: v || undefined } })}
              placeholder="e.g. Confidential Proposal"
              readOnly={!isAdmin}
            />
          </FieldRow>
        </div>
      </div>

      {/* Footer config */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-700">
          <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Footer</span>
        </div>
        <div className="px-4 py-4 space-y-4">
          <FieldRow label="Footer text">
            <textarea
              rows={2}
              value={layout.footer.text ?? ''}
              onChange={e => updateLayout({ ...layout, footer: { ...layout.footer, text: e.target.value || undefined } })}
              disabled={!isAdmin}
              placeholder={`Leave blank for default (e.g. ${settings['branding.companyName'] ?? 'MSP SalesPro'} — Confidential)`}
              className={clsx(
                'w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none',
                !isAdmin && 'bg-gray-50 dark:bg-slate-800 text-gray-400 cursor-default',
              )}
            />
          </FieldRow>
          <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-slate-700">
            <div>
              <div className="text-sm font-medium text-gray-800 dark:text-slate-200">Show generation date</div>
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Adds the export date to the footer</div>
            </div>
            <ToggleSwitch
              enabled={layout.footer.showDate}
              onChange={v => updateLayout({ ...layout, footer: { ...layout.footer, showDate: v } })}
              disabled={!isAdmin}
            />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-gray-800 dark:text-slate-200">Show page numbers</div>
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Adds "Page X of Y" to PDF exports</div>
            </div>
            <ToggleSwitch
              enabled={layout.footer.showPageNumbers}
              onChange={v => updateLayout({ ...layout, footer: { ...layout.footer, showPageNumbers: v } })}
              disabled={!isAdmin}
            />
          </div>
        </div>
      </div>

      {isAdmin && <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />}
    </div>
  );
}

// ─── Main Settings page ───────────────────────────────────────────────────────

// ─── Support Document boilerplate tab ────────────────────────────────────────

const SUPPORT_DOC_SECTIONS: Array<{ key: keyof AppSettings; label: string; description: string; rows: number }> = [
  { key: 'support.doc.companyAddress',       label: 'Company Address (footer)',     description: 'Shown in document footer on every page.',                       rows: 2  },
  { key: 'support.doc.companyWebsite',       label: 'Website (footer)',             description: 'e.g. www.yourcompany.co.uk',                                    rows: 1  },
  { key: 'support.doc.companyPhone',         label: 'Phone (footer)',               description: 'e.g. +44 (0) 20 1234 5678',                                    rows: 1  },
  { key: 'support.doc.confidentialityNotice',label: 'Confidentiality Notice (§1)',  description: 'Appears at the start of every proposal under Section 1.',       rows: 6  },
  { key: 'support.doc.intro',                label: 'Company Introduction (§2)',    description: 'Your "About Us" narrative. Use plain text with bullet points.', rows: 10 },
  { key: 'support.doc.background',           label: 'Company Background (§3)',      description: 'Services, sectors and global reach.',                           rows: 10 },
  { key: 'support.doc.staff',                label: 'Staff & Qualifications (§4)',  description: 'Staffing numbers, certifications, vetting process.',            rows: 10 },
  { key: 'support.doc.certifications',       label: 'Certifications (§5)',          description: 'Accreditations, awards, partner status.',                      rows: 8  },
  { key: 'support.doc.serviceRequirements',  label: 'Service Requirements (§6)',    description: 'Help desk, hours, onsite, patch management, monitoring.',       rows: 14 },
  { key: 'support.doc.businessRequirements', label: 'Business Requirements (§7)',   description: 'Account management, onboarding, compliance, reporting.',        rows: 12 },
  { key: 'support.doc.contractualTerms',     label: 'Contractual Requirements (§8)',description: 'Contract length, SLA overview, software support, passwords.',   rows: 12 },
];

function SupportDocTab({ settings, onChange, isAdmin }: { settings: AppSettings; onChange: (s: AppSettings) => void; isAdmin: boolean }) {
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.update(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return <p className="text-sm text-gray-500">Only administrators can edit the Support Document boilerplate.</p>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-1">Support Document Templates</h2>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        These boilerplate sections appear in every support proposal document. Changes apply to all future proposals.
        You can also edit individual sections inline inside the Document tab on any proposal.
      </p>

      <div className="space-y-6">
        {SUPPORT_DOC_SECTIONS.map(({ key, label, description, rows }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-0.5">{label}</label>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">{description}</p>
            <textarea
              value={(settings[key] as string) ?? ''}
              onChange={e => onChange({ ...settings, [key]: e.target.value })}
              rows={rows}
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder={`Enter ${label.toLowerCase()} text…`}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save All'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
            <CheckCircle size={14} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Settings page ───────────────────────────────────────────────────────

export function Settings() {
  useDocumentTitle('Settings');
  const { currentUser } = useAuth();
  const { lookups, updateLookup } = useStore();
  const isAdmin = canAccessAdmin(currentUser);
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
          {activeTab === 'crm'           && settingsLoaded && <CrmTab settings={appSettings} onChange={setAppSettings} isAdmin={isAdmin} />}
          {activeTab === 'provisioning'  && settingsLoaded && <ProvisioningTab settings={appSettings} onChange={setAppSettings} isAdmin={isAdmin} />}
          {activeTab === 'api'           && <ApiAccessTab isAdmin={isAdmin} />}
          {activeTab === 'email'         && settingsLoaded && <EmailTab settings={appSettings} onChange={setAppSettings} isAdmin={isAdmin} />}
          {activeTab === 'layout'        && settingsLoaded && <LayoutTab settings={appSettings} onChange={setAppSettings} isAdmin={isAdmin} />}
          {activeTab === 'backup'        && <BackupTab isAdmin={isAdmin} />}
          {activeTab === 'support-doc'   && settingsLoaded && <SupportDocTab settings={appSettings} onChange={setAppSettings} isAdmin={isAdmin} />}
          {activeTab === 'about'         && <AboutTab appSettings={appSettings} />}
        </div>
      </div>
    </div>
  );
}

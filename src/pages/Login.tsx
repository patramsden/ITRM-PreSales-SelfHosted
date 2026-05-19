import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, FlaskConical, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../store';
import { api, totpApi } from '../lib/api';
import { useBranding } from '../contexts/BrandingContext';

type Phase = 'email' | 'password' | 'sso' | 'totp';

export function Login() {
  const { login, loginWithSamlCode, signIn } = useAuth();
  const navigate = useNavigate();
  const users = useStore(s => s.users);
  const IS_DEV = import.meta.env.DEV;
  const { logo, primaryColor, companyName, subtitle } = useBranding();

  const [phase, setPhase]         = useState<Phase>('email');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [samlLoading, setSamlLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // TOTP challenge state
  const [totpChallenge, setTotpChallenge] = useState<string | null>(null);
  const [totpCode, setTotpCode]           = useState('');
  const [totpLoading, setTotpLoading]     = useState(false);

  // Handle SAML redirect-back: ?saml_code=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('saml_code');
    if (!code) return;

    // Remove the code from the URL immediately
    const url = new URL(window.location.href);
    url.searchParams.delete('saml_code');
    window.history.replaceState({}, '', url.toString());

    setSamlLoading(true);
    loginWithSamlCode(code)
      .then(() => navigate('/'))
      .catch(e => {
        setError(e instanceof Error ? e.message : 'SSO login failed');
        setSamlLoading(false);
        setPhase('email');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 1: lookup email → determine method ──────────────────────────────
  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setError(null);
    setLoading(true);
    try {
      const { method } = await api.post<{ method: 'local' | 'saml' }>('auth/lookup', { email: trimmed });
      if (method === 'saml') {
        setPhase('sso');
        // Kick off SSO redirect immediately
        const { redirectUrl } = await api.get<{ redirectUrl: string }>('auth/saml/init');
        window.location.href = redirectUrl;
      } else {
        setPhase('password');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to continue. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Phase 2: password submit ──────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result && 'requireTotp' in result && result.requireTotp) {
        setTotpChallenge((result as { challengeToken: string }).challengeToken);
        setPhase('totp');
      } else {
        navigate('/');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Phase 3 (totp): verify code ───────────────────────────────────────────
  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpChallenge) return;
    setError(null);
    setTotpLoading(true);
    try {
      const result = await totpApi.login(totpChallenge, totpCode);
      await login(email, password, { preVerified: true, token: result.token, user: result.user });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setTotpLoading(false);
    }
  };

  const bgStyle = { backgroundColor: primaryColor };

  // ── Full-screen spinner states ─────────────────────────────────────────────
  if (samlLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <div className="text-center text-white">
          <Loader2 size={32} className="animate-spin mx-auto mb-3 text-white/60" />
          <p className="text-sm text-white/60">Completing sign-in…</p>
        </div>
      </div>
    );
  }

  // ── SSO redirect phase ─────────────────────────────────────────────────────
  if (phase === 'sso') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <div className="text-center text-white">
          <Loader2 size={32} className="animate-spin mx-auto mb-3 text-white/60" />
          <p className="text-sm font-medium">Redirecting to your organisation's sign-in…</p>
          <p className="text-xs text-white/50 mt-1">{email}</p>
          <button
            onClick={() => { setPhase('email'); setError(null); }}
            className="mt-5 text-xs text-white/50 hover:text-white/80 underline"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── TOTP challenge phase ───────────────────────────────────────────────────
  if (phase === 'totp') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={28} className="text-white" />
            </div>
            <p className="text-white font-semibold">Two-factor authentication</p>
            <p className="text-sm text-white/60 mt-1">Enter the 6-digit code from your authenticator app</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
            <form onSubmit={handleTotpSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Authenticator code</label>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2.5 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="000000"
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0" />{error}
                </div>
              )}
              <button type="submit" disabled={totpLoading || totpCode.length !== 6}
                className="w-full text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}>
                {totpLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                {totpLoading ? 'Verifying…' : 'Verify'}
              </button>
              <button type="button" onClick={() => { setPhase('password'); setError(null); setTotpCode(''); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 py-1 flex items-center justify-center gap-1">
                <ArrowLeft size={13} /> Back to sign in
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Email + Password phases (shared card) ─────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <img src={logo ?? '/itrm-logo.svg'} alt={companyName} className="h-12 mx-auto mb-4 brightness-0 invert" />
          <p className="text-sm text-white/60 mt-1">{subtitle} · Sign in to continue</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">

          {/* ── Step 1: Email ── */}
          {phase === 'email' && (
            <form onSubmit={handleEmailContinue} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Email address
                </label>
                <input
                  autoFocus
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="you@company.com"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Checking…' : 'Continue'}
              </button>
            </form>
          )}

          {/* ── Step 2: Password ── */}
          {phase === 'password' && (
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Locked email display */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Email address
                </label>
                <div className="flex items-center gap-2 w-full border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-500 dark:text-slate-400">
                  <span className="flex-1 truncate">{email}</span>
                  <button
                    type="button"
                    onClick={() => { setPhase('email'); setPassword(''); setError(null); }}
                    className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium shrink-0"
                  >
                    Change
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <input
                  autoFocus
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Signing in…' : 'Sign in'}
              </button>

              <div className="text-center">
                <a href="/forgot-password" className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
                  Forgot your password?
                </a>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-white/40 mt-6">
          Contact your administrator to get access.
        </p>

        {/* Dev mode user picker */}
        {IS_DEV && (
          <div className="mt-4 bg-black/20 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical size={13} className="text-white/50" />
              <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Dev mode — quick sign-in</span>
            </div>
            <div className="space-y-1.5">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => { signIn(u.id); navigate('/'); }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-left"
                >
                  <span className="text-sm text-white">{u.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${u.appRole === 'admin' ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-white/60'}`}>
                    {u.appRole === 'admin' ? 'Admin' : 'User'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

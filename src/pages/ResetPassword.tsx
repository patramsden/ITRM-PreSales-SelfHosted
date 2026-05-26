import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { passwordResetApi, settingsApi } from '../lib/api';
import { useBranding } from '../contexts/BrandingContext';
import { policyFromSettings, validatePassword, policyDescription } from '../utils/passwordPolicy';

export function ResetPassword() {
  const navigate = useNavigate();
  const { logo, companyName, subtitle, primaryColor } = useBranding();
  const bgStyle = { backgroundColor: primaryColor };

  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [done, setDone]             = useState(false);
  const [policyErrors, setPolicyErrors] = useState<string[]>([]);
  const [policy, setPolicy]         = useState(policyFromSettings({}));

  const token = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    settingsApi.get().then(s => setPolicy(policyFromSettings(s as Record<string,string>))).catch(() => {});
  }, []);

  useEffect(() => {
    if (password) setPolicyErrors(validatePassword(password, policy));
    else setPolicyErrors([]);
  }, [password, policy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) { setError('Passwords do not match'); return; }
    const errs = validatePassword(password, policy);
    if (errs.length) { setError('Password does not meet requirements'); return; }

    setError(null);
    setLoading(true);
    try {
      await passwordResetApi.confirm(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={logo ?? '/msp-logo.svg'} alt={companyName} className="h-12 mx-auto mb-4 brightness-0 invert" />
          <p className="text-sm text-white/60 mt-1">{subtitle} · Set new password</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
          {!token ? (
            <div className="text-center space-y-3">
              <AlertCircle size={32} className="text-red-400 mx-auto" />
              <div className="text-sm text-gray-600 dark:text-slate-300">Invalid or missing reset token.</div>
              <Link to="/forgot-password" className="text-sm text-brand-600 hover:underline">Request a new link</Link>
            </div>
          ) : done ? (
            <div className="text-center space-y-3">
              <CheckCircle size={32} className="text-green-500 mx-auto" />
              <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Password updated!</div>
              <div className="text-xs text-gray-500">Redirecting to sign in…</div>
              <Link to="/login" className="text-sm text-brand-600 hover:underline">Sign in now</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-1">
                Choose a new password
              </div>
              {policy && (
                <p className="text-xs text-gray-400 dark:text-slate-500 -mt-2">
                  Must have {policyDescription(policy)}.
                </p>
              )}

              {/* New password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">New password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    required value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {policyErrors.length > 0 && password && (
                  <ul className="mt-1.5 space-y-0.5">
                    {policyErrors.map(e => (
                      <li key={e} className="text-xs text-red-500 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />{e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Confirm */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Confirm password</label>
                <input
                  type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="••••••••"
                />
                {confirm && confirm !== password && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0" />{error}
                </div>
              )}

              <button type="submit"
                disabled={loading || !password || !confirm || policyErrors.length > 0 || password !== confirm}
                className="w-full text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Updating…' : 'Set new password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

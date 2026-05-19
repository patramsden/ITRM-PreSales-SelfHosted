import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle, KeyRound, Copy, Check } from 'lucide-react';
import { passwordResetApi } from '../lib/api';
import { useBranding } from '../contexts/BrandingContext';

export function ForgotPassword() {
  const { logo, companyName, subtitle, primaryColor } = useBranding();
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);

  const bgStyle = { backgroundColor: primaryColor };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await passwordResetApi.request(email);
      setResetUrl(res.resetUrl ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!resetUrl) return;
    navigator.clipboard.writeText(resetUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={logo ?? '/itrm-logo.svg'} alt={companyName} className="h-12 mx-auto mb-4 brightness-0 invert" />
          <p className="text-sm text-white/60 mt-1">{subtitle} · Password reset</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
          {resetUrl ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle size={22} className="text-green-500 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Reset link generated</div>
                  <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Share this link securely with the user. It expires in 24 hours.
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-slate-700 rounded-lg px-3 py-2.5 flex items-center gap-2">
                <span className="text-xs text-gray-600 dark:text-slate-300 font-mono break-all flex-1">{resetUrl}</span>
                <button onClick={handleCopy}
                  className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-400">
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
              <Link to="/login" className="block text-center text-sm text-brand-600 hover:underline mt-2">
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <KeyRound size={20} className="text-gray-400 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Reset password</div>
                  <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Enter your email address to generate a reset link.
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Email address</label>
                <input
                  type="email" autoComplete="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="you@company.com"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0" />{error}
                </div>
              )}

              <button type="submit" disabled={loading || !email}
                className="w-full text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Generating…' : 'Generate reset link'}
              </button>

              <Link to="/login" className="block text-center text-sm text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
                ← Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

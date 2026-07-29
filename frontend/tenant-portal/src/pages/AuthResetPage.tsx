import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { portalApi } from '../lib/api';
import { CheckCircle2, Loader2 } from 'lucide-react';

// Landing page for the publisher reset link:
//   https://<AUTH_LINK_BASE>/auth/reset?code=<64 hex>
export function AuthResetPage() {
  const [params] = useSearchParams();
  const code = params.get('code') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Same policy /signup enforces, checked here first: the code is single-use, so a
    // rejected password must not cost the user their link.
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be 8+ chars with at least one uppercase and one digit');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await portalApi.confirmPasswordReset(code, password);
      if (res.ok) {
        setDone(true);
      } else {
        setError(res.error?.message ?? 'Could not reset your password. Request a new link.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-[420px]">
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-sm p-2">
          <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
        </div>

        {done ? (
          <div className="text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl font-extrabold text-slate-900 mb-2" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Password changed
            </h1>
            <p className="text-slate-500 text-sm mb-6">Sign in with your new password.</p>
            <Link
              to="/login"
              className="w-full inline-flex items-center justify-center py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98] text-xs"
            >
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-extrabold text-slate-900 mb-2" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Choose a new password
              </h1>
              <p className="text-slate-500 text-sm">At least 8 characters, with one uppercase letter and one digit.</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-xs mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-xs font-semibold text-slate-700 mb-1.5">New Password</label>
                <input
                  id="new-password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter a new password"
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm transition-all shadow-sm"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-700 mb-1.5">Confirm Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat the new password"
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm transition-all shadow-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 text-xs"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 text-white" />
                    Saving…
                  </>
                ) : 'Set new password'}
              </button>
            </form>

            <Link to="/login" className="block mt-6 text-center text-xs font-semibold text-slate-500 hover:text-slate-700">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

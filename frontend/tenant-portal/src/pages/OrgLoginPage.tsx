import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { portalApi } from '../lib/api';
import { auth, googleProvider, signInWithPopup } from '../lib/firebase';
import { PhoneAuthForm } from '../components/PhoneAuthForm';
import { Phone, Mail, Loader2, Sparkles } from 'lucide-react';

export function OrgLoginPage({ onLogin }: { onLogin: (token: string, slug: string, status: string) => void }) {
  const [authMethod, setAuthMethod] = useState<'PASSWORD' | 'PHONE'>('PASSWORD');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Reuses the email already typed above. The reply is deliberately generic — it never
  // says whether the address has an account — so show the server's message as-is.
  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your work email first, then choose "Forgot password".');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await portalApi.requestPasswordReset(email);
      setResetMsg(res.data?.message ?? 'If that address has an account, a reset link is on its way.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await portalApi.orgLogin({ email, password });
      if (res.ok && res.data?.token) {
        onLogin(res.data.token, res.data.slug, res.data.status);
      } else {
        setError(res.error?.message ?? 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFirebaseToken = async (idToken: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (res.ok) {
        const data = await res.json() as { ok: boolean; data?: { token: string; slug: string; status: string } };
        if (data.ok && data.data?.token) {
          onLogin(data.data.token, data.data.slug, data.data.status || 'active');
        } else {
          setError('Could not verify publisher account.');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error?.message || 'Authentication failed. No matching publisher found.');
      }
    } catch (err) {
      console.error('Firebase login error:', err);
      setError('Network error during authentication.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken(true);
      await handleFirebaseToken(idToken);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error('Google login error:', err);
        setError('Google sign-in failed. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Left side: Branding / Marketing */}
      <div className="hidden lg:flex flex-1 flex-col justify-center px-16 relative overflow-hidden bg-slate-900 text-white">
        {/* Background Gradients */}
        <div className="absolute top-0 -right-32 w-[40rem] h-[40rem] bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-[40rem] h-[40rem] bg-emerald-500/10 rounded-full blur-3xl" />
        
        <div className="relative z-10 max-w-lg">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mb-10 shadow-xl overflow-hidden p-2">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight mb-6 text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400">
            Welcome back to your dashboard.
          </h1>
          <p className="text-xl text-slate-300 mb-12 leading-relaxed">
            Manage your publications, view readership analytics, and configure your paywall all in one place.
          </p>

          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-indigo-400" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
              </div>
              <div>
                <h4 className="font-semibold text-lg">Centralized Management</h4>
                <p className="text-slate-400 text-sm">Control all your editions from one unified panel.</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center border border-sky-500/30">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-sky-400" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              </div>
              <div>
                <h4 className="font-semibold text-lg">Real-time Updates</h4>
                <p className="text-slate-400 text-sm">Publish changes instantly to your global readers.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side: Form */}
      <div className="flex-1 flex items-center justify-center p-8 relative bg-white">
        <div className="w-full max-w-[400px]">
          
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-sm p-2">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Sign in to your account</h1>
            <p className="text-slate-500 text-sm">Welcome back! Please choose your preferred sign-in method.</p>
          </div>

          {/* Social / Phone Auth buttons */}
          <div className="space-y-2.5 mb-6">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 shadow-sm transition-all disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              Sign in with Google
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMethod(authMethod === 'PHONE' ? 'PASSWORD' : 'PHONE');
                setError('');
              }}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 shadow-sm transition-all disabled:opacity-50"
            >
              {authMethod === 'PHONE' ? (
                <>
                  <Mail className="h-4 w-4 text-slate-500" />
                  Sign in with Email & Password
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4 text-slate-500" />
                  Sign in with Mobile (SMS OTP)
                </>
              )}
            </button>
          </div>

          <div className="relative flex py-2 items-center mb-6">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-[0.68rem] font-medium uppercase tracking-wider">Or</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-xs flex items-center gap-3 mb-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <span>{error}</span>
            </div>
          )}

          {resetMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-xs mb-4">
              {resetMsg}
            </div>
          )}

          {authMethod === 'PHONE' ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <PhoneAuthForm
                stage="publisher"
                onVerified={handleFirebaseToken}
                onCancel={() => setAuthMethod('PASSWORD')}
              />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Work Email</label>
                <input 
                  type="email"
                  required 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  placeholder="you@company.com"
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm transition-all shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm transition-all shadow-sm"
                />
                <div className="mt-1.5 text-right">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading} 
                className="w-full mt-2 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2 text-xs"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 text-white" />
                    Signing in...
                  </>
                ) : 'Sign in'}
              </button>
            </form>
          )}
          
          <div className="relative flex py-4 items-center mt-4">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-medium uppercase tracking-wider">New organisation?</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <Link 
            to="/signup" 
            className="w-full flex items-center justify-center py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98] text-xs"
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}

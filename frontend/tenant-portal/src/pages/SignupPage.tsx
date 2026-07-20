import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { portalApi } from '../lib/api';
import { auth, googleProvider, signInWithPopup, sendEmailVerification } from '../lib/firebase';
import { PhoneAuthForm } from '../components/PhoneAuthForm';
import { Phone, Mail, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}

export function SignupPage({ onSignup }: { onSignup: (token: string, slug: string) => void }) {
  const navigate = useNavigate();
  const [authMethod, setAuthMethod] = useState<'PASSWORD' | 'PHONE'>('PASSWORD');
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const previewSlug = orgName ? `${slugify(orgName).slice(0, 30)}-xxxx` : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be 8+ chars with at least one uppercase and one digit');
      return;
    }
    setLoading(true);
    try {
      const res = await portalApi.signup({ orgName, name, email, password, plan: 'Free' });
      if (res.ok && res.data?.token) {
        // Send optional Firebase verification mail if configured
        try {
          if (auth.currentUser && auth.currentUser.email === email) {
            await sendEmailVerification(auth.currentUser);
          }
        } catch (e) {
          console.error('Failed to trigger Firebase email verification:', e);
        }
        onSignup(res.data.token, res.data.slug);
      } else {
        const errorMsg = res.error?.message ?? 'Signup failed';
        if (errorMsg === 'Account already exists. Please login.') {
          navigate('/login');
        } else {
          setError(errorMsg);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFirebaseTokenSignup = async (idToken: string, fallbackEmail?: string) => {
    if (!orgName.trim() || !name.trim()) {
      setError('Please enter your Organisation Name and Your Name above before authenticating.');
      setAuthMethod('PASSWORD');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await portalApi.signup({
        orgName: orgName.trim(),
        name: name.trim(),
        // Only send a real email. For phone-only signup we send none — the backend
        // derives identity from the verified token and keys the tenant on the phone
        // number. (Previously a hardcoded 'firebase-phone@epaperspace.com' was sent,
        // which collided on the second phone-only signup since it's the tenant key.)
        email: fallbackEmail || email || undefined,
        idToken,
      } as any);

      if (res.ok && res.data?.token) {
        onSignup(res.data.token, res.data.slug);
      } else {
        const errorMsg = res.error?.message ?? 'Signup failed';
        if (errorMsg === 'Account already exists. Please login.') {
          navigate('/login');
        } else {
          setError(errorMsg);
        }
      }
    } catch (err) {
      console.error('Firebase signup error:', err);
      setError('Failed to create account via social/phone auth.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    if (!orgName.trim() || !name.trim()) {
      setError('Please enter your Organisation Name and Your Name first.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken(true);
      if (!name.trim() && result.user.displayName) {
        setName(result.user.displayName);
      }
      await handleFirebaseTokenSignup(idToken, result.user.email || undefined);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error('Google signup error:', err);
        setError('Google sign-up failed. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Left side: Branding / Marketing */}
      <div className="hidden lg:flex flex-1 flex-col justify-center px-16 relative overflow-hidden bg-slate-900 text-white">
        {/* Background Gradients */}
        <div className="absolute -top-32 -left-32 w-[40rem] h-[40rem] bg-indigo-600/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[40rem] h-[40rem] bg-rose-500/20 rounded-full blur-3xl" />
        
        <div className="relative z-10 max-w-lg">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mb-10 shadow-xl overflow-hidden p-2">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight mb-6 text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400">
            Digital Publishing, Elevated.
          </h1>
          <p className="text-xl text-slate-300 mb-12 leading-relaxed">
            Join hundreds of visionary publishers using our automated ePaper platform to reach readers globally.
          </p>

          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-indigo-400" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div>
                <h4 className="font-semibold text-lg">Automated Workflows</h4>
                <p className="text-slate-400 text-sm">Upload PDFs, we handle rendering and thumbnails.</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-rose-400" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div>
                <h4 className="font-semibold text-lg">Instant Monetization</h4>
                <p className="text-slate-400 text-sm">Built-in paywalls and seamless reader subscriptions.</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-emerald-400" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div>
                <h4 className="font-semibold text-lg">Deep Analytics</h4>
                <p className="text-slate-400 text-sm">Understand reader engagement with heatmap insights.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side: Form */}
      <div className="flex-1 flex items-center justify-center p-8 relative bg-white">
        <div className="w-full max-w-[440px]">
          
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-sm p-2">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Create an account</h1>
            <p className="text-slate-500 text-sm">Sign up to provision your organisation workspace.</p>
          </div>

          <div className="space-y-4">
            {/* Required Workspace & Profile Info */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Organisation Name *</label>
              <input 
                required 
                value={orgName} 
                onChange={e => setOrgName(e.target.value)} 
                placeholder="The Hindu Digital"
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm transition-all shadow-sm"
              />
              {previewSlug && (
                <div className="mt-1 text-[0.7rem] text-slate-500">
                  Subdomain: <span className="text-red-600 font-medium">{previewSlug}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Your Name *</label>
              <input 
                required 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Priya Sharma" 
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm transition-all shadow-sm"
              />
            </div>

            {/* Social / Phone options */}
            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                onClick={handleGoogleSignup}
                disabled={loading || !orgName.trim() || !name.trim()}
                className="w-full flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 shadow-sm transition-all disabled:opacity-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Sign up with Google
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!orgName.trim() || !name.trim()) {
                    setError('Please enter Organisation Name and Your Name first.');
                    return;
                  }
                  setAuthMethod(authMethod === 'PHONE' ? 'PASSWORD' : 'PHONE');
                  setError('');
                }}
                disabled={loading || !orgName.trim() || !name.trim()}
                className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 shadow-sm transition-all disabled:opacity-50"
              >
                {authMethod === 'PHONE' ? (
                  <>
                    <Mail className="h-4 w-4 text-slate-500" />
                    Sign up with Email & Password
                  </>
                ) : (
                  <>
                    <Phone className="h-4 w-4 text-slate-500" />
                    Sign up with Mobile (SMS OTP)
                  </>
                )}
              </button>
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-[0.68rem] font-medium uppercase tracking-wider">Or</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-xs flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <span>{error}</span>
              </div>
            )}

            {authMethod === 'PHONE' ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <PhoneAuthForm
                  stage="publisher"
                  onVerified={(idToken) => handleFirebaseTokenSignup(idToken)}
                  onCancel={() => setAuthMethod('PASSWORD')}
                />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email *</label>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password *</label>
                  <input 
                    type="password" 
                    required 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="8+ chars, 1 uppercase, 1 number" 
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm transition-all shadow-sm"
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={loading || !orgName.trim() || !name.trim()} 
                  className="w-full mt-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-all shadow-md active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2 text-xs"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 text-white" />
                      Creating workspace...
                    </>
                  ) : 'Create account'}
                </button>
              </form>
            )}
            
            <div className="relative flex py-4 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-medium uppercase tracking-wider">Already registered?</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <Link 
              to="/login" 
              className="w-full flex items-center justify-center py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98] text-xs"
            >
              Sign in instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

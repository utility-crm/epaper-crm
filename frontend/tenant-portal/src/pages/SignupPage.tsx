import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { portalApi } from '../lib/api';

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}

export function SignupPage({ onSignup }: { onSignup: (token: string, slug: string) => void }) {
  const navigate = useNavigate();
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
          
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-sm p-2">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Create an account</h1>
            <p className="text-slate-500">Sign up to provision your organisation workspace.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Organisation Name</label>
              <input 
                required 
                value={orgName} 
                onChange={e => setOrgName(e.target.value)} 
                placeholder="The Hindu Digital"
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all shadow-sm"
              />
              {previewSlug && (
                <div className="mt-1.5 text-xs text-slate-500">
                  Subdomain: <span className="text-red-600 font-medium">{previewSlug}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Your Name</label>
                <input 
                  required 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="Priya Sharma" 
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Work Email</label>
                <input 
                  type="email" 
                  required 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  placeholder="you@company.com" 
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <input 
                type="password" 
                required 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="8+ chars, 1 uppercase, 1 number" 
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all shadow-sm"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading} 
              className="w-full mt-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-all shadow-md active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Creating workspace...
                </>
              ) : 'Create account'}
            </button>
            
            <div className="relative flex py-4 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-medium uppercase tracking-wider">Already registered?</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <Link 
              to="/login" 
              className="w-full flex items-center justify-center py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98]"
            >
              Sign in instead
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}

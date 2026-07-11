import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { portalApi } from '../lib/api';

export function OrgLoginPage({ onLogin }: { onLogin: (token: string, slug: string, status: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left side: Branding / Marketing */}
      <div className="hidden lg:flex flex-1 flex-col justify-center px-16 relative overflow-hidden bg-slate-900 text-white">
        {/* Background Gradients */}
        <div className="absolute top-0 -right-32 w-[40rem] h-[40rem] bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-[40rem] h-[40rem] bg-emerald-500/10 rounded-full blur-3xl" />
        
        <div className="relative z-10 max-w-lg">
          <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 mb-10 shadow-xl">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
            </svg>
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
      <div className="flex-1 flex items-center justify-center p-8 relative">
        <div className="w-full max-w-[400px]">
          
          <div className="lg:hidden text-center mb-10">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900">Sign in</h1>
          </div>
          
          <div className="hidden lg:block mb-10">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-2">Sign in to your account</h2>
            <p className="text-slate-500">Welcome back! Please enter your details.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Work Email</label>
              <input 
                type="email"
                required 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="you@company.com"
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <input 
                type="password" 
                required 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="Enter your password" 
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading} 
              className="w-full mt-4 py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Signing in...
                </>
              ) : 'Sign in'}
            </button>

            <p className="text-center text-slate-500 text-sm mt-6">
              New organisation? <Link to="/signup" className="text-indigo-600 font-semibold hover:underline">Create an account</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

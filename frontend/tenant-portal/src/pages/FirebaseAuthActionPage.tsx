import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { auth, applyActionCode } from '../lib/firebase';
import { portalApi, readerApi } from '../lib/api';
import { CheckCircle2, AlertCircle, Loader2, Newspaper } from 'lucide-react';

export const FirebaseAuthActionPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');
  const stage = searchParams.get('stage') || 'reader';
  const slug = searchParams.get('slug') || '';
  const continueUrl = searchParams.get('continueUrl') || '/';

  const [status, setStatus] = useState<'VERIFYING' | 'SUCCESS' | 'ERROR'>('VERIFYING');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!mode || !oobCode) {
      setStatus('ERROR');
      setErrorMessage('Invalid or missing email verification parameters.');
      return;
    }

    if (mode === 'verifyEmail') {
      verifyEmailFlow(oobCode);
    } else {
      setStatus('ERROR');
      setErrorMessage(`Unsupported authentication action mode: ${mode}`);
    }
  }, [mode, oobCode]);

  const verifyEmailFlow = async (code: string) => {
    try {
      // 1. Apply code with Firebase (verifies token cryptographically on Google servers)
      await applyActionCode(auth, code);

      // 2. Refresh current user token so claims.email_verified === true is included
      const currentUser = auth.currentUser;
      if (currentUser) {
        await currentUser.reload();
        const idToken = await currentUser.getIdToken(true);

        // 3. Notify backend depending on stage (`publisher` -> `/api/auth/verify-org`, `reader` -> `/api/read/${slug}/verify-firebase`)
        if (stage === 'publisher') {
          const res = await fetch('/api/auth/verify-org', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });
          if (res.ok) {
            const data = await res.json() as { ok: boolean; data?: { token: string; slug: string; status: string } };
            if (data.ok && data.data?.token) {
              localStorage.setItem('epaper:orgToken', data.data.token);
              localStorage.setItem('epaper:tenantStatus', data.data.status || 'active');
            }
          }
        } else if (slug) {
          const res = await fetch(`/api/read/${slug}/verify-firebase`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });
          if (res.ok) {
            const data = await res.json() as { ok: boolean; data?: { token: string; reader: any } };
            if (data.ok && data.data?.token) {
              localStorage.setItem(`epaper:readerToken:${slug}`, data.data.token);
            }
          }
        }
      }

      setStatus('SUCCESS');

      // Automatically redirect after 2.5 seconds
      setTimeout(() => {
        if (continueUrl.startsWith('http://') || continueUrl.startsWith('https://')) {
          window.location.href = continueUrl;
        } else {
          navigate(continueUrl);
        }
      }, 2500);
    } catch (err: any) {
      console.error('Email verification error:', err);
      setStatus('ERROR');
      setErrorMessage('The verification link has expired, already been used, or is invalid. Please request a new verification mail.');
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-slate-200/80 text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white shadow-md">
          <Newspaper className="h-7 w-7" />
        </div>

        {status === 'VERIFYING' && (
          <div className="space-y-4 py-4">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-red-600" />
            <h2 className="text-lg font-bold text-slate-900">Verifying Your Email...</h2>
            <p className="text-xs text-slate-500">
              Please wait while we confirm your email address and activate your account.
            </p>
          </div>
        )}

        {status === 'SUCCESS' && (
          <div className="space-y-4 py-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Email Verified Successfully!</h2>
            <p className="text-xs text-slate-600">
              Your email address has been confirmed. Redirecting you to your publication...
            </p>
          </div>
        )}

        {status === 'ERROR' && (
          <div className="space-y-4 py-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Verification Failed</h2>
            <p className="text-xs text-red-600 leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm"
            >
              Return to Homepage
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

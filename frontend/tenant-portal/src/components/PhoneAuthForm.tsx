import React, { useState, useRef, useEffect } from 'react';
import { auth, signInWithPhoneNumber, RecaptchaVerifier, ConfirmationResult } from '../lib/firebase';
import { Phone, Lock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface PhoneAuthFormProps {
  stage?: 'publisher' | 'reader';
  slug?: string;
  onVerified: (idToken: string) => void | Promise<void>;
  onCancel?: () => void;
}

export const PhoneAuthForm: React.FC<PhoneAuthFormProps> = ({
  stage = 'reader',
  slug = 'system',
  onVerified,
  onCancel,
}) => {
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);

  // Initialize invisible reCAPTCHA only once guarded by ref
  useEffect(() => {
    if (!recaptchaVerifierRef.current && recaptchaContainerRef.current) {
      try {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
          size: 'invisible',
          callback: () => {
            // reCAPTCHA solved
          },
          'expired-callback': () => {
            setError('reCAPTCHA verification expired. Please try sending OTP again.');
            recaptchaVerifierRef.current?.clear();
            recaptchaVerifierRef.current = null;
          },
        });
      } catch (e) {
        console.error('Failed to initialize RecaptchaVerifier:', e);
      }
    }
    return () => {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
    };
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const mapFirebaseError = (codeOrMsg: string): string => {
    if (codeOrMsg.includes('auth/invalid-phone-number')) {
      return 'Invalid phone number format. Please use +91 followed by your 10-digit mobile number.';
    }
    if (codeOrMsg.includes('auth/too-many-requests')) {
      return 'Too many OTP requests. Please wait before requesting another code.';
    }
    if (codeOrMsg.includes('auth/code-expired')) {
      return 'Verification code has expired. Please request a new OTP.';
    }
    if (codeOrMsg.includes('auth/invalid-verification-code')) {
      return 'Incorrect 6-digit verification code. Please check and try again.';
    }
    return 'Authentication failed. Please check your network or try again later.';
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // E.164 phone validation (e.g. +91XXXXXXXXXX or international)
    const e164Regex = /^\+[1-9]\d{9,14}$/;
    if (!e164Regex.test(phone.trim())) {
      setError('Please enter a valid phone number with country code (e.g. +919876543210).');
      return;
    }

    setLoading(true);

    try {
      // 1. Audit log and rate check with server before sending SMS (cost guardrail: ~$0.07/SMS)
      // NOTE ON PROVIDER SWAPPING:
      // If SMS volume in India scales up and Firebase SMS cost becomes high, you can swap this section:
      // Instead of calling `signInWithPhoneNumber(auth, ...)`, call your custom `/api/auth/send-msg91-otp`
      // endpoint which uses MSG91 / Twilio SDK and stores OTP hash in D1/Redis.
      const auditRes = await fetch('/api/auth/audit/sms-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phonePrefix: phone.slice(0, 6), slug, stage }),
      });

      if (auditRes.status === 429) {
        throw new Error('auth/too-many-requests');
      }

      if (!recaptchaVerifierRef.current && recaptchaContainerRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
          size: 'invisible',
        });
      }

      const confirmation = await signInWithPhoneNumber(
        auth,
        phone.trim(),
        recaptchaVerifierRef.current!
      );

      confirmationResultRef.current = confirmation;
      setStep('OTP');
      setCooldown(60); // 60-second cooldown between resends
    } catch (err: any) {
      console.error('Send OTP error:', err);
      setError(mapFirebaseError(err.code || err.message || ''));
      // Reset reCAPTCHA on failure
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (otp.trim().length !== 6) {
      setError('Please enter the 6-digit OTP sent to your mobile.');
      return;
    }

    if (!confirmationResultRef.current) {
      setError('Session expired. Please request a new OTP.');
      setStep('PHONE');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await confirmationResultRef.current.confirm(otp.trim());
      const idToken = await userCredential.user.getIdToken(true);
      await onVerified(idToken);
    } catch (err: any) {
      console.error('Verify OTP error:', err);
      setError(mapFirebaseError(err.code || err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Invisible reCAPTCHA mount point */}
      <div ref={recaptchaContainerRef} />

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {step === 'PHONE' ? (
        <form onSubmit={handleSendOtp} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mobile Number (with Country Code)
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                required
                disabled={loading}
              />
            </div>
            <p className="mt-1 text-[0.68rem] text-slate-500">
              We will send a 6-digit verification code via SMS.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !phone.trim()}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send OTP
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Enter 6-Digit OTP
              </label>
              <button
                type="button"
                onClick={() => {
                  setStep('PHONE');
                  setOtp('');
                  setError(null);
                }}
                className="text-[0.68rem] text-red-600 hover:underline font-medium"
              >
                Change Number ({phone})
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="123456"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm font-mono tracking-widest focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                required
                disabled={loading}
                autoFocus
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={loading || cooldown > 0}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors"
            >
              {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
            </button>

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Verify & Sign In
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

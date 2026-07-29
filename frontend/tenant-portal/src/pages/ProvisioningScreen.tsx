import React, { useEffect, useState, useCallback, useRef } from 'react';
import { portalApi } from '../lib/api';

interface ProvisioningScreenProps {
  token: string;
  onActive: () => void;
}

const STEPS = [
  { id: 'database', label: 'Provisioning database', desc: 'Creating isolated D1 SQLite database' },
  { id: 'storage', label: 'Creating storage bucket', desc: 'Setting up R2 object storage for PDFs' },
  { id: 'bindings', label: 'Configuring workers', desc: 'Injecting tenant bindings into edge workers' },
  { id: 'schema', label: 'Applying schema', desc: 'Running database migrations' },
  { id: 'deploy', label: 'Deploying to edge', desc: 'Going live across 200+ data centres' },
  { id: 'verify', label: 'Verifying health', desc: 'Running final system health checks' },
];

// After this many seconds, show the "stuck" UI even if still in provisioning state
const TIMEOUT_SECONDS = 3 * 60; // 3 minutes

function randomStep(status: string) {
  if (status === 'pending') return 0;
  if (status === 'active') return STEPS.length;
  if (status === 'provision_failed') return 0;
  return Math.floor(Math.random() * 3) + 2;
}

export function ProvisioningScreen({ token, onActive }: ProvisioningScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [status, setStatus] = useState('pending');
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  // Elapsed timer
  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll provision status
  useEffect(() => {
    cancelledRef.current = false;

    const poll = async () => {
      while (!cancelledRef.current) {
        try {
          const res = await portalApi.provisionStatus(token);
          if (res.ok && res.data) {
            setStatus(res.data.status);
            setCurrentStep(randomStep(res.data.status));
            if (res.data.status === 'active') {
              if (!cancelledRef.current) onActive();
              return;
            }
            if (res.data.status === 'provision_failed') {
              return; // stop polling — let UI show error
            }
          }
        } catch { /* ignore transient errors */ }
        await new Promise(r => setTimeout(r, 10000));
      }
    };

    poll();
    return () => { cancelledRef.current = true; };
  }, [token, onActive]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await portalApi.retriggerProvisioning(token);
      if (res.ok) {
        setStatus('provisioning');
        setCurrentStep(1);
        setElapsedSeconds(0);
        // Restart polling after retry
        cancelledRef.current = false;
      } else {
        setRetryError(res.error?.message ?? 'Retry failed. Please try again later.');
      }
    } catch {
      setRetryError('Network error. Please check your connection and try again.');
    } finally {
      setRetrying(false);
    }
  }, [token]);

  const handleVerify = useCallback(async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await portalApi.verifyProvisioning(token);
      if (res.ok) {
        setStatus(res.data?.status || 'provisioning');
        if (res.data?.status === 'active') {
          onActive();
        } else if (res.data?.status === 'provision_failed') {
          // It will fall through to ErrorState
        } else {
          setRetryError('Still provisioning. Please wait or retry setup.');
        }
      } else {
        setRetryError(res.error?.message ?? 'Verification failed.');
      }
    } catch {
      setRetryError('Network error during verification.');
    } finally {
      setRetrying(false);
    }
  }, [token, onActive]);

  // --- FAILURE STATE ---
  if (status === 'provision_failed') {
    return <ErrorState retrying={retrying} retryError={retryError} onRetry={handleRetry} />;
  }

  // --- STUCK / TIMEOUT STATE: still provisioning after 3 minutes ---
  if (status !== 'active' && elapsedSeconds >= TIMEOUT_SECONDS) {
    return <StuckState retrying={retrying} retryError={retryError} onRetry={handleRetry} onVerify={handleVerify} />;
  }

  // --- NORMAL PROVISIONING STATE ---
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const pct = Math.min(95, Math.max(5, (currentStep / STEPS.length) * 100));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
      background: 'radial-gradient(ellipse at 50% 40%, rgba(99,102,241,0.12) 0%, transparent 70%)' }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        {/* Animated Logo */}
        <div style={{ marginBottom: 40, position: 'relative', display: 'inline-block' }}>
          <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg, var(--color-brand-primary), #7c3aed)',
            borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
            boxShadow: '0 0 60px var(--color-brand-glow)', animation: 'pulse-glow 2s ease-in-out infinite' }}>
            <span style={{ fontSize: '2.5rem' }}>◈</span>
          </div>
          <div className="spinner" style={{ position: 'absolute', inset: -8, width: 96, height: 96, borderWidth: 4, borderRadius: '50%' }} />
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 12 }}>Setting Up Your Organisation</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 40, lineHeight: 1.6 }}>
          We're provisioning your isolated database and storage. This usually takes 60–90 seconds. Sit tight!
          <br />
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Meanwhile, check your inbox — we've emailed you a link to verify your address.
          </span>
        </p>

        {/* Progress bar */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 999, height: 6, marginBottom: 32, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, width: `${pct}%`, transition: 'width 1s ease',
            background: 'linear-gradient(90deg, var(--color-brand-primary), #7c3aed)',
            boxShadow: '0 0 12px var(--color-brand-glow)' }} />
        </div>

        {/* Steps */}
        <div className="card" style={{ textAlign: 'left', marginBottom: 24 }}>
          {STEPS.map((step, i) => {
            const done = i < currentStep;
            const active = i === currentStep;
            return (
              <div key={step.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '12px 0',
                borderBottom: i < STEPS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                  background: done ? 'var(--color-success)' : active ? 'var(--color-brand-primary)' : 'rgba(255,255,255,0.06)',
                  border: `2px solid ${done ? 'var(--color-success)' : active ? 'var(--color-brand-primary)' : 'rgba(255,255,255,0.1)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: active ? '0 0 10px var(--color-brand-glow)' : 'none', transition: 'all 0.4s' }}>
                  {done && <span style={{ fontSize: '0.7rem' }}>✓</span>}
                  {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', animation: 'pulse-dot 1s ease infinite' }} />}
                </div>
                <div>
                  <div style={{ fontWeight: 500, color: done ? 'var(--color-text-secondary)' : active ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: '0.775rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{step.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
          Elapsed: {minutes > 0 ? `${minutes}m ` : ''}{String(seconds).padStart(2, '0')}s · Checking every 10s
        </p>
      </div>

      <style>{`
        @keyframes pulse-glow { 0%,100% { box-shadow: 0 0 40px var(--color-brand-glow); } 50% { box-shadow: 0 0 80px var(--color-brand-glow); } }
        @keyframes pulse-dot { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.6; } }
      `}</style>
    </div>
  );
}

function ErrorState({ retrying, retryError, onRetry }: { retrying: boolean; retryError: string | null; onRetry: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
      background: 'radial-gradient(ellipse at 50% 40%, rgba(239,68,68,0.08) 0%, transparent 70%)' }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #dc2626, #991b1b)',
            borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
            boxShadow: '0 0 60px rgba(220,38,38,0.3)' }}>
            <span style={{ fontSize: '2.5rem' }}>⚠</span>
          </div>
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 12 }}>Setup Failed</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>
          We encountered an error while setting up your organisation. This is usually a temporary infrastructure issue.
        </p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: 32, lineHeight: 1.6 }}>
          Your account is safe and no charges were made. Retry the setup below — your credentials are preserved.
          If the issue persists, contact{' '}
          <a href="mailto:support@epaper-cms.com" style={{ color: 'var(--color-brand-primary)' }}>support@epaper-cms.com</a>.
        </p>

        {retryError && (
          <div style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(220,38,38,0.1)',
            border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, color: '#fca5a5', fontSize: '0.875rem' }}>
            {retryError}
          </div>
        )}

        <button className="btn-primary" disabled={retrying} onClick={onRetry}
          style={{ width: '100%', maxWidth: 280, display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', gap: 8, fontSize: '1rem', padding: '12px 24px' }}>
          {retrying && <span className="spinner" style={{ width: 16, height: 16 }} />}
          {retrying ? 'Retrying Setup…' : '↻ Retry Setup'}
        </button>

        <p style={{ marginTop: 16, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
          You can also close this tab and try signing in again later — your account is saved.
        </p>
      </div>
    </div>
  );
}

function StuckState({ retrying, retryError, onRetry, onVerify }: { retrying: boolean; retryError: string | null; onRetry: () => void; onVerify: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
      background: 'radial-gradient(ellipse at 50% 40%, rgba(245,158,11,0.08) 0%, transparent 70%)' }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #d97706, #92400e)',
            borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
            boxShadow: '0 0 60px rgba(245,158,11,0.25)' }}>
            <span style={{ fontSize: '2.5rem' }}>⏱</span>
          </div>
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 12 }}>Taking Longer Than Expected</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>
          Setup has been running for over 3 minutes. The infrastructure job may have stalled.
        </p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: 32, lineHeight: 1.6 }}>
          You can <strong>Verify Status</strong> to check if it actually completed, or <strong>Restart Setup</strong> to try again. Your account and credentials are safe.
          If this keeps happening, contact{' '}
          <a href="mailto:support@epaper-cms.com" style={{ color: 'var(--color-brand-primary)' }}>support@epaper-cms.com</a>.
        </p>

        {retryError && (
          <div style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(220,38,38,0.1)',
            border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, color: '#fca5a5', fontSize: '0.875rem' }}>
            {retryError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn-secondary" disabled={retrying} onClick={onVerify}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '1rem', padding: '12px 24px', flex: 1, minWidth: 200 }}>
            {retrying ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '✓ Verify Status'}
          </button>
          
          <button className="btn-primary" disabled={retrying} onClick={onRetry}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '1rem', padding: '12px 24px', flex: 1, minWidth: 200 }}>
            {retrying ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '↻ Restart Setup'}
          </button>
        </div>

        <p style={{ marginTop: 24, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
          You can also close this tab and try signing in again later — your account is saved.
        </p>
      </div>
    </div>
  );
}

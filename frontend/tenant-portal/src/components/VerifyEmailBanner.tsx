import { useEffect, useState, useCallback } from 'react';
import { portalApi } from '../lib/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { AlertTriangle, MailCheck } from 'lucide-react';

/**
 * Warns a publisher that their email address is unverified, and gives them the two ways out:
 * resend the link, or — for an account created through Google/OTP that never had an address —
 * add one and verify it.
 *
 * The server is the real gate (workers/content refuses uploads and edition creation with
 * EMAIL_NOT_VERIFIED); this banner exists so the refusal is explained before it happens
 * rather than surfacing as an opaque 403 mid-upload.
 *
 * Renders nothing at all once the address is verified, so it is safe to mount unconditionally
 * on any page whose writes are gated.
 */
export function VerifyEmailBanner({ token, onVerifiedChange }: { token: string; onVerifiedChange?: (blocked: boolean) => void }) {
  const [profile, setProfile] = useState<{ email: string | null; email_verified: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const load = useCallback(async () => {
    const res = await portalApi.getProfile(token);
    if (res.ok && res.data) {
      setProfile({ email: res.data.email ?? null, email_verified: !!res.data.email_verified });
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Blocked covers "no address yet" as well as "address unverified": the content worker only
  // refuses the latter, but an account with no address cannot verify one either, so the
  // affordances it gates should stay disabled until an address exists and is confirmed.
  useEffect(() => {
    if (profile) onVerifiedChange?.(!profile.email || !profile.email_verified);
  }, [profile, onVerifiedChange]);

  const resend = async () => {
    setBusy(true); setError(''); setNote('');
    const res = await portalApi.resendVerifyEmail(token);
    setBusy(false);
    if (!res.ok) { setError(res.error?.message ?? 'Could not send the email.'); return; }
    setNote(`Verification link sent to ${res.data?.email ?? 'your inbox'}. Check your spam folder too.`);
  };

  const addEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setBusy(true); setError(''); setNote('');
    const res = await portalApi.addEmail(newEmail.trim(), token);
    setBusy(false);
    if (!res.ok) { setError(res.error?.message ?? 'Could not add that address.'); return; }
    setNewEmail('');
    setNote(res.data?.sent
      ? `Verification link sent to ${res.data.email}. Open it to finish.`
      : `Address saved. Use Resend below to get the verification link.`);
    load();
  };

  if (!profile) return null;
  if (profile.email && profile.email_verified) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-sm">
          {profile.email ? (
            <>
              <p className="font-medium text-amber-600 dark:text-amber-400">Verify your email to publish</p>
              <p className="text-muted-foreground mt-1">
                We sent a link to <span className="font-medium">{profile.email}</span>. Until you open it you cannot
                create editions or upload files.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-amber-600 dark:text-amber-400">Add an email address to publish</p>
              <p className="text-muted-foreground mt-1">
                Your account was created without an email address. Add one and verify it to create editions and
                upload files.
              </p>
            </>
          )}
        </div>
      </div>

      {profile.email ? (
        <Button size="sm" variant="outline" onClick={resend} disabled={busy}>
          <MailCheck className="h-4 w-4 mr-2" />
          {busy ? 'Sending…' : 'Resend verification email'}
        </Button>
      ) : (
        <form onSubmit={addEmail} className="flex flex-wrap items-center gap-2">
          <Input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="you@example.com"
            className="max-w-xs h-9"
          />
          <Button size="sm" type="submit" disabled={busy || !newEmail.trim()}>
            {busy ? 'Saving…' : 'Add and verify'}
          </Button>
        </form>
      )}

      {note && <p className="text-xs text-green-600 dark:text-green-500">{note}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { portalApi } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Globe, Copy, CheckCircle2, AlertCircle, Trash2, RefreshCw, ExternalLink } from 'lucide-react';

interface Props { slug: string; token: string; }

export function DomainPage({ slug, token }: Props) {
  const [domain, setDomain] = useState('');
  const [current, setCurrent] = useState<{ custom_domain: string | null; domain_verified: number } | null>(null);
  const [cname, setCname] = useState<string>('epaper-reader.pages.dev');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [verifyMsg, setVerifyMsg] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  useEffect(() => {
    portalApi.getDomain(token).then(res => {
      if (res.ok && res.data) {
        setCurrent(res.data);
        setDomain(res.data.custom_domain ?? '');
        if (res.data.cname_target) setCname(res.data.cname_target);
      }
      setLoading(false);
    });
  }, [token]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setVerifyMsg(null);
    const res = await portalApi.setDomain(domain.trim(), token);
    setBusy(false);
    if (!res.ok) { setError(res.error?.message ?? 'Failed to save domain'); return; }
    setCurrent({ custom_domain: res.data.custom_domain, domain_verified: 0 });
    if (res.data.cname_target) setCname(res.data.cname_target);
  };

  const checkDns = async () => {
    setVerifying(true);
    setVerifyMsg(null);
    const res = await portalApi.verifyDomain(token);
    setVerifying(false);
    if (!res.ok) {
      setVerifyMsg({ type: 'error', text: res.error?.message ?? 'Verification check failed' });
      return;
    }
    if (res.data.verified) {
      setCurrent(prev => prev ? { ...prev, domain_verified: 1 } : null);
      setVerifyMsg({ type: 'success', text: res.data.message });
    } else {
      setVerifyMsg({ type: 'warning', text: res.data.message });
    }
  };

  const remove = async () => {
    setBusy(true);
    await portalApi.removeDomain(token);
    setCurrent({ custom_domain: null, domain_verified: 0 });
    setDomain('');
    setVerifyMsg(null);
    setBusy(false);
  };

  if (loading) return <div className="flex justify-center py-24"><div className="spinner" /></div>;

  const fallback = `${window.location.origin}/read/${slug}`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-700 tracking-tight">Custom Domain</h1>
        <p className="mt-1 text-sm text-muted-foreground">Serve your reader edition from your own domain.</p>
      </div>

      {current?.custom_domain && (
        <Card className={current.domain_verified ? 'border-green-500/30' : 'border-amber-500/30'}>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-mono text-sm font-600">{current.custom_domain}</div>
                  <div className="mt-0.5">
                    {current.domain_verified
                      ? <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" /> Verified & Live</Badge>
                      : <Badge variant="warning"><AlertCircle className="mr-1 h-3 w-3" /> Pending DNS</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={checkDns} disabled={verifying}>
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${verifying ? 'animate-spin' : ''}`} />
                  {verifying ? 'Checking...' : 'Check DNS & SSL'}
                </Button>
                <Button variant="secondary" size="sm" onClick={remove} disabled={busy}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>
              </div>
            </div>

            {verifyMsg && (
              <div className={`rounded-md border px-3.5 py-2.5 text-sm ${
                verifyMsg.type === 'success'
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : verifyMsg.type === 'warning'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-400'
              }`}>
                {verifyMsg.text}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{current?.custom_domain ? 'Update domain' : 'Connect a domain'}</CardTitle>
          <CardDescription>Enter the domain (or subdomain) your readers will visit.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Domain</Label>
              <Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="epaper.ranbheri.co.in" className="font-mono" />
            </div>
            {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Domain'}</Button>
          </form>
        </CardContent>
      </Card>

      {current?.custom_domain && (
        <Card>
          <CardHeader>
            <CardTitle>DNS Setup Instructions</CardTitle>
            <CardDescription>Add this CNAME record at your DNS provider, then click "Check DNS & SSL" above.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-2.5 rounded-lg border border-border p-4 font-mono text-sm bg-muted/20">
              <span className="text-muted-foreground">Type</span><span className="font-600">CNAME</span>
              <span className="text-muted-foreground">Name</span><span>{current.custom_domain.split('.')[0] || '@'}</span>
              <span className="text-muted-foreground">Target</span>
              <span className="flex items-center justify-between gap-2 font-600 text-primary">
                <span>{cname}</span>
                <button type="button" onClick={() => navigator.clipboard.writeText(cname)} className="text-muted-foreground hover:text-foreground">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Once your DNS CNAME points to <code className="text-foreground">{cname}</code>, Cloudflare automatically provisions a free SSL/TLS certificate so readers can securely browse your newspaper on <code className="text-foreground">https://{current.custom_domain}</code>.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Fallback Reader Link</CardTitle>
          <CardDescription>Always available, no DNS required.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 font-mono text-xs">
            <span className="truncate text-muted-foreground">{fallback}</span>
            <div className="flex items-center gap-2">
              <a href={fallback} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(fallback)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { readerApi } from '../lib/api';
import { formatINR } from '../lib/utils';
import { ReaderSession, loadRazorpay } from './lib';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Lock, ChevronLeft, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';

interface Props { slug: string; session: ReaderSession | null; onRequireAuth: () => void; }

const INTERVAL_LABEL: Record<string, string> = { monthly: 'Monthly', '6month': '6 Months', '12month': '12 Months' };

export function PaperViewer({ slug, session, onRequireAuth }: Props) {
  const { id } = useParams<{ id: string }>();
  const [paper, setPaper] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [blobType, setBlobType] = useState<'pdf' | 'image'>('pdf');
  const [locked, setLocked] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [plans, setPlans] = useState<any[]>([]);

  const loadPaper = useCallback(async () => {
    if (!id) return;
    const res = await readerApi.getPaper(slug, id, session?.token);
    if (res.ok && res.data) setPaper(res.data);
    const pl = await readerApi.getPlans(slug);
    if (pl.ok && pl.data) setPlans(pl.data.items ?? []);
  }, [slug, id, session]);

  useEffect(() => { loadPaper(); }, [loadPaper]);

  // Fetch the current page with the reader's auth header; a locked page yields 401/402.
  useEffect(() => {
    if (!id || !paper) return;
    let revoked: string | null = null;
    let cancelled = false;
    setPageLoading(true); setLocked(false); setPageUrl(null);
    (async () => {
      const res = await fetch(readerApi.pageUrl(slug, id, page), {
        headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
      });
      if (cancelled) return;
      if (res.status === 401 || res.status === 402) { setLocked(true); setPageLoading(false); return; }
      if (!res.ok) { setPageLoading(false); return; }
      const blob = await res.blob();
      if (cancelled) return;
      setBlobType(blob.type.startsWith('image/') ? 'image' : 'pdf');
      revoked = URL.createObjectURL(blob);
      setPageUrl(revoked);
      setPageLoading(false);
    })();
    return () => { cancelled = true; if (revoked) URL.revokeObjectURL(revoked); };
  }, [slug, id, page, paper, session]);

  const tierPlans = plans.filter(p => !paper?.tier_id || p.tier_id === paper.tier_id);

  const subscribe = async (planId: string) => {
    if (!session) { onRequireAuth(); return; }
    const ok = await loadRazorpay();
    if (!ok) { alert('Could not load payment gateway'); return; }
    const orderRes = await readerApi.subscribe(slug, planId, session.token);
    if (!orderRes.ok || !orderRes.data) { alert(orderRes.error?.message ?? 'Could not start checkout'); return; }
    const { order_id, amount, currency, key_id } = orderRes.data;
    const rzp = new (window as any).Razorpay({
      key: key_id, amount, currency, order_id, name: 'Subscription',
      handler: async (resp: any) => {
        const v = await readerApi.verify(slug, {
          plan_id: planId,
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_signature: resp.razorpay_signature,
        }, session.token);
        if (v.ok) { setLocked(false); loadPaper(); setPage(page); }
        else alert(v.error?.message ?? 'Payment verification failed');
      },
      prefill: { email: session.reader.email },
      theme: { color: '#6366f1' },
    });
    rzp.open();
  };

  if (!paper) return <div className="flex justify-center py-24"><div className="spinner" /></div>;

  const total = paper.page_count || 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <Link to={`/read/${slug}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All papers</Link>
        <div className="text-center">
          <div className="font-serif text-lg font-700">{paper.title || paper.edition_title}</div>
          <div className="text-xs text-muted-foreground">{new Date(paper.publish_date).toLocaleDateString()}</div>
        </div>
        <div className="w-20 text-right">
          {paper.is_free ? <Badge variant="success">Free</Badge> : paper.unlocked ? <Badge variant="success">Unlocked</Badge> : <Badge variant="warning">Premium</Badge>}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="relative flex min-h-[70vh] items-center justify-center bg-black/40">
            {pageLoading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : locked ? (
              <div className="w-full max-w-md p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15"><Lock className="h-6 w-6 text-primary" /></div>
                <h3 className="font-serif text-xl font-700">Page {page} is for subscribers</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {paper.free_page_count > 0 ? `The first ${paper.free_page_count} page${paper.free_page_count > 1 ? 's are' : ' is'} free.` : 'This paper is premium.'} Subscribe to read the full issue.
                </p>
                {!session && <Button className="mt-4" onClick={onRequireAuth}>Sign in to continue</Button>}
                <div className="mt-5 space-y-2 text-left">
                  {tierPlans.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground">No subscription plans available yet.</p>
                  ) : tierPlans.map(p => {
                    const net = Math.round(p.price_paise * (1 - (p.offer_pct || 0) / 100));
                    return (
                      <button key={p.id} onClick={() => subscribe(p.id)}
                        className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50">
                        <div>
                          <div className="text-sm font-semibold">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.tier_name} · {INTERVAL_LABEL[p.interval] ?? p.interval}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-700">{formatINR(net)}</div>
                          {p.offer_pct > 0 && <div className="text-[0.65rem] text-green-400">{p.offer_label || `${p.offer_pct}% off`}</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : pageUrl ? (
              blobType === 'image' ? (
                <img
                  src={pageUrl}
                  alt={`Page ${page}`}
                  className="max-h-[75vh] w-full object-contain"
                />
              ) : (
                <iframe title={`Page ${page}`} src={`${pageUrl}#toolbar=0&navpanes=0`} className="h-[75vh] w-full" />
              )
            ) : (
              <div className="text-sm text-muted-foreground">Page unavailable</div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border p-3">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /> Prev</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {total}</span>
            <Button variant="secondary" size="sm" disabled={page >= total} onClick={() => setPage(p => Math.min(total, p + 1))}>Next <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

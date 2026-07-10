import React, { useEffect, useState, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Point pdfjs at the already-bundled local worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();
import { useParams, Link } from 'react-router-dom';
import { readerApi } from '../lib/api';
import { formatINR } from '../lib/utils';
import { ReaderSession, loadRazorpay } from './lib';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import {
  Lock, ChevronLeft, ChevronRight, ArrowLeft, Loader2,
  Archive, Sun, Moon, Sidebar, ZoomIn, ZoomOut, RotateCcw,
  Crop, Share2, Layers, Newspaper, ExternalLink, Smartphone, Monitor
} from 'lucide-react';
import { ArticleClipModal, ArticleClip } from './ArticleClipModal';

interface Props {
  slug: string;
  basePath?: string;
  session: ReaderSession | null;
  orgName?: string;
  logoUrl?: string | null;
  onRequireAuth: () => void;
}

const INTERVAL_LABEL: Record<string, string> = { monthly: 'Monthly', '6month': '6 Months', '12month': '12 Months' };

export function PaperViewer({ slug, basePath = '', session, orgName, logoUrl, onRequireAuth }: Props) {
  const { id } = useParams<{ id: string }>();
  const [paper, setPaper] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [blobType, setBlobType] = useState<'pdf' | 'image'>('pdf');
  // Pre-rendered flat image of the current page (always PNG, used by clip modal)
  const [pageRenderedDataUrl, setPageRenderedDataUrl] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [plans, setPlans] = useState<any[]>([]);

  // Clickmasks for the current paper
  const [clickmasksByPage, setClickmasksByPage] = useState<Record<number, any[]>>({});
  const [selectedClip, setSelectedClip] = useState<ArticleClip | null>(null);

  // Theme state: light | dark | sepia
  const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');

  // Side Panel state: open/closed, active tab ('pages' | 'articles')
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelTab, setSidePanelTab] = useState<'pages' | 'articles'>('pages');

  // Archive Drawer state
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editions, setEditions] = useState<any[]>([]);

  // Zoom / Pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Custom Crop Tool state
  const [cropMode, setCropMode] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [activeCropRect, setActiveCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Mobile view mode: 'page' | 'article'
  const [mobileMode, setMobileMode] = useState<'page' | 'article'>('page');
  const [mobileArticleIndex, setMobileArticleIndex] = useState(0);

  // Touch Swipe navigation state
  const touchStartX = useRef<number | null>(null);

  const loadPaper = useCallback(async () => {
    if (!id) return;
    const res = await readerApi.getPaper(slug, id, session?.token);
    if (res.ok && res.data) {
      setPaper(res.data);
      // Map clickmasks if returned in pages
      if (res.data.pages) {
        const maskMap: Record<number, any[]> = {};
        res.data.pages.forEach((p: any) => {
          maskMap[p.page_no] = p.clickmasks || [];
        });
        setClickmasksByPage(maskMap);
      }
    }

    // Also fetch clickmasks directly if not in pages
    try {
      const masksRes = await readerApi.getClickmasks(slug, id);
      if (masksRes.ok && masksRes.data?.items) {
        const maskMap: Record<number, any[]> = {};
        masksRes.data.items.forEach((item: any) => {
          maskMap[item.page_no] = item.clickmasks || [];
        });
        setClickmasksByPage(maskMap);
      }
    } catch {}

    const pl = await readerApi.getPlans(slug);
    if (pl.ok && pl.data) setPlans(pl.data.items ?? []);

    const edsRes = await readerApi.getPublicEditions(slug);
    if (edsRes.ok && edsRes.data) setEditions(edsRes.data.items ?? []);
  }, [slug, id, session]);

  useEffect(() => {
    loadPaper();
  }, [loadPaper]);

  // Fetch page image or PDF blob
  useEffect(() => {
    if (!id || !paper) return;
    let revoked: string | null = null;
    let cancelled = false;
    setPageLoading(true);
    setLocked(false);
    setPageUrl(null);
    setPageRenderedDataUrl(null);

    (async () => {
      const res = await fetch(readerApi.pageUrl(slug, id, page), {
        headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
      });
      if (cancelled) return;
      if (res.status === 401 || res.status === 402) {
        setLocked(true);
        setPageLoading(false);
        return;
      }
      if (!res.ok) {
        setPageLoading(false);
        return;
      }
      const blob = await res.blob();
      if (cancelled) return;
      const isImage = blob.type.startsWith('image/');
      setBlobType(isImage ? 'image' : 'pdf');
      revoked = URL.createObjectURL(blob);
      setPageUrl(revoked);
      setPageLoading(false);

      // Render page to a flat PNG data URL so ArticleClipModal can crop it reliably.
      try {
        if (isImage) {
          // For image pages, just draw into a canvas
          const imgEl = new Image();
          imgEl.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            imgEl.onload = () => resolve();
            imgEl.onerror = () => reject();
            imgEl.src = revoked!;
          });
          if (cancelled) return;
          const canvas = document.createElement('canvas');
          canvas.width = imgEl.naturalWidth;
          canvas.height = imgEl.naturalHeight;
          canvas.getContext('2d')!.drawImage(imgEl, 0, 0);
          if (!cancelled) setPageRenderedDataUrl(canvas.toDataURL('image/png'));
        } else {
          // For PDF pages, use pdfjs to render at 2.5x for crisp clipping
          const arrayBuffer = await blob.arrayBuffer();
          if (cancelled) return;
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          if (cancelled) return;
          const pdfPage = await pdf.getPage(1);
          if (cancelled) return;
          const viewport = pdfPage.getViewport({ scale: 2.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (!cancelled) setPageRenderedDataUrl(canvas.toDataURL('image/png'));
        }
      } catch (e) {
        console.warn('Could not pre-render page for clipping:', e);
      }
    })();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [slug, id, page, paper, session]);

  const total = paper?.page_count || 1;
  const currentClickmasks = clickmasksByPage[page] || [];

  // All articles across all pages
  const allArticles = Object.entries(clickmasksByPage).flatMap(([pageNo, masks]) =>
    masks.map((m, idx) => ({ ...m, page_no: Number(pageNo), idx }))
  );

  const tierPlans = plans.filter(p => !paper?.tier_id || p.tier_id === paper.tier_id);

  const subscribe = async (planId: string) => {
    if (!session) {
      onRequireAuth();
      return;
    }
    const ok = await loadRazorpay();
    if (!ok) {
      alert('Could not load payment gateway');
      return;
    }
    const orderRes = await readerApi.subscribe(slug, planId, session.token);
    if (!orderRes.ok || !orderRes.data) {
      alert(orderRes.error?.message ?? 'Could not start checkout');
      return;
    }
    const { order_id, amount, currency, key_id } = orderRes.data;
    const rzp = new (window as any).Razorpay({
      key: key_id,
      amount,
      currency,
      order_id,
      name: 'Subscription',
      handler: async (resp: any) => {
        const v = await readerApi.verify(
          slug,
          {
            plan_id: planId,
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          },
          session.token
        );
        if (v.ok) {
          setLocked(false);
          loadPaper();
          setPage(page);
        } else {
          alert(v.error?.message ?? 'Payment verification failed');
        }
      },
      prefill: { email: session.reader.email },
      theme: { color: '#6366f1' },
    });
    rzp.open();
  };

  // Crop drawing mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropMode || !imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCropStart({ x, y });
    setActiveCropRect({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropMode || !cropStart || !imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const currX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    const x = Math.min(cropStart.x, currX);
    const y = Math.min(cropStart.y, currY);
    const w = Math.abs(currX - cropStart.x);
    const h = Math.abs(currY - cropStart.y);
    setActiveCropRect({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (!cropMode || !activeCropRect) return;
    if (activeCropRect.w > 4 && activeCropRect.h > 4) {
      setSelectedClip({
        title: 'Custom Cropped Clip',
        content: `Cropped selection from Page ${page} of ${paper?.title}`,
        ...activeCropRect,
      });
      setCropMode(false);
    }
    setActiveCropRect(null);
    setCropStart(null);
  };

  // Mobile Swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(deltaX) > 60) {
      if (deltaX < 0 && page < total) {
        setPage(p => p + 1);
      } else if (deltaX > 0 && page > 1) {
        setPage(p => p - 1);
      }
    }
    touchStartX.current = null;
  };

  if (!paper) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  const themeBg =
    theme === 'dark'
      ? 'bg-neutral-950 text-neutral-100'
      : theme === 'sepia'
      ? 'bg-[#fbf0d9] text-[#433422]'
      : 'bg-background text-foreground';

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${themeBg}`}>
      {/* ── 1. Branding & Feature Action Header ───────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md px-4 py-2.5 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidePanelOpen(true)}
              title="Toggle Paper Sidebar"
              className="h-9 w-9"
            >
              <Sidebar className="h-5 w-5" />
            </Button>

            <Link to={basePath || '/'} className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-600 overflow-hidden flex-shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt={orgName || slug} className="h-full w-full object-cover" />
                ) : (
                  <Newspaper className="h-4 w-4 text-white" />
                )}
              </div>
              <div>
                <div className="font-serif text-sm font-bold leading-tight">
                  {paper.title || paper.edition_title || orgName}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(paper.publish_date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
              </div>
            </Link>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            {/* Zoom / Crop controls */}
            <div className="hidden sm:flex items-center gap-1 border rounded-lg p-0.5 bg-muted/30">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomLevel(z => Math.max(0.6, Number((z - 0.2).toFixed(2))))}
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs font-mono px-1 min-w-[40px] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomLevel(z => Math.min(2.5, Number((z + 0.2).toFixed(2))))}
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomLevel(1)}
                title="Reset Zoom"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Crop & Share Tool button */}
            <Button
              variant={cropMode ? 'default' : 'outline'}
              size="sm"
              className="gap-1 text-xs h-8"
              onClick={() => setCropMode(m => !m)}
            >
              <Crop className="w-3.5 h-3.5" />
              {cropMode ? 'Cancel Crop' : 'Crop & Share'}
            </Button>

            {/* Archive Drawer Button */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => setArchiveOpen(true)}
            >
              <Archive className="w-3.5 h-3.5" />
              Archive
            </Button>

            {/* Theme Selector */}
            <div className="flex items-center border rounded-lg overflow-hidden bg-muted/20">
              <Button
                variant={theme === 'light' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setTheme('light')}
                title="Light Mode"
              >
                <Sun className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={theme === 'dark' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setTheme('dark')}
                title="Dark Mode"
              >
                <Moon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={theme === 'sepia' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2 text-[10px] font-serif"
                onClick={() => setTheme('sepia')}
                title="Sepia Mode"
              >
                Sepia
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ── 2. Main Studio View area ──────────────────────────────────── */}
      <main className="flex-1 relative flex overflow-hidden">
        {/* Paper Studio Canvas */}
        <div
          className="flex-1 overflow-auto flex flex-col items-center justify-start p-4 md:p-6"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {cropMode && (
            <div className="mb-3 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium animate-pulse">
              Drag anywhere on Page {page} to crop &amp; share a clip
            </div>
          )}

          <div className="w-full max-w-4xl">
            {pageLoading ? (
              <div className="flex min-h-[70vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : locked ? (
              <Card className="overflow-hidden">
                <CardContent className="p-8 text-center min-h-[60vh] flex flex-col items-center justify-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
                    <Lock className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-serif text-xl font-bold">Page {page} is for subscribers</h3>
                  <p className="mt-1 text-sm text-muted-foreground max-w-md">
                    {paper.free_page_count > 0
                      ? `The first ${paper.free_page_count} page${paper.free_page_count > 1 ? 's are' : ' is'} free.`
                      : 'This paper is premium.'}{' '}
                    Subscribe to read the full issue.
                  </p>
                  {!session && (
                    <Button className="mt-4" onClick={onRequireAuth}>
                      Sign in to continue
                    </Button>
                  )}
                  <div className="mt-6 w-full max-w-md space-y-2 text-left">
                    {tierPlans.map(p => {
                      const net = Math.round(p.price_paise * (1 - (p.offer_pct || 0) / 100));
                      return (
                        <button
                          key={p.id}
                          onClick={() => subscribe(p.id)}
                          className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50"
                        >
                          <div>
                            <div className="text-sm font-semibold">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.tier_name} · {INTERVAL_LABEL[p.interval] ?? p.interval}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">{formatINR(net)}</div>
                            {p.offer_pct > 0 && (
                              <div className="text-[0.65rem] text-green-400">
                                {p.offer_label || `${p.offer_pct}% off`}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : pageUrl ? (
              <div
                ref={imageContainerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className="relative mx-auto transition-transform origin-top select-none shadow-2xl rounded bg-white overflow-hidden"
                style={{
                  transform: `scale(${zoomLevel})`,
                  cursor: cropMode ? 'crosshair' : 'default',
                }}
              >
                {blobType === 'image' ? (
                  <img
                    src={pageUrl}
                    alt={`Page ${page}`}
                    className="w-full h-auto block pointer-events-none"
                  />
                ) : (
                  <iframe
                    title={`Page ${page}`}
                    src={`${pageUrl}#toolbar=0&navpanes=0`}
                    className="h-[80vh] w-full block"
                  />
                )}

                {/* Interactive Clickmask Polygons / Article Overlays */}
                {!cropMode &&
                  currentClickmasks.map((mask, i) => (
                    <div
                      key={mask.id || i}
                      onClick={e => {
                        e.stopPropagation();
                        if (pageUrl) {
                          setSelectedClip({
                            title: mask.title,
                            content: mask.content,
                            x: mask.x,
                            y: mask.y,
                            w: mask.w,
                            h: mask.h,
                          });
                        }
                      }}
                      className="absolute border-2 border-transparent hover:border-primary/80 hover:bg-primary/15 transition-all cursor-pointer group z-10"
                      style={{
                        left: `${mask.x}%`,
                        top: `${mask.y}%`,
                        width: `${mask.w}%`,
                        height: `${mask.h}%`,
                      }}
                      title={mask.title || 'Click to zoom & share article'}
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-0 left-0 right-0 bg-black/80 text-white text-[10px] px-1.5 py-0.5 truncate">
                        {mask.title || 'Click to Zoom & Share'}
                      </div>
                    </div>
                  ))}

                {/* Active Custom Crop Box */}
                {activeCropRect && (
                  <div
                    className="absolute border-2 border-dashed border-primary bg-primary/25 pointer-events-none z-30"
                    style={{
                      left: `${activeCropRect.x}%`,
                      top: `${activeCropRect.y}%`,
                      width: `${activeCropRect.w}%`,
                      height: `${activeCropRect.h}%`,
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="text-center py-24 text-muted-foreground">Page unavailable</div>
            )}
          </div>
        </div>
      </main>

      {/* ── 3. Interactive Pagination Bar (Sticky Bottom) ──────────────── */}
      <footer className="sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md px-4 py-2.5 shadow-lg">
        <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>

          {/* Page Number Pills / Slider */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-[60vw] py-1">
            {Array.from({ length: total }, (_, i) => i + 1).map(pNum => (
              <button
                key={pNum}
                onClick={() => setPage(pNum)}
                className={`h-7 min-w-[28px] px-2 rounded-md text-xs font-semibold transition-all ${
                  pNum === page
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                }`}
              >
                {pNum}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            disabled={page >= total}
            onClick={() => setPage(p => Math.min(total, p + 1))}
            className="gap-1.5"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </footer>

      {/* ── 4. Paper Side Panel Drawer (Pages & Article Clips) ────────── */}
      <Sheet open={sidePanelOpen} onOpenChange={setSidePanelOpen}>
        <SheetContent side="left" className="w-80 sm:w-96 p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="font-serif text-lg">Paper Navigation</SheetTitle>
            <div className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-lg mt-2">
              <button
                onClick={() => setSidePanelTab('pages')}
                className={`py-1.5 text-xs font-medium rounded-md transition-all ${
                  sidePanelTab === 'pages' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Pages ({total})
              </button>
              <button
                onClick={() => setSidePanelTab('articles')}
                className={`py-1.5 text-xs font-medium rounded-md transition-all ${
                  sidePanelTab === 'articles' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Articles ({allArticles.length})
              </button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {sidePanelTab === 'pages' ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: total }, (_, i) => i + 1).map(pNum => (
                  <div
                    key={pNum}
                    onClick={() => {
                      setPage(pNum);
                      setSidePanelOpen(false);
                    }}
                    className={`border rounded-lg p-2 cursor-pointer transition-all ${
                      pNum === page ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'hover:border-primary/50'
                    }`}
                  >
                    <div className="aspect-[1/1.4] bg-muted/40 rounded flex items-center justify-center text-muted-foreground text-xs font-bold mb-1.5">
                      Page {pNum}
                    </div>
                    <div className="text-[11px] font-medium text-center">Page {pNum}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {allArticles.length === 0 ? (
                  <div className="text-center py-12 text-xs text-muted-foreground">
                    No clickmasked articles defined yet for this issue.
                  </div>
                ) : (
                  allArticles.map((art, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setPage(art.page_no);
                        setSidePanelOpen(false);
                        if (pageUrl) {
                          setSelectedClip({
                            title: art.title,
                            content: art.content,
                            x: art.x,
                            y: art.y,
                            w: art.w,
                            h: art.h,
                          });
                        }
                      }}
                      className="p-3 rounded-lg border hover:border-primary/50 cursor-pointer transition-colors space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Page {art.page_no}</span>
                        <Share2 className="w-3 h-3" />
                      </div>
                      <div className="text-sm font-semibold">{art.title || `Article #${idx + 1}`}</div>
                      {art.content && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{art.content}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── 5. Archive Drawer (Past Editions / Issues) ────────────────── */}
      <Sheet open={archiveOpen} onOpenChange={setArchiveOpen}>
        <SheetContent side="right" className="w-80 sm:w-96 p-4 flex flex-col">
          <SheetHeader>
            <SheetTitle className="font-serif text-lg">Newspaper Archive</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex-1 overflow-y-auto space-y-3">
            <Link
              to={basePath || '/'}
              onClick={() => setArchiveOpen(false)}
              className="block p-3 rounded-lg border hover:bg-muted/40 transition-colors"
            >
              <div className="font-serif font-bold text-sm">Browse Full Edition Catalog &rarr;</div>
              <div className="text-xs text-muted-foreground">View all past publications &amp; dates</div>
            </Link>

            <div className="text-xs font-semibold text-muted-foreground uppercase pt-2">
              Available Editions
            </div>
            {editions.map(ed => (
              <div key={ed.id} className="p-3 rounded-lg border bg-muted/10">
                <div className="text-sm font-medium">{ed.title}</div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── 6. Article Clip Zoom & Share Modal ────────────────────────── */}
      {selectedClip && pageRenderedDataUrl && (
        <ArticleClipModal
          slug={slug}
          paper={paper}
          pageNumber={page}
          imageUrl={pageRenderedDataUrl}
          clip={selectedClip}
          onClose={() => setSelectedClip(null)}
        />
      )}
    </div>
  );
}

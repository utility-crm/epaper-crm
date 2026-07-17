import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { readerApi, API_BASE_URL } from '../lib/api';
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
import { DedicatedClipView } from './DedicatedClipView';
import { MobileArticleCard } from './MobileArticleCard';

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
  const [page, setPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('page');
      return p ? Math.max(1, parseInt(p, 10) || 1) : 1;
    }
    return 1;
  });
  const [pageLoading, setPageLoading] = useState(true);
  const [plans, setPlans] = useState<any[]>([]);

  const currentPageData = paper?.pages?.[page - 1];
  const pageUrl = currentPageData?.image_url ? `${API_BASE_URL}${currentPageData.image_url}` : null;
  const locked = currentPageData?.is_locked ?? false;

  useEffect(() => {
    if (pageUrl) {
      setPageLoading(true);
      const img = new Image();
      img.onload = () => setPageLoading(false);
      img.onerror = () => setPageLoading(false);
      img.src = pageUrl;
    }
  }, [pageUrl]);

  // Clickmasks for the current paper
  const [clickmasksByPage, setClickmasksByPage] = useState<Record<number, any[]>>({});
  const [selectedClip, setSelectedClip] = useState<ArticleClip | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const clipParam = params.get('clip');
      if (clipParam) {
        const parts = clipParam.split(',').map(Number);
        if (parts.length === 4 && parts.every(n => !isNaN(n))) {
          return {
            x: parts[0],
            y: parts[1],
            w: parts[2],
            h: parts[3],
            title: params.get('title') || 'Shared Clip'
          };
        }
      }
    }
    return null;
  });

  const [isDedicatedClipView, setIsDedicatedClipView] = useState<boolean>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('clip')
  );

  // View state: 'articles' (card-by-card) on mobile (<768px) or 'fullpage' on desktop (>=768px)
  const [mobileViewMode, setMobileViewMode] = useState<'articles' | 'fullpage'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'articles' : 'fullpage'
  );
  const [mobileArticleIdx, setMobileArticleIdx] = useState<number>(0);

  useEffect(() => {
    setMobileArticleIdx(0);
    setMobileViewMode(typeof window !== 'undefined' && window.innerWidth < 768 ? 'articles' : 'fullpage');
  }, [page]);

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

  // Canvas ref used to display PDF pages (avoids iframe coordinate mismatch)
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);

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
        setClickmasksByPage(prev => ({ ...prev, ...maskMap }));
      }
    } else {
      setPageLoading(false);
      return;
    }

    // Also fetch clickmasks directly if not in pages
    try {
      const masksRes = await readerApi.getClickmasks(slug, id);
      if (masksRes.ok && masksRes.data?.items) {
        const maskMap: Record<number, any[]> = {};
        masksRes.data.items.forEach((item: any) => {
          maskMap[item.page_no] = item.clickmasks || [];
        });
        setClickmasksByPage(prev => ({ ...prev, ...maskMap }));
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
    const { subscription_id, key_id } = orderRes.data;
    const rzp = new (window as any).Razorpay({
      key: key_id,
      subscription_id,
      name: 'Subscription',
      handler: async (resp: any) => {
        const v = await readerApi.verify(
          slug,
          {
            plan_id: planId,
            razorpay_subscription_id: resp.razorpay_subscription_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          },
          session.token
        );
        if (v.ok) {
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

  const getContainerCoordsPercent = (clientX: number, clientY: number) => {
    if (!imageContainerRef.current) return { x: 0, y: 0 };
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  // Crop drawing mouse & touch handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropMode) return;
    const { x, y } = getContainerCoordsPercent(e.clientX, e.clientY);
    setCropStart({ x, y });
    setActiveCropRect({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropMode || !cropStart) return;
    const { x: currX, y: currY } = getContainerCoordsPercent(e.clientX, e.clientY);
    const x = Math.min(cropStart.x, currX);
    const y = Math.min(cropStart.y, currY);
    const w = Math.abs(currX - cropStart.x);
    const h = Math.abs(currY - cropStart.y);
    setActiveCropRect({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (!cropMode || !activeCropRect) return;
    if (activeCropRect.w > 2 && activeCropRect.h > 2) {
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

  const handleCropTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!cropMode || e.touches.length !== 1) return;
    e.stopPropagation();
    const { x, y } = getContainerCoordsPercent(e.touches[0].clientX, e.touches[0].clientY);
    setCropStart({ x, y });
    setActiveCropRect({ x, y, w: 0, h: 0 });
  };

  const handleCropTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!cropMode || !cropStart || e.touches.length !== 1) return;
    e.stopPropagation();
    const { x: currX, y: currY } = getContainerCoordsPercent(e.touches[0].clientX, e.touches[0].clientY);
    const x = Math.min(cropStart.x, currX);
    const y = Math.min(cropStart.y, currY);
    const w = Math.abs(currX - cropStart.x);
    const h = Math.abs(currY - cropStart.y);
    setActiveCropRect({ x, y, w, h });
  };

  const handleCropTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!cropMode) return;
    e.stopPropagation();
    if (activeCropRect && activeCropRect.w > 2 && activeCropRect.h > 2) {
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
    if (cropMode) return;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (cropMode) return;
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

  if (isDedicatedClipView && selectedClip) {
    return (
      <DedicatedClipView
        slug={slug}
        paper={paper}
        pageNumber={page}
        clip={selectedClip}
        onReadFullPaper={() => {
          setIsDedicatedClipView(false);
          setSelectedClip(null);
          if (typeof window !== 'undefined') {
            const u = new URL(window.location.href);
            u.searchParams.delete('clip');
            u.searchParams.delete('title');
            window.history.replaceState(null, '', u.pathname + u.search);
          }
        }}
      />
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

            <Link to={basePath || '/'} className="flex items-center gap-2.5">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={orgName || slug}
                  className="h-9 sm:h-10 w-auto max-w-[180px] object-contain flex-shrink-0"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-600 flex-shrink-0">
                  <Newspaper className="h-4 w-4 text-white" />
                </div>
              )}
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
            <Link
              to={`${basePath || '/'}?archive=true`}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              title="All Editions & Past Dates"
            >
              📅 Archives
            </Link>

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

            {/* View Mode Toggle (Article vs Full Page) */}
            {currentClickmasks.length > 0 && (
              <div className="flex items-center border rounded-lg p-0.5 bg-muted/30 text-xs">
                <Button
                  variant={mobileViewMode === 'articles' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-[11px] gap-1"
                  onClick={() => setMobileViewMode('articles')}
                >
                  <Smartphone className="w-3 h-3" />
                  Articles ({currentClickmasks.length})
                </Button>
                <Button
                  variant={mobileViewMode === 'fullpage' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-[11px] gap-1"
                  onClick={() => setMobileViewMode('fullpage')}
                >
                  <Monitor className="w-3 h-3" />
                  Full Page
                </Button>
              </div>
            )}

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
              <div className="w-full aspect-[3/4] max-w-3xl mx-auto rounded-lg border border-border/80 bg-card p-6 md:p-10 shadow-lg flex flex-col justify-between animate-pulse transition-all">
                {/* Skeleton Masthead */}
                <div className="border-b border-border/60 pb-5 mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-4 w-32 rounded bg-muted"></div>
                    <div className="h-4 w-24 rounded bg-muted"></div>
                  </div>
                  <div className="h-8 w-3/4 mx-auto rounded bg-muted/80 mb-2"></div>
                  <div className="h-3 w-1/2 mx-auto rounded bg-muted/60"></div>
                </div>

                {/* Skeleton Newspaper Grid */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 mb-5">
                  <div className="md:col-span-8 flex flex-col gap-3">
                    <div className="h-6 w-5/6 rounded bg-muted/90"></div>
                    <div className="h-4 w-2/3 rounded bg-muted/70"></div>
                    <div className="w-full h-48 rounded bg-muted/80 my-2"></div>
                    <div className="space-y-2">
                      <div className="h-3 w-full rounded bg-muted/60"></div>
                      <div className="h-3 w-full rounded bg-muted/60"></div>
                      <div className="h-3 w-4/5 rounded bg-muted/60"></div>
                    </div>
                  </div>
                  <div className="md:col-span-4 flex flex-col gap-4 border-t md:border-t-0 md:border-l border-border/60 pt-4 md:pt-0 md:pl-5">
                    <div className="space-y-2">
                      <div className="h-4 w-full rounded bg-muted/80"></div>
                      <div className="h-3 w-full rounded bg-muted/60"></div>
                      <div className="h-3 w-3/4 rounded bg-muted/60"></div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 w-11/12 rounded bg-muted/80"></div>
                      <div className="h-20 w-full rounded bg-muted/70 my-1"></div>
                      <div className="h-3 w-full rounded bg-muted/60"></div>
                    </div>
                  </div>
                </div>

                {/* Skeleton Footer & Page Status */}
                <div className="border-t border-border/60 pt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="font-medium">Loading Page {page} of {total}...</span>
                  </div>
                  <span>ePaper Space Reader</span>
                </div>
              </div>
            ) : !paper ? (
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center text-muted-foreground gap-2">
                  <Newspaper className="h-10 w-10 opacity-20" />
                  <p>Paper could not be loaded</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.href = basePath || '/'}>Go Back Home</Button>
                </div>
              </div>
            ) : locked ? (
              <Card className="overflow-hidden relative w-full max-w-4xl mx-auto aspect-[3/4] border-border/80 shadow-lg">
                {pageUrl && (
                  <div 
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60"
                    style={{ backgroundImage: `url(${pageUrl})` }} 
                  />
                )}
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10" />
                <CardContent className="relative z-20 h-full p-8 text-center flex flex-col items-center justify-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 shadow-sm">
                    <Lock className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-serif text-2xl font-bold">Page {page} is Premium</h3>
                  <p className="mt-2 text-sm text-foreground/80 max-w-md font-medium">
                    {paper.free_page_count > 0
                      ? `The first ${paper.free_page_count} page${paper.free_page_count > 1 ? 's are' : ' is'} free.`
                      : 'This paper is premium.'}{' '}
                    Subscribe to read the full issue.
                  </p>
                  {!session && (
                    <Button className="mt-6" size="lg" onClick={onRequireAuth}>
                      Sign in to continue
                    </Button>
                  )}
                  <div className="mt-6 w-full max-w-md space-y-2 text-left">
                    {tierPlans.map(p => {
                      const net = Math.round(p.price_paise * (1 - (p.offer_pct || 0) / 100));
                      const finalPaise = Math.round(net * (1 + (p.tax_percentage || 0) / 100));
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
                              {p.tax_percentage > 0 && ` · incl. ${p.tax_percentage}% tax`}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">{formatINR(finalPaise)}</div>
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
              <>
                {/* ── Single-Article Card View ── */}
                {mobileViewMode === 'articles' && currentClickmasks.length > 0 && (
                  <div className="w-full">
                    <MobileArticleCard
                      pageUrl={pageUrl}
                      mask={currentClickmasks[mobileArticleIdx] || currentClickmasks[0]}
                      articleIndex={mobileArticleIdx}
                      totalArticles={currentClickmasks.length}
                      onPrev={() => setMobileArticleIdx(i => Math.max(0, i - 1))}
                      onNext={() => setMobileArticleIdx(i => Math.min(currentClickmasks.length - 1, i + 1))}
                      onShare={() => {
                        const mask = currentClickmasks[mobileArticleIdx] || currentClickmasks[0];
                        if (mask) {
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
                      onViewFullPage={() => setMobileViewMode('fullpage')}
                    />
                  </div>
                )}

                {/* ── Full Page Interactive View ── */}
                <div
                  ref={imageContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onTouchStart={handleCropTouchStart}
                  onTouchMove={handleCropTouchMove}
                  onTouchEnd={handleCropTouchEnd}
                  className={`relative mx-auto transition-transform origin-top select-none shadow-2xl rounded bg-white overflow-hidden ${
                    mobileViewMode === 'articles' && currentClickmasks.length > 0 ? 'hidden' : 'block'
                  }`}
                  style={{
                    transform: `scale(${zoomLevel})`,
                    cursor: cropMode ? 'crosshair' : 'default',
                  }}
                >
                <img
                  src={pageUrl}
                  alt={`Page ${page}`}
                  className="w-full h-auto block pointer-events-none animate-in fade-in duration-300"
                />

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
            </>
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
      {selectedClip && pageUrl && (
        <ArticleClipModal
          slug={slug}
          paper={paper}
          pageNumber={page}
          imageUrl={pageUrl}
          clip={selectedClip}
          onClose={() => setSelectedClip(null)}
        />
      )}
    </div>
  );
}

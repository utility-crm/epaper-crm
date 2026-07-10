import React, { useEffect, useState, useRef } from 'react';
import { Button } from '../components/ui/button';
import { ChevronLeft, ChevronRight, Share2, Eye, Loader2 } from 'lucide-react';

interface Props {
  pageUrl: string;
  mask: {
    id?: string;
    title?: string;
    content?: string;
    x: number;
    y: number;
    w: number;
    h: number;
  };
  articleIndex: number;
  totalArticles: number;
  onPrev: () => void;
  onNext: () => void;
  onShare: () => void;
  onViewFullPage: () => void;
}

export function MobileArticleCard({
  pageUrl,
  mask,
  articleIndex,
  totalArticles,
  onPrev,
  onNext,
  onShare,
  onViewFullPage,
}: Props) {
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const touchStartRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCroppedUrl(null);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const sx = Math.max(0, (mask.x / 100) * img.naturalWidth);
      const sy = Math.max(0, (mask.y / 100) * img.naturalHeight);
      const sw = Math.max(10, (mask.w / 100) * img.naturalWidth);
      const sh = Math.max(10, (mask.h / 100) * img.naturalHeight);

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        if (!cancelled) {
          setCroppedUrl(canvas.toDataURL('image/png'));
          setLoading(false);
        }
      }
    };
    img.onerror = () => {
      if (!cancelled) setLoading(false);
    };
    img.src = pageUrl;

    return () => {
      cancelled = true;
    };
  }, [pageUrl, mask.x, mask.y, mask.w, mask.h]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartRef.current;
    if (diffX < -50 && articleIndex < totalArticles - 1) {
      onNext();
    } else if (diffX > 50 && articleIndex > 0) {
      onPrev();
    }
    touchStartRef.current = null;
  };

  return (
    <div
      className="w-full max-w-lg mx-auto flex flex-col gap-4 p-2"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Article Counter & Quick Share Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
            Article {articleIndex + 1} of {totalArticles}
          </span>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Swipe left/right to navigate
          </span>
        </div>

        <Button
          onClick={onShare}
          size="sm"
          className="gap-1.5 h-8 text-xs font-medium shadow-sm"
        >
          <Share2 className="w-3.5 h-3.5" />
          Zoom &amp; Share
        </Button>
      </div>

      {/* Cropped Article Display Card */}
      <div className="relative rounded-xl border bg-card shadow-md overflow-hidden transition-all">
        {loading || !croppedUrl ? (
          <div className="flex items-center justify-center min-h-[260px] bg-muted/20">
            <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <img
            src={croppedUrl}
            alt={mask.title || `Article ${articleIndex + 1}`}
            className="w-full h-auto block object-contain max-h-[75vh]"
          />
        )}
      </div>

      {/* Optional Title & Content Text */}
      {(mask.title || mask.content) && (
        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
          {mask.title && (
            <h3 className="font-serif text-lg font-bold text-foreground leading-snug">
              {mask.title}
            </h3>
          )}
          {mask.content && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {mask.content}
            </p>
          )}
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="grid grid-cols-3 items-center gap-2 pt-1">
        <Button
          variant="outline"
          onClick={onPrev}
          disabled={articleIndex === 0}
          className="gap-1 text-xs h-10"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </Button>

        <Button
          variant="ghost"
          onClick={onViewFullPage}
          className="text-xs h-10 text-muted-foreground hover:text-foreground gap-1"
        >
          <Eye className="w-3.5 h-3.5" />
          Full Page
        </Button>

        <Button
          variant="outline"
          onClick={onNext}
          disabled={articleIndex === totalArticles - 1}
          className="gap-1 text-xs h-10"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

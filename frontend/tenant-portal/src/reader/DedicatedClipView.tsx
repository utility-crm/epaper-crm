import React, { useEffect, useRef, useState } from 'react';
import { Download, Share2, Copy, Check, ArrowLeft, Newspaper } from 'lucide-react';
import { readerApi } from '../lib/api';
import { ArticleClip } from './ArticleClipModal';

interface Props {
  slug: string;
  paper: any;
  pageNumber: number;
  clip: ArticleClip;
  onReadFullPaper: () => void;
}

export function DedicatedClipView({ slug, paper, pageNumber, clip, onReadFullPaper }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const basePrefix = window.location.pathname.startsWith('/read') ? `/read/${slug}` : '';
  const clipParams = `?page=${pageNumber}&clip=${Math.round(clip.x)},${Math.round(clip.y)},${Math.round(clip.w)},${Math.round(clip.h)}&title=${encodeURIComponent(clip.title || paper.title || 'Clip')}`;
  const d = new Date(paper.publish_date);
  const dateSlug = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).replace(/\s+/g, '-').toLowerCase();
  const editionSlug = (paper.edition_title || 'edition').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const shareUrl = `${window.location.protocol}//${window.location.host}${basePrefix}/${dateSlug}/${editionSlug}/${paper.id}${clipParams}`;

  const clipTitle = clip.title || paper.title || 'Shared Clipping';
  const pubTitle = paper?.publication?.title || paper?.title || 'ePaper';

  useEffect(() => {
    let cancelled = false;

    const tryRender = (attempt = 0) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        if (attempt < 30 && !cancelled) {
          setTimeout(() => tryRender(attempt + 1), 30);
        }
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const directUrl = readerApi.pageUrl(slug, paper.id, pageNumber);

      const loadWithUrl = (url: string, useCors: boolean) => {
        const img = new Image();
        if (useCors && !url.startsWith('blob:') && !url.startsWith('data:')) {
          img.crossOrigin = 'anonymous';
        }

        img.onload = () => {
          if (cancelled) return;
          const naturalW = img.naturalWidth || 1000;
          const naturalH = img.naturalHeight || 1400;

          const sx = Math.max(0, Math.floor((clip.x / 100) * naturalW));
          const sy = Math.max(0, Math.floor((clip.y / 100) * naturalH));
          const sw = Math.max(30, Math.min(naturalW - sx, Math.ceil((clip.w / 100) * naturalW)));
          const sh = Math.max(30, Math.min(naturalH - sy, Math.ceil((clip.h / 100) * naturalH)));

          canvas.width = sw;
          canvas.height = sh;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sw, sh);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

          setImageLoaded(true);
        };

        img.onerror = () => {
          if (cancelled) return;
          if (useCors) {
            loadWithUrl(url, false);
          } else {
            setImageLoaded(true);
          }
        };

        img.src = url;
      };

      loadWithUrl(directUrl, true);
    };

    tryRender(0);

    return () => {
      cancelled = true;
    };
  }, [slug, paper.id, pageNumber, clip]);

  const downloadClip = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `${slug}-page-${pageNumber}-clip.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareViaDevice = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      if (navigator.share && navigator.canShare) {
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const file = new File([blob], `${slug}-clip.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: clipTitle,
              text: `${clipTitle} — Page ${pageNumber}`,
              url: shareUrl,
              files: [file],
            });
            return;
          }
          await navigator.share({
            title: clipTitle,
            text: `${clipTitle} — Page ${pageNumber}`,
            url: shareUrl,
          });
        }, 'image/png');
      } else {
        copyShareLink();
      }
    } catch (err) {
      console.log('Share aborted or failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onReadFullPaper}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-colors shrink-0 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Full ePaper</span>
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-foreground truncate">{pubTitle}</h1>
              <p className="text-xs text-muted-foreground truncate">Page {pageNumber} • Article Clipping</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadClip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-colors shadow-sm"
              title="Download PNG image"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={shareViaDevice}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors shadow-sm"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 flex flex-col items-center">
        <div className="w-full bg-card text-card-foreground border border-border rounded-xl overflow-hidden shadow-sm flex flex-col">
          {/* Clip Article Title & Badge */}
          <div className="p-5 sm:p-6 border-b border-border flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground leading-snug">{clipTitle}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Excerpt from {paper?.title || pubTitle} — Page {pageNumber}
              </p>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
              Page {pageNumber}
            </span>
          </div>

          {/* Rendered Clipped Canvas Image */}
          <div className="relative p-4 sm:p-8 bg-muted/40 flex items-center justify-center min-h-[280px]">
            {!imageLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Rendering clipped article...</span>
              </div>
            )}
            <canvas
              ref={canvasRef}
              className={`max-w-full h-auto rounded-lg shadow-md border border-border bg-white transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </div>

          {/* Action Footer */}
          <div className="p-5 sm:p-6 bg-card border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="bg-background border border-input rounded-md px-3 py-2 text-xs text-foreground flex-1 sm:w-72 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={copyShareLink}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-xs font-medium transition-colors shrink-0 shadow-sm"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>

            <button
              onClick={onReadFullPaper}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-sm shadow-sm transition-all"
            >
              <Newspaper className="w-4 h-4" />
              <span>Read Full Newspaper Page {pageNumber}</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '../components/ui/dialog';
import { Download, Share2, Copy, Check, ExternalLink, MessageCircle, Send, X } from 'lucide-react';
import { readerApi } from '../lib/api';

export interface ArticleClip {
  title?: string;
  content?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  slug: string;
  paper: any;
  pageNumber: number;
  imageUrl: string;
  clip: ArticleClip;
  onClose: () => void;
}

export function ArticleClipModal({ slug, paper, pageNumber, imageUrl, clip, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const basePrefix = window.location.pathname.startsWith('/read') ? `/read/${slug}` : '';
  const clipParams = `&clip=${Math.round(clip.x)},${Math.round(clip.y)},${Math.round(clip.w)},${Math.round(clip.h)}&title=${encodeURIComponent(clip.title || paper.title || 'Clip')}`;
  const shareUrl = `${window.location.protocol}//${window.location.host}${basePrefix}/paper/${paper.id}?page=${pageNumber}${clipParams}`;

  const shareText = `${clip.title || paper.title || 'E-Paper Article'} — Page ${pageNumber}`;

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
      const srcUrl = imageUrl || directUrl;

      const loadWithUrl = (url: string, useCors: boolean, fallbackUrl?: string) => {
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
            loadWithUrl(url, false, fallbackUrl);
          } else if (fallbackUrl && url !== fallbackUrl) {
            loadWithUrl(fallbackUrl, true);
          } else {
            setImageLoaded(true);
          }
        };

        img.src = url;
      };

      loadWithUrl(srcUrl, true, directUrl);
    };

    tryRender(0);

    return () => {
      cancelled = true;
    };
  }, [imageUrl, clip, slug, paper.id, pageNumber]);

  const downloadClip = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const a = document.createElement('a');
      a.download = `${(clip.title || 'article-clip').replace(/\s+/g, '-').toLowerCase()}-p${pageNumber}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch {
      window.open(imageUrl, '_blank');
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareOnWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const shareOnTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const shareOnFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const shareOnTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator.share({
        title: clip.title || paper.title,
        text: clip.content || shareText,
        url: shareUrl
      }).catch(() => {});
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-xl w-[94vw] p-0 overflow-hidden rounded-xl border bg-background shadow-2xl flex flex-col [&>button]:right-5 [&>button]:top-4.5 [&>button]:z-10">
        {/* Header: Share Clip title */}
        <div className="flex items-center px-5 py-4 border-b bg-muted/20">
          <div className="flex items-center gap-2.5 text-base font-bold text-foreground">
            <Share2 className="w-5 h-5 text-primary" />
            <span>Share Clip</span>
          </div>
        </div>

        {/* Main Cropped Image Container */}
        <div className="bg-muted/30 p-5 sm:p-6 flex items-center justify-center min-h-[220px] max-h-[50vh] overflow-auto">
          <div className="relative bg-white p-2 shadow-md rounded border inline-flex items-center justify-center max-w-full">
            <canvas
              ref={canvasRef}
              className={`max-w-full max-h-[42vh] object-contain block rounded transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground animate-pulse">
                Rendering clip...
              </div>
            )}
          </div>
        </div>

        {/* Direct Link Read-only Input Box */}
        <div className="px-5 sm:px-6 pt-5">
          <div className="flex items-center justify-between bg-muted/60 border rounded-lg px-3.5 py-2.5 text-xs font-mono text-foreground overflow-x-auto whitespace-nowrap select-all shadow-inner">
            <span>{shareUrl}</span>
          </div>
        </div>

        {/* Action Toolbar Icons (Bottom row exactly like the reference picture) */}
        <div className="px-5 sm:px-6 py-5 flex items-center justify-center flex-wrap gap-2.5 sm:gap-3">
          {/* Native Share / Share2 */}
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              onClick={handleNativeShare}
              title="Share via Device"
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow transition-all hover:scale-105 active:scale-95"
            >
              <Share2 className="w-5 h-5" />
            </button>
          )}

          {/* Download PNG */}
          <button
            onClick={downloadClip}
            title="Download PNG"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-slate-700 hover:bg-slate-800 text-white flex items-center justify-center shadow transition-all hover:scale-105 active:scale-95"
          >
            <Download className="w-5 h-5" />
          </button>

          {/* Copy Link */}
          <button
            onClick={copyShareLink}
            title={copied ? 'Copied Link!' : 'Copy Link'}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center shadow transition-all hover:scale-105 active:scale-95"
          >
            {copied ? <Check className="w-5 h-5 text-white" /> : <Copy className="w-5 h-5" />}
          </button>

          {/* Open Link in new tab */}
          <button
            onClick={() => window.open(shareUrl, '_blank')}
            title="Open Link"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center shadow transition-all hover:scale-105 active:scale-95"
          >
            <ExternalLink className="w-5 h-5" />
          </button>

          {/* Facebook */}
          <button
            onClick={shareOnFacebook}
            title="Share on Facebook"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow transition-all hover:scale-105 active:scale-95 font-bold text-base"
          >
            f
          </button>

          {/* X (Twitter) */}
          <button
            onClick={shareOnTwitter}
            title="Share on X (Twitter)"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center shadow transition-all hover:scale-105 active:scale-95 font-bold text-base"
          >
            𝕏
          </button>

          {/* WhatsApp */}
          <button
            onClick={shareOnWhatsApp}
            title="Share on WhatsApp"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow transition-all hover:scale-105 active:scale-95"
          >
            <MessageCircle className="w-5 h-5" />
          </button>

          {/* Telegram */}
          <button
            onClick={shareOnTelegram}
            title="Share on Telegram"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-sky-400 hover:bg-sky-500 text-white flex items-center justify-center shadow transition-all hover:scale-105 active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

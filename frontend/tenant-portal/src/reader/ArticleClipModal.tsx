import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Download, Share2, Copy, CheckCircle2, MessageCircle, Send, ExternalLink } from 'lucide-react';

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
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const basePrefix = window.location.pathname.startsWith('/read') ? `/read/${slug}` : '';
  const shareUrl = `${window.location.protocol}//${window.location.host}${basePrefix}/paper/${paper.id}?page=${pageNumber}`;

  const shareText = `${clip.title || paper.title || 'E-Paper Article'} — Page ${pageNumber}`;

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImageLoaded(true);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Crop coordinates in pixel space
      const sx = Math.max(0, (clip.x / 100) * img.naturalWidth);
      const sy = Math.max(0, (clip.y / 100) * img.naturalHeight);
      const sw = Math.max(10, (clip.w / 100) * img.naturalWidth);
      const sh = Math.max(10, (clip.h / 100) * img.naturalHeight);

      canvas.width = sw;
      canvas.height = sh;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      try {
        setDataUrl(canvas.toDataURL('image/png'));
      } catch {
        // May fail if crossOrigin tainted
      }
    };
    img.src = imageUrl;
  }, [imageUrl, clip]);

  const downloadClip = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `${(clip.title || 'article-clip').replace(/\s+/g, '-').toLowerCase()}-p${pageNumber}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 border-b bg-muted/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-serif">
                {clip.title || 'Article Clip / Cropped View'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Page {pageNumber} • {paper.title}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={downloadClip} className="gap-1.5 text-xs">
                <Download className="w-4 h-4" />
                Download PNG
              </Button>
              <Button size="sm" onClick={copyShareLink} className="gap-1.5 text-xs">
                {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy Link'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto flex flex-col md:flex-row">
          {/* Cropped Canvas View */}
          <div className="flex-1 bg-neutral-900/90 p-6 flex items-center justify-center overflow-auto min-h-[300px]">
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-[60vh] bg-white shadow-2xl rounded"
            />
          </div>

          {/* Sharing & Article Text Sidebar */}
          <div className="w-full md:w-80 border-l bg-background p-5 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-serif text-base font-bold">
                  {clip.title || 'Selected Section'}
                </h3>
                {clip.content && (
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    {clip.content}
                  </p>
                )}
              </div>

              <div className="space-y-3 pt-3 border-t">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Share Across Platforms
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border-emerald-500/30"
                    onClick={shareOnWhatsApp}
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 text-xs bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 border-sky-500/30"
                    onClick={shareOnTelegram}
                  >
                    <Send className="w-4 h-4" />
                    Telegram
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 text-xs"
                    onClick={shareOnTwitter}
                  >
                    X (Twitter)
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 text-xs"
                    onClick={shareOnFacebook}
                  >
                    Facebook
                  </Button>
                </div>

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full gap-2 text-xs mt-2"
                    onClick={handleNativeShare}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share via Device...
                  </Button>
                )}
              </div>
            </div>

            <div className="border-t pt-4 text-center">
              <span className="text-[11px] text-muted-foreground block">
                Direct link to Page {pageNumber}
              </span>
              <div className="mt-1 flex items-center justify-center gap-1 font-mono text-[10px] text-muted-foreground truncate bg-muted/40 p-1.5 rounded">
                {shareUrl}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

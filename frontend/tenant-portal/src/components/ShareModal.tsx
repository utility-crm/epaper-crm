import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from './ui/button';
import { Download, Copy, CheckCircle2 } from 'lucide-react';

interface Props {
  slug: string;
  paper: any;
  onClose: () => void;
}

export function ShareModal({ slug, paper, onClose }: Props) {
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const isWorkersDev = window.location.hostname.includes('workers.dev') || window.location.hostname === 'localhost';
  const d = new Date(paper.publish_date);
  const dateSlug = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).replace(/\s+/g, '-').toLowerCase();
  const editionSlug = (paper.edition_title || 'edition').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  
  const shareUrl = isWorkersDev 
    ? `${window.location.protocol}//${window.location.host}/tenant/${slug}/${dateSlug}/${editionSlug}/${paper.id}`
    : `${window.location.protocol}//${window.location.host}/${dateSlug}/${editionSlug}/${paper.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQR = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (ctx) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        const a = document.createElement('a');
        a.download = `QR-${slug}-${paper.id}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Share Paper</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Permanent Link</Label>
              <div className="flex gap-2">
                <Input readOnly value={shareUrl} className="text-xs font-mono" />
                <Button variant="outline" size="icon" onClick={copyLink} className="shrink-0">
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-base">Customize QR Code</Label>
              
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Foreground Color</Label>
                <div className="flex gap-3">
                  <Input type="color" value={fgColor} onChange={e => setFgColor(e.target.value)} className="w-12 p-1 h-9" />
                  <Input type="text" value={fgColor} onChange={e => setFgColor(e.target.value)} className="flex-1 font-mono text-sm uppercase" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Background Color</Label>
                <div className="flex gap-3">
                  <Input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-12 p-1 h-9" />
                  <Input type="text" value={bgColor} onChange={e => setBgColor(e.target.value)} className="flex-1 font-mono text-sm uppercase" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center space-y-6 border rounded-xl p-6 bg-muted/10">
            <div className="bg-white p-4 rounded-xl shadow-sm border">
              <QRCodeSVG
                value={shareUrl}
                size={200}
                fgColor={fgColor}
                bgColor={bgColor}
                level="H"
                includeMargin={false}
                ref={svgRef}
              />
            </div>
            
            <Button onClick={downloadQR} className="w-full gap-2">
              <Download className="w-4 h-4" />
              Download PNG
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

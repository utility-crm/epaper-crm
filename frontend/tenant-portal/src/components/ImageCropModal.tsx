import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Crop,
  Check,
  X,
  Maximize2,
} from 'lucide-react';

interface Props {
  open: boolean;
  imageFile: File | null;
  title?: string;
  onClose: () => void;
  onSave: (croppedFile: File, previewUrl: string) => void;
}

type AspectRatioMode = 'free' | '1:1' | '4:1' | '16:9' | 'full';

export function ImageCropModal({
  open,
  imageFile,
  title = 'Crop & Adjust Image',
  onClose,
  onSave,
}: Props) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [aspectMode, setAspectMode] = useState<AspectRatioMode>('free');

  // Crop box normalized coordinates (0 to 1 relative to displayed image)
  const [cropBox, setCropBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setImageSrc(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImageSrc(url);
    setZoom(1);
    setRotation(0);
    setCropBox({ x: 0, y: 0, w: 1, h: 1 });
    setAspectMode('free');
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const applyAspectRatio = (mode: AspectRatioMode) => {
    setAspectMode(mode);
    if (mode === 'full') {
      setCropBox({ x: 0, y: 0, w: 1, h: 1 });
      return;
    }
    if (mode === '1:1') {
      setCropBox({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    } else if (mode === '4:1') {
      setCropBox({ x: 0.05, y: 0.3, w: 0.9, h: 0.225 });
    } else if (mode === '16:9') {
      setCropBox({ x: 0.05, y: 0.2, w: 0.9, h: 0.5 });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setIsDragging(true);
    setDragStart({ x: nx, y: ny });
    setCropBox({ x: nx, y: ny, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStart || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const currentY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const minX = Math.min(dragStart.x, currentX);
    const minY = Math.min(dragStart.y, currentY);
    const width = Math.abs(currentX - dragStart.x);
    const height = Math.abs(currentY - dragStart.y);

    setCropBox({ x: minX, y: minY, w: Math.max(width, 0.05), h: Math.max(height, 0.05) });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleApplyCrop = () => {
    if (!imgRef.current || !imageFile) return;

    const img = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Natural image dimensions
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;

    const sx = Math.max(0, Math.floor(cropBox.x * nw));
    const sy = Math.max(0, Math.floor(cropBox.y * nh));
    const sw = Math.min(nw - sx, Math.max(1, Math.floor(cropBox.w * nw)));
    const sh = Math.min(nh - sy, Math.max(1, Math.floor(cropBox.h * nh)));

    canvas.width = sw;
    canvas.height = sh;

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    canvas.toBlob(
      blob => {
        if (!blob) return;
        const croppedFile = new File(
          [blob],
          imageFile.name || 'cropped-image.png',
          { type: blob.type || 'image/png' }
        );
        const previewUrl = URL.createObjectURL(blob);
        onSave(croppedFile, previewUrl);
      },
      'image/png',
      1.0
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="h-5 w-5 text-primary" />
            <span>{title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Crop Presets:</span>
              <Button
                type="button"
                variant={aspectMode === 'free' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyAspectRatio('free')}
              >
                Free / Custom
              </Button>
              <Button
                type="button"
                variant={aspectMode === '1:1' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyAspectRatio('1:1')}
              >
                Square (1:1)
              </Button>
              <Button
                type="button"
                variant={aspectMode === '4:1' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyAspectRatio('4:1')}
              >
                Masthead Banner
              </Button>
              <Button
                type="button"
                variant={aspectMode === 'full' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyAspectRatio('full')}
              >
                Full Image
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setRotation(r => (r + 90) % 360)}
                title="Rotate 90°"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Click and drag over the image to select the exact section (such as signatures or logo bounds) you want to store.
          </p>

          {/* Interactive Image & Crop Box */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="relative w-full max-h-[380px] bg-slate-900/90 rounded-lg overflow-hidden flex items-center justify-center select-none cursor-crosshair border border-border"
          >
            {imageSrc && (
              <>
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Upload preview"
                  style={{ transform: `rotate(${rotation}deg)` }}
                  className="max-h-[360px] w-auto max-w-full object-contain pointer-events-none transition-transform duration-200"
                />

                {/* Overlay Darkener outside crop box */}
                <div
                  className="absolute border-2 border-amber-400 bg-amber-400/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] pointer-events-none"
                  style={{
                    left: `${cropBox.x * 100}%`,
                    top: `${cropBox.y * 100}%`,
                    width: `${cropBox.w * 100}%`,
                    height: `${cropBox.h * 100}%`,
                  }}
                >
                  <div className="absolute top-0 left-0 w-2 h-2 bg-amber-400" />
                  <div className="absolute top-0 right-0 w-2 h-2 bg-amber-400" />
                  <div className="absolute bottom-0 left-0 w-2 h-2 bg-amber-400" />
                  <div className="absolute bottom-0 right-0 w-2 h-2 bg-amber-400" />
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApplyCrop} className="gap-1.5">
            <Check className="h-4 w-4" />
            Apply Crop & Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

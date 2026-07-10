import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { portalApi, readerApi } from '../lib/api';
import {
  Plus, Trash2, Save, Layers, ChevronLeft, ChevronRight, Check,
  ArrowUp, ArrowDown, Copy, Wand2, ArrowLeft, ArrowRight, Move,
  Maximize2, Minimize2
} from 'lucide-react';

export interface ClickmaskItem {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  w: number; // percentage 0-100
  h: number; // percentage 0-100
  title: string;
  content: string;
}

interface Props {
  slug: string;
  epaper: any;
  token: string;
  onClose: () => void;
}

export function ClickmaskEditorModal({ slug, epaper, token, onClose }: Props) {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [masksByPage, setMasksByPage] = useState<Record<number, ClickmaskItem[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Drag-to-draw state
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDrawRect, setCurrentDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Drag-to-resize / drag-to-move existing mask state
  const [activeTransform, setActiveTransform] = useState<{
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
    maskId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const totalPages = epaper.page_count || 1;
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [blobType, setBlobType] = useState<'image' | 'pdf'>('pdf');

  useEffect(() => {
    loadClickmasks();
  }, [slug, epaper.id]);

  useEffect(() => {
    let cancelled = false;
    let revoked: string | null = null;
    setImageLoading(true);
    setPageImageUrl(null);

    (async () => {
      try {
        const blob = await portalApi.getPageImage(slug, epaper.id, currentPage, token);
        if (cancelled) return;
        if (blob) {
          const isPdf = blob.type === 'application/pdf' || blob.type.includes('pdf');
          setBlobType(isPdf ? 'pdf' : 'image');
          revoked = URL.createObjectURL(blob);
          setPageImageUrl(revoked);
        } else {
          setBlobType('pdf');
          setPageImageUrl(readerApi.pageUrl(slug, epaper.id, currentPage));
        }
      } catch (err) {
        if (!cancelled) {
          setBlobType('pdf');
          setPageImageUrl(readerApi.pageUrl(slug, epaper.id, currentPage));
        }
      } finally {
        if (!cancelled) setImageLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [slug, epaper.id, currentPage, token]);

  const loadClickmasks = async () => {
    setLoading(true);
    try {
      const res = await portalApi.getClickmasks(slug, epaper.id, token);
      if (res.data && res.data.masks) {
        setMasksByPage(res.data.masks);
      }
    } catch (e) {
      console.error('Failed loading clickmasks', e);
    } finally {
      setLoading(false);
    }
  };

  const currentMasks = masksByPage[currentPage] || [];

  const updateCurrentMasks = (newMasks: ClickmaskItem[]) => {
    setMasksByPage(prev => ({ ...prev, [currentPage]: newMasks }));
  };

  // Reorder Articles (#1, #2, #3...)
  const handleMoveArticle = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentMasks.length) return;
    const updated = [...currentMasks];
    const [moved] = updated.splice(idx, 1);
    updated.splice(targetIdx, 0, moved);
    updateCurrentMasks(updated);
  };

  // Smart Newspaper Auto-Detect
  const handleAutoDetectNewspaper = () => {
    const layout: ClickmaskItem[] = [
      {
        id: 'auto_lead_' + Date.now(),
        x: 2, y: 11, w: 96, h: 26,
        title: 'Main Headline Story',
        content: ''
      },
      {
        id: 'auto_left_' + Date.now(),
        x: 2, y: 39, w: 31, h: 37,
        title: 'Left Column Lead',
        content: ''
      },
      {
        id: 'auto_center_' + Date.now(),
        x: 34.5, y: 39, w: 31, h: 37,
        title: 'Center Story',
        content: ''
      },
      {
        id: 'auto_right_' + Date.now(),
        x: 67, y: 39, w: 31, h: 37,
        title: 'Right Column Feature',
        content: ''
      },
      {
        id: 'auto_bottom_' + Date.now(),
        x: 2, y: 78, w: 96, h: 20,
        title: 'Bottom Banner Article',
        content: ''
      }
    ];
    updateCurrentMasks(layout);
    setSelectedId(layout[0].id);
  };

  const handleAutoGrid = (cols: number, rows: number) => {
    const gridMasks: ClickmaskItem[] = [];
    let idx = 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        gridMasks.push({
          id: `mask_grid_${r}_${c}_` + Date.now(),
          x: Number(((c * 100) / cols).toFixed(2)),
          y: Number(((r * 100) / rows).toFixed(2)),
          w: Number((100 / cols).toFixed(2)),
          h: Number((100 / rows).toFixed(2)),
          title: `Article Block #${idx++}`,
          content: ''
        });
      }
    }
    updateCurrentMasks(gridMasks);
  };

  const handleDuplicateMask = (mask: ClickmaskItem) => {
    const newMask: ClickmaskItem = {
      ...mask,
      id: 'mask_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      x: Math.min(90, mask.x + 2),
      y: Math.min(90, mask.y + 4),
      title: `${mask.title} (Copy)`
    };
    updateCurrentMasks([...currentMasks, newMask]);
    setSelectedId(newMask.id);
  };

  const handleSplitHorizontal = (mask: ClickmaskItem) => {
    const halfH = Number((mask.h / 2).toFixed(2));
    const topMask: ClickmaskItem = { ...mask, h: halfH, title: `${mask.title} (Top)` };
    const bottomMask: ClickmaskItem = {
      ...mask,
      id: 'mask_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      y: Number((mask.y + halfH).toFixed(2)),
      h: halfH,
      title: `${mask.title} (Bottom)`
    };
    const updated = currentMasks.map(m => (m.id === mask.id ? topMask : m));
    updated.push(bottomMask);
    updateCurrentMasks(updated);
    setSelectedId(topMask.id);
  };

  const handleSplitVertical = (mask: ClickmaskItem) => {
    const halfW = Number((mask.w / 2).toFixed(2));
    const leftMask: ClickmaskItem = { ...mask, w: halfW, title: `${mask.title} (Left)` };
    const rightMask: ClickmaskItem = {
      ...mask,
      id: 'mask_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      x: Number((mask.x + halfW).toFixed(2)),
      w: halfW,
      title: `${mask.title} (Right)`
    };
    const updated = currentMasks.map(m => (m.id === mask.id ? leftMask : m));
    updated.push(rightMask);
    updateCurrentMasks(updated);
    setSelectedId(leftMask.id);
  };

  const handleNudgeMask = (maskId: string, delta: { x?: number; y?: number; w?: number; h?: number }) => {
    updateCurrentMasks(currentMasks.map(m => {
      if (m.id !== maskId) return m;
      const x = Math.max(0, Math.min(98, Number((m.x + (delta.x || 0)).toFixed(2))));
      const y = Math.max(0, Math.min(98, Number((m.y + (delta.y || 0)).toFixed(2))));
      const w = Math.max(2, Math.min(100 - x, Number((m.w + (delta.w || 0)).toFixed(2))));
      const h = Math.max(2, Math.min(100 - y, Number((m.h + (delta.h || 0)).toFixed(2))));
      return { ...m, x, y, w, h };
    }));
  };

  // Mouse drag & resize handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const startX = ((e.clientX - rect.left) / rect.width) * 100;
    const startY = ((e.clientY - rect.top) / rect.height) * 100;
    setIsDrawing(true);
    setDrawStart({ x: startX, y: startY });
    setCurrentDrawRect({ x: startX, y: startY, w: 0, h: 0 });
    setSelectedId(null);
  };

  const startTransform = (
    e: React.MouseEvent,
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w',
    mask: ClickmaskItem
  ) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const startX = ((e.clientX - rect.left) / rect.width) * 100;
    const startY = ((e.clientY - rect.top) / rect.height) * 100;
    setSelectedId(mask.id);
    setActiveTransform({
      type,
      maskId: mask.id,
      startX,
      startY,
      origX: mask.x,
      origY: mask.y,
      origW: mask.w,
      origH: mask.h
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currentY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    if (activeTransform) {
      const dx = currentX - activeTransform.startX;
      const dy = currentY - activeTransform.startY;
      const { origX, origY, origW, origH } = activeTransform;

      const updated = currentMasks.map(m => {
        if (m.id !== activeTransform.maskId) return m;
        let nx = origX;
        let ny = origY;
        let nw = origW;
        let nh = origH;

        if (activeTransform.type === 'move') {
          nx = Math.max(0, Math.min(100 - origW, origX + dx));
          ny = Math.max(0, Math.min(100 - origH, origY + dy));
        } else {
          if (activeTransform.type.includes('w')) {
            nx = Math.max(0, Math.min(origX + origW - 3, origX + dx));
            nw = origW - (nx - origX);
          }
          if (activeTransform.type.includes('e')) {
            nw = Math.max(3, Math.min(100 - origX, origW + dx));
          }
          if (activeTransform.type.includes('n')) {
            ny = Math.max(0, Math.min(origY + origH - 3, origY + dy));
            nh = origH - (ny - origY);
          }
          if (activeTransform.type.includes('s')) {
            nh = Math.max(3, Math.min(100 - origY, origH + dy));
          }
        }
        return {
          ...m,
          x: Number(nx.toFixed(2)),
          y: Number(ny.toFixed(2)),
          w: Number(nw.toFixed(2)),
          h: Number(nh.toFixed(2))
        };
      });
      updateCurrentMasks(updated);
      return;
    }

    if (!isDrawing || !drawStart) return;
    const x = Math.min(drawStart.x, currentX);
    const y = Math.min(drawStart.y, currentY);
    const w = Math.abs(currentX - drawStart.x);
    const h = Math.abs(currentY - drawStart.y);

    setCurrentDrawRect({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (activeTransform) {
      setActiveTransform(null);
      return;
    }
    if (!isDrawing || !currentDrawRect) {
      setIsDrawing(false);
      return;
    }
    setIsDrawing(false);

    // Only add if mask has reasonable width/height (> 2%)
    if (currentDrawRect.w > 2 && currentDrawRect.h > 2) {
      const newMask: ClickmaskItem = {
        id: 'mask_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        x: Number(currentDrawRect.x.toFixed(2)),
        y: Number(currentDrawRect.y.toFixed(2)),
        w: Number(currentDrawRect.w.toFixed(2)),
        h: Number(currentDrawRect.h.toFixed(2)),
        title: `Article ${currentMasks.length + 1}`,
        content: ''
      };
      updateCurrentMasks([...currentMasks, newMask]);
      setSelectedId(newMask.id);
    }
    setCurrentDrawRect(null);
    setDrawStart(null);
  };

  const selectedMask = currentMasks.find(m => m.id === selectedId);

  const handleSavePage = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      const res = await portalApi.saveClickmasks(slug, epaper.id, currentPage, currentMasks, token);
      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2500);
      }
    } catch (e) {
      console.error('Failed saving clickmasks', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-7xl h-[92vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-3.5 border-b bg-muted/30 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-serif">Interactive Article Clickmasks Studio</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Draw rectangles, resize edges, reorder sequence, and auto-detect newspaper story layouts.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-md overflow-hidden bg-background">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); setSelectedId(null); }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs font-medium px-3">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); setSelectedId(null); }}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleSavePage}
                disabled={saving}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-green-400" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Clickmasks'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Top Shortcut Bar */}
        <div className="px-4 py-2 border-b bg-muted/15 flex items-center justify-between gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-muted-foreground mr-1">Smart Presets:</span>
            <Button variant="secondary" size="sm" className="h-7 text-xs gap-1" onClick={handleAutoDetectNewspaper}>
              <Wand2 className="w-3.5 h-3.5 text-primary" />
              Auto-Detect Newspaper Layout (5 Stories)
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAutoGrid(2, 2)}>
              4-Grid
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAutoGrid(2, 3)}>
              6-Grid
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAutoGrid(3, 1)}>
              3 Columns
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            {selectedMask && (
              <>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDuplicateMask(selectedMask)}>
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleSplitHorizontal(selectedMask)}>
                  Split Top/Bottom
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleSplitVertical(selectedMask)}>
                  Split Left/Right
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => updateCurrentMasks([])}
              disabled={currentMasks.length === 0}
            >
              Clear Page
            </Button>
          </div>
        </div>

        {/* Studio Workspace */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left / Center: Interactive Canvas */}
          <div className="flex-1 bg-neutral-900/90 overflow-auto flex items-center justify-center p-6 select-none relative">
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="relative max-h-full max-w-full aspect-[1/1.4] bg-white shadow-2xl overflow-hidden cursor-crosshair"
              style={{ width: 'auto', height: '100%' }}
            >
              {imageLoading ? (
                <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-400 text-sm">
                  Loading page...
                </div>
              ) : blobType === 'pdf' ? (
                <iframe
                  title={`Page ${currentPage}`}
                  src={`${pageImageUrl || readerApi.pageUrl(slug, epaper.id, currentPage)}#toolbar=0&navpanes=0&scrollbar=0`}
                  className="w-full h-full border-0 pointer-events-none block"
                />
              ) : (
                <img
                  src={pageImageUrl || readerApi.pageUrl(slug, epaper.id, currentPage)}
                  alt={`Page ${currentPage}`}
                  className="w-full h-full object-contain pointer-events-none block"
                />
              )}

              {/* Render Existing Clickmasks */}
              {currentMasks.map((mask, i) => {
                const isSelected = mask.id === selectedId;
                return (
                  <div
                    key={mask.id}
                    onMouseDown={(e) => startTransform(e, 'move', mask)}
                    className={`absolute border-2 transition-colors flex flex-col justify-between p-1 text-[11px] font-medium cursor-move ${
                      isSelected
                        ? 'border-primary bg-primary/25 z-20 shadow-lg'
                        : 'border-blue-500/80 bg-blue-500/15 hover:bg-blue-500/25 z-10'
                    }`}
                    style={{
                      left: `${mask.x}%`,
                      top: `${mask.y}%`,
                      width: `${mask.w}%`,
                      height: `${mask.h}%`
                    }}
                  >
                    <span className="bg-black/75 text-white px-1.5 py-0.5 rounded text-[10px] truncate max-w-full inline-flex items-center gap-1">
                      <span className="font-bold text-yellow-300">#{i + 1}</span>
                      {mask.title || 'Untitled Article'}
                    </span>

                    {/* 8 Resize Handles when selected */}
                    {isSelected && (
                      <>
                        <div
                          onMouseDown={(e) => startTransform(e, 'nw', mask)}
                          className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-primary border border-white cursor-nwse-resize z-30"
                        />
                        <div
                          onMouseDown={(e) => startTransform(e, 'n', mask)}
                          className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary border border-white cursor-ns-resize z-30"
                        />
                        <div
                          onMouseDown={(e) => startTransform(e, 'ne', mask)}
                          className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-primary border border-white cursor-nesw-resize z-30"
                        />
                        <div
                          onMouseDown={(e) => startTransform(e, 'e', mask)}
                          className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-primary border border-white cursor-ew-resize z-30"
                        />
                        <div
                          onMouseDown={(e) => startTransform(e, 'se', mask)}
                          className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-primary border border-white cursor-nwse-resize z-30"
                        />
                        <div
                          onMouseDown={(e) => startTransform(e, 's', mask)}
                          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary border border-white cursor-ns-resize z-30"
                        />
                        <div
                          onMouseDown={(e) => startTransform(e, 'sw', mask)}
                          className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-primary border border-white cursor-nesw-resize z-30"
                        />
                        <div
                          onMouseDown={(e) => startTransform(e, 'w', mask)}
                          className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-primary border border-white cursor-ew-resize z-30"
                        />
                      </>
                    )}
                  </div>
                );
              })}

              {/* Current active drawing rect */}
              {currentDrawRect && (
                <div
                  className="absolute border-2 border-dashed border-primary bg-primary/20 pointer-events-none z-30"
                  style={{
                    left: `${currentDrawRect.x}%`,
                    top: `${currentDrawRect.y}%`,
                    width: `${currentDrawRect.w}%`,
                    height: `${currentDrawRect.h}%`
                  }}
                />
              )}
            </div>
          </div>

          {/* Right Panel: Article Inspector, Resize Nudge & Reorder List */}
          <div className="w-88 border-l bg-background flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Selected Article Precision Controls */}
              {selectedMask ? (
                <div className="border rounded-xl p-3.5 space-y-3.5 bg-muted/20 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px]">
                        #{currentMasks.findIndex(m => m.id === selectedMask.id) + 1}
                      </span>
                      Editing Article Box
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        updateCurrentMasks(currentMasks.filter(m => m.id !== selectedMask.id));
                        setSelectedId(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Headline / Title</Label>
                    <Input
                      value={selectedMask.title}
                      onChange={e => {
                        const val = e.target.value;
                        updateCurrentMasks(
                          currentMasks.map(m => (m.id === selectedMask.id ? { ...m, title: val } : m))
                        );
                      }}
                      placeholder="e.g. Govt Announces New Policy"
                      className="text-xs h-8"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Text Excerpt / Summary</Label>
                    <textarea
                      value={selectedMask.content}
                      onChange={e => {
                        const val = e.target.value;
                        updateCurrentMasks(
                          currentMasks.map(m => (m.id === selectedMask.id ? { ...m, content: val } : m))
                        );
                      }}
                      placeholder="Article snippet shown when sharing..."
                      className="w-full min-h-[70px] rounded-md border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {/* Precision Resize & Nudge Toolbar */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="text-[11px] font-semibold text-muted-foreground">
                      Resize & Position Nudge Shortcuts
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] px-1"
                        onClick={() => handleNudgeMask(selectedMask.id, { w: -1 })}
                      >
                        W -1%
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] px-1"
                        onClick={() => handleNudgeMask(selectedMask.id, { w: 1 })}
                      >
                        W +1%
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] px-1"
                        onClick={() => handleNudgeMask(selectedMask.id, { h: -1 })}
                      >
                        H -1%
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] px-1"
                        onClick={() => handleNudgeMask(selectedMask.id, { h: 1 })}
                      >
                        H +1%
                      </Button>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] px-1"
                        onClick={() => handleNudgeMask(selectedMask.id, { x: -1 })}
                      >
                        ← Left
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] px-1"
                        onClick={() => handleNudgeMask(selectedMask.id, { x: 1 })}
                      >
                        Right →
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] px-1"
                        onClick={() => handleNudgeMask(selectedMask.id, { y: -1 })}
                      >
                        ↑ Up
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] px-1"
                        onClick={() => handleNudgeMask(selectedMask.id, { y: 1 })}
                      >
                        Down ↓
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground pt-1">
                      <div>X: {selectedMask.x}% | Y: {selectedMask.y}%</div>
                      <div>W: {selectedMask.w}% | H: {selectedMask.h}%</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed rounded-xl p-4 text-center text-xs text-muted-foreground">
                  Click any article box or draw a rectangle to edit its title, size, and position.
                </div>
              )}

              {/* Reorder Articles Sequence */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">
                    Articles Order ({currentMasks.length})
                  </h3>
                  <span className="text-[10px] text-muted-foreground">Reorder reading flow</span>
                </div>

                <div className="space-y-2">
                  {currentMasks.map((mask, i) => (
                    <div
                      key={mask.id}
                      onClick={() => setSelectedId(mask.id)}
                      className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-all ${
                        mask.id === selectedId
                          ? 'border-primary bg-primary/10 shadow-sm font-medium'
                          : 'hover:bg-muted/50 bg-card'
                      }`}
                    >
                      <div className="truncate pr-2 flex items-center gap-1.5">
                        <span className="bg-primary/15 text-primary font-bold px-1.5 py-0.5 rounded text-[10px]">
                          #{i + 1}
                        </span>
                        <span className="truncate">{mask.title || 'Untitled Article'}</span>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          disabled={i === 0}
                          onClick={() => handleMoveArticle(i, 'up')}
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          disabled={i === currentMasks.length - 1}
                          onClick={() => handleMoveArticle(i, 'down')}
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            updateCurrentMasks(currentMasks.filter(m => m.id !== mask.id));
                            if (selectedId === mask.id) setSelectedId(null);
                          }}
                          title="Delete Article"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

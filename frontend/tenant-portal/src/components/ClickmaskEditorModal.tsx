import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { portalApi, readerApi } from '../lib/api';
import { Plus, Trash2, Save, Layers, ChevronLeft, ChevronRight, Check } from 'lucide-react';

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
      if (res.ok && res.data?.items) {
        const map: Record<number, ClickmaskItem[]> = {};
        res.data.items.forEach((item: any) => {
          map[item.page_no] = item.clickmasks || [];
        });
        setMasksByPage(map);
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

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currentY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    const x = Math.min(drawStart.x, currentX);
    const y = Math.min(drawStart.y, currentY);
    const w = Math.abs(currentX - drawStart.x);
    const h = Math.abs(currentY - drawStart.y);

    setCurrentDrawRect({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentDrawRect) {
      setIsDrawing(false);
      return;
    }
    setIsDrawing(false);

    // Only add if mask has reasonable width/height (> 3%)
    if (currentDrawRect.w > 3 && currentDrawRect.h > 3) {
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

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b bg-muted/30 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-serif">Interactive Article Clickmasks Studio</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Draw rectangles on the page image to define clickable article clips for sharing & zoomed reading.
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

              <Button onClick={handleSavePage} disabled={saving} size="sm" className="gap-1.5">
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-green-300" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Current Page'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Main Drawing Canvas */}
          <div className="flex-1 bg-neutral-900 overflow-auto flex items-center justify-center p-6 select-none relative">
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="relative max-h-full max-w-full aspect-[1/1.4] bg-white shadow-2xl cursor-crosshair overflow-hidden"
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(mask.id);
                    }}
                    className={`absolute border-2 transition-all flex flex-col justify-between p-1 text-[11px] font-medium ${
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
                    <span className="bg-black/75 text-white px-1 py-0.5 rounded text-[10px] truncate max-w-full">
                      #{i + 1} {mask.title || 'Untitled Article'}
                    </span>
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

          {/* Right Panel: Article Inspector & Quick Tools */}
          <div className="w-80 border-l bg-background flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quick Layout Tools
                </span>
                <Layers className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => handleAutoGrid(2, 2)}>
                  4-Article Grid
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => handleAutoGrid(2, 3)}>
                  6-Article Grid
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-destructive hover:bg-destructive/10"
                onClick={() => updateCurrentMasks([])}
                disabled={currentMasks.length === 0}
              >
                Clear All on Page {currentPage}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Article Clips ({currentMasks.length})
                </h3>
              </div>

              {selectedMask ? (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-primary">
                      Selected Mask #{currentMasks.findIndex(m => m.id === selectedMask.id) + 1}
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
                    <Label className="text-xs">Article Title / Headline</Label>
                    <Input
                      size={1}
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
                    <Label className="text-xs">Article Summary / Text Snippet</Label>
                    <textarea
                      value={selectedMask.content}
                      onChange={e => {
                        const val = e.target.value;
                        updateCurrentMasks(
                          currentMasks.map(m => (m.id === selectedMask.id ? { ...m, content: val } : m))
                        );
                      }}
                      placeholder="Brief excerpt shown when sharing or zooming..."
                      className="w-full min-h-[80px] rounded-md border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground pt-1 border-t">
                    <div>X: {selectedMask.x}%, Y: {selectedMask.y}%</div>
                    <div>W: {selectedMask.w}%, H: {selectedMask.h}%</div>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                  Click any box on the image or draw a rectangle to edit an article clip.
                </div>
              )}

              <div className="space-y-2">
                {currentMasks.map((mask, i) => (
                  <div
                    key={mask.id}
                    onClick={() => setSelectedId(mask.id)}
                    className={`p-2.5 rounded-md border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                      mask.id === selectedId
                        ? 'border-primary bg-primary/10 font-medium'
                        : 'hover:bg-muted/40'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <span className="text-muted-foreground mr-1">#{i + 1}</span>
                      {mask.title || 'Untitled Article'}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateCurrentMasks(currentMasks.filter(m => m.id !== mask.id));
                        if (selectedId === mask.id) setSelectedId(null);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

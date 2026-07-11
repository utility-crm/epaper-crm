import { useEffect, useState, useCallback } from 'react';
import { portalApi } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Newspaper, Plus, Upload, FileText, CheckCircle2, Layers, Pencil, Globe, EyeOff, Image as ImageIcon, Share2, Scissors, Clock } from 'lucide-react';
import { convertPdfToWebpPages } from '../lib/pdfToImages';
import { extractPdfThumbnail } from '../lib/pdfThumbnail';
import { ShareModal } from '../components/ShareModal';
import { ClickmaskEditorModal } from '../components/ClickmaskEditorModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../components/ui/sheet';

interface Props { slug: string; token: string; }
const NONE = '__none__';

export function PapersPage({ slug, token }: Props) {
  const [editions, setEditions] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [modal, setModal] = useState<null | 'edition' | 'paper'>(null);
  const [upload, setUpload] = useState<any>(null);
  const [editEdition, setEditEdition] = useState<any>(null);
  const [editPaper, setEditPaper] = useState<any>(null);
  const [sharePaper, setSharePaper] = useState<any>(null);
  const [clickmaskPaper, setClickmaskPaper] = useState<any>(null);

  const loadEditions = useCallback(async () => {
    const [edRes, tierRes] = await Promise.all([portalApi.getEditions(slug, token), portalApi.getTiers(slug, token)]);
    const eds = edRes.ok && edRes.data ? edRes.data.items ?? [] : [];
    setEditions(eds);
    if (tierRes.ok && tierRes.data) setTiers(tierRes.data.items ?? []);
    setSelected(prev => prev || (eds[0]?.id ?? ''));
    setLoading(false);
  }, [slug, token]);

  const loadPapers = useCallback(async () => {
    if (!selected) { setPapers([]); return; }
    setLoadingPapers(true);
    const res = await portalApi.getEpapers(slug, selected, token);
    setPapers(res.ok && res.data ? res.data.items ?? [] : []);
    setLoadingPapers(false);
  }, [slug, selected, token]);

  useEffect(() => { loadEditions(); }, [loadEditions]);
  useEffect(() => { loadPapers(); }, [loadPapers]);

  const edition = editions.find(e => e.id === selected);
  const tierName = (id: string | null) => tiers.find(t => t.id === id)?.name;

  const assignTier = async (tierId: string) => {
    if (!edition) return;
    await portalApi.updateEdition(slug, edition.id, { tier_id: tierId === NONE ? null : tierId }, token);
    loadEditions();
  };

  const togglePublish = async (p: any) => {
    await portalApi.updateEpaper(slug, p.id, { status: p.status === 'published' ? 'draft' : 'published' }, token);
    loadPapers();
  };

  const setDefault = async (p: any) => {
    await portalApi.setDefaultPaper(slug, p.id, token);
    loadPapers();
  };

  if (loading) return <div className="flex justify-center py-24"><div className="spinner" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl font-700 tracking-tight">Editions &amp; Papers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organize editions and publish dated paper issues.</p>
        </div>
        <Button variant="secondary" onClick={() => setModal('edition')}><Plus className="h-4 w-4" /> New Edition</Button>
      </div>

      {editions.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Newspaper className="h-10 w-10 text-muted-foreground" />
          <div className="text-lg font-semibold">No editions yet</div>
          <p className="text-sm text-muted-foreground">Create your first edition to get started</p>
          <Button onClick={() => setModal('edition')}><Plus className="h-4 w-4" /> Create First Edition</Button>
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <Label className="text-foreground">Edition</Label>
              </div>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {editions.map(e => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {edition && (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEditEdition(edition)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit Edition
                </Button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Label className="text-foreground">Subscription tier</Label>
                <Select value={edition?.tier_id ?? NONE} onValueChange={assignTier}>
                  <SelectTrigger className="w-52"><SelectValue placeholder="Free / untiered" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Free / untiered</SelectItem>
                    {tiers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {edition?.tier_id ? <><>Premium papers here unlock with the </><Badge variant="default">{tierName(edition.tier_id)}</Badge><> tier.</></> : 'This edition has no tier — premium papers cannot be unlocked until you assign one.'}
            </div>
            <Button onClick={() => setModal('paper')}><Plus className="h-4 w-4" /> New Paper</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingPapers ? (
                <div className="flex justify-center py-16"><div className="spinner" /></div>
              ) : papers.length === 0 ? (
                <div className="px-6 py-14 text-center text-sm text-muted-foreground">No papers in this edition yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead><TableHead>Date</TableHead><TableHead>Pages</TableHead>
                      <TableHead>Free preview</TableHead><TableHead>Status</TableHead><TableHead>PDF</TableHead><TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {papers.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.title || 'Untitled'}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(p.publish_date).toLocaleDateString()}</TableCell>
                        <TableCell>{p.page_count || '—'}</TableCell>
                        <TableCell>
                          {p.is_free ? <Badge variant="success">Fully free</Badge>
                            : p.free_page_count === 0 ? <Badge variant="warning">Fully premium</Badge>
                            : <Badge variant="default">{p.free_page_count} page{p.free_page_count > 1 ? 's' : ''}</Badge>}
                        </TableCell>
                        <TableCell>
                          <button onClick={() => togglePublish(p)} className="cursor-pointer" title={p.status === 'published' ? 'Click to unpublish' : 'Click to publish'}>
                            {p.status === 'published'
                              ? <Badge variant="success"><Globe className="inline h-3 w-3 mr-1" />Published</Badge>
                              : p.publish_type === 'scheduled' && p.scheduled_at
                                ? <Badge variant="warning"><Clock className="inline h-3 w-3 mr-1" />Scheduled</Badge>
                                : <Badge variant="muted"><EyeOff className="inline h-3 w-3 mr-1" />Draft</Badge>}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {p.r2_key ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="h-3.5 w-3.5" /> {p.page_count}p</span> : <span className="text-xs text-muted-foreground">No PDF</span>}
                            <Button variant="secondary" size="sm" onClick={() => setUpload(p)}><Upload className="h-3.5 w-3.5" /> {p.r2_key ? 'Replace' : 'Upload'}</Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setDefault(p)} title="Set as default paper for this date">
                              <span className={p.is_default_for_day ? 'text-amber-500' : 'text-muted-foreground'}>★</span>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setClickmaskPaper(p)} title="Interactive Article Clickmasks Studio"><Scissors className="h-3.5 w-3.5 text-primary" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => setSharePaper(p)} title="Share"><Share2 className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditPaper(p)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {modal === 'edition' && <EditionModal slug={slug} token={token} tiers={tiers} onClose={() => { setModal(null); loadEditions(); }} />}
      {modal === 'paper' && edition && <PaperModal slug={slug} token={token} editionId={edition.id} onClose={() => { setModal(null); loadPapers(); }} />}
      {upload && <UploadModal slug={slug} token={token} paper={upload} onClose={() => { setUpload(null); loadPapers(); }} />}
      {sharePaper && <ShareModal slug={slug} paper={sharePaper} onClose={() => setSharePaper(null)} />}
      {clickmaskPaper && <ClickmaskEditorModal slug={slug} epaper={clickmaskPaper} token={token} onClose={() => setClickmaskPaper(null)} />}

      <Sheet open={!!editEdition} onOpenChange={o => !o && setEditEdition(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {editEdition && (
            <EditEditionSheet
              slug={slug} token={token} tiers={tiers} edition={editEdition}
              onSaved={() => { setEditEdition(null); loadEditions(); }}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!editPaper} onOpenChange={o => !o && setEditPaper(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {editPaper && (
            <EditPaperSheet
              slug={slug} token={token} paper={editPaper}
              onSaved={() => { setEditPaper(null); loadPapers(); }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ── Edit Edition Sheet ──────────────────────────────────────── */
function EditEditionSheet({ slug, token, tiers, edition, onSaved }: { slug: string; token: string; tiers: any[]; edition: any; onSaved: () => void }) {
  const [title, setTitle] = useState(edition.title ?? '');
  const [tierId, setTierId] = useState(edition.tier_id ?? NONE);
  const [status, setStatus] = useState(edition.status ?? 'draft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await portalApi.updateEdition(slug, edition.id, { title, tier_id: tierId === NONE ? null : tierId, status }, token);
    setBusy(false);
    if (!res.ok) { setError(res.error?.message ?? 'Failed'); return; }
    onSaved();
  };

  const deleteEdition = async () => {
    if (!confirm('Are you sure you want to delete this edition? All papers inside it will be permanently deleted. This action cannot be undone.')) return;
    setBusy(true); setError('');
    const res = await portalApi.deleteEdition(slug, edition.id, token);
    setBusy(false);
    if (!res.ok) { setError(res.error?.message ?? 'Failed to delete'); return; }
    onSaved();
  };

  return (
    <form onSubmit={save} className="flex flex-col h-full gap-6">
      <SheetHeader>
        <SheetTitle>Edit Edition</SheetTitle>
        <SheetDescription>Update the title, subscription tier, or status of this edition.</SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Subscription tier</Label>
          <Select value={tierId} onValueChange={setTierId}>
            <SelectTrigger><SelectValue placeholder="Free / untiered" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Free / untiered</SelectItem>
              {tiers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Papers in this edition will require an active subscription of the assigned tier to read past the free preview.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
      </div>

      <SheetFooter className="flex-row sm:justify-between items-center w-full">
        <Button type="button" variant="destructive" onClick={deleteEdition} disabled={busy}>Delete Edition</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</Button>
      </SheetFooter>
    </form>
  );
}

/* ── Edit Paper Sheet ────────────────────────────────────────── */
function EditPaperSheet({ slug, token, paper, onSaved }: { slug: string; token: string; paper: any; onSaved: () => void }) {
  const [title, setTitle] = useState(paper.title ?? '');
  const [isFree, setIsFree] = useState(!!paper.is_free);
  const [freePages, setFreePages] = useState(paper.free_page_count ?? 0);
  const [status, setStatus] = useState(paper.status ?? 'draft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [files, setFiles] = useState<File[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [step, setStep] = useState<'form' | 'uploading' | 'done'>('form');
  const [progressMsg, setProgressMsg] = useState('');

  const isPdf = files.length === 1 && files[0].type === 'application/pdf';

  const onFilesChange = (picked: FileList | null) => {
    if (!picked) return;
    const arr = Array.from(picked);
    const pdfs = arr.filter(f => f.type === 'application/pdf');
    if (pdfs.length > 0) { setFiles([pdfs[0]]); return; }
    const imgs = arr.filter(f => f.type.startsWith('image/'));
    if (imgs.length > 0) setFiles(imgs.sort((a, b) => a.name.localeCompare(b.name)));
  };

  const onCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) setCoverFile(e.target.files[0]);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await portalApi.updateEpaper(slug, paper.id, {
      title: title || null,
      is_free: isFree,
      free_page_count: isFree ? 0 : freePages,
      status,
    }, token);
    
    if (!res.ok) { setError(res.error?.message ?? 'Failed'); setBusy(false); return; }

    if (files.length > 0) {
      setStep('uploading');
      let finalFiles = files;
      let finalCover = coverFile;
      
      if (isPdf) {
        setProgressMsg('Converting PDF pages to crisp WebP images...');
        try {
          const { pages, cover } = await convertPdfToWebpPages(files[0], setProgressMsg);
          finalFiles = pages;
          if (!finalCover) finalCover = cover;
          setProgressMsg('Uploading pages...');
        } catch (err: any) {
          setError('PDF conversion failed: ' + err.message);
          setBusy(false); setStep('form'); return;
        }
      }

      const uploadRes = await portalApi.uploadPages(slug, paper.id, finalFiles, token, finalCover ?? undefined);
      if (!uploadRes.ok) {
        setError('Paper updated but file upload failed: ' + (uploadRes.error?.message ?? 'unknown error'));
        setBusy(false); setStep('form'); return;
      }
      setStep('done');
      setTimeout(() => { setBusy(false); onSaved(); }, 1200);
      return;
    }

    setBusy(false);
    onSaved();
  };

  const deletePaper = async () => {
    if (!confirm('Are you sure you want to delete this paper? This action cannot be undone.')) return;
    setBusy(true); setError('');
    const res = await portalApi.deleteEpaper(slug, paper.id, token);
    setBusy(false);
    if (!res.ok) { setError(res.error?.message ?? 'Failed to delete'); return; }
    onSaved();
  };

  if (step === 'done') return (
    <div className="flex flex-col h-full items-center justify-center py-16 text-center">
      <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-400" />
      <div className="text-lg font-semibold">Changes saved & files uploaded!</div>
    </div>
  );

  if (step === 'uploading') return (
    <div className="flex flex-col h-full items-center justify-center py-16 text-center">
      <div className="spinner mx-auto mb-4" />
      <div className="text-lg font-semibold">{isPdf ? 'Processing PDF…' : 'Uploading images…'}</div>
      <p className="mt-1 text-sm text-muted-foreground">
        {isPdf ? progressMsg : `Storing ${files.length} image${files.length > 1 ? 's' : ''}…`}
      </p>
    </div>
  );

  return (
    <form onSubmit={save} className="flex flex-col h-full gap-6">
      <SheetHeader>
        <SheetTitle>Edit Paper</SheetTitle>
        <SheetDescription>
          {paper.publish_date ? new Date(paper.publish_date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Paper details'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5">
        <div className="space-y-1.5">
          <Label>Title <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Morning Edition" />
        </div>

        <div className="rounded-lg border border-border p-4 space-y-4">
          <h3 className="text-sm font-semibold">Access Control</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Free for everyone</div>
              <div className="text-xs text-muted-foreground">All pages are publicly accessible — no subscription required.</div>
            </div>
            <Switch checked={isFree} onCheckedChange={setIsFree} />
          </div>
          {!isFree && (
            <div className="space-y-1.5">
              <Label>Free preview pages</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number" min={0} max={paper.page_count || 9999}
                  value={freePages}
                  onChange={e => setFreePages(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-28"
                />
                {paper.page_count > 0 && (
                  <span className="text-xs text-muted-foreground">of {paper.page_count} total pages</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {freePages === 0
                  ? '🔒 Fully locked — readers need a subscription to view any page.'
                  : `Pages 1–${freePages} shown freely. Page ${freePages + 1} onwards require a subscription.`}
              </p>
              {paper.page_count > 0 && (
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  {[0, 1, 2, 3].map(n => (
                    <button key={n} type="button" onClick={() => setFreePages(n)}
                      className={`px-2.5 py-1 rounded text-xs border transition ${freePages === n ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                      {n === 0 ? 'Fully locked' : `${n} free`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft (hidden from readers)</SelectItem>
              <SelectItem value="published">Published (visible to readers)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Upload file <span className="text-muted-foreground text-xs">(optional — replace existing)</span></Label>
          <div
            className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-12 transition-colors hover:border-primary/50 hover:bg-muted/50"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); onFilesChange(e.dataTransfer.files); }}
          >
            <input type="file" multiple accept=".pdf,image/png,image/jpeg,image/webp" onChange={e => onFilesChange(e.target.files)} className="absolute inset-0 cursor-pointer opacity-0" />
            <div className="pointer-events-none flex flex-col items-center space-y-2">
              <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              {files.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center">
                  Drag &amp; drop a <strong>PDF</strong> or <strong>multiple images</strong>, or click to browse
                </div>
              ) : isPdf ? (
                <div className="text-sm font-medium">{files[0].name} <span className="text-muted-foreground">({(files[0].size / 1024 / 1024).toFixed(1)} MB)</span></div>
              ) : (
                <div className="text-sm font-medium">{files.length} image{files.length > 1 ? 's' : ''} selected</div>
              )}
            </div>
          </div>
          {files.length > 0 && (
            <div className="flex justify-between items-center px-1">
              <button type="button" onClick={() => setFiles([])} className="text-xs text-muted-foreground hover:text-foreground">✕ Remove file(s)</button>
              
              <label className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />
                {coverFile ? coverFile.name : 'Upload Custom Thumbnail'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onCoverChange} className="hidden" />
              </label>
            </div>
          )}
        </div>

        {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
      </div>

      <SheetFooter className="flex-row sm:justify-between items-center w-full">
        <Button type="button" variant="destructive" onClick={deletePaper} disabled={busy}>Delete Paper</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : (files.length > 0 ? 'Save & Upload' : 'Save Changes')}</Button>
      </SheetFooter>
    </form>
  );
}

/* ── Create Edition Modal ────────────────────────────────────── */
function EditionModal({ slug, token, tiers, onClose }: { slug: string; token: string; tiers: any[]; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [tierId, setTierId] = useState(NONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    setBusy(true); setError('');
    const res = await portalApi.createEdition(slug, { title, tier_id: tierId === NONE ? null : tierId }, token);
    setBusy(false);
    if (!res.ok) { setError(res.error?.message ?? 'Failed'); return; }
    onClose();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Edition</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Daily Times" autoFocus /></div>
          <div className="space-y-1.5">
            <Label>Subscription tier (optional)</Label>
            <Select value={tierId} onValueChange={setTierId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Free / untiered</SelectItem>
                {tiers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          <DialogFooter><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Create Paper Modal (with inline file upload) ───────────────────────── */
function PaperModal({ slug, token, editionId, onClose }: { slug: string; token: string; editionId: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [isManualTitle, setIsManualTitle] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [publishType, setPublishType] = useState<'instant' | 'scheduled'>('instant');
  const defaultSchedule = new Date(Date.now() + 3600000 - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
  const [scheduledAt, setScheduledAt] = useState(defaultSchedule);
  const [isFree, setIsFree] = useState(false);
  const [freePages, setFreePages] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'form' | 'uploading' | 'done'>('form');
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState('');

  const [y, m, d] = date.split('-');
  const localDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const defaultTitle = localDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    if (!isManualTitle) {
      setTitle(defaultTitle);
    }
  }, [defaultTitle, isManualTitle]);

  const isPdf = files.length === 1 && files[0].type === 'application/pdf';

  const onFilesChange = (picked: FileList | null) => {
    if (!picked) return;
    const arr = Array.from(picked);
    const pdfs = arr.filter(f => f.type === 'application/pdf');
    if (pdfs.length > 0) { setFiles([pdfs[0]]); return; }
    const imgs = arr.filter(f => f.type.startsWith('image/'));
    if (imgs.length > 0) setFiles(imgs.sort((a, b) => a.name.localeCompare(b.name)));
  };

  const onCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCoverFile(e.target.files[0]);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onFilesChange(e.dataTransfer.files);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const finalTitle = title.trim() || defaultTitle;
    const res = await portalApi.createEpaper(slug, editionId, {
      title: finalTitle, 
      publish_date: date, 
      is_free: isFree, 
      free_page_count: isFree ? 0 : freePages, 
      publish_type: publishType,
      scheduled_at: publishType === 'scheduled' ? new Date(scheduledAt).toISOString() : null
    }, token);
    if (!res.ok) { setError(res.error?.message ?? 'Failed'); setBusy(false); return; }
    const epaperId = res.data?.id;
    if (epaperId && files.length > 0) {
      setStep('uploading');
      
      let finalFiles = files;
      let finalCover = coverFile;
      
      if (isPdf) {
        setProgressMsg('Converting PDF pages to crisp WebP images...');
        try {
          const { pages, cover } = await convertPdfToWebpPages(files[0], setProgressMsg);
          finalFiles = pages;
          if (!finalCover) finalCover = cover;
          setProgressMsg('Uploading pages...');
        } catch (err: any) {
          setError('PDF conversion failed: ' + err.message);
          setBusy(false); setStep('form'); return;
        }
      }

      const uploadRes = await portalApi.uploadPages(slug, epaperId, finalFiles, token, finalCover ?? undefined);
      if (!uploadRes.ok) {
        setError('Paper created but file upload failed: ' + (uploadRes.error?.message ?? 'unknown error'));
        setBusy(false); setStep('form'); return;
      }
    }
    setStep('done');
    setTimeout(onClose, 1200);
  };

  if (step === 'done') return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <div className="py-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-400" />
          <div className="text-lg font-semibold">Paper created!</div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (step === 'uploading') return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent>
        <div className="py-8 text-center">
          <div className="spinner mx-auto mb-4" />
          <div className="text-lg font-semibold">{isPdf ? 'Processing PDF…' : 'Uploading images…'}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPdf ? progressMsg : `Storing ${files.length} image${files.length > 1 ? 's' : ''}…`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New Paper Issue</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label>Title (optional)</Label><Input value={title} onChange={e => { setTitle(e.target.value); setIsManualTitle(true); }} placeholder={`e.g. ${defaultTitle}`} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Publish date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
            <div className="space-y-1.5">
              <Label>Publishing</Label>
              <Select value={publishType} onValueChange={(v: any) => setPublishType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="instant">Publish instantly</SelectItem>
                  <SelectItem value="scheduled">Schedule for later</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {publishType === 'scheduled' && (
            <div className="space-y-1.5 p-3 border rounded-lg bg-muted/10">
              <Label>Scheduled Date & Time (Local)</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} required />
              <p className="text-xs text-muted-foreground mt-1">This paper will be hidden as a Draft until this time arrives.</p>
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div><div className="text-sm font-medium">Free for everyone</div><div className="text-xs text-muted-foreground">No paywall on any page</div></div>
            <Switch checked={isFree} onCheckedChange={setIsFree} />
          </div>
          {!isFree && (
            <div className="space-y-1.5">
              <Label>Free preview pages</Label>
              <Input type="number" min={0} value={freePages} onChange={e => setFreePages(Math.max(0, parseInt(e.target.value) || 0))} />
              <p className="text-xs text-muted-foreground">0 = fully locked. First {freePages} page{freePages === 1 ? '' : 's'} shown free; the rest need a subscription.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Upload file <span className="text-muted-foreground text-xs">(optional — can upload later)</span></Label>
            <div
              className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-12 transition-colors hover:border-primary/50 hover:bg-muted/50"
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
            >
              <input type="file" multiple accept=".pdf,image/png,image/jpeg,image/webp" onChange={e => onFilesChange(e.target.files)} className="absolute inset-0 cursor-pointer opacity-0" />
              <div className="pointer-events-none flex flex-col items-center space-y-2">
                <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                {files.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Drag &amp; drop a <strong>PDF</strong> or <strong>multiple images</strong>, or click to browse
                  </div>
                ) : isPdf ? (
                  <div className="text-sm font-medium">{files[0].name} <span className="text-muted-foreground">({(files[0].size / 1024 / 1024).toFixed(1)} MB)</span></div>
                ) : (
                  <div className="text-sm font-medium">{files.length} image{files.length > 1 ? 's' : ''} selected</div>
                )}
              </div>
            </div>
            {files.length > 0 && (
              <div className="flex justify-between items-center px-1">
                <button type="button" onClick={() => setFiles([])} className="text-xs text-muted-foreground hover:text-foreground">✕ Remove file(s)</button>
                
                <label className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
                  {coverFile ? coverFile.name : 'Upload Custom Thumbnail'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onCoverChange} className="hidden" />
                </label>
              </div>
            )}
          </div>

          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Creating…' : (files.length > 0 ? 'Create & Upload' : 'Create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── PDF / Image Upload Modal (replace after creation) ──────────────────── */
function UploadModal({ slug, token, paper, onClose }: { slug: string; token: string; paper: any; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [step, setStep] = useState<'form' | 'uploading' | 'done'>('form');
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState('');

  const isPdf = files.length === 1 && files[0].type === 'application/pdf';

  const onFilesChange = (picked: FileList | null) => {
    if (!picked) return;
    const arr = Array.from(picked);
    const pdfs = arr.filter(f => f.type === 'application/pdf');
    if (pdfs.length > 0) { setFiles([pdfs[0]]); return; }
    const imgs = arr.filter(f => f.type.startsWith('image/'));
    if (imgs.length > 0) setFiles(imgs);
  };

  const onCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCoverFile(e.target.files[0]);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) return;
    setStep('uploading'); setError('');
    
    let finalFiles = files;
    let finalCover = coverFile;
    if (isPdf) {
      setProgressMsg('Converting PDF pages to crisp WebP images...');
      try {
        const { pages, cover } = await convertPdfToWebpPages(files[0], setProgressMsg);
        finalFiles = pages;
        if (!finalCover) finalCover = cover;
        setProgressMsg('Uploading pages...');
      } catch (err: any) {
        setError('PDF conversion failed: ' + err.message);
        setStep('form'); return;
      }
    }

    const res = await portalApi.uploadPages(slug, paper.id, finalFiles, token, finalCover ?? undefined);
    if (!res.ok) { setError(res.error?.message ?? 'Upload failed'); setStep('form'); return; }
    setStep('done');
    setTimeout(onClose, 1400);
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        {step === 'done' ? (
          <div className="py-8 text-center"><CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-400" /><div className="text-lg font-semibold">Upload complete!</div></div>
        ) : step === 'uploading' ? (
          <div className="py-8 text-center">
            <div className="spinner mx-auto mb-4" />
            <div className="text-lg font-semibold">{isPdf ? 'Processing PDF…' : 'Uploading images…'}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isPdf ? progressMsg : `Storing ${files.length} image${files.length > 1 ? 's' : ''}…`}
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader><DialogTitle>{paper.r2_key ? 'Replace Content' : 'Upload Content'}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Upload a single <strong>PDF</strong> (auto-split into pages) or select <strong>multiple images</strong> (one per page, sorted by filename).
            </p>
            <div
              className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-12 transition-colors hover:border-primary/50 hover:bg-muted/50"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); onFilesChange(e.dataTransfer.files); }}
            >
              <input type="file" multiple accept=".pdf,image/png,image/jpeg,image/webp" onChange={e => onFilesChange(e.target.files)} className="absolute inset-0 cursor-pointer opacity-0" />
              <div className="pointer-events-none flex flex-col items-center space-y-2">
                <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                {files.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Drag &amp; drop a PDF or images, or click to browse</div>
                ) : isPdf ? (
                  <div className="text-sm font-medium">{files[0].name} <span className="text-muted-foreground">({(files[0].size / 1024 / 1024).toFixed(1)} MB)</span></div>
                ) : (
                  <div className="text-sm font-medium">{files.length} image{files.length > 1 ? 's' : ''} selected</div>
                )}
              </div>
            </div>
            {files.length > 0 && (
              <div className="flex justify-between items-center px-1">
                <button type="button" onClick={() => setFiles([])} className="text-xs text-muted-foreground hover:text-foreground">✕ Remove file(s)</button>
                
                <label className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
                  {coverFile ? coverFile.name : 'Upload Custom Thumbnail'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onCoverChange} className="hidden" />
                </label>
              </div>
            )}
            {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
            <DialogFooter><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!files.length}>Upload</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

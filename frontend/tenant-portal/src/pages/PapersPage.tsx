import { useEffect, useState, useCallback } from 'react';
import { portalApi } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Newspaper, Plus, Upload, FileText, CheckCircle2, Layers } from 'lucide-react';

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
          <p className="text-sm text-muted-foreground">An edition is a publication title (e.g. "Daily Times"). Create one to start publishing.</p>
          <Button onClick={() => setModal('edition')}><Plus className="h-4 w-4" /> Create Edition</Button>
        </CardContent></Card>
      ) : (
        <>
          {/* Edition selector + tier assignment */}
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
              {edition?.tier_id ? <>Premium papers here unlock with the <Badge variant="default">{tierName(edition.tier_id)}</Badge> tier.</> : 'This edition has no tier — premium papers cannot be unlocked until you assign one.'}
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
                      <TableHead>Free preview</TableHead><TableHead>Status</TableHead><TableHead>PDF</TableHead>
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
                          <button onClick={() => togglePublish(p)} className="cursor-pointer">
                            <Badge variant={p.status === 'published' ? 'success' : 'muted'}>{p.status}</Badge>
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {p.r2_key ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="h-3.5 w-3.5" /> {p.page_count}p</span> : <span className="text-xs text-muted-foreground">No PDF</span>}
                            <Button variant="secondary" size="sm" onClick={() => setUpload(p)}><Upload className="h-3.5 w-3.5" /> {p.r2_key ? 'Replace' : 'Upload'}</Button>
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
    </div>
  );
}

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

function PaperModal({ slug, token, editionId, onClose }: { slug: string; token: string; editionId: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isFree, setIsFree] = useState(false);
  const [freePages, setFreePages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await portalApi.createEpaper(slug, editionId, {
      title, publish_date: date, is_free: isFree, free_page_count: isFree ? 0 : freePages, publish_type: 'instant',
    }, token);
    setBusy(false);
    if (!res.ok) { setError(res.error?.message ?? 'Failed'); return; }
    onClose();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Paper Issue</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label>Title (optional)</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Morning Edition" /></div>
          <div className="space-y-1.5"><Label>Publish date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div><div className="text-sm font-medium">Free for everyone</div><div className="text-xs text-muted-foreground">No paywall on any page</div></div>
            <Switch checked={isFree} onCheckedChange={setIsFree} />
          </div>
          {!isFree && (
            <div className="space-y-1.5">
              <Label>Free preview pages</Label>
              <Input type="number" min={0} value={freePages} onChange={e => setFreePages(Math.max(0, parseInt(e.target.value) || 0))} />
              <p className="text-xs text-muted-foreground">0 = fully locked. First {freePages} page{freePages === 1 ? '' : 's'} shown free; the rest need an active subscription.</p>
            </div>
          )}
          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          <DialogFooter><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UploadModal({ slug, token, paper, onClose }: { slug: string; token: string; paper: any; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<'form' | 'uploading' | 'done'>('form');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setStep('uploading'); setError('');
    const res = await portalApi.uploadPdf(slug, paper.id, file, token);
    if (!res.ok) { setError(res.error?.message ?? 'Upload failed'); setStep('form'); return; }
    setStep('done');
    setTimeout(onClose, 1400);
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        {step === 'done' ? (
          <div className="py-8 text-center"><CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-400" /><div className="text-lg font-semibold">PDF split &amp; stored</div></div>
        ) : step === 'uploading' ? (
          <div className="py-8 text-center"><div className="spinner mx-auto mb-4" /><div className="text-lg font-semibold">Splitting pages…</div><p className="mt-1 text-sm text-muted-foreground">Uploading &amp; slicing at the edge</p></div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader><DialogTitle>Upload PDF</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Each page is stored separately so the paywall can serve free pages without leaking locked ones.</p>
            <div
              onClick={() => document.getElementById('pdf-in')!.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') setFile(f); }}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
            >
              <input id="pdf-in" type="file" accept="application/pdf" className="hidden" onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
              <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              {file ? <div className="text-sm font-medium">{file.name} <span className="text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></div>
                : <div className="text-sm text-muted-foreground">Drag &amp; drop a PDF, or click to browse</div>}
            </div>
            {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
            <DialogFooter><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!file}>Upload</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

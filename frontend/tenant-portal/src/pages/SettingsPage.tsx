import { useState, useCallback, useRef } from 'react';
import { portalApi } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useEffect } from 'react';
import { ImageIcon, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';

interface Props { slug: string; token: string; onSettingsChange?: (s: any) => void; }

const THEMES = [
  { id: 'modern', label: 'Modern Dark', description: 'Sleek dark UI with vibrant accent colors' },
  { id: 'classic', label: 'Classic Serif', description: 'Elegant newspaper-inspired typography' },
  { id: 'bold', label: 'Bold & Bright', description: 'High-contrast, impactful headlines' },
  { id: 'minimal', label: 'Minimal White', description: 'Clean white background, minimal chrome' },
];

export function SettingsPage({ slug, token, onSettingsChange }: Props) {
  const [orgName, setOrgName] = useState('');
  const [themeId, setThemeId] = useState('modern');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    const res = await portalApi.getSettings(slug, token);
    if (res.ok && res.data) {
      setOrgName(res.data.org_name ?? '');
      setThemeId(res.data.theme_id ?? 'modern');
      if (res.data.logo_url) setLogoPreview(portalApi.logoUrl(slug) + `?t=${Date.now()}`);
    }
  }, [slug, token]);

  useEffect(() => { load(); }, [load]);

  const handleLogoFile = (f: File) => {
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    setBusy(true); setError(''); setSaved(false);
    // Upload logo first if changed
    if (logoFile) {
      const logoRes = await portalApi.uploadLogo(slug, logoFile, token);
      if (!logoRes.ok) { setError('Logo upload failed'); setBusy(false); return; }
    }
    // Save text settings
    const res = await portalApi.updateSettings(slug, { org_name: orgName || null, theme_id: themeId }, token);
    setBusy(false);
    if (!res.ok) { setError(res.error?.message ?? 'Failed to save'); return; }
    setSaved(true);
    onSettingsChange?.({ org_name: orgName, theme_id: themeId, logo_url: logoPreview });
    setTimeout(() => setSaved(false), 3000);
  };

  const handleDeleteOrganization = async () => {
    if (deleteConfirmText !== slug) return;
    setIsDeleting(true);
    setDeleteError('');
    const res = await portalApi.deleteOrganization(slug, token);
    if (!res.ok) {
      setDeleteError(res.error?.message || 'Failed to delete organization');
      setIsDeleting(false);
    } else {
      localStorage.removeItem('epaper:orgToken');
      localStorage.removeItem('epaper:tenantStatus');
      window.location.href = '/';
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-700 tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure your publication's branding for the reader-facing portal.</p>
      </div>

      {/* Logo */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Logo</h2>
          <p className="text-sm text-muted-foreground">Displayed in the reader header and on sign-in/sign-up pages.</p>
          <div className="flex items-center gap-6">
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleLogoFile(f); }}
              className="relative flex h-24 w-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 transition hover:border-primary/60 overflow-hidden"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleLogoFile(e.target.files[0])} />
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Click or drag to upload. PNG, JPG, SVG — recommended 256×256px.</p>
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Upload Logo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Org Name */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="text-base font-semibold">Organization Name</h2>
          <p className="text-sm text-muted-foreground">Shown in the reader header alongside your logo.</p>
          <div className="max-w-sm space-y-1.5">
            <Label>Name</Label>
            <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="e.g. The Morning Herald" />
          </div>
        </CardContent>
      </Card>

      {/* Reader Theme */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Reader Theme</h2>
          <p className="text-sm text-muted-foreground">Controls the look of your public-facing reader portal, sign-in, and sign-up pages.</p>
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            {THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setThemeId(t.id)}
                className={`rounded-lg border-2 p-4 text-left transition-all ${themeId === t.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 bg-card/40'}`}
              >
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save Settings'}
        </Button>
        {saved && <span className="flex items-center gap-1.5 text-sm text-green-400"><CheckCircle2 className="h-4 w-4" /> Saved!</span>}
      </div>

      {/* Danger Zone */}
      <div className="pt-10">
        <div className="rounded-lg border border-red-500/30 p-6">
          <h2 className="text-lg font-semibold text-red-500 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Danger Zone
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Permanently delete your organization, including all editions, reader accounts, and settings. 
            All active reader subscriptions will be cancelled immediately. Your recurring platform subscription will also be cancelled.
            This action cannot be undone.
          </p>
          <div className="mt-4">
            <Button variant="destructive" onClick={() => setDeleteModalOpen(true)}>
              Delete Organization
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-500">Delete Organization</DialogTitle>
            <DialogDescription>
              This action is irreversible. All data, settings, and reader accounts will be permanently destroyed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Type <span className="font-bold font-mono text-foreground">{slug}</span> to confirm</Label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={slug}
              />
            </div>
            {deleteError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {deleteError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" disabled={deleteConfirmText !== slug || isDeleting} onClick={handleDeleteOrganization}>
              {isDeleting ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { portalApi } from '../lib/api';
import { formatINR } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Layers, Plus, Trash2, Tag, Users, Pencil, Check } from 'lucide-react';

interface Props { slug: string; token: string; }

const INTERVAL_LABEL: Record<string, string> = { monthly: 'Monthly', '6month': '6 Months', '12month': '12 Months' };

export function PlansPage({ slug, token }: Props) {
  const [tiers, setTiers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ type: 'tier' | 'plan', data?: any } | null>(null);

  const load = useCallback(async () => {
    const [t, p, s] = await Promise.all([
      portalApi.getTiers(slug, token),
      portalApi.getPlans(slug, token),
      portalApi.getReaderSubscriptions(slug, token),
    ]);
    if (t.ok && t.data) setTiers(t.data.items ?? []);
    if (p.ok && p.data) setPlans(p.data.items ?? []);
    if (s.ok && s.data) setSubs(s.data.items ?? []);
    setLoading(false);
  }, [slug, token]);

  useEffect(() => { load(); }, [load]);

  const delTier = async (id: string) => { await portalApi.deleteTier(slug, id, token); load(); };
  const delPlan = async (id: string) => { await portalApi.deletePlan(slug, id, token); load(); };

  if (loading) return <div className="flex justify-center py-24"><div className="spinner" /></div>;

  const activeSubs = subs.filter(s => s.status === 'active').length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl font-700 tracking-tight">Reader Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Define content tiers and the plans readers buy to unlock premium papers.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Tiers', value: tiers.length, icon: Layers },
          { label: 'Active Plans', value: plans.filter(p => p.active).length, icon: Tag },
          { label: 'Active Subscribers', value: activeSubs, icon: Users },
        ].map(k => (
          <Card key={k.label}><CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5"><k.icon className="h-5 w-5 text-primary" /></div>
            <div><div className="text-2xl font-700 leading-none">{k.value}</div><div className="mt-1 text-xs text-muted-foreground">{k.label}</div></div>
          </CardContent></Card>
        ))}
      </div>

      {/* Tiers */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Content Tiers</CardTitle><CardDescription>Assign editions to a tier; a subscription to that tier unlocks its papers.</CardDescription></div>
          <Button variant="secondary" size="sm" onClick={() => setModal({ type: 'tier' })}><Plus className="h-4 w-4" /> New Tier</Button>
        </CardHeader>
        <CardContent>
          {tiers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No tiers yet. Create one (e.g. "Premium", "Magazine").</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tiers.map(t => (
                <div key={t.id} className="flex items-start justify-between rounded-lg border border-border p-4">
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    {t.description && <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>}
                    <div className="mt-2 text-xs text-muted-foreground">{plans.filter(p => p.tier_id === t.id).length} plan(s)</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setModal({ type: 'tier', data: t })} className="p-1 text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => delTier(t.id)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plans */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Subscription Plans</CardTitle><CardDescription>Pricing readers see at checkout.</CardDescription></div>
          <Button size="sm" onClick={() => setModal({ type: 'plan' })} disabled={tiers.length === 0}><Plus className="h-4 w-4" /> New Plan</Button>
        </CardHeader>
        <CardContent>
          {tiers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Create a tier first, then add plans to it.</p>
          ) : plans.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No plans yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map(p => {
                const net = Math.round(p.price_paise * (1 - (p.offer_pct || 0) / 100));
                const finalPaise = Math.round(net * (1 + (p.tax_percentage || 0) / 100));
                return (
                  <div key={p.id} className="relative rounded-xl border border-border p-5">
                    {!p.active && <Badge variant="muted" className="absolute right-3 top-3">Inactive</Badge>}
                    <div className="text-xs uppercase tracking-wide text-primary">{p.tier_name}</div>
                    <div className="mt-1 font-semibold">{p.name}</div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-2xl font-700">{formatINR(finalPaise)}</span>
                      {(p.offer_pct > 0 || (p.tax_percentage || 0) > 0) && <span className="text-sm text-muted-foreground line-through">{formatINR(p.price_paise)}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {INTERVAL_LABEL[p.interval] ?? p.interval} 
                      {p.tax_percentage > 0 && ` (+${p.tax_percentage}% tax)`}
                    </div>
                    {p.offer_pct > 0 && <Badge variant="success" className="mt-3">{p.offer_label || `${p.offer_pct}% off`}</Badge>}
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => setModal({ type: 'plan', data: p })} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      <button onClick={() => delPlan(p.id)} className="text-xs text-muted-foreground hover:text-red-400 flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {modal?.type === 'tier' && <TierModal slug={slug} token={token} initialData={modal.data} onClose={() => { setModal(null); load(); }} />}
      {modal?.type === 'plan' && <PlanModal slug={slug} token={token} tiers={tiers} initialData={modal.data} onClose={() => { setModal(null); load(); }} />}
    </div>
  );
}

const TIER_FEATURES = [
  'Daily Epapers',
  'Archived Editions',
  'Weekly Magazines',
  'Sunday Supplements',
  'Regional Editions'
];

function TierModal({ slug, token, initialData, onClose }: { slug: string; token: string; initialData?: any; onClose: () => void }) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [features, setFeatures] = useState<string[]>(initialData?.description ? initialData.description.split(',').map((s: string) => s.trim()) : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  
  const toggleFeature = (f: string) => setFeatures(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setBusy(true); setError('');
    const description = features.join(', ');
    const res = initialData
      ? await portalApi.updateTier(slug, initialData.id, { name, description }, token)
      : await portalApi.createTier(slug, { name, description }, token);
    setBusy(false);
    if (!res.ok) { setError(res.error?.message ?? 'Failed'); return; }
    onClose();
  };
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initialData ? 'Edit Content Tier' : 'New Content Tier'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Premium" autoFocus /></div>
          <div className="space-y-1.5">
            <Label>Tier Features</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {TIER_FEATURES.map(f => (
                <Badge key={f} variant={features.includes(f) ? 'default' : 'outline'} className="cursor-pointer select-none" onClick={() => toggleFeature(f)}>
                  {features.includes(f) && <Check className="mr-1 h-3 w-3" />} {f}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Select the features included in this tier. Readers will see this list.</p>
          </div>
          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          <DialogFooter><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : (initialData ? 'Save Changes' : 'Create')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlanModal({ slug, token, tiers, initialData, onClose }: { slug: string; token: string; tiers: any[]; initialData?: any; onClose: () => void }) {
  const [tierId, setTierId] = useState(initialData?.tier_id ?? (tiers[0]?.id ?? ''));
  const [name, setName] = useState(initialData?.name ?? '');
  const [interval, setInterval] = useState(initialData?.interval ?? 'monthly');
  const [rupees, setRupees] = useState(initialData ? String(initialData.price_paise / 100) : '99');
  const [offerPct, setOfferPct] = useState(initialData ? String(initialData.offer_pct) : '0');
  const [offerLabel, setOfferLabel] = useState(initialData?.offer_label ?? '');
  const [taxPct, setTaxPct] = useState(initialData ? String(initialData.tax_percentage || '0') : '0');
  const [includeTax, setIncludeTax] = useState(initialData ? (initialData.tax_percentage > 0) : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tierId || !name) { setError('Tier and name required'); return; }
    setBusy(true); setError('');
    const payload = {
      tier_id: tierId, name, interval,
      price_paise: Math.round(parseFloat(rupees || '0') * 100),
      tax_percentage: includeTax ? (parseInt(taxPct) || 0) : 0,
      offer_pct: parseInt(offerPct) || 0,
      offer_label: offerLabel || undefined,
    };
    const res = initialData
      ? await portalApi.updatePlan(slug, initialData.id, payload, token)
      : await portalApi.createPlan(slug, payload, token);
    setBusy(false);
    if (!res.ok) { setError(res.error?.message ?? 'Failed'); return; }
    onClose();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initialData ? 'Edit Subscription Plan' : 'New Subscription Plan'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tier</Label>
              <Select value={tierId} onValueChange={setTierId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{tiers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Billing interval</Label>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="6month">6 Months</SelectItem>
                  <SelectItem value="12month">12 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Plan name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Premium Monthly" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Price (₹)</Label><Input type="number" min={0} value={rupees} onChange={e => setRupees(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Offer (% off)</Label><Input type="number" min={0} max={100} value={offerPct} onChange={e => setOfferPct(e.target.value)} /></div>
          </div>
          {parseInt(offerPct) > 0 && <div className="space-y-1.5"><Label>Offer label</Label><Input value={offerLabel} onChange={e => setOfferLabel(e.target.value)} placeholder="e.g. Launch offer" /></div>}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includeTax} onChange={e => setIncludeTax(e.target.checked)} className="rounded border-input" />
              Include Taxes
            </Label>
            {includeTax && (
              <div className="mt-2">
                <Label>Tax Percentage (%)</Label>
                <Input type="number" min={0} max={100} value={taxPct} onChange={e => setTaxPct(e.target.value)} />
              </div>
            )}
          </div>
          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          <DialogFooter><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : (initialData ? 'Save Changes' : 'Create Plan')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

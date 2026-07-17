import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalApi } from '../lib/api';
import { formatBytes } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { lazy, Suspense } from 'react';
import { Newspaper, Eye, HardDrive, CheckCircle2, Copy, Upload, CreditCard, ArrowUpRight, RotateCcw } from 'lucide-react';

interface OrgDashboardProps { slug: string; token: string; }

const DashboardCharts = lazy(() => import('../components/DashboardCharts'));

export function OrgDashboard({ slug, token }: OrgDashboardProps) {
  const [editions, setEditions] = useState<any[]>([]);
  const [papers, setPapers] = useState<any[]>([]);
  const [stats, setStats] = useState({ disk_usage_bytes: 0, pageviews: 0 });
  const [billing, setBilling] = useState<any>(null);
  const [domain, setDomain] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      portalApi.getEditions(slug, token),
      portalApi.getTenantStats(slug, token),
      portalApi.getPlatformBillingStatus(slug, token),
      portalApi.getDomain(token),
    ]).then(async ([edRes, statsRes, billRes, domRes]) => {
      const eds = edRes.ok && edRes.data ? edRes.data.items ?? [] : [];
      setEditions(eds);
      if (statsRes.ok && statsRes.data) setStats(statsRes.data);
      if (billRes.ok && billRes.data) setBilling(billRes.data);
      if (domRes.ok && domRes.data) setDomain(domRes.data);
      // pull papers for the most recent few editions for the table + count
      const paperLists = await Promise.all(
        eds.slice(0, 8).map((e: any) => portalApi.getEpapers(slug, e.id, token).then(r => (r.ok && r.data ? (r.data.items ?? []).map((p: any) => ({ ...p, edition_title: e.title })) : [])))
      );
      setPapers(paperLists.flat());
      setLoading(false);
    });
  }, [slug, token]);

  const plan = billing?.plan || 'free';
  const isEnterprise = plan === 'enterprise';

  // Use limits from DB, fallback to hardcoded if not loaded yet
  const limitMB = billing?.limits?.storage_mb ?? (isEnterprise ? 2000000 : plan === 'growth' ? 51200 : plan === 'free' ? 100 : 100);
  const diskLimitBytes = limitMB * 1024 * 1024;
  const diskUsed = stats.disk_usage_bytes || 0;
  const diskFree = Math.max(0, diskLimitBytes - diskUsed);

  const diskData = [
    { name: 'Used', value: diskUsed || 1 },
    { name: 'Free', value: diskFree },
  ];
  const publishedPapers = papers.filter(p => p.status === 'published').length;

  // 6-month traffic trend — synthesized shape anchored to the real total until historical data lands.
  const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  const base = stats.pageviews || 0;
  const trafficData = months.map((m, i) => ({ name: m, views: Math.round(base * [0.05, 0.09, 0.14, 0.22, 0.3, 0.2][i]) }));
  if (base > 0 && trafficData.every(d => d.views === 0)) {
    trafficData[5].views = base; // Assign to latest month if rounding zeroed everything
  }

  const publicLink = domain?.custom_domain ? `https://${domain.custom_domain}` : `${window.location.origin}/read/${slug}`;

  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(publicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="flex justify-center py-24"><div className="spinner" /></div>;
  }

  const kpis = [
    { label: 'Editions', value: editions.length, icon: Newspaper, tint: 'text-primary' },
    { label: 'Published Papers', value: publishedPapers, icon: CheckCircle2, tint: 'text-green-400' },
    { label: 'Total Views', value: stats.pageviews.toLocaleString(), icon: Eye, tint: 'text-sky-400' },
    { label: 'Storage Used', value: formatBytes(diskUsed), icon: HardDrive, tint: 'text-amber-400', isStorage: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl font-700 tracking-tight">Newsroom Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Publishing performance for <span className="text-foreground">{slug}</span></p>
        </div>
        <Button asChild><Link to="/portal/papers"><Upload className="h-4 w-4" /> Publish Paper</Link></Button>
      </div>

      {/* Public reader link */}
      <Card className="border-primary/25">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><ArrowUpRight className="h-4 w-4 text-primary" /> Public Reader Link</div>
            <p className="mt-1 text-sm text-muted-foreground">Share with readers to browse your published papers.</p>
          </div>
          <div className="flex items-center gap-2">
            <code className="rounded-md bg-black/30 px-3 py-1.5 font-mono text-xs text-primary">{publicLink}</code>
            <Button variant="secondary" size="sm" onClick={handleCopy} className="min-w-[80px]">
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={publicLink} target="_blank" rel="noopener noreferrer">
                Open <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5"><k.icon className={`h-5 w-5 ${k.tint}`} /></div>
                <div>
                  <div className="text-2xl font-700 leading-none">{k.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{k.label}</div>
                </div>
              </div>
              {k.isStorage && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    const res = await portalApi.recalculateStats(slug, token);
                    if (res.ok && res.data) {
                      setStats(s => ({ ...s, disk_usage_bytes: res.data.disk_usage_bytes }));
                    }
                  }}
                  title="Recalculate Storage"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts (Lazy Loaded) */}
      <Suspense fallback={<div className="h-64 flex items-center justify-center border border-dashed border-border rounded-xl"><div className="spinner" /></div>}>
        <DashboardCharts 
          trafficData={trafficData} 
          diskData={diskData} 
          diskUsed={diskUsed} 
          diskLimitBytes={diskLimitBytes} 
          formatBytes={formatBytes} 
          isEnterprise={isEnterprise} 
          limitMB={limitMB} 
          plan={plan} 
        />
      </Suspense>

      {/* Recent papers */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent Papers</CardTitle>
          <Link to="/portal/papers" className="text-sm text-primary hover:underline">View all</Link>
        </CardHeader>
        <CardContent className="p-0">
          {papers.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-muted-foreground">No papers published yet. <Link to="/portal/papers" className="text-primary hover:underline">Create your first paper</Link>.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paper</TableHead><TableHead>Edition</TableHead><TableHead>Date</TableHead>
                  <TableHead>Access</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {papers.slice(0, 6).map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.title || 'Untitled'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.edition_title}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(p.publish_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {p.is_free ? <Badge variant="success">Free</Badge> : <Badge variant="warning">{p.free_page_count > 0 ? `${p.free_page_count} free pages` : 'Premium'}</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'published' ? 'success' : p.status === 'draft' ? 'default' : 'muted'}>{p.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

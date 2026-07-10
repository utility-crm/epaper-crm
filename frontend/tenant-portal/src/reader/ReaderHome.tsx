import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readerApi } from '../lib/api';
import { ReaderSession } from './lib';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationLink, PaginationNext, PaginationEllipsis } from '../components/ui/pagination';
import { Newspaper, Lock } from 'lucide-react';

interface Props {
  slug: string;
  basePath?: string;
  session: ReaderSession | null;
  orgName?: string | null;
}

export function ReaderHome({ slug, basePath = '', session, orgName }: Props) {
  const [papers, setPapers] = useState<any[]>([]);
  const [editions, setEditions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filterEdition, setFilterEdition] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filterEdition, filterStart, filterEnd]);

  useEffect(() => {
    readerApi.getPublicEditions(slug).then(res => {
      if (res.ok && res.data) setEditions(res.data.items ?? []);
    });
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    readerApi.getPapers(slug, { 
      edition_id: filterEdition || undefined,
      start_date: filterStart || undefined,
      end_date: filterEnd || undefined,
      page
    }).then(res => {
      if (res.ok && res.data) {
        setPapers(res.data.items ?? []);
        const limit = res.data.limit || 12;
        const total = res.data.total || 0;
        setTotalPages(Math.max(1, Math.ceil(total / limit)));
      }
      setLoading(false);
    });
  }, [slug, session, filterEdition, filterStart, filterEnd, page]);

  if (loading && papers.length === 0) return <div className="flex justify-center py-24"><div className="spinner" /></div>;

  const displayName = orgName || slug;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-serif text-3xl font-700 tracking-tight">{displayName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Browse published editions. Free papers open instantly; premium papers show a preview.</p>

      {/* Filter Bar */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium">Edition</label>
          <Select value={filterEdition || "all"} onValueChange={v => setFilterEdition(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 bg-transparent shadow-sm">
              <SelectValue placeholder="All Editions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Editions</SelectItem>
              {editions.map(e => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium">From Date</label>
          <input 
            type="date" 
            value={filterStart} onChange={e => setFilterStart(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium">To Date</label>
          <input 
            type="date" 
            value={filterEnd} onChange={e => setFilterEnd(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={() => { setFilterEdition(''); setFilterStart(''); setFilterEnd(''); }}
            className="h-9 px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </div>

      {papers.length === 0 ? (
        <div className="py-24 text-center text-muted-foreground"><Newspaper className="mx-auto mb-3 h-10 w-10" /> No papers found matching criteria.</div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {papers.map(p => (
            <Link key={p.id} to={`${basePath}/paper/${p.id}`}>
              <Card className="group h-full overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10">
                <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900">
                  {p.cover_key ? (
                    <PaperThumbnail
                      slug={slug}
                      paperId={p.id}
                      alt={p.title || p.edition_title}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Newspaper className="h-10 w-10 text-white/20" />
                    </div>
                  )}
                  {!p.is_free && (
                    <div className="absolute right-2 top-2">
                      <Badge variant="warning"><Lock className="mr-1 h-3 w-3" />Premium</Badge>
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <div className="truncate font-medium">{p.title || p.edition_title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {p.edition_title} · {new Date(p.publish_date).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {papers.length > 0 && totalPages > 1 && (
        <div className="mt-8 flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setPage(p => Math.max(1, p - 1))} 
                  className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <PaginationItem key={p} className={
                  totalPages > 7 && Math.abs(page - p) > 2 && p !== 1 && p !== totalPages ? "hidden" : ""
                }>
                  <PaginationLink 
                    isActive={page === p} 
                    onClick={() => setPage(p)}
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}

              <PaginationItem>
                <PaginationNext 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}

/* ── Paper Thumbnail ─────────────────────────────────────────────────────── */
function PaperThumbnail({ slug, paperId, alt }: { slug: string; paperId: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const src = readerApi.coverUrl(slug, paperId);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Newspaper className="h-10 w-10 text-white/20" />
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Newspaper className="h-10 w-10 animate-pulse text-white/20" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </>
  );
}

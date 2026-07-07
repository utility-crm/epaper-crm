import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readerApi, portalApi } from '../lib/api';
import { ReaderSession } from './lib';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Newspaper, Lock } from 'lucide-react';

interface Props {
  slug: string;
  session: ReaderSession | null;
  orgName?: string | null;
}

export function ReaderHome({ slug, session, orgName }: Props) {
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readerApi.getPapers(slug).then(res => {
      if (res.ok && res.data) setPapers(res.data.items ?? []);
      setLoading(false);
    });
  }, [slug, session]);

  if (loading) return <div className="flex justify-center py-24"><div className="spinner" /></div>;

  const displayName = orgName || slug;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-serif text-3xl font-700 tracking-tight">{displayName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Browse published editions. Free papers open instantly; premium papers show a preview.</p>

      {papers.length === 0 ? (
        <div className="py-24 text-center text-muted-foreground"><Newspaper className="mx-auto mb-3 h-10 w-10" /> No papers published yet.</div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {papers.map(p => (
            <Link key={p.id} to={`/read/${slug}/paper/${p.id}`}>
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
    </div>
  );
}

/* ── Paper Thumbnail ─────────────────────────────────────────────────────── */
function PaperThumbnail({ slug, paperId, alt }: { slug: string; paperId: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const src = portalApi.coverUrl(slug, paperId);

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

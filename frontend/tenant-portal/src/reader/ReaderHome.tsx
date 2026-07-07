import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readerApi } from '../lib/api';
import { ReaderSession } from './lib';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Newspaper, Lock } from 'lucide-react';

interface Props { slug: string; session: ReaderSession | null; }

export function ReaderHome({ slug, session }: Props) {
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readerApi.getPapers(slug).then(res => {
      if (res.ok && res.data) setPapers(res.data.items ?? []);
      setLoading(false);
    });
  }, [slug, session]);

  if (loading) return <div className="flex justify-center py-24"><div className="spinner" /></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-serif text-3xl font-700 tracking-tight">Latest Papers</h1>
      <p className="mt-1 text-sm text-muted-foreground">Browse published editions. Free papers open instantly; premium papers show a preview.</p>

      {papers.length === 0 ? (
        <div className="py-24 text-center text-muted-foreground"><Newspaper className="mx-auto mb-3 h-10 w-10" /> No papers published yet.</div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {papers.map(p => (
            <Link key={p.id} to={`/read/${slug}/paper/${p.id}`}>
              <Card className="group h-full overflow-hidden transition-colors hover:border-primary/50">
                <div className="relative flex aspect-[3/4] items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                  <Newspaper className="h-10 w-10 text-white/20" />
                  {!p.is_free && (
                    <div className="absolute right-2 top-2">
                      <Badge variant="warning"><Lock className="mr-1 h-3 w-3" /> Premium</Badge>
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <div className="truncate font-medium">{p.title || p.edition_title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{p.edition_title} · {new Date(p.publish_date).toLocaleDateString()}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

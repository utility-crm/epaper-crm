import { useEffect, useState } from 'react';
import { Routes, Route, useParams, Navigate, Link } from 'react-router-dom';
import { readerApi } from '../lib/api';
import { useReaderSession } from './lib';
import { ReaderHome } from './ReaderHome';
import { PaperViewer } from './PaperViewer';
import { ReaderAuthDialog } from './ReaderAuthDialog';
import { Button } from '../components/ui/button';
import { Newspaper } from 'lucide-react';

// Resolves which publication (slug) this reader session is for
function ReaderShell() {
  const params = useParams();
  const explicitSlug = params.slug;
  const [slug, setSlug] = useState<string | null>(explicitSlug ?? null);
  const [resolving, setResolving] = useState(!explicitSlug);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (explicitSlug) { setSlug(explicitSlug); return; }
    readerApi.resolveDomain(window.location.host).then(res => {
      if (res.ok && res.data) setSlug(res.data.slug);
      else setNotFound(true);
      setResolving(false);
    });
  }, [explicitSlug]);

  if (resolving) return <div className="flex h-screen items-center justify-center"><div className="spinner" /></div>;
  if (notFound || !slug) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
        <Newspaper className="h-10 w-10 text-muted-foreground" />
        <h1 className="font-serif text-2xl font-700">Publication not found</h1>
        <p className="text-sm text-muted-foreground">This domain isn't linked to a publication yet.</p>
      </div>
    );
  }
  return <ReaderInner slug={slug} basePath={explicitSlug ? `/read/${slug}` : '/read'} />;
}

function ReaderInner({ slug, basePath }: { slug: string; basePath: string }) {
  const { session, signIn, signOut } = useReaderSession(slug);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [orgSettings, setOrgSettings] = useState<{ org_name: string | null; logo_url: string | null; theme_id?: string } | null>(null);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    readerApi.getSettings(slug).then(res => {
      if (res.ok && res.data) setOrgSettings(res.data);
    });
  }, [slug]);

  const logoUrl = orgSettings?.logo_url ? `/api/content/${slug}/settings/logo` : null;
  const displayName = orgSettings?.org_name || slug;

  const openAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to={`${basePath}`} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-600 overflow-hidden flex-shrink-0">
              {logoUrl && !logoError ? (
                <img src={logoUrl} alt={displayName} className="h-full w-full object-cover" onError={() => setLogoError(true)} />
              ) : (
                <Newspaper className="h-4 w-4 text-white" />
              )}
            </div>
            <span className="font-serif text-lg font-700">{displayName}</span>
          </Link>
          {session ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground hidden sm:block">{session.reader.email}</span>
              <Button variant="secondary" size="sm" onClick={signOut}>Sign out</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => openAuth('login')}>Sign in</Button>
              <Button size="sm" onClick={() => openAuth('signup')}>Sign up</Button>
            </div>
          )}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<ReaderHome slug={slug} session={session} />} />
        <Route path="/paper/:id" element={<PaperViewer slug={slug} session={session} onRequireAuth={() => openAuth('login')} />} />
        <Route path="*" element={<Navigate to={basePath} replace />} />
      </Routes>

      {authOpen && (
        <ReaderAuthDialog
          slug={slug}
          initialMode={authMode}
          orgName={displayName}
          logoUrl={logoUrl}
          orgSettings={orgSettings}
          onClose={() => setAuthOpen(false)}
          onAuth={s => { signIn(s); setAuthOpen(false); }}
        />
      )}
    </div>
  );
}

export function ReaderApp() {
  return (
    <Routes>
      <Route path="/read/:slug/*" element={<ReaderShell />} />
      <Route path="/read/*" element={<ReaderShell />} />
    </Routes>
  );
}

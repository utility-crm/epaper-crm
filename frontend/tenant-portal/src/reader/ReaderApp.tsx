import { useEffect, useState } from 'react';
import { Routes, Route, useParams, Navigate, Link } from 'react-router-dom';
import { readerApi } from '../lib/api';
import { useReaderSession } from './lib';
import { ReaderHome } from './ReaderHome';
import { PaperViewer } from './PaperViewer';
import { ReaderAuthDialog } from './ReaderAuthDialog';
import { TodayRedirect } from './TodayRedirect';
import { ReaderFooter } from './ReaderFooter';
import { ReaderInfoPage } from './ReaderInfoPage';
import { Button } from '../components/ui/button';
import { Newspaper, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';

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
  return <ReaderInner slug={slug} basePath={explicitSlug ? `/read/${slug}` : ''} />;
}

function ReaderInner({ slug, basePath }: { slug: string; basePath: string }) {
  const { session, signIn, signOut } = useReaderSession(slug);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [orgSettings, setOrgSettings] = useState<{ org_name: string | null; logo_url: string | null; theme_id?: string } | null>(() => {
    if (typeof window !== 'undefined' && (window as any).__EPAPER_INITIAL_SETTINGS__) {
      return (window as any).__EPAPER_INITIAL_SETTINGS__;
    }
    return null;
  });
  const [logoError, setLogoError] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    readerApi.getSettings(slug).then(res => {
      if (!res.ok) {
        if (res.error?.message === 'TENANT_SUSPENDED') {
          setIsSuspended(true);
        } else if (res.error?.message === 'TENANT_DELETED' || res.error?.message === 'Tenant deleted' || res.error?.message === 'Tenant not found' || res.error?.message === 'NOT_FOUND') {
          setIsNotFound(true);
        }
        return;
      }
      if (res.ok && res.data) {
        setOrgSettings(res.data);
        if (res.data.org_name) {
          document.title = res.data.org_name;
        }
        if (res.data.favicon_url) {
          const favUrl = readerApi.faviconUrl(slug) + `?t=${Date.now()}`;
          let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = favUrl;
        }
      }
    });
  }, [slug]);

  if (isNotFound) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center bg-background text-foreground">
        <Newspaper className="h-10 w-10 text-muted-foreground" />
        <h1 className="font-serif text-2xl font-700">Publication not found</h1>
        <p className="text-sm text-muted-foreground">This publication may have been removed or does not exist.</p>
      </div>
    );
  }

  if (isSuspended) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center bg-background text-foreground">
        <ShieldAlert className="h-10 w-10 text-amber-500" />
        <h1 className="font-serif text-2xl font-700">Publication Unavailable</h1>
        <p className="text-sm text-muted-foreground">This publication is temporarily unavailable.</p>
      </div>
    );
  }

  const displayName = orgSettings?.org_name || slug;
  const logoUrl = orgSettings?.logo_url ? readerApi.logoUrl(slug) : null;

  const themeClass = orgSettings?.theme_id === 'theme-classic' ? 'theme-classic' :
                     orgSettings?.theme_id === 'theme-modern' ? 'theme-modern font-sans' :
                     orgSettings?.theme_id === 'theme-bold' ? 'theme-bold' : '';

  const openAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <div className={cn("min-h-screen flex flex-col bg-background text-foreground", themeClass)}>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to={basePath || '/'} className="flex items-center gap-3">
            {logoUrl && !logoError ? (
              <img
                src={logoUrl}
                alt={displayName}
                className="h-10 sm:h-12 w-auto max-w-[220px] object-contain flex-shrink-0"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-red-600 to-rose-700 shadow-md flex-shrink-0">
                <Newspaper className="h-5 w-5 text-white" />
              </div>
            )}
            <span className="font-serif text-lg font-bold tracking-tight">{displayName}</span>
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

      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<ReaderHome slug={slug} basePath={basePath} session={session} orgName={displayName} />} />
          <Route path="today" element={<TodayRedirect slug={slug} basePath={basePath} />} />
          <Route path="paper/:id" element={<PaperViewer slug={slug} basePath={basePath} session={session} orgName={displayName} logoUrl={logoUrl} onRequireAuth={() => openAuth('login')} />} />
          <Route path=":date/:edition/:id" element={<PaperViewer slug={slug} basePath={basePath} session={session} orgName={displayName} logoUrl={logoUrl} onRequireAuth={() => openAuth('login')} />} />
          <Route path="privacy" element={<ReaderInfoPage slug={slug} basePath={basePath} orgName={displayName} type="privacy" />} />
          <Route path="disclaimer" element={<ReaderInfoPage slug={slug} basePath={basePath} orgName={displayName} type="disclaimer" />} />
          <Route path="terms" element={<ReaderInfoPage slug={slug} basePath={basePath} orgName={displayName} type="terms" />} />
          <Route path="about" element={<ReaderInfoPage slug={slug} basePath={basePath} orgName={displayName} type="about" />} />
          <Route path="contact" element={<ReaderInfoPage slug={slug} basePath={basePath} orgName={displayName} type="contact" />} />
          <Route path="*" element={<Navigate to={basePath || '/'} replace />} />
        </Routes>
      </main>

      <ReaderFooter
        slug={slug}
        basePath={basePath}
        orgName={displayName}
        logoUrl={logoUrl}
        orgSettings={orgSettings}
      />

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
      <Route path="/*" element={<ReaderShell />} />
    </Routes>
  );
}

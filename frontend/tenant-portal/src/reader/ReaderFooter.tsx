import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Share2 } from 'lucide-react';

interface FooterLink {
  label: string;
  url: string;
}

interface SocialLinks {
  facebook?: string;
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
}

interface ReaderFooterProps {
  slug: string;
  basePath: string;
  orgName?: string | null;
  logoUrl?: string | null;
  orgSettings?: any;
  latestEditionDate?: string;
}

export function ReaderFooter({
  slug,
  basePath,
  orgName,
  logoUrl,
  orgSettings,
  latestEditionDate,
}: ReaderFooterProps) {
  // Parse custom footer links if configured by the publication writer / admin
  let customLinks: FooterLink[] = [];
  if (orgSettings?.footer_links) {
    try {
      customLinks =
        typeof orgSettings.footer_links === 'string'
          ? JSON.parse(orgSettings.footer_links)
          : orgSettings.footer_links;
    } catch (_) {
      customLinks = [];
    }
  }

  const defaultLinks: FooterLink[] = [
    { label: 'Privacy Policy', url: `${basePath}/privacy` },
    { label: 'Disclaimer', url: `${basePath}/disclaimer` },
    { label: 'Terms And Conditions', url: `${basePath}/terms` },
  ];

  const linksToRender = Array.isArray(customLinks) && customLinks.length > 0 ? customLinks : defaultLinks;

  // Parse social links
  let social: SocialLinks = {};
  if (orgSettings?.social_links) {
    try {
      social =
        typeof orgSettings.social_links === 'string'
          ? JSON.parse(orgSettings.social_links)
          : orgSettings.social_links;
    } catch (_) {
      social = {};
    }
  }

  const formattedDate =
    latestEditionDate ||
    new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const publicationTitle = orgName || slug || 'ePaper';

  return (
    <footer className="w-full bg-[#1e293b] text-slate-200 border-t border-slate-800 font-sans mt-auto">
      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Col 1: Publication Branding */}
        <div className="space-y-3">
          {logoUrl ? (
            <Link to={basePath || '/'} className="inline-block">
              <img
                src={logoUrl}
                alt={publicationTitle}
                className="h-12 w-auto object-contain max-w-[200px]"
              />
            </Link>
          ) : (
            <Link to={basePath || '/'} className="inline-block">
              <h3 className="font-serif text-2xl font-bold tracking-tight text-white hover:text-primary transition-colors">
                {publicationTitle}
              </h3>
            </Link>
          )}
          <p className="text-xs text-slate-400 leading-relaxed">
            विश्वसनीय डिजिटल अखबार • Digital ePaper Edition
          </p>
        </div>

        {/* Col 2: Important Links */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white tracking-wide">
            Important Links
          </h4>
          <ul className="space-y-2 text-xs">
            {linksToRender.map((link, idx) => {
              const rawUrl = (link.url || '').trim();
              const isExternal =
                rawUrl.startsWith('http://') ||
                rawUrl.startsWith('https://') ||
                rawUrl.startsWith('mailto:') ||
                rawUrl.startsWith('tel:') ||
                (rawUrl.includes('.') && !rawUrl.startsWith('/'));
              const finalUrl =
                !isExternal || rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('mailto:') || rawUrl.startsWith('tel:')
                  ? rawUrl
                  : 'https://' + rawUrl;

              return (
                <li key={idx}>
                  {isExternal ? (
                    <a
                      href={finalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <span className="text-amber-500 font-bold mr-2">&gt;</span>
                      <span>{link.label}</span>
                    </a>
                  ) : (
                    <Link
                      to={finalUrl}
                      className="flex items-center text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <span className="text-amber-500 font-bold mr-2">&gt;</span>
                      <span>{link.label}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Col 3: Latest Edition */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white tracking-wide">
            Latest Edition
          </h4>
          <div className="flex items-center gap-2 text-xs text-amber-400 font-medium bg-slate-800/80 border border-slate-700/60 px-3 py-2 rounded-lg w-fit">
            <Calendar className="w-4 h-4 text-amber-500" />
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* Col 4: Social Pages */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white tracking-wide flex items-center gap-1.5">
            <Share2 className="w-4 h-4 text-amber-500" />
            <span>Social Pages</span>
          </h4>
          <div className="flex items-center gap-3 pt-1">
            <a
              href={social.facebook || '#'}
              target={social.facebook ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Facebook"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
            <a
              href={social.twitter || '#'}
              target={social.twitter ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="X (Twitter)"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href={social.instagram || '#'}
              target={social.instagram ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Instagram"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </a>
            <a
              href={social.linkedin || '#'}
              target={social.linkedin ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="LinkedIn"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
              </svg>
            </a>
            <a
              href={social.youtube || '#'}
              target={social.youtube ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="YouTube"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Bottom Copyright & SEO Dofollow Backlink Bar */}
      <div className="border-t border-slate-800/80 bg-[#0f172a] py-4 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-2 text-center text-xs text-slate-400">
          <span>
            © {new Date().getFullYear()} {publicationTitle} | Powered By:{' '}
            <a
              href="https://epaperspace.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-amber-400 font-semibold transition-colors hover:underline"
            >
              EpaperSpace.com
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

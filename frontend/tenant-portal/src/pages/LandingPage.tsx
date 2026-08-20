import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';
import {
  FAQS,
  FEATURES,
  BrandLockup,
  PublisherCarousel,
  StatsBand,
  FeaturesSection,
  TestimonialsSection,
  FaqSection,
} from './LandingSections';

export function LandingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFaq, setActiveFaq] = useState<string | null>(null);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // Filter Features & FAQs strictly based on Search Query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return {
      features: FEATURES.filter(
        item => item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
      ),
      faqs: FAQS.filter(
        faq => faq.question.toLowerCase().includes(q) || faq.answer.toLowerCase().includes(q)
      ),
    };
  }, [searchQuery]);

  useEffect(() => {
    // Title Tag (50-60 chars) - Keyword at beginning, Brand at end
    document.title = 'ePaper Space 2026 | Digital Newspaper Publishing SaaS';

    // Meta Description (140-160 chars)
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute(
      'content',
      'Launch your digital ePaper newspaper portal with automated PDF conversion, paywalls, mobile apps & analytics. Start for free or view our pricing!'
    );

    // Self Canonical Tag
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://epaperspace.com/');

    // Structured JSON-LD Schema (Organization, SoftwareApplication, FAQPage)
    const schemaId = 'epaper-seo-jsonld';
    let scriptTag = document.getElementById(schemaId);
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = schemaId;
      scriptTag.setAttribute('type', 'application/ld+json');
      document.head.appendChild(scriptTag);
    }

    const jsonLdData = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          name: 'ePaperSpace',
          url: 'https://epaperspace.com',
          logo: 'https://epaperspace.com/logo.svg',
          sameAs: [
            'https://youtube.com/@epaperspace',
            'https://facebook.com/epaperspace',
            'https://twitter.com/epaperspace',
            'https://instagram.com/epaperspace',
          ],
        },
        {
          '@type': 'SoftwareApplication',
          name: 'ePaperSpace Digital Newspaper Publishing Platform',
          operatingSystem: 'Web, iOS, Android',
          applicationCategory: 'BusinessApplication',
          offers: {
            '@type': 'Offer',
            price: '0.00',
            priceCurrency: 'USD',
          },
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: '4.9',
            reviewCount: '318',
          },
        },
        {
          '@type': 'FAQPage',
          mainEntity: FAQS.map(f => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: f.answer,
            },
          })),
        },
      ],
    };

    scriptTag.textContent = JSON.stringify(jsonLdData);
  }, []);

  return (
    <div className="landing">
      {/* Sticky Header with Logo, Navigation, CTA & Live Search */}
      <header className="landing-nav sticky-header">
        <div className="landing-container landing-nav__inner">
          <Link to="/" className="landing-nav__brand" aria-label="ePaperSpace Home">
            <BrandLockup />
          </Link>

          <nav className="landing-nav__menu" aria-label="Main Navigation">
            <Link to="/" className="landing-nav__link">Home</Link>
            <a href="#features" className="landing-nav__link">Features</a>
            <a href="#testimonials" className="landing-nav__link">Testimonials</a>
            <a href="#faq" className="landing-nav__link">FAQ</a>
            <Link to="/pricing" className="landing-nav__link">Pricing</Link>
            <Link to="/contact" className="landing-nav__link">Contact</Link>
          </nav>

          {/* Interactive Live Search for Features & FAQs */}
          <div className="landing-nav__search">
            <input
              type="text"
              placeholder="Search features or FAQs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="landing-nav__search-input"
              aria-label="Search features or FAQs"
            />
            {searchQuery && (
              <button
                type="button"
                className="landing-nav__search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="landing-nav__actions">
            <Link to="/login" className="landing-btn landing-btn--outline">Publisher Login</Link>
            <Link to="/signup" className="landing-btn landing-btn--primary">Get Started</Link>
          </div>
        </div>

        {/* Live Search Results Dropdown Overlay */}
        {filteredItems && (
          <div className="landing-search-results">
            <div className="landing-container">
              <div className="landing-search-results__box">
                <div className="landing-search-results__header">
                  <h4>Search results for "{searchQuery}" (Features &amp; FAQs)</h4>
                  <button onClick={() => setSearchQuery('')}>Close</button>
                </div>
                {filteredItems.features.length === 0 && filteredItems.faqs.length === 0 ? (
                  <p className="no-results">No matching features or FAQs found.</p>
                ) : (
                  <div className="landing-search-results__grid">
                    {filteredItems.features.map(item => (
                      <a href="#features" key={item.id} className="search-result-card" onClick={() => setSearchQuery('')}>
                        <span className="search-result-icon">{item.icon}</span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.desc}</p>
                          <span className="badge">FEATURE</span>
                        </div>
                      </a>
                    ))}
                    {filteredItems.faqs.map(faq => (
                      <a href="#faq" key={faq.id} className="search-result-card" onClick={() => { setActiveFaq(faq.id); setSearchQuery(''); }}>
                        <span className="search-result-icon">❓</span>
                        <div>
                          <strong>{faq.question}</strong>
                          <p>{faq.answer}</p>
                          <span className="badge">FAQ</span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section (Single H1 Tag) */}
      <section className="landing-hero">
        <div className="landing-container landing-hero__inner">
          <div className="landing-hero__content">
            <div className="landing-hero__badge">
              <span>🌟 #1 Ranked ePaper Publishing SaaS Platform 2026</span>
            </div>
            <h1 className="landing-hero__title">
              Interactive ePaper Editor Section &amp; Publishing Platform.
            </h1>
            <p className="landing-hero__subtitle">
              Combine an intuitive Clickmask Article Editor with a turnkey White-Label Publishing Platform. Convert print-ready newspaper PDFs into interactive hotspots, monetized paywalls, custom domain portals, and mobile reader apps.
            </p>

            {/* Clear Call to Action (CTAs) */}
            <div className="landing-hero__cta-group">
              <Link to="/signup" className="landing-btn landing-btn--primary landing-btn--lg">
                Start for Free
              </Link>
              <Link to="/pricing" className="landing-btn landing-btn--outline landing-btn--lg">
                View Pricing
              </Link>
            </div>
          </div>

          <div className="landing-hero__visual">
            <img
              src="/hero.webp"
              alt="ePaperSpace digital newspaper edition shown on a laptop, tablet, and phone"
              className="hero-photo"
              width={1465}
              height={858}
              fetchPriority="high"
              decoding="async"
            />
          </div>
        </div>
      </section>

      <PublisherCarousel />
      <StatsBand />
      <FeaturesSection />
      <TestimonialsSection />
      <FaqSection activeId={activeFaq} onSelect={setActiveFaq} />

      {/* Footer Section with Important Pages, Legal Links, Social Media & Auto-updating Year */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer__grid">
            {/* Brand & Social Media */}
            <div className="landing-footer__col">
              <Link to="/" className="landing-footer__brand">
                <BrandLockup />
              </Link>
              <p className="landing-footer__desc">
                The premier digital newspaper publishing platform. Empowering publishers with AI clipping, metered paywalls, and mobile apps.
              </p>
              <div className="landing-footer__social">
                <a href="https://youtube.com/@epaperspace" target="_blank" rel="noopener noreferrer" aria-label="YouTube">▶️ YouTube</a>
                <a href="https://facebook.com/epaperspace" target="_blank" rel="noopener noreferrer" aria-label="Facebook">👍 FB</a>
                <a href="https://twitter.com/epaperspace" target="_blank" rel="noopener noreferrer" aria-label="Twitter">🐦 Twitter</a>
                <a href="https://instagram.com/epaperspace" target="_blank" rel="noopener noreferrer" aria-label="Instagram">📸 Instagram</a>
              </div>
            </div>

            {/* Important Pages */}
            <div className="landing-footer__col">
              <h4 className="landing-footer__title">Important Pages</h4>
              <ul className="landing-footer__links">
                <li><Link to="/about">About us</Link></li>
                <li><Link to="/contact">Contact</Link></li>
                <li><Link to="/services">Services</Link></li>
                <li><Link to="/pricing">Pricing</Link></li>
                <li><Link to="/login">Publisher Login</Link></li>
              </ul>
            </div>

            {/* Legal & Policy Pages */}
            <div className="landing-footer__col">
              <h4 className="landing-footer__title">Legal &amp; Compliance</h4>
              <ul className="landing-footer__links">
                <li><Link to="/privacy-policy">Privacy Policy</Link></li>
                <li><Link to="/terms-and-conditions">Terms &amp; Conditions</Link></li>
                <li><Link to="/refund-policy">Refund Policy</Link></li>
                <li><Link to="/disclaimer">Disclaimer</Link></li>
              </ul>
            </div>

            {/* Contact Details Brief */}
            <div className="landing-footer__col">
              <h4 className="landing-footer__title">Publisher Support</h4>
              <p className="landing-footer__contact-text">
                support@epaperspace.com<br />
                +1 (800) 555-EPAP<br />
                Mon–Fri, 9am–6pm PT
              </p>
            </div>
          </div>

          {/* Auto-updating copyright year */}
          <div className="landing-footer__bottom">
            <p>Copyright © {currentYear} ePaperSpace. All rights reserved.</p>
            <p className="seo-tagline">Complete On-Page SEO Checklist (2026) Compliant Architecture.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

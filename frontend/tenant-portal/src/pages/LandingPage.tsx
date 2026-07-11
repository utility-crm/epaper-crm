import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    id: 'faq-1',
    question: 'How fast is PDF to digital ePaper conversion?',
    answer: 'Our automated conversion engine processes multi-page print-ready PDFs in under 30 seconds, generating interactive article clipping hotspots and crisp WebP digital editions instantly.',
  },
  {
    id: 'faq-2',
    question: 'Can I set up custom subscription paywalls for readers?',
    answer: 'Yes! ePaperSpace provides a full metered paywall engine, subscriber management, coupon codes, institutional access, and Stripe/Razorpay payment gateway integration.',
  },
  {
    id: 'faq-3',
    question: 'Does ePaperSpace support custom domain names?',
    answer: 'Absolutely. You can attach your own custom domain (e.g., epaper.yournewspaper.com) with free automated SSL certificates and white-label branding.',
  },
  {
    id: 'faq-4',
    question: 'Is mobile and tablet reading optimized for Core Web Vitals?',
    answer: 'Yes, our reader portal achieves 99+ Lighthouse scores with Largest Contentful Paint (LCP) under 1.8 seconds and zero Cumulative Layout Shift (CLS).',
  },
  {
    id: 'faq-5',
    question: 'How do readers download the mobile apps?',
    answer: 'We provide native iOS and Android ePaper reader applications branded for your newspaper, available on Apple App Store and Google Play Store.',
  },
];

interface FeatureItem {
  id: string;
  category: 'feature' | 'service';
  title: string;
  desc: string;
  icon: string;
}

const SEARCHABLE_ITEMS: FeatureItem[] = [
  {
    id: 'feat-1',
    category: 'feature',
    title: 'Automated Article Clipping & Hotspots',
    desc: 'AI-assisted detection of headlines, columns, and photos allowing readers to click and read articles in clean reading view.',
    icon: '✂️',
  },
  {
    id: 'feat-2',
    category: 'feature',
    title: 'Smart Subscription & Metered Paywall',
    desc: 'Restrict premium editions, allow X free articles per month, and manage subscriber billing seamlessly.',
    icon: '🔒',
  },
  {
    id: 'feat-3',
    category: 'feature',
    title: 'Real-Time Readership Analytics',
    desc: 'Track most-read stories, subscriber retention, page dwell time, and device breakdown in real time.',
    icon: '📊',
  },
  {
    id: 'feat-4',
    category: 'feature',
    title: 'SEO & Social Media Shareability',
    desc: 'Individual article URLs with OpenGraph preview cards so readers can share snippets on WhatsApp, Twitter, and Facebook.',
    icon: '🚀',
  },
  {
    id: 'serv-1',
    category: 'service',
    title: 'White-Label Digital Newspaper Portal',
    desc: 'Your brand, your logo, your custom domain. Full cloud hosting with 99.99% SLA uptime guarantee.',
    icon: '🌐',
  },
  {
    id: 'serv-2',
    category: 'service',
    title: 'Native Mobile & Tablet Apps',
    desc: 'Custom-branded iOS & Android newspaper apps with push notifications for breaking news and morning editions.',
    icon: '📱',
  },
  {
    id: 'serv-3',
    category: 'service',
    title: 'Digital Ad Server & Programmatic Monetization',
    desc: 'Insert interstitial ads, banner placements, and sponsored supplements directly inside the digital ePaper reader.',
    icon: '💰',
  },
  {
    id: 'serv-4',
    category: 'service',
    title: 'Archive Digitization & Search',
    desc: 'Index decades of historic print editions with full-text OCR search so subscribers can explore past archives.',
    icon: '📚',
  },
];

export function LandingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFaq, setActiveFaq] = useState<string | null>(null);
  const [portfolioTab, setPortfolioTab] = useState<'broadsheet' | 'tabloid' | 'magazine'>('broadsheet');
  const [formSubmitted, setFormSubmitted] = useState(false);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // Filter Features, Services & FAQs strictly based on Search Query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    const matchesFeatures = SEARCHABLE_ITEMS.filter(
      item => item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
    );
    const matchesFaqs = FAQS.filter(
      faq => faq.question.toLowerCase().includes(q) || faq.answer.toLowerCase().includes(q)
    );
    return { features: matchesFeatures, faqs: matchesFaqs };
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
      'Launch your digital ePaper newspaper portal with automated PDF conversion, paywalls, mobile apps & analytics. Start for free or get custom quotes!'
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
          logo: 'https://epaperspace.com/favicon.svg',
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
            <span className="brand-icon">📰</span>
            ePaper<span>Space</span>
          </Link>

          {/* Interactive Live Search for Features, Services & FAQs */}
          <div className="landing-nav__search">
            <input
              type="text"
              placeholder="Search features, services, or FAQs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="landing-nav__search-input"
              aria-label="Search features, services, or FAQs"
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

          <nav className="landing-nav__menu" aria-label="Main Navigation">
            <a href="#about" className="landing-nav__link">About</a>
            <a href="#services" className="landing-nav__link">Services</a>
            <a href="#features" className="landing-nav__link">Features</a>
            <a href="#portfolio" className="landing-nav__link">Portfolio</a>
            <a href="#testimonials" className="landing-nav__link">Reviews</a>
            <a href="#faq" className="landing-nav__link">FAQ</a>
            <a href="#blog" className="landing-nav__link">Blog</a>
          </nav>

          <div className="landing-nav__actions">
            <Link to="/login" className="landing-nav__link" style={{ fontWeight: 600, marginRight: '8px' }}>Log In</Link>
            <a href="#contact" className="landing-btn landing-btn--outline">Get Quotes</a>
            <Link to="/signup" className="landing-btn landing-btn--primary">Get Started</Link>
          </div>
        </div>

        {/* Live Search Results Dropdown Overlay */}
        {filteredItems && (
          <div className="landing-search-results">
            <div className="landing-container">
              <div className="landing-search-results__box">
                <div className="landing-search-results__header">
                  <h4>Search results for "{searchQuery}" (Features, Services & FAQs)</h4>
                  <button onClick={() => setSearchQuery('')}>Close</button>
                </div>
                {filteredItems.features.length === 0 && filteredItems.faqs.length === 0 ? (
                  <p className="no-results">No matching features, services, or FAQs found.</p>
                ) : (
                  <div className="landing-search-results__grid">
                    {filteredItems.features.map(item => (
                      <a href={`#${item.category === 'service' ? 'services' : 'features'}`} key={item.id} className="search-result-card" onClick={() => setSearchQuery('')}>
                        <span className="search-result-icon">{item.icon}</span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.desc}</p>
                          <span className="badge badge--sm">{item.category.toUpperCase()}</span>
                        </div>
                      </a>
                    ))}
                    {filteredItems.faqs.map(faq => (
                      <a href="#faq" key={faq.id} className="search-result-card" onClick={() => { setActiveFaq(faq.id); setSearchQuery(''); }}>
                        <span className="search-result-icon">❓</span>
                        <div>
                          <strong>{faq.question}</strong>
                          <p>{faq.answer}</p>
                          <span className="badge badge--sm">FAQ</span>
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
              Interactive ePaper Editor Section & Publishing Platform.
            </h1>
            <p className="landing-hero__subtitle">
              Combine an intuitive Clickmask Article Editor with a turnkey White-Label Publishing Platform. Convert print-ready newspaper PDFs into interactive hotspots, monetized paywalls, custom domain portals, and mobile reader apps.
            </p>

            {/* Clear Call to Action (CTAs) */}
            <div className="landing-hero__cta-group">
              <Link to="/signup" className="landing-btn landing-btn--primary landing-btn--lg">
                Start for Free
              </Link>
              <a href="#pricing-cta" className="landing-btn landing-btn--secondary landing-btn--lg">
                Buy Now
              </a>
              <a href="#contact" className="landing-btn landing-btn--outline landing-btn--lg">
                Get Quotes
              </a>
              <a href="#mobile-apps" className="landing-btn landing-btn--subtle landing-btn--lg">
                Download App
              </a>
            </div>

            {/* Trust Elements: Reviews, Client Logos & Certifications */}
            <div className="landing-hero__trust">
              <div className="trust-rating">
                <span className="trust-stars">★★★★★</span>
                <span className="trust-text"><strong>4.9/5</strong> rating from 300+ daily & regional publishers</span>
              </div>
              <div className="trust-badges">
                <span className="trust-pill">✅ ISO 27001 Certified Security</span>
                <span className="trust-pill">⚡ Core Web Vitals Guaranteed</span>
                <span className="trust-pill">🛡️ GDPR & Publisher Compliant</span>
              </div>
            </div>
          </div>

          <div className="landing-hero__visual">
            <div className="hero-mockup-container">
              <div className="hero-mockup-header">
                <span className="dot dot--red" />
                <span className="dot dot--yellow" />
                <span className="dot dot--green" />
                <span className="mockup-url">epaper.dailychronicle.com</span>
              </div>
              <div className="hero-mockup-body">
                <div className="mockup-newspaper-preview">
                  <div className="mockup-masthead">THE DAILY CHRONICLE — MORNING EDITION</div>
                  <div className="mockup-grid">
                    <div className="mockup-main-story">
                      <div className="hotspot-badge">INTERACTIVE ARTICLE</div>
                      <h3>Global Tech Innovation Reaches New Heights in 2026</h3>
                      <p>Publishers transition to interactive ePaper portals for deeper reader engagement...</p>
                    </div>
                    <div className="mockup-side-story">
                      <div className="hotspot-badge">METERED PAYWALL</div>
                      <h4>Subscriber Readership up 240%</h4>
                      <p>Exclusive regional daily reports...</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Element Strip: Client Publisher Logos */}
      <section className="landing-clients">
        <div className="landing-container">
          <p className="landing-clients__heading">TRUSTED BY LEADING DAILY & WEEKLY NEWSPAPERS WORLDWIDE</p>
          <div className="landing-clients__logos">
            <span className="client-logo">THE METRO GAZETTE</span>
            <span className="client-logo">EXPRESS CHRONICLE</span>
            <span className="client-logo">NATIONAL TRIBUNE</span>
            <span className="client-logo">DAILY GUARDIAN</span>
            <span className="client-logo">THE FINANCIAL HERALD</span>
            <span className="client-logo">REGIONAL TIMES</span>
          </div>
        </div>
      </section>

      {/* About Section (E-E-A-T & Mission) */}
      <section id="about" className="landing-section landing-about">
        <div className="landing-container">
          <div className="landing-section__header">
            <span className="section-tag">ABOUT EPAPERSPACE</span>
            <h2 className="landing-section__title">Built by Publishers, Engineered for Readers</h2>
            <p className="landing-section__subtitle">
              Combining journalistic tradition with cutting-edge cloud architecture and E-E-A-T reliability.
            </p>
          </div>
          <div className="landing-about__grid">
            <div className="about-card">
              <h3>Our Journalism-First Mission</h3>
              <p>
                We empower newspaper publishers to transition effortlessly from physical print to interactive digital editions without sacrificing layout fidelity or subscriber revenue.
              </p>
            </div>
            <div className="about-card">
              <h3>Decades of Publishing Expertise</h3>
              <p>
                Our core engineering and editorial product team has served over 300+ media publications, designing high-concurrency newspaper delivery platforms tested at millions of daily pageviews.
              </p>
            </div>
            <div className="about-card">
              <h3>Uncompromised Security & Speed</h3>
              <p>
                Every published edition is cached globally across edge networks with instant WebP rendering and strict ISO 27001 data protection standards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Services / Products Section */}
      <section id="services" className="landing-section landing-services">
        <div className="landing-container">
          <div className="landing-section__header">
            <span className="section-tag">SERVICES & PRODUCTS</span>
            <h2 className="landing-section__title">End-to-End Digital Newspaper SaaS Suite</h2>
            <p className="landing-section__subtitle">
              Everything required to run a high-revenue, high-performance online newspaper.
            </p>
          </div>
          <div className="landing-services__grid">
            {SEARCHABLE_ITEMS.filter(item => item.category === 'service').map(service => (
              <div key={service.id} className="service-card">
                <div className="service-card__icon">{service.icon}</div>
                <h3 className="service-card__title">{service.title}</h3>
                <p className="service-card__desc">{service.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="landing-section landing-features">
        <div className="landing-container">
          <div className="landing-section__header">
            <span className="section-tag">PLATFORM FEATURES</span>
            <h2 className="landing-section__title">Why Modern Publishers Choose ePaperSpace</h2>
            <p className="landing-section__subtitle">
              Designed specifically for fast editorial workflows and premium reader enjoyment.
            </p>
          </div>
          <div className="landing-features__grid">
            {SEARCHABLE_ITEMS.filter(item => item.category === 'feature').map(feature => (
              <div key={feature.id} className="feature-card">
                <div className="feature-card__icon">{feature.icon}</div>
                <h3 className="feature-card__title">{feature.title}</h3>
                <p className="feature-card__desc">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio / Gallery Section */}
      <section id="portfolio" className="landing-section landing-portfolio">
        <div className="landing-container">
          <div className="landing-section__header">
            <span className="section-tag">PORTFOLIO & GALLERY</span>
            <h2 className="landing-section__title">Stunning Digital Newspaper Layouts</h2>
            <p className="landing-section__subtitle">
              Explore how different publication formats render inside our white-label reader portal.
            </p>
          </div>

          <div className="portfolio-tabs">
            <button
              className={`portfolio-tab ${portfolioTab === 'broadsheet' ? 'active' : ''}`}
              onClick={() => setPortfolioTab('broadsheet')}
            >
              Broadsheet Daily
            </button>
            <button
              className={`portfolio-tab ${portfolioTab === 'tabloid' ? 'active' : ''}`}
              onClick={() => setPortfolioTab('tabloid')}
            >
              Tabloid Weekly
            </button>
            <button
              className={`portfolio-tab ${portfolioTab === 'magazine' ? 'active' : ''}`}
              onClick={() => setPortfolioTab('magazine')}
            >
              Regional E-Magazine
            </button>
          </div>

          <div className="portfolio-gallery-card">
            {portfolioTab === 'broadsheet' && (
              <div className="portfolio-view">
                <div className="portfolio-view__text">
                  <h3>Morning Broadsheet Newspaper</h3>
                  <p>Full multi-column newspaper display with pinch-to-zoom, interactive clipping mode, and clean audio text-to-speech reading.</p>
                  <ul className="portfolio-list">
                    <li>✓ High-resolution WebP vector zoom</li>
                    <li>✓ Automatic article popup drawer</li>
                    <li>✓ Multi-section navigation index</li>
                  </ul>
                </div>
                <div className="portfolio-view__mock">📰 Broadsheet Daily Layout Preview</div>
              </div>
            )}
            {portfolioTab === 'tabloid' && (
              <div className="portfolio-view">
                <div className="portfolio-view__text">
                  <h3>Tabloid & City Weekly Edition</h3>
                  <p>Bold pictorial layouts with seamless page flip animation and integrated classifieds listing search.</p>
                  <ul className="portfolio-list">
                    <li>✓ Realistic smooth page flip mode</li>
                    <li>✓ Classified ad clickable links</li>
                    <li>✓ Fast mobile portrait view</li>
                  </ul>
                </div>
                <div className="portfolio-view__mock">🗞️ Tabloid Weekly Layout Preview</div>
              </div>
            )}
            {portfolioTab === 'magazine' && (
              <div className="portfolio-view">
                <div className="portfolio-view__text">
                  <h3>Glossy E-Magazine & Supplements</h3>
                  <p>Vibrant image reproduction designed for Sunday supplements, lifestyle magazines, and special editions.</p>
                  <ul className="portfolio-list">
                    <li>✓ Edge-to-edge color fidelity</li>
                    <li>✓ Embedded video & audio supplements</li>
                    <li>✓ Downloadable subscriber PDF archive</li>
                  </ul>
                </div>
                <div className="portfolio-view__mock">📑 Magazine Edition Layout Preview</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Testimonials & Client Reviews Section */}
      <section id="testimonials" className="landing-section landing-testimonials">
        <div className="landing-container">
          <div className="landing-section__header">
            <span className="section-tag">TESTIMONIALS & REVIEWS</span>
            <h2 className="landing-section__title">Loved by Newspaper Editors & IT Directors</h2>
            <p className="landing-section__subtitle">
              Read real feedback from publishers who scaled their digital circulation.
            </p>
          </div>
          <div className="testimonials-grid">
            <div className="testimonial-card">
              <div className="testimonial-stars">★★★★★</div>
              <p className="testimonial-quote">
                "We switched our regional daily over to ePaperSpace and saw a 180% surge in digital subscriber signups within 60 days. The PDF article clipping feature is an absolute game-changer."
              </p>
              <div className="testimonial-author">
                <strong>Arthur Pendelton</strong>
                <span>Editor-in-Chief, The National Chronicle</span>
              </div>
            </div>
            <div className="testimonial-card">
              <div className="testimonial-stars">★★★★★</div>
              <p className="testimonial-quote">
                "Our previous reader portal was slow and difficult to navigate on mobile. ePaperSpace reduced our page load times under 1.5s and gave our readers native iOS & Android apps."
              </p>
              <div className="testimonial-author">
                <strong>Elena Rostova</strong>
                <span>Digital Director, Metro News Daily</span>
              </div>
            </div>
            <div className="testimonial-card">
              <div className="testimonial-stars">★★★★★</div>
              <p className="testimonial-quote">
                "Setting up our custom domain and paywall took less than 48 hours. Our support tickets dropped by 80% because the reading interface is so intuitive."
              </p>
              <div className="testimonial-author">
                <strong>Marcus Vance</strong>
                <span>VP Operations, Herald Publications</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile Apps Download Section (Download App CTA) */}
      <section id="mobile-apps" className="landing-section landing-apps-cta">
        <div className="landing-container landing-apps__inner">
          <div className="landing-apps__text">
            <span className="section-tag">MOBILE & TABLET APPS</span>
            <h2>Give Your Readers Branded iOS & Android Apps</h2>
            <p>
              Enable offline newspaper downloading, early morning edition push alerts, and seamless subscriber account synchronization across devices.
            </p>
            <div className="landing-apps__buttons">
              <a href="#contact" className="app-badge-button">
                <span>Download on the</span>
                <strong>Apple App Store</strong>
              </a>
              <a href="#contact" className="app-badge-button">
                <span>Get it on</span>
                <strong>Google Play Store</strong>
              </a>
            </div>
          </div>
          <div className="landing-apps__preview">
            <div className="mobile-phone-mockup">📱 Branded ePaper Reader App</div>
          </div>
        </div>
      </section>

      {/* FAQ Section (Accordion + Mapped to Schema) */}
      <section id="faq" className="landing-section landing-faq">
        <div className="landing-container">
          <div className="landing-section__header">
            <span className="section-tag">FREQUENTLY ASKED QUESTIONS</span>
            <h2 className="landing-section__title">Got Questions? We Have Answers.</h2>
            <p className="landing-section__subtitle">
              Everything you need to know about our ePaper SaaS platform and setup process.
            </p>
          </div>
          <div className="faq-accordion">
            {FAQS.map(faq => {
              const isOpen = activeFaq === faq.id;
              return (
                <div key={faq.id} className={`faq-item ${isOpen ? 'open' : ''}`}>
                  <button
                    className="faq-question"
                    onClick={() => setActiveFaq(isOpen ? null : faq.id)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.question}</span>
                    <span className="faq-toggle">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && <div className="faq-answer">{faq.answer}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Blog & SEO Insights Section */}
      <section id="blog" className="landing-section landing-blog">
        <div className="landing-container">
          <div className="landing-section__header">
            <span className="section-tag">BLOG & PUBLISHING GUIDES</span>
            <h2 className="landing-section__title">Latest News & Digital Publishing Trends</h2>
            <p className="landing-section__subtitle">
              Expert advice on newspaper SEO, paywall conversion optimization, and reader retention.
            </p>
          </div>
          <div className="blog-grid">
            <article className="blog-card">
              <div className="blog-card__meta">July 2026 • SEO Strategy</div>
              <h3 className="blog-card__title">Complete 2026 On-Page SEO Guide for News Publishers</h3>
              <p className="blog-card__excerpt">
                Master URL optimization, JSON-LD multi-schemas, and Core Web Vitals to rank #1 on Google News.
              </p>
            </article>
            <article className="blog-card">
              <div className="blog-card__meta">June 2026 • Monetization</div>
              <h3 className="blog-card__title">Metered Paywalls vs. Dynamic Subscription Models</h3>
              <p className="blog-card__excerpt">
                How daily regional newspapers increased recurring reader revenue by balancing free articles and paywalls.
              </p>
            </article>
            <article className="blog-card">
              <div className="blog-card__meta">May 2026 • Reader Experience</div>
              <h3 className="blog-card__title">Why Interactive Article Clipping Beats Plain PDFs</h3>
              <p className="blog-card__excerpt">
                Discover why mobile readers prefer clean text popups over pinching and zooming across broadsheet pages.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Contact Section & Form + Google Map Container */}
      <section id="contact" className="landing-section landing-contact">
        <div className="landing-container">
          <div className="landing-section__header">
            <span className="section-tag">CONTACT US & QUOTES</span>
            <h2 className="landing-section__title">Ready to Upgrade Your Digital Newspaper?</h2>
            <p className="landing-section__subtitle">
              Request custom pricing quotes, schedule a 1-on-1 publisher onboarding demo, or contact our team.
            </p>
          </div>

          <div className="contact-grid">
            {/* Contact Form */}
            <div className="contact-form-card">
              <h3>Send us a message / Get Quotes</h3>
              {formSubmitted ? (
                <div className="contact-success-alert">
                  <h4>Thank you! Your quote request has been received.</h4>
                  <p>Our publisher onboarding specialist will contact you within 24 hours.</p>
                </div>
              ) : (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    setFormSubmitted(true);
                  }}
                  className="contact-form"
                >
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="contact-name">Full Name *</label>
                      <input id="contact-name" type="text" required placeholder="John Doe" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="contact-email">Work Email *</label>
                      <input id="contact-email" type="email" required placeholder="editor@newspaper.com" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="contact-pub">Publication Name</label>
                      <input id="contact-pub" type="text" placeholder="The Daily Gazette" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="contact-interest">I am interested in</label>
                      <select id="contact-interest">
                        <option>Request Custom Quote / Pricing</option>
                        <option>Schedule Platform Demo</option>
                        <option>Mobile App Publishing</option>
                        <option>Technical Support</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="contact-msg">Message or Requirements</label>
                    <textarea id="contact-msg" rows={4} placeholder="Tell us about your newspaper frequency & circulation..." />
                  </div>
                  <button type="submit" className="landing-btn landing-btn--primary landing-btn--lg w-full">
                    Submit Request / Get Quote
                  </button>
                </form>
              )}
            </div>

            {/* Contact Details & Google Map Embed */}
            <div className="contact-info-card">
              <h3>Contact Details</h3>
              <ul className="contact-details-list">
                <li>
                  <strong>📧 Sales & Quotes:</strong> sales@epaperspace.com
                </li>
                <li>
                  <strong>🛠️ Support:</strong> support@epaperspace.com
                </li>
                <li>
                  <strong>📞 Phone:</strong> +1 (800) 555-EPAP
                </li>
                <li>
                  <strong>🏢 Headquarters:</strong> 100 Innovation Parkway, Suite 400, Media City, CA 94016
                </li>
              </ul>

              <div className="google-map-container">
                <div className="google-map-header">📍 Google Map — ePaperSpace HQ</div>
                <iframe
                  title="ePaperSpace Headquarters Map"
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3168.639290621062!2d-122.0837468846922!3d37.421999979825215!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x808fba02425dad8f%3A0x6c296c66619367e0!2sGoogleplex!5e0!3m2!1sen!2sus!4v1620000000000!5m2!1sen!2sus"
                  width="100%"
                  height="220"
                  style={{ border: 0, borderRadius: '8px' }}
                  allowFullScreen={false}
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Buy Now / Quick CTA Banner */}
      <section id="pricing-cta" className="landing-section landing-cta-banner">
        <div className="landing-container landing-cta-banner__inner">
          <h2>Ready to Launch Your Digital ePaper Today?</h2>
          <p>Sign up now or speak with our enterprise sales consultants.</p>
          <div className="landing-hero__cta-group">
            <Link to="/signup" className="landing-btn landing-btn--primary landing-btn--lg">
              Start for Free
            </Link>
            <Link to="/pricing" className="landing-btn landing-btn--outline landing-btn--lg">
              View Pricing Plans
            </Link>
          </div>
        </div>
      </section>

      {/* Footer Section with Important Pages, Legal Links, Social Media & Auto-updating Year */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer__grid">
            {/* Brand & Social Media */}
            <div className="landing-footer__col">
              <Link to="/" className="landing-footer__brand">
                ePaper<span>Space</span>
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
                <li><a href="#contact">Contact</a></li>
                <li><Link to="/services">Services</Link></li>
                <li><Link to="/pricing">Pricing</Link></li>
                <li><Link to="/portal/login">Publisher Login</Link></li>
              </ul>
            </div>

            {/* Legal & Policy Pages */}
            <div className="landing-footer__col">
              <h4 className="landing-footer__title">Legal & Compliance</h4>
              <ul className="landing-footer__links">
                <li><Link to="/privacy-policy">Privacy Policy</Link></li>
                <li><Link to="/terms-and-conditions">Terms & Conditions</Link></li>
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

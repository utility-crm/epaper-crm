import { useState } from 'react';

/* Shared marketing sections used by both the home page and the pricing page. */

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export const FAQS: FAQItem[] = [
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

export interface FeatureItem {
  id: string;
  title: string;
  desc: string;
  icon: string;
  tint: string;
}

export const FEATURES: FeatureItem[] = [
  {
    id: 'feat-1',
    title: 'Article Clipping & Hotspots',
    desc: 'AI-assisted detection of headlines, columns, and photos so readers click straight into a clean reading view.',
    icon: '✂️',
    tint: '#fee2e2',
  },
  {
    id: 'feat-2',
    title: 'Metered Paywall',
    desc: 'Restrict premium editions, allow X free articles per month, and manage subscriber billing seamlessly.',
    icon: '🔒',
    tint: '#e0e7ff',
  },
  {
    id: 'feat-3',
    title: 'Readership Analytics',
    desc: 'Track most-read stories, subscriber retention, page dwell time, and device breakdown in real time.',
    icon: '📊',
    tint: '#dbeafe',
  },
  {
    id: 'feat-4',
    title: 'SEO & Social Sharing',
    desc: 'Per-article URLs with OpenGraph preview cards so readers can share snippets on WhatsApp, X, and Facebook.',
    icon: '🚀',
    tint: '#fef3c7',
  },
  {
    id: 'feat-5',
    title: 'White-Label Portal',
    desc: 'Your brand, your logo, your custom domain with automated SSL and 99.9% uptime cloud hosting.',
    icon: '🌐',
    tint: '#dcfce7',
  },
  {
    id: 'feat-6',
    title: 'Mobile & Tablet Apps',
    desc: 'Custom-branded iOS and Android reader apps with push alerts for breaking news and morning editions.',
    icon: '📱',
    tint: '#f3e8ff',
  },
  {
    id: 'feat-7',
    title: 'Ad Server & Monetization',
    desc: 'Insert interstitials, banner placements, and sponsored supplements directly inside the digital reader.',
    icon: '💰',
    tint: '#ffedd5',
  },
  {
    id: 'feat-8',
    title: 'Archive Digitization',
    desc: 'Index decades of historic print editions with full-text OCR search so subscribers can explore the past.',
    icon: '📚',
    tint: '#e0f2fe',
  },
  {
    id: 'feat-9',
    title: 'Automated PDF Conversion',
    desc: 'Drop a production PDF and get high-resolution WebP pages, thumbnails, and page index automatically.',
    icon: '⚡',
    tint: '#fae8ff',
  },
  {
    id: 'feat-10',
    title: 'Publishing Scheduler',
    desc: 'Queue tomorrow morning’s edition tonight and let it go live at the exact minute you choose.',
    icon: '🗓️',
    tint: '#ede9fe',
  },
  {
    id: 'feat-11',
    title: 'Multi-User Newsroom',
    desc: 'Invite editors and production staff with role-based access so nobody touches what they should not.',
    icon: '👥',
    tint: '#ccfbf1',
  },
  {
    id: 'feat-12',
    title: 'Watermark & Protection',
    desc: 'Protect editions with custom watermarks, download rules, and per-tier access control.',
    icon: '🛡️',
    tint: '#fee2e2',
  },
];

export interface Publisher {
  name: string;
  mark: string;
  meta: string;
}

/* Placeholder roster carried over from the previous "trusted by" strip.
   Swap in real publication names/logo files as they are cleared for use. */
export const PUBLISHERS: Publisher[] = [
  { name: 'गूंज उठी रणभेरी', mark: 'रण', meta: 'Datia, Madhya Pradesh' },
  { name: 'The Metro Gazette', mark: 'MG', meta: 'Metropolitan Daily' },
  { name: 'Express Chronicle', mark: 'EC', meta: 'Regional Daily' },
  { name: 'National Tribune', mark: 'NT', meta: 'National Broadsheet' },
  { name: 'Daily Guardian', mark: 'DG', meta: 'City Daily' },
  { name: 'The Financial Herald', mark: 'FH', meta: 'Business Weekly' },
  { name: 'Regional Times', mark: 'RT', meta: 'Weekly Edition' },
  { name: 'Sunday Supplement', mark: 'SS', meta: 'E-Magazine' },
];

/** Auto-scrolling "trusted by" carousel of publisher name cards. */
export function PublisherCarousel() {
  return (
    <section className="landing-publishers" aria-label="Publishers using ePaperSpace">
      <div className="landing-container">
        <p className="landing-publishers__heading">TRUSTED BY LEADING DAILY &amp; WEEKLY PUBLISHERS</p>
      </div>
      <div className="marquee">
        <div className="marquee__track">
          {[...PUBLISHERS, ...PUBLISHERS].map((p, i) => (
            <div
              className="publisher-card"
              key={`${p.name}-${i}`}
              /* second pass is a visual duplicate only — keep it out of the a11y tree */
              aria-hidden={i >= PUBLISHERS.length || undefined}
            >
              <span className="publisher-card__mark">{p.mark}</span>
              <span className="publisher-card__body">
                <span className="publisher-card__name">{p.name}</span>
                <span className="publisher-card__meta">{p.meta}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Headline numbers strip. */
export function StatsBand() {
  return (
    <section className="landing-stats">
      <div className="landing-container landing-stats__grid">
        <div className="stat">
          <div className="stat__value">300+</div>
          <div className="stat__label">Happy Publishers</div>
        </div>
        <div className="stat">
          <div className="stat__value">4.9/5</div>
          <div className="stat__stars" aria-hidden="true">★★★★★</div>
          <div className="stat__label">Average Publisher Rating</div>
        </div>
        <div className="stat">
          <div className="stat__value">99.9%</div>
          <div className="stat__label">Uptime &amp; Reliable</div>
        </div>
      </div>
    </section>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="landing-section landing-features">
      <div className="landing-container">
        <div className="landing-section__header">
          <span className="section-tag">Platform Features</span>
          <h2 className="landing-section__title">Powerful Features</h2>
          <p className="landing-section__subtitle">
            Everything you need to start and grow your digital publishing business.
          </p>
        </div>
        <div className="landing-features__grid">
          {FEATURES.map(f => (
            <div key={f.id} className="feature-card">
              <div className="feature-card__icon" style={{ background: f.tint }}>{f.icon}</div>
              <div>
                <h3 className="feature-card__title">{f.title}</h3>
                <p className="feature-card__desc">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TESTIMONIALS = [
  {
    quote: 'We switched our regional daily over to ePaperSpace and saw a 180% surge in digital subscriber signups within 60 days. The PDF article clipping feature is an absolute game-changer.',
    name: 'Arthur Pendelton',
    role: 'Editor-in-Chief, The National Chronicle',
  },
  {
    quote: 'Our previous reader portal was slow and hard to navigate on mobile. ePaperSpace pulled page loads under 1.5s and gave our readers native iOS & Android apps.',
    name: 'Elena Rostova',
    role: 'Digital Director, Metro News Daily',
  },
  {
    quote: 'Setting up our custom domain and paywall took less than 48 hours. Our support tickets dropped by 80% because the reading interface is so intuitive.',
    name: 'Marcus Vance',
    role: 'VP Operations, Herald Publications',
  },
];

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="landing-section landing-testimonials">
      <div className="landing-container">
        <div className="landing-section__header">
          <span className="section-tag">Testimonials</span>
          <h2 className="landing-section__title">Loved by Editors &amp; IT Directors</h2>
          <p className="landing-section__subtitle">
            Real feedback from publishers who scaled their digital circulation.
          </p>
        </div>
        <div className="testimonials-grid">
          {TESTIMONIALS.map(t => (
            <div key={t.name} className="testimonial-card">
              <div className="testimonial-stars" aria-hidden="true">★★★★★</div>
              <p className="testimonial-quote">&ldquo;{t.quote}&rdquo;</p>
              <div className="testimonial-author">
                <strong>{t.name}</strong>
                <span>{t.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * FAQ accordion. Uncontrolled by default; pass activeId/onSelect to drive it
 * from outside (the home page opens an entry from its search results).
 */
export function FaqSection({ activeId, onSelect }: { activeId?: string | null; onSelect?: (id: string | null) => void } = {}) {
  const [localId, setLocalId] = useState<string | null>(null);
  const active = activeId !== undefined ? activeId : localId;
  const select = onSelect ?? setLocalId;

  return (
    <section id="faq" className="landing-section landing-faq">
      <div className="landing-container">
        <div className="landing-section__header">
          <span className="section-tag">Frequently Asked Questions</span>
          <h2 className="landing-section__title">Got Questions? We Have Answers.</h2>
          <p className="landing-section__subtitle">
            Everything you need to know about the platform and the setup process.
          </p>
        </div>
        <div className="faq-accordion">
          {FAQS.map(faq => {
            const isOpen = active === faq.id;
            return (
              <div key={faq.id} className="faq-item">
                <button
                  className="faq-question"
                  onClick={() => select(isOpen ? null : faq.id)}
                  aria-expanded={isOpen}
                >
                  <span>{faq.question}</span>
                  <span className="faq-toggle" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && <div className="faq-answer">{faq.answer}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Brand lockup used in the header and footer of every marketing page. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <>
      <img src="/logo.svg" alt="" className={className ?? 'brand-icon-img'} width={28} height={34} />
      {/* one flex item, so the parent's gap can't split the wordmark */}
      <span className="brand-wordmark">ePaper<span>Space</span></span>
    </>
  );
}

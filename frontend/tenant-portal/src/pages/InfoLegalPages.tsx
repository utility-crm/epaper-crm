import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalApi } from '../lib/api';
import './LandingPage.css';

interface PageMetaProps {
  title: string;
  description: string;
  path: string;
}

function useSEOMeta({ title, description, path }: PageMetaProps) {
  useEffect(() => {
    document.title = title;
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `https://epaperspace.com${path}`);
  }, [title, description, path]);
}

interface BreadcrumbsProps {
  currentPage: string;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ currentPage }) => (
  <nav className="landing-breadcrumbs" aria-label="breadcrumb">
    <ol className="landing-breadcrumbs__list">
      <li><Link to="/">Home</Link></li>
      <li className="landing-breadcrumbs__separator">/</li>
      <li aria-current="page">{currentPage}</li>
    </ol>
  </nav>
);

const PageLayout: React.FC<{
  title: string;
  subtitle: string;
  currentPage: string;
  meta: PageMetaProps;
  children: React.ReactNode;
}> = ({ title, subtitle, currentPage, meta, children }) => {
  useSEOMeta(meta);
  const currentYear = new Date().getFullYear();

  return (
    <div className="landing">
      {/* Sticky Header */}
      <header className="landing-nav sticky-header">
        <div className="landing-container landing-nav__inner">
          <Link to="/" className="landing-nav__brand" aria-label="ePaperSpace Home">
            <img src="/logo.png" alt="ePaperSpace Logo" className="brand-icon-img" style={{ height: '32px', width: 'auto', marginRight: '8px' }} />
            ePaper<span>Space</span>
          </Link>

          <nav className="landing-nav__menu" aria-label="Main Navigation">
            <Link to="/" className="landing-nav__link">Home</Link>
            <Link to="/about" className="landing-nav__link">About</Link>
            <Link to="/services" className="landing-nav__link">Services & Editor</Link>
            <Link to="/pricing" className="landing-nav__link">Pricing</Link>
            <Link to="/contact" className="landing-nav__link">Contact</Link>
          </nav>

          <div className="landing-nav__actions">
            <Link to="/login" className="landing-btn landing-btn--outline">Publisher Login</Link>
            <Link to="/signup" className="landing-btn landing-btn--primary">Get Started</Link>
          </div>
        </div>
      </header>

      {/* Header Banner with Breadcrumbs */}
      <section className="landing-subpage-header">
        <div className="landing-container">
          <Breadcrumbs currentPage={currentPage} />
          <h1 className="landing-subpage-header__title">{title}</h1>
          <p className="landing-subpage-header__subtitle">{subtitle}</p>
        </div>
      </section>

      {/* Content */}
      <main className="landing-subpage-content">
        <div className="landing-container landing-subpage-content__inner">
          {children}
        </div>
      </main>

      {/* CTA Section */}
      <section className="landing-cta-banner">
        <div className="landing-container landing-cta-banner__inner">
          <h2>Ready to combine powerful ePaper Editing with an Enterprise Platform?</h2>
          <p>Join top publishers using ePaperSpace's interactive Clickmask Editor and White-Label Portal.</p>
          <div className="landing-cta-banner__actions">
            <Link to="/signup" className="landing-btn landing-btn--primary landing-btn--lg">
              Start for Free
            </Link>
            <Link to="/contact" className="landing-btn landing-btn--secondary landing-btn--lg">
              Get Custom Quotes
            </Link>
          </div>
        </div>
      </section>

      {/* Comprehensive 4-Column Footer */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer__grid">
            {/* Brand & Social Media */}
            <div className="landing-footer__col">
              <Link to="/" className="landing-footer__brand" style={{ display: 'flex', alignItems: 'center' }}>
                <img src="/logo.png" alt="ePaperSpace Logo" className="brand-icon-img" style={{ height: '32px', width: 'auto', marginRight: '8px' }} />
                ePaper<span>Space</span>
              </Link>
              <p className="landing-footer__desc">
                The comprehensive digital newspaper publishing solution combining an interactive Article Clickmask Editor with a robust White-Label SaaS Platform.
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
                <li><Link to="/about">About Us</Link></li>
                <li><Link to="/contact">Contact Us</Link></li>
                <li><Link to="/services">Services & Editor Suite</Link></li>
                <li><Link to="/pricing">Pricing Plans</Link></li>
                <li><Link to="/login">Publisher Login</Link></li>
              </ul>
            </div>

            {/* Legal & Compliance */}
            <div className="landing-footer__col">
              <h4 className="landing-footer__title">Legal & Compliance</h4>
              <ul className="landing-footer__links">
                <li><Link to="/privacy-policy">Privacy Policy</Link></li>
                <li><Link to="/terms-and-conditions">Terms & Conditions</Link></li>
                <li><Link to="/refund-policy">Refund Policy</Link></li>
                <li><Link to="/disclaimer">Disclaimer</Link></li>
              </ul>
            </div>

            {/* Publisher Support */}
            <div className="landing-footer__col">
              <h4 className="landing-footer__title">Publisher Support</h4>
              <p className="landing-footer__contact-text">
                support@epaperspace.com<br />
                sales@epaperspace.com<br />
                +1 (800) 555-EPAP<br />
                Mon–Fri, 9am–6pm PT
              </p>
            </div>
          </div>

          <div className="landing-footer__bottom">
            <p>Copyright © {currentYear} ePaperSpace. All rights reserved.</p>
            <p className="seo-tagline">Dual-Architecture: Interactive Editor Section + White-Label Publishing Platform.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const AboutPage: React.FC = () => (
  <PageLayout
    title="About ePaperSpace"
    subtitle="Bridging the gap between traditional print newspaper publishing and interactive digital readership."
    currentPage="About Us"
    meta={{
      title: 'About ePaperSpace | ePaper Editor Section & Publishing Platform',
      description: 'Learn about ePaperSpace, our dual architecture offering an interactive Article Clickmask Editor and a turnkey White-Label ePaper Publishing Platform.',
      path: '/about',
    }}
  >
    <div className="landing-legal-doc">
      <h2>Our Dual Architecture: Editor Section & Enterprise Platform</h2>
      <p>
        Modern newspaper publishers face two distinct technical challenges: creating interactive, clickable article experiences from static print layouts, and operating a reliable, branded web and mobile portal to distribute and monetize that content.
      </p>
      <p>
        <strong>ePaperSpace</strong> solves both challenges in a single integrated SaaS suite:
      </p>
      <ul>
        <li><strong>The Interactive Editor Section:</strong> Our visual Clickmask & Article Studio allows editors and production staff to draw interactive polygonal hotspots around articles, headlines, photos, and advertisements. Readers can click any article on a full newspaper page to read clean, responsive text, clip high-resolution images, and share articles directly on social media.</li>
        <li><strong>The White-Label Publishing Platform:</strong> Our cloud infrastructure automatically converts uploaded PDF editions into ultra-fast WebP/PNG pages, manages metered paywalls and subscription tiers, hosts branded portals on your custom domain, and delivers real-time readership analytics.</li>
      </ul>

      <h2>Experience, Expertise, Authority & Trust (E-E-A-T)</h2>
      <p>
        Our engineering team has spent over a decade developing high-performance digital newsroom workflows. By combining AI-assisted hotspot clipping with rock-solid content delivery networks, we empower publishers ranging from regional weeklies to national daily broadsheets.
      </p>
    </div>
  </PageLayout>
);

export const ServicesInfoPage: React.FC = () => (
  <PageLayout
    title="Services, Editor Suite & Platform"
    subtitle="Comprehensive tools for editorial teams and digital publishing managers."
    currentPage="Services"
    meta={{
      title: 'ePaper Editor Section & White-Label Platform Services | ePaperSpace',
      description: 'Explore our complete suite: Visual Clickmask Article Editor, Automated PDF Conversion, Custom Domain Portals, Metered Paywalls, and Analytics.',
      path: '/services',
    }}
  >
    <div className="landing-legal-doc">
      <h2>1. The ePaper Editor Section (Interactive Studio)</h2>
      <p>
        Give your newsroom complete creative control over digital editions without writing a single line of code:
      </p>
      <ul>
        <li><strong>Interactive Clickmask Drawing:</strong> Easily map polygonal or rectangular interactive hotspots over articles, columns, photos, and advertisements directly on your PDF pages.</li>
        <li><strong>Article Clipping & Social Sharing:</strong> Readers can click any hotspot to isolate an article, download crisp cropped PNG clippings, or share individual articles via WhatsApp, Twitter/X, and Facebook.</li>
        <li><strong>Dual Reader Modes:</strong> Seamlessly switch between traditional Full-Page Newspaper View and clean, responsive Mobile Article View.</li>
        <li><strong>Rich Multimedia Integration:</strong> Embed video links, audio interviews, and interactive external links right inside newspaper pages.</li>
      </ul>

      <h2>2. The White-Label Publishing Platform</h2>
      <p>
        Enterprise-grade infrastructure designed to scale with your readership:
      </p>
      <ul>
        <li><strong>Automated PDF-to-ePaper Conversion:</strong> Upload production-ready PDF files and let our backend render high-resolution WebP pages and thumbnails automatically.</li>
        <li><strong>Custom Domain & SSL Architecture:</strong> Host your ePaper portal on your own domain (e.g., <code>epaper.yournewspaper.com</code>) with automated CNAME verification and SSL provisioning.</li>
        <li><strong>Subscription Paywall & Access Control:</strong> Monetize readers through metered paywalls, subscriber login tiers, promotional coupon codes, and institutional licensing.</li>
        <li><strong>Real-Time Readership Analytics:</strong> Track daily active readers, most-clipped articles, geographic reach, and engagement heatmaps.</li>
      </ul>
    </div>
  </PageLayout>
);

export const PricingInfoPage: React.FC = () => {
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.getPlatformTiers().then(res => {
      if (res.ok && res.data) {
        setTiers(res.data);
      }
      setLoading(false);
    });
  }, []);

  const formatAmount = (inr: number, period: string): string => {
    const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(inr);
    return `${formatted}/${period === 'yearly' ? 'yr' : 'mo'}`;
  };

  return (
    <PageLayout
      title="Transparent Publisher Pricing"
      subtitle="Plans that include both our Interactive Editor Suite and our White-Label Publishing Platform."
      currentPage="Pricing"
      meta={{
        title: 'ePaper SaaS Pricing | Editor Section & Platform Plans',
        description: 'Transparent pricing plans including full access to the ePaper Clickmask Editor Studio, Custom Domain Platform, Paywall, and Unlimited Readers.',
        path: '/pricing',
      }}
    >
      <div className="landing-legal-doc" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 40, borderBottom: 'none', paddingBottom: 0 }}>Choose the Right Edition for Your Readership</h2>
        
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 60 }}>
            {tiers.map(tier => {
              const amount = tier.price_inr; // In paise
              return (
                <div key={tier.id} className="card" style={{ display: 'flex', flexDirection: 'column', padding: '32px 24px', border: '1px solid var(--color-border)', borderRadius: 12 }}>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8, color: 'var(--color-brand-primary)', textTransform: 'capitalize' }}>
                    {tier.name}
                  </h3>
                  
                  <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 8 }}>
                    {amount > 0 ? formatAmount(amount, tier.billing_cycle || 'monthly') : 'Free'}
                  </div>
                  
                  {tier.tax_percentage > 0 && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 24 }}>
                      + {tier.tax_percentage}% tax (calculated at checkout)
                    </div>
                  )}
                  {tier.tax_percentage === 0 && amount > 0 && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 24 }}>
                      Inclusive of taxes
                    </div>
                  )}
                  {amount === 0 && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 24 }}>
                      No credit card required
                    </div>
                  )}

                  <ul style={{ margin: '0 0 24px 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
                      <span style={{ color: 'var(--color-success)' }}>✓</span> <strong>{tier.max_storage_mb >= 1024 ? `${(tier.max_storage_mb / 1024).toFixed(1)} GB` : `${tier.max_storage_mb} MB`}</strong> Storage
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
                      <span style={{ color: 'var(--color-success)' }}>✓</span> <strong>{tier.max_views_per_day.toLocaleString()}</strong> Views / Day
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
                      <span style={{ color: 'var(--color-success)' }}>✓</span> Up to <strong>{tier.max_papers_per_day}</strong> Papers / Day
                    </li>
                    
                    {tier.features && tier.features.map((f: string, i: number) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.95rem' }}>
                        <span style={{ color: 'var(--color-brand-primary)' }}>✦</span> {f}
                      </li>
                    ))}
                  </ul>

                  <Link to="/signup" className="landing-btn landing-btn--primary" style={{ width: '100%', textAlign: 'center' }}>
                    {amount === 0 ? 'Start for Free' : 'Get Started'}
                  </Link>
                </div>
              );
            })}

            {/* Enterprise Tier Static Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '32px 24px', border: '1px solid var(--color-text-primary)', borderRadius: 12, background: 'var(--color-bg-alt)' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8, color: 'var(--color-text-primary)' }}>
                Global Syndicate
              </h3>
              
              <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 8 }}>
                Custom
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 24 }}>
                Tailored limits & SLA
              </div>

              <ul style={{ margin: '0 0 24px 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>★</span> Custom Storage Capacity
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>★</span> Unlimited Readership
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>★</span> Dedicated Account Manager
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.95rem' }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>★</span> Custom Integrations & APIs
                </li>
              </ul>

              <Link to="/contact" className="landing-btn landing-btn--outline" style={{ width: '100%', textAlign: 'center' }}>
                Contact Sales
              </Link>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export const ContactInfoPage: React.FC = () => (
  <PageLayout
    title="Contact Publisher Support & Sales"
    subtitle="Get custom quotes, technical onboarding assistance, or live demos of our Editor Suite & Platform."
    currentPage="Contact Us"
    meta={{
      title: 'Contact Us | ePaperSpace Publisher Sales & Support',
      description: 'Contact ePaperSpace for custom enterprise quotes, onboarding assistance for our ePaper Editor Section, or technical portal support.',
      path: '/contact',
    }}
  >
    <div className="landing-legal-doc">
      <h2>Get in Touch with Our Team</h2>
      <p>
        Whether you have questions about configuring the Clickmask Editor, mapping your custom domain, or setting up metered paywalls, our publisher specialists are available to assist.
      </p>
      <ul>
        <li><strong>Publisher Sales & Custom Quotes:</strong> sales@epaperspace.com</li>
        <li><strong>Technical Support & Onboarding:</strong> support@epaperspace.com</li>
        <li><strong>Phone Support:</strong> +1 (800) 555-EPAP</li>
        <li><strong>Headquarters:</strong> 100 Innovation Parkway, Suite 400, Media City, CA 94016</li>
      </ul>
    </div>
  </PageLayout>
);

export const PrivacyPolicyPage: React.FC = () => (
  <PageLayout
    title="Privacy Policy"
    subtitle="Safeguarding publisher data, editorial content, and reader privacy."
    currentPage="Privacy Policy"
    meta={{
      title: 'Privacy Policy | ePaperSpace',
      description: 'Read our official Privacy Policy outlining data protection for both our ePaper Editor Section and White-Label Reader Platform.',
      path: '/privacy-policy',
    }}
  >
    <div className="landing-legal-doc">
      <h2>1. Information We Collect</h2>
      <p>
        We collect publisher account information, uploaded PDF editions, editorial clickmask metadata, and anonymized reader interaction metrics necessary to operate the ePaperSpace Platform.
      </p>
      <h2>2. Protection of Editorial & Reader Data</h2>
      <p>
        All data transmitted between editorial teams using the Editor Section and readers accessing the public Platform is encrypted using TLS 1.3. We do not sell publisher or subscriber data to third parties.
      </p>
      <h2>3. Cookies & Reader Analytics</h2>
      <p>
        We use essential cookies to maintain secure publisher login sessions and anonymized performance metrics to help publishers understand readership trends.
      </p>
    </div>
  </PageLayout>
);

export const TermsConditionsPage: React.FC = () => (
  <PageLayout
    title="Terms & Conditions"
    subtitle="Terms governing the use of the ePaperSpace Editor Section and Publishing Platform."
    currentPage="Terms & Conditions"
    meta={{
      title: 'Terms & Conditions | ePaperSpace',
      description: 'Review the Terms & Conditions governing publisher accounts, editorial tools, and white-label ePaper portal deployment.',
      path: '/terms-and-conditions',
    }}
  >
    <div className="landing-legal-doc">
      <h2>1. Intellectual Property & Ownership</h2>
      <p>
        Publishers retain 100% intellectual property ownership of all newspaper editions, PDF assets, extracted articles, and images uploaded to or processed by the ePaperSpace Platform.
      </p>
      <h2>2. License to SaaS Tools</h2>
      <p>
        ePaperSpace grants active publisher accounts a non-exclusive license to access the interactive Clickmask Editor Section, white-label reader portal, and administration dashboard.
      </p>
      <h2>3. Platform Reliability & Uptime</h2>
      <p>
        We commit to enterprise-grade infrastructure and aim for 99.9% availability for all published reader editions across web and mobile platforms.
      </p>
    </div>
  </PageLayout>
);

export const RefundPolicyPage: React.FC = () => (
  <PageLayout
    title="Refund & Cancellation Policy"
    subtitle="Flexible billing terms designed for modern newspaper publishers."
    currentPage="Refund Policy"
    meta={{
      title: 'Refund Policy | ePaperSpace',
      description: 'Learn about subscription cancellation, billing cycles, and refund guidelines for ePaperSpace SaaS plans.',
      path: '/refund-policy',
    }}
  >
    <div className="landing-legal-doc">
      <h2>1. Subscription Cancellations</h2>
      <p>
        Publishers may cancel or downgrade their SaaS subscription at any time via the Platform Billing dashboard. Continued access to both the Editor Section and published archives remains active until the end of the current billing period.
      </p>
      <h2>2. Refund Guidelines</h2>
      <p>
        If an annual plan is canceled within the first 30 days of onboarding, publishers are eligible for a prorated refund subject to onboarding and setup costs.
      </p>
    </div>
  </PageLayout>
);

export const DisclaimerPage: React.FC = () => (
  <PageLayout
    title="Disclaimer"
    subtitle="Important notices regarding newspaper content and software services."
    currentPage="Disclaimer"
    meta={{
      title: 'Disclaimer | ePaperSpace',
      description: 'Legal disclaimer regarding third-party newspaper content published across the ePaperSpace Platform.',
      path: '/disclaimer',
    }}
  >
    <div className="landing-legal-doc">
      <h2>1. Content Responsibility</h2>
      <p>
        ePaperSpace provides the technical software infrastructure (Editor Section and Publishing Platform) for independent newspaper publishers. Individual publishers are solely responsible for the accuracy, legality, copyright compliance, and editorial content of their newspaper editions.
      </p>
      <h2>2. Third-Party Links & Advertisements</h2>
      <p>
        Interactive hotspots created within the Editor Section may link to third-party advertiser websites. ePaperSpace does not endorse or assume liability for third-party websites or services.
      </p>
    </div>
  </PageLayout>
);

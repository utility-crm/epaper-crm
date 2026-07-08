import React from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

export default function LandingPage() {
  return (
    <div className="landing">
      {/* Navbar */}
      <nav className="landing-nav">
        <div className="landing-container landing-nav__inner">
          <a href="/" className="landing-nav__brand">
            ePaper<span>Space</span>
          </a>
          <div className="landing-nav__links">
            <a href="#features" className="landing-nav__link">Features</a>
            <Link to="/login" className="landing-btn landing-btn--outline">Login</Link>
            <Link to="/signup" className="landing-btn landing-btn--primary">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-container landing-hero__inner">
          <div className="landing-hero__text">
            <h1 className="landing-hero__title">
              Publish your digital newspaper with ease.
            </h1>
            <p className="landing-hero__subtitle">
              The ultimate SaaS platform for publishers. Transform your PDFs into
              interactive, readable digital editions in seconds.
            </p>
            <div className="landing-hero__actions">
              <Link to="/signup" className="landing-btn landing-btn--primary landing-btn--lg">
                Get Started
              </Link>
              <Link to="/login" className="landing-btn landing-btn--outline landing-btn--lg">
                Publisher Login
              </Link>
            </div>
          </div>
          <div className="landing-hero__image">
            <img
              src="https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=800"
              alt="Digital newspaper reading experience"
              className="landing-hero__img"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="landing-features">
        <div className="landing-container">
          <div className="landing-features__header">
            <h2 className="landing-features__title">Everything you need to publish online</h2>
            <p className="landing-features__subtitle">Powerful features designed for modern publishers.</p>
          </div>
          <div className="landing-features__grid">
            <div className="landing-feature-card">
              <div className="landing-feature-card__icon">📰</div>
              <h4 className="landing-feature-card__title">PDF to Digital</h4>
              <p className="landing-feature-card__desc">
                Upload your print-ready PDFs and we automatically convert them into a
                beautiful digital reading experience.
              </p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-card__icon">🔒</div>
              <h4 className="landing-feature-card__title">Access Control</h4>
              <p className="landing-feature-card__desc">
                Manage your subscribers effortlessly. Restrict access to premium
                editions and protect your content.
              </p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-card__icon">📈</div>
              <h4 className="landing-feature-card__title">Analytics</h4>
              <p className="landing-feature-card__desc">
                Track your readership. Understand what your audience reads with
                built-in pageview and visitor analytics.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta">
        <div className="landing-container landing-cta__inner">
          <h2 className="landing-cta__title">Ready to bring your newspaper online?</h2>
          <p className="landing-cta__subtitle">Join the future of digital publishing today.</p>
          <Link to="/signup" className="landing-btn landing-btn--primary landing-btn--lg">
            Start for Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer__grid">
            <div className="landing-footer__brand-col">
              <div className="landing-footer__brand">ePaper<span>Space</span></div>
              <p className="landing-footer__brand-desc">
                The complete SaaS platform for digital newspapers and publishers.
              </p>
            </div>
            <div className="landing-footer__links-col">
              <h5 className="landing-footer__col-title">Platform</h5>
              <ul className="landing-footer__link-list">
                <li><Link to="/login">Publisher Login</Link></li>
                <li><Link to="/admin-login">Super Admin</Link></li>
              </ul>
            </div>
            <div className="landing-footer__links-col">
              <h5 className="landing-footer__col-title">Legal</h5>
              <ul className="landing-footer__link-list">
                <li><a href="/privacy">Privacy Policy</a></li>
                <li><a href="/terms">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="landing-footer__bottom">
            <p>© 2026 ePaperSpace. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

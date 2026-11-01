import type { ReactNode } from 'react';
import { Link } from 'wouter';

export interface FooterProps {
  className?: string;
  links?: Array<{ href: string; label: string }>;
  copyright?: string;
  tagline?: string;
  note?: string;
  /** Optional custom Link component if using outside of wouter (e.g. Next.js Link or react-router-dom) */
  renderLink?: (props: { href: string; className: string; children: ReactNode; 'data-testid'?: string }) => ReactNode;
}

const DEFAULT_NAV_LINKS = [
  { href: '/recipes', label: 'Explore' },
  { href: '/why-ai-recipes', label: 'Why recipes' },
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

/**
 * Ultra-luxurious, modern, minimalist "OG" Footer component.
 * Features a deep luxury dark background, golden amber accents,
 * smooth gold hover states, and a human-like android illustration.
 */
export function Footer({
  className = '',
  links = DEFAULT_NAV_LINKS,
  copyright = '© 2026 TaskBakeAI',
  tagline = 'A practical field guide to doing better work with AI.',
  note = 'Made for curious minds',
  renderLink,
}: FooterProps) {
  const renderNavLink = (item: { href: string; label: string }) => {
    const content = (
      <span className="relative group inline-block py-1">
        <span className="footer-nav-label transition-all duration-300">
          {item.label}
        </span>
        <span
          className="footer-nav-underline absolute bottom-0 left-0 w-full h-[1.5px] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left ease-out rounded-full"
          aria-hidden="true"
        />
      </span>
    );

    if (renderLink) {
      return (
        <span key={item.href}>
          {renderLink({
            href: item.href,
            className: 'footer-nav-link text-xs sm:text-sm font-medium tracking-wide',
            children: content,
            'data-testid': `link-footer-${item.label.toLowerCase()}`,
          })}
        </span>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        className="footer-nav-link text-xs sm:text-sm font-medium tracking-wide transition-colors"
        data-testid={`link-footer-${item.label.toLowerCase()}`}
      >
        {content}
      </Link>
    );
  };

  return (
    <footer
      className={`site-footer relative mt-11 bg-ink text-bg pt-7 pb-6 rounded-t-2xl sm:rounded-t-3xl border-t border-[rgb(var(--brand-rgb)/.25)] shadow-[0_-10px_40px_rgba(22,19,15,.18)] overflow-hidden ${className}`}
    >
      {/* Ambient Luxury Radial Glow at top center */}
      <div
        className="footer-ambient-glow pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-3/4 max-w-2xl h-36 blur-2xl"
        aria-hidden="true"
      />

      <div className="shell footer-inner relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col">
        {/* Main Content Area */}
        <div className="footer-main flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 sm:gap-6 lg:gap-8">
          {/* Brand & Tagline */}
          <div className="footer-brand-area flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6 lg:gap-8 flex-1 min-w-0">
            {/* Brand Logo & Heading */}
            <div className="footer-brand-copy shrink-0">
              <Link href="/" className="brand-mark taskbakeai-footer-brand group inline-flex items-center gap-2.5" aria-label="TaskBakeAI home" data-testid="link-logo">
                <picture className="brand-picture">
                  <source srcSet="/taskbakeai-wordmark-light.webp" type="image/webp" />
                  <img className="taskbakeai-footer-wordmark" src="/taskbakeai-wordmark-light.png" width="2172" height="724" alt="TaskBakeAI" decoding="async" />
                </picture>
              </Link>
              <p className="footer-tagline text-xs sm:text-sm font-sans tracking-wide mt-1 leading-snug">
                {tagline}
              </p>
            </div>
          </div>

          {/* Minimalist Navigation Links */}
          <nav
            className="footer-nav flex items-center flex-wrap gap-4 sm:gap-6 lg:gap-8 shrink-0"
            aria-label="Footer navigation"
          >
            {links.map(renderNavLink)}
          </nav>
        </div>

        {/* Sleek Low-Opacity Divider & Bottom Bar */}
        <div className="footer-bottom border-t mt-5 sm:mt-6 pt-4 flex flex-row items-center justify-between gap-3 font-mono text-[11px] sm:text-xs tracking-wider">
          <span className="footer-bottom-copyright transition-colors">
            {copyright}
          </span>
          <span className="footer-bottom-note flex items-center gap-1.5">
            <span className="footer-status-dot w-1.5 h-1.5 rounded-full inline-block animate-pulse" />
            {note}
          </span>
        </div>
      </div>
    </footer>
  );
}

export const OGFooter = Footer;

export default Footer;

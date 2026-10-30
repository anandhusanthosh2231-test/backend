import { useEffect, useRef, useState } from 'react';
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
 * smooth gold hover states, and an antigravity floating yellow mascot
 * that glides dynamically along a sleek horizontal golden guide track.
 */
export function Footer({
  className = '',
  links = DEFAULT_NAV_LINKS,
  copyright = '© 2026 TaskBakeAI',
  tagline = 'A practical field guide to doing better work with AI.',
  note = 'Made for curious minds',
  renderLink,
}: FooterProps) {
  const footerRef = useRef<HTMLElement>(null);
  const robotTrackRef = useRef<HTMLDivElement>(null);
  const robotRef = useRef<SVGSVGElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const footer = footerRef.current;
    const track = robotTrackRef.current;
    const robot = robotRef.current;
    if (!footer || !track || !robot) return;

    let trackWidth = 0;
    let robotWidth = 0;
    const updateTravel = (trackWidth: number, robotWidth: number) => {
      const travel = Math.max(0, trackWidth - robotWidth);
      track.style.setProperty('--robot-travel', `${travel}px`);
    };
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === track) trackWidth = entry.contentRect.width;
        if (entry.target === robot) robotWidth = entry.contentRect.width;
      }
      if (trackWidth > 0 && robotWidth > 0) updateTravel(trackWidth, robotWidth);
    });
    resizeObserver.observe(track);
    resizeObserver.observe(robot);

    let intersectionObserver: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        setHasStarted(true);
        intersectionObserver?.disconnect();
      }, { threshold: 0.05 });
      intersectionObserver.observe(footer);
    } else {
      setHasStarted(true);
    }

    return () => {
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
    };
  }, []);

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
      ref={footerRef}
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
          {/* Brand & Tagline + Track Area */}
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

            {/* Yellow Mascot Track (Sleek Horizontal Golden Guide Rail) */}
            <div
              ref={robotTrackRef}
              className="footer-robot-track relative flex-1 min-w-[120px] max-w-full sm:max-w-[240px] md:max-w-[320px] lg:max-w-[420px] h-6 self-stretch sm:self-center flex items-center"
              aria-hidden="true"
            >
              {/* Left & Right Glowing Terminal Micro-Nodes */}
              <span className="footer-track-node footer-track-node--left absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" />
              <span className="footer-track-node footer-track-node--right absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" />

              {/* Zero-Bloat Inline Mascot SVG with Antigravity Float & Mechanics */}
              <svg
                ref={robotRef}
                className={`footer-robot ${hasStarted ? 'is-started' : ''}`}
                viewBox="0 0 24 24"
                role="presentation"
                aria-label="TaskBakeAI Mascot"
              >
                <g className="footer-robot-body">
                  {/* Robot Head */}
                  <g className="footer-robot-head">
                    <rect
                      x="5"
                      y="2"
                      width="14"
                      height="11"
                      rx="4"
                      fill="var(--ink)"
                      stroke="var(--brand)"
                      strokeWidth="1.25"
                    />
                    {/* Glowing Eyes */}
                    <g className="footer-robot-eyes" fill="var(--brand)">
                      <circle cx="8" cy="7.5" r=".9" />
                      <circle cx="16" cy="7.5" r=".9" />
                    </g>
                    {/* Gentle Smile Visor */}
                    <path
                      d="M9 10h6"
                      fill="none"
                      stroke="var(--brand)"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                    {/* Crown Antenna / Antigravity Beacon */}
                    <path
                      d="M12 2V.8m-.8 0h1.6"
                      fill="none"
                      stroke="var(--brand)"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy=".8" r=".6" fill="var(--brand)" />
                  </g>

                  {/* Robot Torso / Chassis */}
                  <path
                    d="M12 13v1.5m-5 0h10a2 2 0 0 1 2 2V21H5v-4.5a2 2 0 0 1 2-2Z"
                    fill="var(--ink)"
                    stroke="var(--brand)"
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                  />
                  {/* Central Power Core Amber Diamond */}
                  <circle cx="12" cy="17.5" r="1.2" fill="var(--brand)" />

                  {/* Articulated Wave Arm */}
                  <g className="footer-robot-arm">
                    <path
                      d="m19 15 2 3"
                      fill="none"
                      stroke="var(--brand)"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                    />
                    <circle cx="21" cy="18" r="1.1" fill="var(--brand)" />
                  </g>

                  {/* Antigravity Floating/Stepping Legs */}
                  <g
                    className="footer-robot-legs"
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                  >
                    <path className="footer-robot-leg-left" d="M9 21v2" />
                    <path className="footer-robot-leg-right" d="M15 21v2" />
                  </g>
                </g>
              </svg>
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

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

    const updateTravel = () => {
      const travel = Math.max(0, track.clientWidth - robot.getBoundingClientRect().width);
      track.style.setProperty('--robot-travel', `${travel}px`);
    };
    updateTravel();

    const resizeObserver = 'ResizeObserver' in window
      ? new ResizeObserver(updateTravel)
      : null;
    resizeObserver?.observe(track);
    resizeObserver?.observe(robot);
    if (!resizeObserver) window.addEventListener('resize', updateTravel);

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
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', updateTravel);
      intersectionObserver?.disconnect();
    };
  }, []);

  const renderNavLink = (item: { href: string; label: string }) => {
    const content = (
      <span className="relative group inline-block py-1">
        <span className="transition-all duration-300 text-neutral-400 group-hover:text-amber-300 group-hover:drop-shadow-[0_0_8px_rgba(246,201,68,0.5)]">
          {item.label}
        </span>
        <span
          className="absolute bottom-0 left-0 w-full h-[1.5px] bg-gradient-to-r from-amber-400 via-amber-300 to-amber-200 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left ease-out rounded-full shadow-[0_0_6px_rgba(246,201,68,0.6)]"
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
      className={`site-footer relative mt-11 bg-[#0F0E13] text-[#FAF8F5] pt-7 pb-6 rounded-t-2xl sm:rounded-t-3xl border-t border-amber-500/20 shadow-[0_-10px_40px_rgba(0,0,0,0.6)] overflow-hidden ${className}`}
    >
      {/* Ambient Luxury Radial Glow at top center */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-3/4 max-w-2xl h-36 bg-[radial-gradient(ellipse_at_center,rgba(246,201,68,0.08),transparent_70%)] blur-2xl"
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
                <img className="taskbakeai-footer-mark" src="/taskbakeai-mark.png" alt="" />
                <span className="text-base sm:text-lg font-bold tracking-tight text-white font-sans transition-colors duration-200 group-hover:text-amber-200">
                  TaskBakeAI
                </span>
              </Link>
              <p className="footer-tagline text-xs sm:text-sm text-neutral-400 font-sans tracking-wide mt-1 leading-snug">
                {tagline}
              </p>
            </div>

            {/* Yellow Mascot Track (Sleek Horizontal Golden Guide Rail) */}
            <div
              ref={robotTrackRef}
              className="footer-robot-track relative flex-1 min-w-[120px] max-w-full sm:max-w-[240px] md:max-w-[320px] lg:max-w-[420px] h-6 self-stretch sm:self-center flex items-center text-[#F6C944]"
              aria-hidden="true"
            >
              {/* Left & Right Glowing Terminal Micro-Nodes */}
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-400/50 shadow-[0_0_6px_rgba(246,201,68,0.6)]" />
              <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-400/70 shadow-[0_0_8px_rgba(246,201,68,0.7)]" />

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
                      fill="#1E192B"
                      stroke="#F6C944"
                      strokeWidth="1.25"
                    />
                    {/* Glowing Eyes */}
                    <g className="footer-robot-eyes" fill="#F6C944">
                      <circle cx="8" cy="7.5" r=".9" />
                      <circle cx="16" cy="7.5" r=".9" />
                    </g>
                    {/* Gentle Smile Visor */}
                    <path
                      d="M9 10h6"
                      fill="none"
                      stroke="#F6C944"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                    {/* Crown Antenna / Antigravity Beacon */}
                    <path
                      d="M12 2V.8m-.8 0h1.6"
                      fill="none"
                      stroke="#F6C944"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy=".8" r=".6" fill="#FBBF24" />
                  </g>

                  {/* Robot Torso / Chassis */}
                  <path
                    d="M12 13v1.5m-5 0h10a2 2 0 0 1 2 2V21H5v-4.5a2 2 0 0 1 2-2Z"
                    fill="#1E192B"
                    stroke="#F6C944"
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                  />
                  {/* Central Power Core Amber Diamond */}
                  <circle cx="12" cy="17.5" r="1.2" fill="#F6C944" />

                  {/* Articulated Wave Arm */}
                  <g className="footer-robot-arm">
                    <path
                      d="m19 15 2 3"
                      fill="none"
                      stroke="#F6C944"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                    />
                    <circle cx="21" cy="18" r="1.1" fill="#F6C944" />
                  </g>

                  {/* Antigravity Floating/Stepping Legs */}
                  <g
                    className="footer-robot-legs"
                    fill="none"
                    stroke="#F6C944"
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
        <div className="footer-bottom border-t border-amber-500/10 sm:border-white/[0.06] mt-5 sm:mt-6 pt-4 flex flex-row items-center justify-between gap-3 text-neutral-400 font-mono text-[11px] sm:text-xs tracking-wider">
          <span className="text-neutral-500 hover:text-neutral-400 transition-colors">
            {copyright}
          </span>
          <span className="text-neutral-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 inline-block animate-pulse" />
            {note}
          </span>
        </div>
      </div>
    </footer>
  );
}

export const OGFooter = Footer;

export default Footer;

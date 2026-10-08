import { useState, useRef, useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Sparkles, Check, Clock3, Flame, ShieldCheck } from 'lucide-react';
import type { RecipeCard } from '@workspace/api-client-react';

interface BannerItem {
  id: string;
  badge: string;
  badgeIcon?: React.ReactNode;
  title: string;
  subtitle: string;
  linkText: string;
  href: string;
  accentBg: string;
  textColor?: string;
}

interface MobileBannerCarouselProps {
  recipeOfDay?: RecipeCard | null;
}

export function MobileBannerCarousel({ recipeOfDay }: MobileBannerCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const banners: BannerItem[] = [
    ...(recipeOfDay
      ? [
          {
            id: 'featured-today',
            badge: 'RECIPE OF THE DAY',
            badgeIcon: <Flame size={14} className="text-[#e25c38]" />,
            title: recipeOfDay.title,
            subtitle: recipeOfDay.shortDescription || 'One practical workflow tested for real work.',
            linkText: 'Run Recipe',
            href: `/recipes/${recipeOfDay.slug}`,
            accentBg: 'linear-gradient(135deg, #272235 0%, #171420 100%)',
            textColor: '#fffdf7',
          },
        ]
      : []),
    {
      id: 'indian-first',
      badge: 'INDIAN-FIRST FIELD GUIDE',
      badgeIcon: <ShieldCheck size={14} className="text-[#388e3c]" />,
      title: 'Less prompt theatre. More useful work.',
      subtitle: 'Copy-paste instructions tested for Indian businesses, students & freelancers.',
      linkText: 'Browse Shelf',
      href: '/recipes',
      accentBg: 'linear-gradient(135deg, #874239 0%, #5a2720 100%)',
      textColor: '#fffdf7',
    },
    {
      id: 'categories-spotlight',
      badge: 'POPULAR WORKFLOWS',
      badgeIcon: <Sparkles size={14} className="text-[#f6c944]" />,
      title: 'Coding, Writing & Market Research',
      subtitle: 'Pick the problem, get step-by-step prompts and verified outputs.',
      linkText: 'Explore Categories',
      href: '/categories',
      accentBg: 'linear-gradient(135deg, #2d4a3e 0%, #1b3027 100%)',
      textColor: '#fffdf7',
    },
    {
      id: 'submit-workflow',
      badge: 'CONTRIBUTE',
      badgeIcon: <Check size={14} className="text-[#3a7bd5]" />,
      title: 'Have a prompt that saves hours?',
      subtitle: 'Share your proven workflow with the community. We test and publish it.',
      linkText: 'Share Workflow',
      href: '/submit',
      accentBg: 'linear-gradient(135deg, #2f3e66 0%, #1e2844 100%)',
      textColor: '#fffdf7',
    },
  ];

  const handleScroll = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const scrollPosition = container.scrollLeft;
    const cardWidth = container.offsetWidth * 0.92;
    const index = Math.round(scrollPosition / cardWidth);
    if (index >= 0 && index < banners.length) {
      setActiveIndex(index);
    }
  };

  const scrollToSlide = (index: number) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const cardWidth = container.offsetWidth * 0.92;
    container.scrollTo({
      left: index * cardWidth,
      behavior: 'smooth',
    });
    setActiveIndex(index);
  };

  // Auto rotate banner every 5 seconds if not actively touched
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % banners.length;
        if (containerRef.current) {
          const cardWidth = containerRef.current.offsetWidth * 0.92;
          containerRef.current.scrollTo({
            left: next * cardWidth,
            behavior: 'smooth',
          });
        }
        return next;
      });
    }, 5500);

    return () => clearInterval(timer);
  }, [banners.length]);

  return (
    <div className="flipkart-banner-section" aria-label="Featured Highlights">
      <div
        className="flipkart-banner-rail"
        ref={containerRef}
        onScroll={handleScroll}
        role="region"
        aria-roledescription="carousel"
      >
        {banners.map((banner, index) => (
          <Link
            key={banner.id}
            href={banner.href}
            className="flipkart-banner-card"
            style={{ background: banner.accentBg, color: banner.textColor }}
            data-testid={`mobile-banner-${banner.id}`}
            aria-label={banner.title}
          >
            <div className="flipkart-banner-card__content">
              <div className="flipkart-banner-card__badge-row">
                <span className="flipkart-banner-card__badge">
                  {banner.badgeIcon}
                  <span>{banner.badge}</span>
                </span>
                {banner.id === 'featured-today' && recipeOfDay?.estimatedTime && (
                  <span className="flipkart-banner-card__time">
                    <Clock3 size={13} /> {recipeOfDay.estimatedTime}
                  </span>
                )}
              </div>

              <h2 className="flipkart-banner-card__title">{banner.title}</h2>
              <p className="flipkart-banner-card__subtitle">{banner.subtitle}</p>

              <div className="flipkart-banner-card__action">
                <span>{banner.linkText}</span>
                <div className="flipkart-banner-card__action-arrow">
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="flipkart-banner-dots" aria-hidden="true">
        {banners.map((_, index) => (
          <button
            key={index}
            type="button"
            className={`flipkart-banner-dot ${index === activeIndex ? 'is-active' : ''}`}
            onClick={() => scrollToSlide(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

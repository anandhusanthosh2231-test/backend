import { useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { 
  Sparkles, Code, PenTool, TrendingUp, BookOpen, Briefcase, 
  Palette, MessageSquare, Zap, Layers
} from 'lucide-react';

interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  recipeCount?: number;
}

interface MobileCategoryChipsProps {
  categories?: CategoryItem[];
  activeSlug?: string;
  onSelectCategory?: (slug: string) => void;
  showAll?: boolean;
}

// Map common category slugs or keywords to vibrant icons
const getCategoryIcon = (name: string, slug: string) => {
  const lower = (name + ' ' + slug).toLowerCase();
  if (lower.includes('code') || lower.includes('dev') || lower.includes('tech')) return Code;
  if (lower.includes('writ') || lower.includes('content') || lower.includes('copy')) return PenTool;
  if (lower.includes('market') || lower.includes('growth') || lower.includes('seo')) return TrendingUp;
  if (lower.includes('stud') || lower.includes('learn') || lower.includes('exam')) return BookOpen;
  if (lower.includes('bus') || lower.includes('work') || lower.includes('ops')) return Briefcase;
  if (lower.includes('design') || lower.includes('art') || lower.includes('creat')) return Palette;
  if (lower.includes('prompt') || lower.includes('chat') || lower.includes('talk')) return MessageSquare;
  if (lower.includes('fast') || lower.includes('tool')) return Zap;
  return Sparkles;
};

export function MobileCategoryChips({
  categories = [],
  activeSlug,
  onSelectCategory,
  showAll = true,
}: MobileCategoryChipsProps) {
  const [location] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!categories || categories.length === 0) {
    return null;
  }

  const isCurrentActive = (slug: string) => {
    if (activeSlug !== undefined) return activeSlug === slug;
    return location === `/categories/${slug}`;
  };

  return (
    <div className="flipkart-category-scroll-container">
      <div className="flipkart-category-scroll-rail" ref={scrollRef} role="tablist">
        {showAll && (
          <Link
            href="/recipes"
            className={`flipkart-category-item ${!activeSlug && location === '/recipes' ? 'is-active' : ''}`}
            onClick={(e) => {
              if (onSelectCategory) {
                e.preventDefault();
                onSelectCategory('');
              }
            }}
            data-testid="mobile-chip-all"
            role="tab"
          >
            <div className="flipkart-category-icon-bubble is-all">
              <Layers size={22} />
            </div>
            <span className="flipkart-category-label">All</span>
          </Link>
        )}

        {categories.map((cat) => {
          const Icon = getCategoryIcon(cat.name, cat.slug);
          const active = isCurrentActive(cat.slug);

          return (
            <Link
              key={cat.id}
              href={`/categories/${cat.slug}`}
              className={`flipkart-category-item ${active ? 'is-active' : ''}`}
              onClick={(e) => {
                if (onSelectCategory) {
                  e.preventDefault();
                  onSelectCategory(cat.slug);
                }
              }}
              data-testid={`mobile-chip-${cat.slug}`}
              role="tab"
              aria-selected={active}
            >
              <div className={`flipkart-category-icon-bubble ${active ? 'is-active' : ''}`}>
                <Icon size={20} />
                {typeof cat.recipeCount === 'number' && cat.recipeCount > 0 && (
                  <span className="flipkart-category-count-badge">{cat.recipeCount}</span>
                )}
              </div>
              <span className="flipkart-category-label">{cat.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

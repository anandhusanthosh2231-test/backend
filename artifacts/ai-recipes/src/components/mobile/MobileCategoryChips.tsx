import { useRef } from 'react';
import { Link, useLocation } from 'wouter';
import {
  BookOpen,
  Briefcase,
  Calculator,
  Camera,
  Code,
  Dumbbell,
  FileText,
  GraduationCap,
  HeartPulse,
  Landmark,
  Leaf,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Music,
  Palette,
  PenTool,
  Plane,
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Utensils,
  Wallet,
  Wrench,
  Zap,
  Layers,
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
  loading?: boolean;
}

const categoryIconRules = [
  { keywords: ['code', 'coding', 'developer', 'development', 'software', 'technology', 'tech', 'data', 'automation'], icon: Code },
  { keywords: ['write', 'writing', 'content', 'copy', 'editing', 'communication', 'document'], icon: PenTool },
  { keywords: ['market', 'marketing', 'growth', 'seo', 'social', 'sales', 'advertis', 'brand'], icon: TrendingUp },
  { keywords: ['study', 'student', 'learn', 'learning', 'exam', 'education', 'research', 'course'], icon: GraduationCap },
  { keywords: ['business', 'work', 'career', 'job', 'office', 'operations', 'startup', 'management'], icon: Briefcase },
  { keywords: ['design', 'art', 'creative', 'creativity', 'visual', 'photo', 'camera'], icon: Palette },
  { keywords: ['prompt', 'chat', 'conversation', 'customer', 'whatsapp', 'message', 'support'], icon: MessageSquare },
  { keywords: ['finance', 'financial', 'money', 'budget', 'account', 'invest', 'bank', 'tax'], icon: Wallet },
  { keywords: ['health', 'fitness', 'wellness', 'medical', 'mental', 'nutrition'], icon: HeartPulse },
  { keywords: ['food', 'recipe', 'cook', 'kitchen', 'restaurant'], icon: Utensils },
  { keywords: ['travel', 'trip', 'tourism', 'journey'], icon: Plane },
  { keywords: ['shop', 'shopping', 'ecommerce', 'retail', 'product'], icon: ShoppingBag },
  { keywords: ['legal', 'law', 'compliance', 'policy', 'security', 'privacy'], icon: ShieldCheck },
  { keywords: ['engineering', 'repair', 'maintenance', 'build', 'construction'], icon: Wrench },
  { keywords: ['environment', 'sustainability', 'climate', 'nature', 'garden'], icon: Leaf },
  { keywords: ['music', 'audio', 'podcast', 'sound'], icon: Music },
  { keywords: ['government', 'public', 'civic', 'history', 'culture'], icon: Landmark },
  { keywords: ['math', 'mathematics', 'calculation', 'accounting'], icon: Calculator },
  { keywords: ['video', 'film', 'media', 'photography'], icon: Camera },
  { keywords: ['fitness', 'sport', 'sports', 'exercise', 'training'], icon: Dumbbell },
  { keywords: ['strategy', 'planning', 'idea', 'innovation', 'productivity'], icon: Lightbulb },
  { keywords: ['announcement', 'public relations', 'press', 'promotion'], icon: Megaphone },
  { keywords: ['file', 'report', 'template', 'workflow'], icon: FileText },
  { keywords: ['quick', 'tool', 'utility'], icon: Zap },
];

const fallbackIcons = [Layers, BookOpen, Sparkles, MessageSquare, Lightbulb];

const getCategoryIcon = (name: string, slug: string) => {
  const normalized = `${name} ${slug}`.toLowerCase().replace(/[-_]+/g, ' ');
  const matchedRule = categoryIconRules.find(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword)),
  );
  if (matchedRule) return matchedRule.icon;

  const stableIndex = Array.from(slug).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return fallbackIcons[stableIndex % fallbackIcons.length];
};

export function MobileCategoryChips({
  categories = [],
  activeSlug,
  onSelectCategory,
  showAll = true,
  loading = false,
}: MobileCategoryChipsProps) {
  const [location] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return (
      <div className="flipkart-category-scroll-container flipkart-category-scroll-container--loading" aria-hidden="true">
        <div className="flipkart-category-scroll-rail">
          {Array.from({ length: 6 }, (_, index) => <span className="flipkart-category-skeleton" key={index} />)}
        </div>
      </div>
    );
  }

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

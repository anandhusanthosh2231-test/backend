import { useState, useEffect } from 'react';
import { Search, PenLine, Bookmark, X, ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@clerk/react';

interface MobileTopHeaderProps {
  onSearch?: (query: string) => void;
}

export function MobileTopHeader({ onSearch }: MobileTopHeaderProps) {
  const [location, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const [searchValue, setSearchValue] = useState('');
  const isSearchPage = location.startsWith('/search') || location.startsWith('/recipes');
  const isDetailPage = location.startsWith('/recipes/') && location !== '/recipes';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const q = urlParams.get('q') || '';
      if (q) setSearchValue(q);
    }
  }, [location]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchValue.trim();
    if (query) {
      if (onSearch) {
        onSearch(query);
      } else {
        setLocation(`/search?q=${encodeURIComponent(query)}`);
      }
    }
  };

  const handleClear = () => {
    setSearchValue('');
    if (location.startsWith('/search') || location.startsWith('/recipes')) {
      setLocation('/recipes');
    }
  };

  return (
    <header className="flipkart-mobile-header" role="banner">
      <div className="flipkart-mobile-header__top-row">
        <div className="flipkart-mobile-header__left">
          {isDetailPage ? (
            <button
              type="button"
              className="flipkart-mobile-header__back-btn"
              onClick={() => window.history.back()}
              aria-label="Go back"
              data-testid="button-mobile-back"
            >
              <ArrowLeft size={22} />
            </button>
          ) : null}
          <Link href="/" className={`flipkart-mobile-header__brand${isDetailPage ? ' is-detail' : ''}`} aria-label="TaskBakeAI home" data-testid="mobile-link-logo">
              <picture className="brand-picture">
                <source srcSet="/taskbakeai-mark-96.webp" type="image/webp" />
                <img className="flipkart-mobile-header__brand-mark" src="/taskbakeai-mark.png" width="96" height="96" alt="" decoding="async" />
              </picture>
              <span className="flipkart-mobile-header__brand-text">TaskBakeAI</span>
            </Link>
        </div>

        <div className="flipkart-mobile-header__actions">
          <Link
            href="/submit"
            className="flipkart-mobile-header__action-btn create-btn"
            aria-label="Create recipe"
            data-testid="mobile-link-submit"
          >
            <PenLine size={17} strokeWidth={2} />
          </Link>

          {isSignedIn ? (
            <Link
              href="/saved"
              className="flipkart-mobile-header__action-btn"
              aria-label="Saved Shelf"
              data-testid="mobile-link-saved"
            >
              <Bookmark size={20} />
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="flipkart-mobile-header__login-pill"
              data-testid="mobile-link-signin"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      <div className="flipkart-mobile-header__search-row">
        <form
          className="flipkart-mobile-header__search-form"
          onSubmit={handleSubmit}
          role="search"
        >
          <Search size={18} className="flipkart-mobile-header__search-icon" />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search AI recipes, prompts, tools..."
            aria-label="Search recipes"
            className="flipkart-mobile-header__search-input"
            data-testid="mobile-input-search"
          />
          {searchValue ? (
            <button
              type="button"
              onClick={handleClear}
              className="flipkart-mobile-header__clear-btn"
              aria-label="Clear search"
              data-testid="mobile-button-clear-search"
            >
              <X size={16} />
            </button>
          ) : (
            <span className="flipkart-mobile-header__search-badge">Explore</span>
          )}
        </form>
      </div>
    </header>
  );
}

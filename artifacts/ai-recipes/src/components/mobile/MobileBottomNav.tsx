import { useMemo } from 'react';
import { Home, Layers, Search, ShoppingBag, User } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@clerk/react';
import { useListSavedRecipes, getListSavedRecipesQueryKey } from '@workspace/api-client-react';

export function MobileBottomNav() {
  const [location] = useLocation();
  const { isSignedIn } = useAuth();
  const savedQuery = useListSavedRecipes({
    query: {
      queryKey: getListSavedRecipesQueryKey(),
      enabled: !!isSignedIn,
      staleTime: 30000,
    },
  });

  const savedCount = useMemo(() => {
    if (!isSignedIn || !savedQuery.data) return 0;
    return savedQuery.data.length;
  }, [isSignedIn, savedQuery.data]);

  if (location.startsWith('/admin')) {
    return null;
  }

  const navItems = [
    {
      id: 'home',
      label: 'Home',
      href: '/',
      icon: Home,
      isActive: location === '/',
    },
    {
      id: 'categories',
      label: 'Categories',
      href: '/categories',
      icon: Layers,
      isActive: location.startsWith('/categories'),
    },
    {
      id: 'search',
      label: 'Search',
      href: '/search',
      icon: Search,
      isActive: location.startsWith('/search') || (location === '/recipes' && window.location.search.includes('q=')),
    },
    {
      id: 'cart',
      label: 'Cart',
      href: isSignedIn ? '/saved' : '/sign-in',
      icon: ShoppingBag,
      badge: savedCount > 0 ? (savedCount > 99 ? '99+' : savedCount) : null,
      isActive: location === '/saved',
    },
    {
      id: 'account',
      label: 'Account',
      href: isSignedIn ? '/profile' : '/sign-in',
      icon: User,
      isActive: location === '/profile' || location === '/sign-in' || location === '/sign-up',
    },
  ];

  const handleTap = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignore vibration errors on unsupported platforms
      }
    }
  };

  return (
    <nav
      className="flipkart-bottom-nav"
      aria-label="Mobile Navigation"
      role="navigation"
    >
      <div className="flipkart-bottom-nav__inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          const activeClass = item.isActive ? 'is-active' : '';

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flipkart-bottom-nav__item ${activeClass}`}
              onClick={handleTap}
              data-testid={`mobile-nav-${item.id}`}
              aria-current={item.isActive ? 'page' : undefined}
            >
              <div className="flipkart-bottom-nav__icon-wrapper">
                <Icon size={22} strokeWidth={item.isActive ? 2.4 : 1.8} />
                {item.badge !== null && item.badge !== undefined && (
                  <span className="flipkart-bottom-nav__badge" aria-label={`${item.badge} items in cart`}>
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="flipkart-bottom-nav__label">{item.label}</span>
              {item.isActive && <span className="flipkart-bottom-nav__active-pill" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

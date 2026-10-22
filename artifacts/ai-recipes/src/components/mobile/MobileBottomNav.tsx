import { Home, Layers, Search, Sparkles, User } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@clerk/react';
import { ADMIN_PATH } from '@/lib/admin-path';

export function MobileBottomNav() {
  const [location] = useLocation();
  const { isSignedIn } = useAuth();

  if (location === ADMIN_PATH || location.startsWith(`${ADMIN_PATH}/`)) {
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
      id: 'why-ai-recipes',
      label: 'Why TaskBakeAI',
      href: '/why-ai-recipes',
      icon: Sparkles,
      isActive: location === '/why-ai-recipes',
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

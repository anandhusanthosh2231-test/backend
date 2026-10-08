import { useEffect, useState } from 'react';

const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;

export interface MobileDetectionState {
  isMobileDevice: boolean;
  isMobileViewport: boolean;
  isEnforcedMobile: boolean;
  hasTouch: boolean;
}

export function detectIsMobile(): MobileDetectionState {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isMobileDevice: false,
      isMobileViewport: false,
      isEnforcedMobile: false,
      hasTouch: false,
    };
  }

  const userAgent = navigator.userAgent || '';
  const isMobileUserAgent = MOBILE_REGEX.test(userAgent);
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isMobileViewport = window.innerWidth <= 768;
  const isSmallScreen = window.screen.width <= 768;

  // Enforced if either user agent is mobile, screen is mobile, or viewport is mobile width
  const isEnforcedMobile = isMobileUserAgent || isMobileViewport || (hasTouch && isSmallScreen);

  return {
    isMobileDevice: isMobileUserAgent || (hasTouch && isSmallScreen),
    isMobileViewport,
    isEnforcedMobile,
    hasTouch,
  };
}

export function useMobileEnforcement(): MobileDetectionState {
  const [state, setState] = useState<MobileDetectionState>(() => detectIsMobile());

  useEffect(() => {
    const handleCheck = () => {
      const current = detectIsMobile();
      setState(current);

      const root = document.documentElement;
      const body = document.body;

      if (current.isEnforcedMobile) {
        root.classList.add('mobile-mode', 'is-mobile-device');
        body.classList.add('mobile-mode', 'is-mobile-device');
        root.setAttribute('data-mobile-mode', 'true');
      } else {
        root.classList.remove('mobile-mode', 'is-mobile-device');
        body.classList.remove('mobile-mode', 'is-mobile-device');
        root.setAttribute('data-mobile-mode', 'false');
      }

      // Enforce strict viewport meta tag if stripped or modified by desktop mode
      let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
      const targetViewport = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
      if (!viewportMeta) {
        viewportMeta = document.createElement('meta');
        viewportMeta.name = 'viewport';
        document.head.appendChild(viewportMeta);
      }
      if (viewportMeta.content !== targetViewport) {
        viewportMeta.content = targetViewport;
      }
    };

    handleCheck();

    // Prevent pinch-to-zoom gestures on touch devices to enforce mobile app UX
    const handleGesture = (e: Event) => {
      e.preventDefault();
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    };

    window.addEventListener('resize', handleCheck);
    window.addEventListener('orientationchange', handleCheck);
    document.addEventListener('gesturestart', handleGesture, { passive: false });
    document.addEventListener('gesturechange', handleGesture, { passive: false });
    document.addEventListener('gestureend', handleGesture, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener('resize', handleCheck);
      window.removeEventListener('orientationchange', handleCheck);
      document.removeEventListener('gesturestart', handleGesture);
      document.removeEventListener('gesturechange', handleGesture);
      document.removeEventListener('gestureend', handleGesture);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  return state;
}

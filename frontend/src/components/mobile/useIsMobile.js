import { useEffect, useState } from 'react';

/**
 * `true` below the 768px breakpoint, which is where the phone layout kicks in.
 *
 * Tailwind's `md:` prefix covers everything that can be expressed in CSS, so this
 * hook is only for the handful of decisions that need JavaScript: which dialog
 * shape to mount, and whether the bottom nav owns the navigation.
 */
const QUERY = '(max-width: 767px)';

const read = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
};

export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mql = window.matchMedia(QUERY);
    const onChange = (event) => setIsMobile(event.matches);

    // Safari on older Android WebViews only has the deprecated listener API.
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);

    // The first render can happen before layout settles on a rotating device.
    setIsMobile(mql.matches);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  return isMobile;
};

export default useIsMobile;

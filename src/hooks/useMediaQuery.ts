import { useEffect, useState } from 'react';

/** Acompanha uma media query do CSS em tempo real (resize, rotação de tela). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);

    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

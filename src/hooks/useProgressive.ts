import { useEffect, useRef, useState } from 'react';

/*
 * Liste lunghe (collezione, card per il mazzo): si disegnano le prime `step` card e le altre
 * man mano che si scorre, così il telefono non deve creare centinaia di card tutte insieme.
 * Restituisce quante mostrare e il riferimento da mettere su un elemento in fondo alla lista.
 */
export function useProgressive(total: number, step = 40, resetKey?: unknown) {
  const [limit, setLimit] = useState(step);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // cambiano filtri o ordinamento: si riparte dalle prime
  useEffect(() => setLimit(step), [resetKey, step]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= total) return;
    if (typeof IntersectionObserver === 'undefined') {
      setLimit(total);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => Math.min(total, l + step));
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [limit, total, step]);

  return { limit, sentinel };
}

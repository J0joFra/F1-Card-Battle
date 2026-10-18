import { useMemo, type CSSProperties } from 'react';
import type { Season } from '../lib/season';

// Decorazioni delle feste che scendono (o volano) sullo sfondo. Leggere: poche, solo CSS, mai durante la partita.
const FX: Record<Season, { items: string[]; motion: 'fall' | 'fly'; count: number }> = {
  halloween: { items: ['🦇', '🦇', '🎃', '🦇', '👻'], motion: 'fly', count: 9 },
  winter: { items: ['❄', '❅', '❆'], motion: 'fall', count: 18 },
  christmas: { items: ['❄', '❅', '❆', '✨', '❄', '🎁'], motion: 'fall', count: 18 },
  easter: { items: ['🌸', '🌼', '🌸', '🥚', '🌷'], motion: 'fall', count: 12 },
};

// numeri "casuali" fissi, così le decorazioni non saltano a ogni aggiornamento
const rand = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function SeasonFx({ season }: { season: Season }) {
  const { items, motion, count } = FX[season];
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        ch: items[i % items.length],
        style: {
          '--x': `${(rand(i, 1) * 100).toFixed(1)}%`,
          '--y': `${(8 + rand(i, 2) * 70).toFixed(1)}%`,
          '--size': `${(motion === 'fly' ? 18 : 10) + rand(i, 3) * 14}px`,
          '--dur': `${(motion === 'fly' ? 14 : 9) + rand(i, 4) * 10}s`,
          '--delay': `${(-rand(i, 5) * 20).toFixed(1)}s`,
          '--sway': `${(rand(i, 6) * 60 - 30).toFixed(0)}px`,
        } as CSSProperties,
      })),
    [items, motion, count],
  );
  return (
    <div className={`season-fx fx-${motion}`} aria-hidden>
      {parts.map((p, i) => (
        <span key={i} style={p.style}>
          {p.ch}
        </span>
      ))}
    </div>
  );
}

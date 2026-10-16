import type { Card } from '../types';
import { STATS, formatStat, statLabel, statShort } from '../game/cards';
import { percentile } from '../game/engine';

/*
 * Diagramma a ragnatela delle 7 metriche di una card.
 * Ogni raggio è il percentile rispetto a tutte le card (bordo = la migliore, centro = la peggiore),
 * già girato per le metriche "↓": così le forme delle card si confrontano tra loro a colpo d'occhio.
 */

const N = STATS.length;
const SIZE = 150;
const C = SIZE / 2;
const CY = C + 5; // un po' più in basso: sopra c'è il nome della card
const H = SIZE + 8;
const R = 47; // raggio del bordo esterno
const RINGS = [0.25, 0.5, 0.75, 1];

const point = (i: number, r: number) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / N; // si parte in alto, in senso orario
  return [C + Math.cos(a) * r, CY + Math.sin(a) * r] as const;
};
const poly = (r: (i: number) => number) =>
  STATS.map((_, i) => point(i, r(i)).map((v) => v.toFixed(1)).join(',')).join(' ');

export function StatRadar({ card }: { card: Card }) {
  const values = STATS.map((s) => percentile(s.key, card.stats[s.key]));
  const summary = STATS.map((s) => `${statLabel(s.key)} ${formatStat(s, card.stats[s.key])}`).join(', ');
  return (
    <svg className="stat-radar" viewBox={`0 0 ${SIZE} ${H}`} role="img" aria-label={summary}>
      {/* griglia: eptagoni concentrici e raggi, discreti */}
      {RINGS.map((k) => (
        <polygon key={k} points={poly(() => R * k)} className="radar-ring" />
      ))}
      {STATS.map((_, i) => {
        const [x, y] = point(i, R);
        return <line key={i} x1={C} y1={CY} x2={x} y2={y} className="radar-spoke" />;
      })}
      {/* la card */}
      <polygon points={poly((i) => R * Math.max(0.04, values[i]))} className="radar-area" />
      {values.map((v, i) => {
        const [x, y] = point(i, R * Math.max(0.04, v));
        return <circle key={i} cx={x} cy={y} r={2.2} className="radar-dot" />;
      })}
      {/* etichette: sigla della metrica e valore vero */}
      {STATS.map((s, i) => {
        const [x, y] = point(i, R + 16);
        return (
          <text key={s.key} x={x} y={y} textAnchor="middle" className="radar-label">
            <tspan x={x} dy="-0.15em">
              {statShort(s.key)}
            </tspan>
            <tspan x={x} dy="1.1em" className="radar-value">
              {formatStat(s, card.stats[s.key])}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

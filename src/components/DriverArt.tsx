import { useId } from 'react';
import type { Card } from '../types';
import { teamColor } from '../game/teamColors';

/*
 * Illustrazione della card.
 * Le immagini disegnate vanno in src/assets/drivers/ e vengono trovate in automatico:
 *   - <id card>.webp  → per una card precisa, es. lewis-hamilton__ferrari.webp (pilota con la tuta di quella scuderia)
 *   - <id pilota>.webp → per tutte le card del pilota, es. lewis-hamilton.webp
 * Formati accettati: webp, png, jpg. Senza immagine si usa il casco disegnato con i colori della scuderia.
 */
const files = import.meta.glob('../assets/drivers/*.{webp,png,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const PORTRAITS = new Map(
  Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.(webp|png|jpg)$/, ''), url]),
);

export const portraitOf = (card: Card) => PORTRAITS.get(card.id) ?? PORTRAITS.get(card.driver.id) ?? null;

export function DriverArt({ card }: { card: Card }) {
  const src = portraitOf(card);
  if (src) return <img className="art-img" src={src} alt={card.driver.name} loading="lazy" draggable={false} />;
  return <Helmet card={card} />;
}

// ---------- casco ----------
// Ogni pilota ha il suo disegno, uguale su tutte le sue card (come nella realtà): motivo, secondo colore
// e visiera vengono dal suo id. Il colore di base resta quello della scuderia.

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const ACCENTS = ['#ffffff', '#ffd400', '#15171d', '#e10600', '#1e5bff', '#16a34a', '#c0c6d0', '#ff7a00', '#ff4fa3', '#00c2d1'];
const VISORS = ['#11131a', '#11131a', '#11131a', '#c99a1c', '#2d6cdf', '#6a3fa0'];
export const HELMET_DESIGNS = ['stripe', 'twin', 'crown', 'chevron', 'stars', 'split', 'ring', 'bolt', 'dots', 'checker'] as const;
type Design = (typeof HELMET_DESIGNS)[number];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distance = (a: string, b: string) => {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

// motivo, colore e visiera del casco di un pilota (il secondo colore si stacca sempre dalla base)
export function helmetStyle(driverId: string, base: string) {
  const h = hash(driverId);
  const design: Design = HELMET_DESIGNS[h % HELMET_DESIGNS.length];
  let a = (h >>> 8) % ACCENTS.length;
  for (let i = 0; i < ACCENTS.length && distance(ACCENTS[a], base) < 140; i++) a = (a + 1) % ACCENTS.length;
  return { design, accent: ACCENTS[a], visor: VISORS[(h >>> 16) % VISORS.length] };
}

const SHELL = 'M14 66 C10 36 34 12 66 12 C94 12 112 32 112 58 L112 74 C112 82 106 86 98 86 L30 86 C20 86 15 78 14 66 Z';
const star = (cx: number, cy: number, r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const d = i % 2 ? r * 0.45 : r;
    return `${(cx + d * Math.cos(a)).toFixed(1)},${(cy + d * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

// il motivo, disegnato sopra la calotta (e ritagliato sulla sua forma)
function Pattern({ design, color }: { design: Design; color: string }) {
  switch (design) {
    case 'stripe':
      return <path d="M22 44 C40 24 74 18 104 34 L106 42 C76 28 44 32 24 52 Z" fill={color} />;
    case 'twin':
      return (
        <>
          <path d="M18 50 C38 28 72 20 106 34 L107 39 C74 26 42 33 20 55 Z" fill={color} />
          <path d="M22 60 C42 38 74 32 110 44 L110 49 C76 38 46 44 24 65 Z" fill={color} />
        </>
      );
    case 'crown':
      return <path d="M0 0 H120 V34 C92 24 56 24 30 36 C20 40 12 46 0 54 Z" fill={color} />;
    case 'chevron':
      return <polygon points="18,30 50,52 18,74 30,74 62,52 30,30" fill={color} />;
    case 'stars':
      return (
        <>
          <polygon points={star(40, 32, 9)} fill={color} />
          <polygon points={star(66, 24, 7)} fill={color} />
          <polygon points={star(28, 56, 6)} fill={color} />
          <polygon points={star(88, 30, 5)} fill={color} />
        </>
      );
    case 'split':
      return <path d="M0 100 L0 58 L66 0 L84 0 L14 100 Z" fill={color} />;
    case 'ring':
      return (
        <>
          <path d="M0 34 C40 26 80 26 120 34 L120 44 C80 36 40 36 0 44 Z" fill={color} />
          <path d="M0 48 C40 40 80 40 120 48 L120 51 C80 43 40 43 0 51 Z" fill={color} opacity="0.7" />
        </>
      );
    case 'bolt':
      return <polygon points="12,62 40,40 38,50 70,28 66,40 108,22 74,52 76,42 44,62 46,52" fill={color} />;
    case 'dots':
      return (
        <>
          {[0, 1, 2, 3].flatMap((r) =>
            [0, 1, 2, 3, 4].map((c) => (
              <circle key={`${r}-${c}`} cx={20 + c * 12 + (r % 2) * 6} cy={26 + r * 11} r={3.2 - r * 0.5} fill={color} />
            )),
          )}
        </>
      );
    case 'checker':
      return (
        <>
          {Array.from({ length: 12 }, (_, i) =>
            [0, 1].map((r) => ((i + r) % 2 ? null : <rect key={`${i}-${r}`} x={8 + i * 9} y={34 + r * 7} width="9" height="7" fill={color} />)),
          )}
        </>
      );
  }
}

// Casco stilizzato: colore della scuderia, motivo del pilota, visiera, numero di gara sul lato.
function Helmet({ card }: { card: Card }) {
  const id = useId().replace(/:/g, '');
  const base = card.kind === 'career' ? '#c9a227' : teamColor(card.team.id);
  const { design, accent, visor } = helmetStyle(card.driver.id, base);
  const label = card.kind === 'career' ? '★' : (card.number ?? card.driver.abbreviation.slice(0, 2));
  return (
    <svg className="art-helmet" viewBox="0 0 120 100" aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={`v${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor={visor} stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <path d={SHELL} />
        </clipPath>
      </defs>
      {/* calotta con il motivo del pilota */}
      <path d={SHELL} fill={base} />
      <g clipPath={`url(#c${id})`} opacity="0.92">
        <Pattern design={design} color={accent} />
      </g>
      <path d={SHELL} fill={`url(#g${id})`} />
      {/* visiera */}
      <path d="M58 46 L110 46 C112 46 113 48 113 50 L113 62 C113 64 112 65 110 65 L64 65 C58 65 54 60 54 55 C54 50 55 46 58 46 Z" fill={visor} />
      <path d="M58 46 L110 46 C112 46 113 48 113 50 L113 62 C113 64 112 65 110 65 L64 65 C58 65 54 60 54 55 C54 50 55 46 58 46 Z" fill={`url(#v${id})`} />
      <path d="M62 49 L108 49 L108 53 L60 53 Z" fill="#fff" opacity="0.18" />
      {/* mentoniera */}
      <path d="M30 86 L98 86 C96 92 90 95 82 95 L44 95 C36 95 32 92 30 86 Z" fill="#11131a" opacity="0.85" />
      {/* numero */}
      <text x="36" y="76" textAnchor="middle" fontFamily="Titillium Web, sans-serif" fontWeight="900" fontStyle="italic" fontSize="20" fill="#fff" stroke="#000" strokeOpacity="0.45" strokeWidth="0.9">
        {label}
      </text>
    </svg>
  );
}

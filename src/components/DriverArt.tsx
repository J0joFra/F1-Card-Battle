import { useId } from 'react';
import type { Card } from '../types';
import { teamColor } from '../game/teamColors';
import { seasonNow, type Season } from '../lib/season';
import { HELMET_DESIGNS, type HelmetDesign } from '../game/profile';

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
export { HELMET_DESIGNS };
type Design = HelmetDesign;

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
    case 'slash':
      return (
        <>
          <polygon points="30,0 44,0 4,100 -10,100" fill={color} />
          <polygon points="52,0 60,0 20,100 12,100" fill={color} />
        </>
      );
    case 'diamonds':
      return (
        <>
          {[24, 44, 64, 84].map((x, i) => (
            <polygon key={x} points={`${x},${28 + (i % 2) * 8} ${x + 8},${38 + (i % 2) * 8} ${x},${48 + (i % 2) * 8} ${x - 8},${38 + (i % 2) * 8}`} fill={color} />
          ))}
        </>
      );
    case 'crown':
      return <polygon points="0,0 120,0 120,28 0,50" fill={color} />;
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
    case 'band':
      return (
        <>
          <rect x="0" y="30" width="120" height="10" fill={color} />
          <rect x="0" y="44" width="120" height="3" fill={color} />
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

// Cappello delle feste sopra il casco: Babbo Natale, berretto di lana, cappello da strega, orecchie da coniglio.
function Hat({ season, shade }: { season: Season; shade: string }) {
  switch (season) {
    case 'christmas':
      return (
        <g>
          <path d="M30 17 C33 -2 62 -10 82 -3 C91 1 96 8 98 16 Z" fill="#d42426" />
          <path d="M44 2 C30 -8 14 -6 6 6 L13 10 C19 2 30 0 46 8 Z" fill="#d42426" />
          <path d="M30 17 C33 -2 62 -10 82 -3 C91 1 96 8 98 16 Z" fill={`url(#${shade})`} />
          <rect x="25" y="10" width="76" height="11" rx="5.5" fill="#fff" />
          <circle cx="7" cy="9" r="7" fill="#fff" />
        </g>
      );
    case 'winter':
      return (
        <g>
          <path d="M29 18 C29 -4 97 -4 97 18 Z" fill="#2f8fe0" />
          {[38, 48, 58, 68, 78, 88].map((x) => (
            <path key={x} d={`M${x} 17 C${x - 1} 8 ${x + 1} 2 ${x + 4} -1`} stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" fill="none" />
          ))}
          <rect x="26" y="11" width="74" height="10" rx="4" fill="#1d5f9e" />
          <circle cx="63" cy="-4" r="7.5" fill="#fff" />
        </g>
      );
    case 'halloween':
      return (
        <g>
          <path d="M44 14 L84 14 L70 -4 L52 -16 L58 -3 Z" fill="#3b1f5c" />
          <path d="M45 8 L83 8 L84 14 L44 14 Z" fill="#ff7a00" />
          <ellipse cx="64" cy="15" rx="44" ry="5.5" fill="#2b1640" />
        </g>
      );
    case 'easter':
      return (
        <g>
          <ellipse cx="52" cy="-1" rx="7" ry="17" transform="rotate(-14 52 -1)" fill="#fff" stroke="#e6d6e6" />
          <ellipse cx="52" cy="0" rx="3.5" ry="12" transform="rotate(-14 52 0)" fill="#ffb3d1" />
          <ellipse cx="75" cy="-1" rx="7" ry="17" transform="rotate(16 75 -1)" fill="#fff" stroke="#e6d6e6" />
          <ellipse cx="75" cy="0" rx="3.5" ry="12" transform="rotate(16 75 0)" fill="#ffb3d1" />
          <rect x="36" y="11" width="56" height="5" rx="2.5" fill="#f7b733" />
        </g>
      );
  }
}

// Casco stilizzato: colore della scuderia, motivo del pilota, visiera, numero di gara sul lato.
function Helmet({ card }: { card: Card }) {
  const base = card.kind === 'career' ? '#c9a227' : teamColor(card.team.id);
  const { design, accent, visor } = helmetStyle(card.driver.id, base);
  const label = card.kind === 'career' ? '★' : (card.number ?? card.driver.abbreviation.slice(0, 2));
  return <HelmetSvg className="art-helmet" base={base} design={design} accent={accent} visor={visor} label={label} />;
}

interface HelmetProps {
  base: string;
  design: Design;
  accent: string;
  visor: string;
  label: string | number;
  className?: string;
}

export function HelmetSvg({ base, design, accent, visor, label, className }: HelmetProps) {
  const id = useId().replace(/:/g, '');
  const season = seasonNow();
  return (
    <svg className={className} viewBox={season ? '0 -18 120 118' : '0 0 120 100'} aria-hidden>
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
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
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
      {season && (
        <g className="hat">
          <Hat season={season} shade={`s${id}`} />
        </g>
      )}
      {/* numero */}
      <text x="36" y="76" textAnchor="middle" fontFamily="Titillium Web, sans-serif" fontWeight="900" fontStyle="italic" fontSize="20" fill="#fff" stroke="#000" strokeOpacity="0.45" strokeWidth="0.9">
        {label}
      </text>
    </svg>
  );
}

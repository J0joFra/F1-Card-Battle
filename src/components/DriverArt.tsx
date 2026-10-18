import { useEffect, useState } from 'react';
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

// Avatar disegnati (DiceBear): il modulo si carica la prima volta che serve, intanto si vede il casco.
type AvatarFn = (driver: Card['driver']) => string;
let avatarFn: AvatarFn | null = null;
let loading: Promise<void> | null = null;
const waiting = new Set<() => void>();
function loadAvatars() {
  loading ??= import('../lib/avatars').then((m) => {
    avatarFn = m.avatarUri;
    waiting.forEach((f) => f());
    waiting.clear();
  });
}

export function DriverArt({ card }: { card: Card }) {
  const src = portraitOf(card);
  const [, ready] = useState(!!avatarFn);
  useEffect(() => {
    if (src || avatarFn) return;
    const done = () => ready(true);
    waiting.add(done);
    loadAvatars();
    return () => {
      waiting.delete(done);
    };
  }, [src]);
  if (src) return <img className="art-img" src={src} alt={card.driver.name} loading="lazy" draggable={false} />;
  if (!avatarFn) return <Helmet card={card} />;
  return (
    <>
      <img className="art-avatar" src={avatarFn(card.driver)} alt="" draggable={false} />
      {card.kind !== 'career' && card.number != null && <span className="art-number">{card.number}</span>}
      {card.kind === 'career' && <span className="art-number">★</span>}
    </>
  );
}

// Casco stilizzato: colore della scuderia, visiera scura, numero di gara sul lato.
function Helmet({ card }: { card: Card }) {
  const base = card.kind === 'career' ? '#c9a227' : teamColor(card.team.id);
  const label = card.kind === 'career' ? '★' : (card.number ?? card.driver.abbreviation.slice(0, 2));
  return (
    <svg className="art-helmet" viewBox="0 0 120 100" aria-hidden>
      <defs>
        <linearGradient id={`h-${card.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {/* calotta */}
      <path d="M14 66 C10 36 34 12 66 12 C94 12 112 32 112 58 L112 74 C112 82 106 86 98 86 L30 86 C20 86 15 78 14 66 Z" fill={base} />
      <path d="M14 66 C10 36 34 12 66 12 C94 12 112 32 112 58 L112 74 C112 82 106 86 98 86 L30 86 C20 86 15 78 14 66 Z" fill={`url(#h-${card.id})`} />
      {/* striscia decorativa */}
      <path d="M22 44 C40 24 74 18 104 34 L106 42 C76 28 44 32 24 52 Z" fill="#fff" opacity="0.85" />
      {/* visiera */}
      <path d="M58 46 L110 46 C112 46 113 48 113 50 L113 62 C113 64 112 65 110 65 L64 65 C58 65 54 60 54 55 C54 50 55 46 58 46 Z" fill="#11131a" />
      <path d="M62 49 L108 49 L108 53 L60 53 Z" fill="#fff" opacity="0.18" />
      {/* mentoniera */}
      <path d="M30 86 L98 86 C96 92 90 95 82 95 L44 95 C36 95 32 92 30 86 Z" fill="#11131a" opacity="0.85" />
      {/* numero */}
      <text x="36" y="76" textAnchor="middle" fontFamily="Titillium Web, sans-serif" fontWeight="900" fontStyle="italic" fontSize="20" fill="#fff" stroke="#000" strokeOpacity="0.35" strokeWidth="0.8">
        {label}
      </text>
    </svg>
  );
}

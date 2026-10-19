import { ALL_CARDS } from './cards';

/*
 * Profilo del giocatore: nickname, avatar (un ritratto che gli somiglia) e pilota preferito.
 * Le stesse regole valgono sul telefono (per avvisare subito) e sul server (che decide).
 */

export const HELMET_DESIGNS = ['slash', 'diamonds', 'crown', 'chevron', 'stars', 'split', 'band', 'bolt', 'dots', 'checker'] as const;
export type HelmetDesign = (typeof HELMET_DESIGNS)[number];

// Avatar del giocatore: un ritratto in tuta da pilota, da costruire perché ti assomigli.
// Ogni parte è il numero dell'opzione scelta nell'elenco qui sotto.
export const AVATAR_OPTIONS = {
  skin: ['#ffdfc8', '#f3c6a5', '#e2aa84', '#c98a62', '#aa6c45', '#8c5333', '#6c3e24', '#4a2a17'],
  hair: ['bald', 'buzz', 'short', 'sidepart', 'curly', 'afro', 'long', 'ponytail', 'bun', 'mohawk', 'wavy', 'spiky'],
  hairColor: ['#1b1b1d', '#3b2418', '#6b3f1f', '#9a6233', '#c99a5b', '#e8cf8a', '#b5482a', '#8f8f94', '#e9e9ec', '#2f5bea', '#e0457b'],
  eyes: ['round', 'happy', 'narrow', 'big', 'wink'],
  eyeColor: ['#3a2a1e', '#6b4a2b', '#3d7a3d', '#3a6fb0', '#6b7b8c'],
  brows: ['natural', 'arched', 'thick', 'straight', 'raised'],
  mouth: ['smile', 'grin', 'neutral', 'open', 'smirk', 'tongue'],
  beard: ['none', 'stubble', 'moustache', 'goatee', 'full', 'chinstrap'],
  glasses: ['none', 'round', 'square', 'aviator', 'sunglasses'],
  suit: ['#e10600', '#ff8000', '#00a19c', '#1e41ff', '#005aff', '#00594f', '#ffd800', '#ff4fa3', '#7c3aed', '#15171d', '#f4f4f5', '#9aa0ab'],
} as const;
export type AvatarPart = keyof typeof AVATAR_OPTIONS;
export const AVATAR_PARTS = Object.keys(AVATAR_OPTIONS) as AvatarPart[];
export type Avatar = Record<AvatarPart, number>;

export interface PlayerProfile {
  nickname: string;
  avatar: Avatar;
  favorite: string | null; // id del pilota preferito
}

export const NICK_MIN = 3;
export const NICK_MAX = 16;

// nickname: 3–16 caratteri tra lettere (anche accentate), numeri, spazio, punto, trattino e trattino basso
export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const nick = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (nick.length < NICK_MIN || nick.length > NICK_MAX) return null;
  return /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(nick) ? nick : null;
}

export function parseAvatar(raw: unknown): Avatar | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const out = {} as Avatar;
  for (const part of AVATAR_PARTS) {
    const v = a[part];
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= AVATAR_OPTIONS[part].length) return null;
    out[part] = v as number;
  }
  return out;
}

// piloti che si possono scegliere come preferiti (uno per pilota, in ordine alfabetico)
export const DRIVERS = [...new Map(ALL_CARDS.map((c) => [c.driver.id, c.driver])).values()].sort((a, b) =>
  a.name.localeCompare(b.name),
);
const DRIVER_IDS = new Set(DRIVERS.map((d) => d.id));
export const validFavorite = (id: unknown): string | null => (typeof id === 'string' && DRIVER_IDS.has(id) ? id : null);

export function randomAvatar(rng: () => number = Math.random): Avatar {
  const out = {} as Avatar;
  for (const part of AVATAR_PARTS) out[part] = Math.floor(rng() * AVATAR_OPTIONS[part].length);
  // un po' più spesso niente barba e niente occhiali
  if (rng() < 0.5) out.beard = 0;
  if (rng() < 0.6) out.glasses = 0;
  return out;
}

// Codice di recupero: per riavere l'account su un altro telefono. Sul server si salva solo l'impronta (hash).
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}
export const normalizeRecoveryCode = (raw: unknown) =>
  typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
export async function hashRecoveryCode(raw: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`f1cb:${normalizeRecoveryCode(raw)}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

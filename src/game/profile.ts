import { ALL_CARDS } from './cards';

/*
 * Profilo del giocatore: nickname, avatar (un casco disegnato da lui) e pilota preferito.
 * Le stesse regole valgono sul telefono (per avvisare subito) e sul server (che decide).
 */

export const HELMET_DESIGNS = ['slash', 'diamonds', 'crown', 'chevron', 'stars', 'split', 'band', 'bolt', 'dots', 'checker'] as const;
export type HelmetDesign = (typeof HELMET_DESIGNS)[number];

// colori a scelta per il casco dell'avatar
export const AVATAR_BASES = ['#e10600', '#ff8000', '#ffd400', '#16a34a', '#00a19c', '#1e5bff', '#1e2b5c', '#7c3aed', '#ff4fa3', '#f4f4f5', '#9aa0ab', '#15171d'];
export const AVATAR_ACCENTS = ['#ffffff', '#ffd400', '#15171d', '#e10600', '#1e5bff', '#16a34a', '#c0c6d0', '#ff7a00', '#ff4fa3', '#00c2d1'];
export const AVATAR_VISORS = ['#11131a', '#c99a1c', '#2d6cdf', '#6a3fa0'];

export interface Avatar {
  base: string;
  design: HelmetDesign;
  accent: string;
  visor: string;
  number: number; // numero di gara, 0–99
}

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
  const ok =
    AVATAR_BASES.includes(a.base as string) &&
    (HELMET_DESIGNS as readonly string[]).includes(a.design as string) &&
    AVATAR_ACCENTS.includes(a.accent as string) &&
    AVATAR_VISORS.includes(a.visor as string) &&
    Number.isInteger(a.number) &&
    (a.number as number) >= 0 &&
    (a.number as number) <= 99;
  return ok
    ? { base: a.base as string, design: a.design as HelmetDesign, accent: a.accent as string, visor: a.visor as string, number: a.number as number }
    : null;
}

// piloti che si possono scegliere come preferiti (uno per pilota, in ordine alfabetico)
export const DRIVERS = [...new Map(ALL_CARDS.map((c) => [c.driver.id, c.driver])).values()].sort((a, b) =>
  a.name.localeCompare(b.name),
);
const DRIVER_IDS = new Set(DRIVERS.map((d) => d.id));
export const validFavorite = (id: unknown): string | null => (typeof id === 'string' && DRIVER_IDS.has(id) ? id : null);

export function randomAvatar(rng: () => number = Math.random): Avatar {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
  const base = pick(AVATAR_BASES);
  return {
    base,
    design: pick(HELMET_DESIGNS),
    accent: pick(AVATAR_ACCENTS.filter((c) => c !== base)),
    visor: pick(AVATAR_VISORS),
    number: 1 + Math.floor(rng() * 99),
  };
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

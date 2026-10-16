import { CARD_BY_ID } from '../game/cards';
import { normalizeProgress, type Progress } from '../game/collection';
import { deckProblems } from '../game/deckRules';
import type { Rng } from '../game/engine';
import type { Card } from '../types';
import type { GameResponse, Store } from './types';

// Pezzi comuni a tutte le azioni del server.

export class GameError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export interface Ctx {
  today: string; // data del server (UTC), AAAA-MM-GG
  rng: Rng;
  now?: () => number;
}

export const nowOf = (ctx: Ctx) => (ctx.now ?? Date.now)();

const MAX_RETRIES = 4;

// la data del telefono (fuso orario locale) è accettata se dista al massimo un giorno da quella del server
export function checkDate(date: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new GameError('bad_date');
  const diff = Math.abs(Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`));
  if (!(diff <= 86_400_000)) throw new GameError('bad_date');
}

export const cardOrThrow = (id: unknown) => {
  const c = typeof id === 'string' ? CARD_BY_ID.get(id) : undefined;
  if (!c) throw new GameError('unknown_card');
  return c;
};

// carica il profilo, applica la modifica e salva; se un'altra richiesta l'ha cambiato nel frattempo, riprova
export async function withProfile<T extends GameResponse>(
  store: Store,
  _ctx: Ctx,
  change: (p: Progress) => T & { progress: Progress },
  uid?: string,
): Promise<T> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const row = await store.getProfile(uid);
    if (!row) throw new GameError('no_profile', 409);
    const current = normalizeProgress(row.progress);
    const res = change(current);
    if (await store.putProfile({ ...res.progress, updatedAt: Date.now() }, row.version, uid)) return res;
  }
  throw new GameError('busy', 409);
}

// mazzo valido: card esistenti, possedute, senza doppioni e nel rispetto dei limiti di rarità
export function validDeck(ids: unknown, p: Progress): Card[] {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new GameError('bad_deck');
  const deck = ids.map(cardOrThrow);
  if (deck.some((c) => !p.owned[c.id]) || deckProblems(deck).length) throw new GameError('bad_deck');
  return deck;
}

export async function myProgress(store: Store) {
  const row = await store.getProfile();
  if (!row) throw new GameError('no_profile', 409);
  return normalizeProgress(row.progress);
}

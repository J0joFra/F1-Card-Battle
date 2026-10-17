import type { Card, Rarity } from '../types';
import { ALL_CARDS, CARDS_DATA, CARD_BY_ID, cardsOfRarity } from './cards';
import { shuffle, type Rng } from './engine';
import {
  CARD_PRICE,
  JOLLY_CHANCE,
  PACK_ODDS,
  PACK_PRICE,
  PACK_SIZE,
  addCards,
  jollyTargets,
  type Progress,
  type UnlockResult,
} from './collection';
import { TEAM_THEMES, seededRng } from './daily';

/*
 * Negozio: tre tipi di pacchetto e 5 card del giorno da comprare con i crediti.
 */

export type PackKind = 'classic' | 'premium' | 'team';

export interface PackType {
  price: number;
  size: number;
  odds: [Rarity, number][];
  minLast: Rarity; // l'ultima card del pacchetto è almeno di questa rarità
}

export const PACK_TYPES: Record<PackKind, PackType> = {
  // il pacchetto di sempre (anche quello vinto ogni 10 vittorie)
  classic: { price: PACK_PRICE, size: PACK_SIZE, odds: PACK_ODDS, minLast: 'argento' },
  // niente Bronzo, molto più Oro e Leggendarie
  premium: {
    price: 150,
    size: PACK_SIZE,
    odds: [
      ['argento', 0.5],
      ['oro', 0.32],
      ['platino', 0.12],
      ['leggendaria', 0.06],
    ],
    minLast: 'oro',
  },
  // solo card della scuderia del giorno: per completare le scuderie
  team: { price: 80, size: 4, odds: PACK_ODDS, minLast: 'argento' },
};

const RANK: Record<Rarity, number> = { bronzo: 0, argento: 1, oro: 2, platino: 3, leggendaria: 4 };

function roll(odds: [Rarity, number][], rng: Rng): Rarity {
  let r = rng();
  for (const [rarity, p] of odds) {
    if (r < p) return rarity;
    r -= p;
  }
  return odds[odds.length - 1][0];
}

// La scuderia del pacchetto "Scuderia" cambia ogni giorno (uguale per tutti).
export function teamOfDay(date: string) {
  const rng = seededRng(`shop-team:${date}`);
  const id = TEAM_THEMES[Math.floor(rng() * TEAM_THEMES.length)];
  return { id, name: CARDS_DATA.teams[id] ?? id };
}

const teamPool = (teamId: string) => ALL_CARDS.filter((c) => c.kind === 'team' && c.team.id === teamId);

export function drawPackOf(kind: PackKind, date: string, rng: Rng): Card[] {
  const type = PACK_TYPES[kind];
  const pool = kind === 'team' ? teamPool(teamOfDay(date).id) : ALL_CARDS;
  const cards: Card[] = [];
  for (let i = 0; i < type.size; i++) {
    let rarity = roll(type.odds, rng);
    if (i === type.size - 1 && RANK[rarity] < RANK[type.minLast]) rarity = type.minLast;
    let candidates = (kind === 'team' ? pool.filter((c) => c.rarity === rarity) : cardsOfRarity(rarity)).filter((c) => !cards.includes(c));
    // scuderia senza card di quella rarità: la più vicina disponibile
    if (!candidates.length) candidates = pool.filter((c) => !cards.includes(c)).sort((a, b) => RANK[b.rarity] - RANK[a.rarity]);
    if (!candidates.length) break;
    cards.push(candidates[Math.floor(rng() * candidates.length)]);
  }
  return cards;
}

// Compra un Premium o uno Scuderia e lo apre subito (il Classico invece va tra i pacchetti da aprire).
export function buyAndOpen(p: Progress, kind: Exclude<PackKind, 'classic'>, date: string, rng: Rng = Math.random): UnlockResult | null {
  const { price } = PACK_TYPES[kind];
  if (p.credits < price) return null;
  const res = addCards({ ...p, credits: p.credits - price }, drawPackOf(kind, date, rng));
  const jolly = rng() < JOLLY_CHANCE;
  return jolly ? { ...res, jolly, progress: { ...res.progress, jolly: res.progress.jolly + 1 } } : res;
}

// ---- Card del giorno ----

export const STORE_SIZE = 6;

export interface StoreState {
  date: string;
  cards: string[];
  bought: string[];
}

// Le 6 card del giorno: soprattutto card scuderia che ti mancano dei piloti che stai completando,
// poi altre card che non hai. Si scelgono una volta al giorno e restano fisse fino a mezzanotte.
export function generateStore(owned: Record<string, number>, date: string, salt = ''): StoreState {
  const rng = seededRng(`store:${date}:${salt}`);
  const useful = shuffle(
    jollyTargets({ owned } as Progress).flatMap((t) => t.missing),
    rng,
  );
  const others = shuffle(
    ALL_CARDS.filter((c) => c.kind === 'team' && !owned[c.id] && !useful.includes(c)),
    rng,
  );
  const picked: Card[] = [];
  for (const c of useful) {
    if (picked.length >= 3) break;
    picked.push(c);
  }
  // le altre: al massimo un Oro o Platino, per non rendere il negozio troppo caro
  for (const c of others) {
    if (picked.length >= STORE_SIZE) break;
    const top = (x: Card) => x.rarity === 'oro' || x.rarity === 'platino';
    if (top(c) && picked.some(top)) continue;
    picked.push(c);
  }
  return { date, cards: picked.map((c) => c.id), bought: [] };
}

export const storeFor = (prev: StoreState | undefined, owned: Record<string, number>, date: string, salt = '') =>
  prev && prev.date === date ? prev : generateStore(owned, date, salt);

// card utili: quelle che servono per completare un pilota che hai già iniziato
export const isUseful = (p: Progress, card: Card) =>
  card.kind === 'team' && !p.owned[card.id] && jollyTargets(p).some((t) => t.missing.includes(card));

export const storePrice = (card: Card) => CARD_PRICE[card.rarity];

export function buyFromStore(p: Progress, cardId: string, date: string, salt = ''): UnlockResult | null {
  const store = storeFor(p.store, p.owned, date, salt);
  const card = CARD_BY_ID.get(cardId);
  if (!card || !store.cards.includes(cardId) || store.bought.includes(cardId) || p.owned[cardId]) return null;
  const price = storePrice(card);
  if (p.credits < price) return null;
  const res = addCards({ ...p, credits: p.credits - price }, [card]);
  return { ...res, progress: { ...res.progress, store: { ...store, bought: [...store.bought, cardId] } } };
}

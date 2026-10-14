import type { Card, Rarity } from '../types';
import { ALL_CARDS, CARD_BY_ID, careerCardOf, cardsOfRarity, teamCardsOfDriver } from './cards';
import { DECK_SIZE, shuffle, type Rng } from './engine';
import { canAdd } from './deckRules';

export const WINS_PER_PACK = 5;
export const PACK_SIZE = 5;
export const PACK_PRICE = 40;

// Probabilità di rarità per ogni card del pacchetto.
export const PACK_ODDS: [Rarity, number][] = [
  ['bronzo', 0.7],
  ['argento', 0.22],
  ['oro', 0.07],
  ['leggendaria', 0.01],
];

// Crediti ricevuti per un doppione e prezzo per comprare una card a scelta.
export const DUPLICATE_CREDITS: Record<Rarity, number> = { bronzo: 2, argento: 5, oro: 15, leggendaria: 40 };
export const CARD_PRICE: Record<Rarity, number> = { bronzo: 15, argento: 40, oro: 120, leggendaria: 300 };

export interface Progress {
  owned: Record<string, number>; // id card → copie ottenute (doppioni inclusi)
  deck: string[]; // card scelte per le partite
  credits: number;
  wins: number;
  losses: number;
  draws: number;
  packs: number; // pacchetti da aprire
  winsTowardPack: number;
}

export function starterProgress(rng: Rng = Math.random): Progress {
  const starter = [
    ...shuffle(cardsOfRarity('bronzo'), rng).slice(0, 12),
    ...shuffle(cardsOfRarity('argento'), rng).slice(0, 3),
  ];
  const owned: Record<string, number> = {};
  for (const c of starter) owned[c.id] = 1;
  return {
    owned,
    deck: [],
    credits: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    packs: 1, // un pacchetto di benvenuto
    winsTowardPack: 0,
  };
}

export const ownedCards = (p: Progress): Card[] =>
  Object.keys(p.owned).map((id) => CARD_BY_ID.get(id)).filter((c): c is Card => !!c);

// Ultimo mazzo usato, limitato alle card ancora possedute.
export const savedDeck = (p: Progress): Card[] =>
  p.deck.map((id) => CARD_BY_ID.get(id)).filter((c): c is Card => !!c && !!p.owned[c.id]).slice(0, DECK_SIZE);

// Completa il mazzo con card casuali della collezione, rispettando i limiti di rarità.
export function autoFillDeck(p: Progress, deck: Card[], rng: Rng = Math.random): Card[] {
  const result = [...deck];
  for (const c of shuffle(ownedCards(p), rng)) {
    if (result.length >= DECK_SIZE) break;
    if (canAdd(result, c)) result.push(c);
  }
  return result;
}

function rollRarity(rng: Rng): Rarity {
  let r = rng();
  for (const [rarity, odds] of PACK_ODDS) {
    if (r < odds) return rarity;
    r -= odds;
  }
  return 'bronzo';
}

export function drawPack(rng: Rng = Math.random): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    let rarity = rollRarity(rng);
    // l'ultima card del pacchetto è almeno Argento
    if (i === PACK_SIZE - 1 && rarity === 'bronzo') rarity = 'argento';
    const pool = cardsOfRarity(rarity).filter((c) => !cards.includes(c));
    cards.push(pool[Math.floor(rng() * pool.length)]);
  }
  return cards;
}

export interface AddResult {
  card: Card;
  duplicate: boolean;
  credits: number;
}

export interface UnlockResult {
  progress: Progress;
  added: AddResult[];
  unlockedCareers: Card[];
}

// Aggiunge card alla collezione: i doppioni diventano crediti,
// e completare tutte le scuderie di un pilota sblocca la sua Carriera.
export function addCards(p: Progress, cards: Card[]): UnlockResult {
  const owned = { ...p.owned };
  let credits = p.credits;
  const added: AddResult[] = [];
  for (const card of cards) {
    const duplicate = !!owned[card.id];
    owned[card.id] = (owned[card.id] || 0) + 1;
    const gain = duplicate ? DUPLICATE_CREDITS[card.rarity] : 0;
    credits += gain;
    added.push({ card, duplicate, credits: gain });
  }
  const unlockedCareers: Card[] = [];
  for (const driverId of new Set(cards.map((c) => c.driver.id))) {
    const career = careerCardOf(driverId);
    if (!career || owned[career.id]) continue;
    if (teamCardsOfDriver(driverId).every((c) => owned[c.id])) {
      owned[career.id] = 1;
      unlockedCareers.push(career);
    }
  }
  return { progress: { ...p, owned, credits }, added, unlockedCareers };
}

export function openPack(p: Progress, rng: Rng = Math.random): UnlockResult | null {
  if (p.packs <= 0) return null;
  return addCards({ ...p, packs: p.packs - 1 }, drawPack(rng));
}

export function buyPack(p: Progress): Progress | null {
  if (p.credits < PACK_PRICE) return null;
  return { ...p, credits: p.credits - PACK_PRICE, packs: p.packs + 1 };
}

export function buyCard(p: Progress, card: Card): UnlockResult | null {
  const price = CARD_PRICE[card.rarity];
  if (p.owned[card.id] || p.credits < price) return null;
  return addCards({ ...p, credits: p.credits - price }, [card]);
}

export function recordMatch(p: Progress, outcome: 'player' | 'cpu' | 'draw'): { progress: Progress; packEarned: boolean } {
  if (outcome !== 'player') {
    return {
      progress: outcome === 'cpu' ? { ...p, losses: p.losses + 1 } : { ...p, draws: p.draws + 1 },
      packEarned: false,
    };
  }
  const toward = p.winsTowardPack + 1;
  const packEarned = toward >= WINS_PER_PACK;
  return {
    progress: {
      ...p,
      wins: p.wins + 1,
      winsTowardPack: packEarned ? 0 : toward,
      packs: p.packs + (packEarned ? 1 : 0),
    },
    packEarned,
  };
}

export const collectionSize = (p: Progress) => Object.keys(p.owned).length;
export const TOTAL_CARDS = ALL_CARDS.length;

const STORAGE_KEY = 'f1-card-battle:v1';

export function loadProgress(): Progress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Progress;
    // scarta card non più presenti dopo un aggiornamento dei dati
    p.owned = Object.fromEntries(Object.entries(p.owned).filter(([id]) => CARD_BY_ID.has(id)));
    p.deck = p.deck.filter((id) => CARD_BY_ID.has(id));
    return p;
  } catch {
    return null;
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // salvataggio non disponibile (es. navigazione privata): si gioca comunque
  }
}

export function resetProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignora */
  }
}

import type { Card, Rarity } from '../types';
import { ALL_CARDS, CARD_BY_ID, careerCardOf, cardsOfRarity, teamCardsOfDriver } from './cards';
import { DECK_SIZE, shuffle, type Rng } from './engine';
import { canAdd, deckProblems } from './deckRules';
import { emptyDaily, type DailyState, type MissionsState } from './daily';

export const WINS_PER_PACK = 10;
// sfida contro un amico: crediti extra per vittoria e pareggio (oltre alla vittoria che conta per il pacchetto)
export const FRIEND_WIN_CREDITS = 10;
export const FRIEND_DRAW_CREDITS = 5;
export const PACK_SIZE = 5;
export const PACK_PRICE = 40;
// Probabilità che un pacchetto contenga anche un Jolly: una card scuderia a scelta
// di un pilota che stai completando.
export const JOLLY_CHANCE = 0.2;

// Probabilità di rarità per ogni card del pacchetto.
export const PACK_ODDS: [Rarity, number][] = [
  ['bronzo', 0.65],
  ['argento', 0.22],
  ['oro', 0.09],
  ['platino', 0.03],
  ['leggendaria', 0.01],
];

// Crediti ricevuti per un doppione e prezzo per comprare una card a scelta.
export const DUPLICATE_CREDITS: Record<Rarity, number> = { bronzo: 2, argento: 5, oro: 15, platino: 25, leggendaria: 40 };
export const CARD_PRICE: Record<Rarity, number> = { bronzo: 15, argento: 40, oro: 120, platino: 200, leggendaria: 300 };

export interface Progress {
  owned: Record<string, number>; // id card → copie ottenute (doppioni inclusi)
  deck: string[]; // mazzo in uso (copia dello slot attivo, per compatibilità)
  decks?: string[][]; // mazzi salvati, uno per slot (stile Clash Royale)
  activeDeck?: number; // slot in uso
  credits: number;
  wins: number;
  losses: number;
  draws: number;
  packs: number; // pacchetti da aprire
  winsTowardPack: number;
  jolly: number; // Jolly da usare
  daily: DailyState; // sfida del giorno
  missions?: MissionsState; // missioni del giorno (generate al primo uso)
  store?: { date: string; cards: string[]; bought: string[] }; // card del giorno nel negozio
  updatedAt: number; // ultima modifica (ms), per capire quale copia è più recente tra dispositivo e cloud
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
    jolly: 0,
    daily: emptyDaily(),
    updatedAt: 0,
  };
}

export const ownedCards = (p: Progress): Card[] =>
  Object.keys(p.owned).map((id) => CARD_BY_ID.get(id)).filter((c): c is Card => !!c);

// Mazzi salvati: 3 slot. Nella sfida tra amici (al meglio di 3) la partita N si gioca con il mazzo N.
export const DECK_SLOTS = 3;

export const deckSlots = (p: Progress): string[][] =>
  Array.from({ length: DECK_SLOTS }, (_, i) => p.decks?.[i] ?? (i === (p.activeDeck ?? 0) ? p.deck : []));

export const activeSlot = (p: Progress) => Math.min(DECK_SLOTS - 1, Math.max(0, p.activeDeck ?? 0));

const toCards = (p: Progress, ids: string[]) =>
  ids.map((id) => CARD_BY_ID.get(id)).filter((c): c is Card => !!c && !!p.owned[c.id]).slice(0, DECK_SIZE);

// Mazzo salvato in uno slot (di default quello in uso), limitato alle card ancora possedute.
export const savedDeck = (p: Progress, slot = activeSlot(p)): Card[] => toCards(p, deckSlots(p)[slot] ?? []);

// Salva i mazzi e lo slot in uso.
export function withDecks(p: Progress, decks: string[][], active: number): Progress {
  const clean = Array.from({ length: DECK_SLOTS }, (_, i) =>
    (Array.isArray(decks[i]) ? decks[i] : []).filter((id, j, all) => typeof id === 'string' && !!p.owned[id] && all.indexOf(id) === j).slice(0, DECK_SIZE),
  );
  const slot = Number.isInteger(active) ? Math.min(DECK_SLOTS - 1, Math.max(0, active)) : 0;
  return { ...p, decks: clean, activeDeck: slot, deck: clean[slot] };
}

// I 3 mazzi della sfida tra amici, solo se sono tutti completi e validi.
export function seriesDecks(p: Progress): Card[][] | null {
  const decks = deckSlots(p).map((ids) => toCards(p, ids));
  return decks.every((d) => d.length === DECK_SIZE && !deckProblems(d).length) ? decks : null;
}

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
  jolly?: boolean; // il pacchetto conteneva un Jolly
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
  const res = addCards({ ...p, packs: p.packs - 1 }, drawPack(rng));
  const jolly = rng() < JOLLY_CHANCE;
  return jolly ? { ...res, jolly, progress: { ...res.progress, jolly: res.progress.jolly + 1 } } : res;
}

// Card che un Jolly può prendere: le card scuderia mancanti dei piloti di cui hai già
// almeno una card scuderia (cioè quelli che stai completando).
export function jollyTargets(p: Progress): { driverId: string; owned: number; total: number; missing: Card[] }[] {
  const started = new Set(
    Object.keys(p.owned)
      .map((id) => CARD_BY_ID.get(id))
      .filter((c): c is Card => !!c && c.kind === 'team')
      .map((c) => c.driver.id),
  );
  return [...started]
    .map((driverId) => {
      const teams = teamCardsOfDriver(driverId);
      const missing = teams.filter((c) => !p.owned[c.id]);
      return { driverId, owned: teams.length - missing.length, total: teams.length, missing };
    })
    .filter((t) => t.missing.length > 0 && careerCardOf(t.driverId))
    .sort((a, b) => a.missing.length - b.missing.length || b.total - a.total);
}

export function spendJolly(p: Progress, card: Card): UnlockResult | null {
  if (p.jolly <= 0 || p.owned[card.id] || card.kind !== 'team') return null;
  if (!jollyTargets(p).some((t) => t.missing.includes(card))) return null;
  return addCards({ ...p, jolly: p.jolly - 1 }, [card]);
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
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Rende valido un salvataggio (locale o dal cloud) anche se creato da una versione precedente.
export function normalizeProgress(raw: Partial<Progress>): Progress {
  const base = starterProgress();
  const p = { ...base, ...raw, owned: raw.owned ?? {}, deck: raw.deck ?? [] };
  // scarta card non più presenti dopo un aggiornamento dei dati
  p.owned = Object.fromEntries(Object.entries(p.owned).filter(([id]) => CARD_BY_ID.has(id)));
  p.deck = p.deck.filter((id) => CARD_BY_ID.has(id));
  if (Array.isArray(p.decks)) p.decks = p.decks.map((d) => (Array.isArray(d) ? d.filter((id) => CARD_BY_ID.has(id)) : []));
  p.jolly ??= 0;
  p.daily ??= emptyDaily();
  p.updatedAt ??= 0;
  return p;
}

// Nessuna partita giocata e nessun pacchetto aperto: è la collezione iniziale di un ospite.
export const isUntouched = (p: Progress) =>
  p.wins + p.losses + p.draws === 0 && p.packs >= 1 && p.credits === 0 && p.jolly === 0 && collectionSize(p) <= 15;

// Unisce due progressioni (es. quella da ospite sul dispositivo e quella dell'account) senza perdere
// card: per ogni valore tiene il massimo, così nessuno dei due perde nulla e non si duplica niente.
export function mergeProgress(account: Progress, device: Progress): Progress {
  const owned = { ...account.owned };
  for (const [id, n] of Object.entries(device.owned)) owned[id] = Math.max(owned[id] ?? 0, n);
  return {
    owned,
    deck: account.deck.length ? account.deck : device.deck,
    decks: account.decks ?? device.decks,
    activeDeck: account.decks ? account.activeDeck : device.activeDeck,
    credits: Math.max(account.credits, device.credits),
    wins: Math.max(account.wins, device.wins),
    losses: Math.max(account.losses, device.losses),
    draws: Math.max(account.draws, device.draws),
    packs: Math.max(account.packs, device.packs),
    winsTowardPack: Math.max(account.winsTowardPack, device.winsTowardPack),
    jolly: Math.max(account.jolly, device.jolly),
    // sfida e missioni: vale la copia del giorno più recente (a parità, quella dell'account)
    daily: device.daily.date > account.daily.date ? device.daily : account.daily,
    missions: (device.missions?.date ?? '') > (account.missions?.date ?? '') ? device.missions : account.missions,
    store: (device.store?.date ?? '') > (account.store?.date ?? '') ? device.store : account.store,
    updatedAt: Date.now(),
  };
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

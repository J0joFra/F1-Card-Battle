import type { Card, Rarity } from '../types';
import { ALL_CARDS, RARITIES, decadeOf, isCollectOnly, rarityLabel } from './cards';
import { translate } from '../lib/i18n';
import { DECK_SIZE, shuffle, type Rng } from './engine';

/*
 * Regole per comporre il mazzo e modalità di partita.
 * Partita classica: al massimo 2 Oro e 2 card "top" tra Platino e Leggendaria, di cui al massimo 1 Leggendaria
 * (quindi 1 Leggendaria + 1 Platino + 2 Oro, oppure 2 Platino + 2 Oro).
 * Le altre modalità ammettono solo le card che rispettano il tema (una rarità, un decennio, una nazionalità
 * o, nella sfida del giorno, una scuderia).
 */
export const MAX_ORO = 2;
export const MAX_TOP = 2; // Platino + Leggendaria
export const MAX_LEGGENDARIA = 1;

export type MatchMode =
  | { kind: 'classic' }
  | { kind: 'rarity'; rarity: Rarity }
  | { kind: 'decade'; decade: number }
  | { kind: 'nation'; country: string }
  | { kind: 'team'; team: string }; // solo per la sfida del giorno

export const CLASSIC: MatchMode = { kind: 'classic' };

// nazionalità con almeno 7 piloti e decenni con abbastanza card: le scelte possibili
export const NATIONS = Object.entries(
  ALL_CARDS.reduce<Record<string, Set<string>>>((m, c) => {
    if (c.kind === 'team' && c.driver.country) (m[c.driver.country] ??= new Set()).add(c.driver.id);
    return m;
  }, {}),
)
  .filter(([, drivers]) => drivers.size >= DECK_SIZE)
  .sort((a, b) => b[1].size - a[1].size)
  .map(([country]) => country);
export const DECADES = [...new Set(ALL_CARDS.filter((c) => c.kind === 'team').map(decadeOf))]
  .filter((d) => ALL_CARDS.filter((c) => c.kind === 'team' && decadeOf(c) === d).length >= DECK_SIZE * 3)
  .sort();

export function fitsMode(mode: MatchMode, c: Card): boolean {
  if (isCollectOnly(c)) return false; // Pionieri e Classiche si collezionano soltanto
  switch (mode.kind) {
    case 'classic':
      return true;
    case 'rarity':
      return c.rarity === mode.rarity;
    case 'decade':
      return c.kind === 'team' && decadeOf(c) === mode.decade;
    case 'nation':
      return c.driver.country === mode.country;
    case 'team':
      return c.kind === 'team' && c.team.id === mode.team;
  }
}

// nella modalità "una rarità" le card sono tutte uguali: niente limiti
const limited = (mode: MatchMode) => mode.kind !== 'rarity';

// Modalità ricevuta dal client: solo valori validi, altrimenti null.
export function parseMode(raw: unknown): MatchMode | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  switch (m.kind) {
    case 'classic':
      return CLASSIC;
    case 'rarity':
      return RARITIES.includes(m.rarity as Rarity) ? { kind: 'rarity', rarity: m.rarity as Rarity } : null;
    case 'decade':
      return DECADES.includes(m.decade as number) ? { kind: 'decade', decade: m.decade as number } : null;
    case 'nation':
      return NATIONS.includes(m.country as string) ? { kind: 'nation', country: m.country as string } : null;
    default:
      return null; // la scuderia vale solo per la sfida del giorno, decisa dal server
  }
}

const countOf = (deck: Card[], r: Rarity) => deck.filter((c) => c.rarity === r).length;

// Quante card di ogni rarità limitata si possono ancora avere, visto il mazzo attuale.
export function rarityCaps(deck: Card[]): [Rarity, number][] {
  const leg = countOf(deck, 'leggendaria');
  const plat = countOf(deck, 'platino');
  return [
    ['leggendaria', Math.max(0, Math.min(MAX_LEGGENDARIA, MAX_TOP - plat))],
    ['platino', Math.max(0, MAX_TOP - leg)],
    ['oro', MAX_ORO],
  ];
}

function rarityProblems(deck: Card[]): string[] {
  const problems: string[] = [];
  const leg = countOf(deck, 'leggendaria');
  const plat = countOf(deck, 'platino');
  const oro = countOf(deck, 'oro');
  if (leg > MAX_LEGGENDARIA)
    problems.push(translate('deck_tooMany', { n: MAX_LEGGENDARIA, r: rarityLabel('leggendaria'), m: leg }));
  if (leg + plat > MAX_TOP) problems.push(translate('deck_tooManyTop', { n: MAX_TOP, m: leg + plat }));
  if (oro > MAX_ORO) problems.push(translate('deck_tooMany', { n: MAX_ORO, r: rarityLabel('oro'), m: oro }));
  return problems;
}

export function deckProblems(deck: Card[], mode: MatchMode = CLASSIC): string[] {
  const problems: string[] = [];
  if (deck.length !== DECK_SIZE) problems.push(translate('deck_need', { n: DECK_SIZE, m: deck.length }));
  if (deck.some((c) => !fitsMode(mode, c))) problems.push(translate('deck_offMode'));
  if (limited(mode)) problems.push(...rarityProblems(deck));
  return problems;
}

// I 3 mazzi devono essere davvero diversi: due mazzi hanno al massimo MAX_SHARED card in comune
// (cioè almeno 5 diverse) e nessuna card può stare in tutti e 3.
export const MIN_DIFFERENT = 5;
export const MAX_SHARED = DECK_SIZE - MIN_DIFFERENT;

const has = (deck: Card[], card: Card) => deck.some((c) => c.id === card.id);
const shared = (a: Card[], b: Card[]) => a.filter((c) => has(b, c)).length;

export type SlotBlock = 'full' | 'rarity' | 'allDecks' | 'similar';

// Perché la card non si può aggiungere al mazzo (null = si può). `others` sono gli altri mazzi salvati.
export function addBlock(deck: Card[], card: Card, mode: MatchMode = CLASSIC, others: Card[][] = []): SlotBlock | null {
  if (deck.length >= DECK_SIZE) return 'full';
  if (has(deck, card) || !fitsMode(mode, card)) return 'rarity';
  if (limited(mode) && rarityProblems([...deck, card]).length) return 'rarity';
  const withCard = others.filter((d) => has(d, card));
  if (others.length >= 2 && withCard.length === others.length) return 'allDecks';
  if (withCard.some((d) => shared(deck, d) >= MAX_SHARED)) return 'similar';
  return null;
}

// Si può aggiungere questa card senza sforare i limiti?
export const canAdd = (deck: Card[], card: Card, mode: MatchMode = CLASSIC, others: Card[][] = []) =>
  addBlock(deck, card, mode, others) === null;

// Cosa non va tra i mazzi (solo le coppie che riguardano `slot`, se indicato): troppe card in comune
// o card presenti in tutti i mazzi.
export function decksProblems(decks: Card[][], slot?: number): string[] {
  const problems: string[] = [];
  for (let i = 0; i < decks.length; i++)
    for (let j = i + 1; j < decks.length; j++) {
      if (slot !== undefined && slot !== i && slot !== j) continue;
      const n = shared(decks[i], decks[j]);
      if (n > MAX_SHARED) problems.push(translate('deck_similar', { a: i + 1, b: j + 1, n, max: MAX_SHARED }));
    }
  if (decks.length >= 3) {
    const inAll = (decks[slot ?? 0] ?? []).filter((c) => decks.every((d) => has(d, c)));
    if (inAll.length) {
      const names = inAll.slice(0, 3).map((c) => c.driver.lastName).join(', ') + (inAll.length > 3 ? '…' : '');
      problems.push(translate('deck_inAll', { n: inAll.length, names }));
    }
  }
  return problems;
}

// Quanto i mazzi violano la regola (0 = tutto a posto): serve al server per accettare le modifiche
// che sistemano mazzi già troppo simili, anche un passo alla volta.
export function decksOverlap(decks: Card[][]): number {
  let score = 0;
  for (let i = 0; i < decks.length; i++)
    for (let j = i + 1; j < decks.length; j++) score += Math.max(0, shared(decks[i], decks[j]) - MAX_SHARED);
  if (decks.length >= 3) score += decks[0].filter((c) => decks.every((d) => has(d, c))).length;
  return score;
}

// Completa il mazzo con le card date (a caso, oppure dalla valutazione più alta), rispettando le regole.
// Con gli altri mazzi: prima prova con card nuove; se non bastano, riusa quelle degli altri mazzi.
export function fillDeck(
  cards: Card[],
  deck: Card[],
  mode: MatchMode = CLASSIC,
  rng: Rng = Math.random,
  best = false,
  others: Card[][] = [],
  reuseFirst = false,
): Card[] {
  const order = best ? shuffle(cards, rng).sort((a, b) => b.ovr - a.ovr) : shuffle(cards, rng);
  const run = (list: Card[]) => {
    const result = deck.filter((c) => fitsMode(mode, c));
    for (const c of list) {
      if (result.length >= DECK_SIZE) break;
      if (canAdd(result, c, mode, others)) result.push(c);
    }
    return result;
  };
  const inOthers = (c: Card) => others.some((d) => has(d, c));
  const reused = [...order.filter(inOthers), ...order.filter((c) => !inOthers(c))];
  if (reuseFirst) return run(reused);
  const first = run(order);
  return first.length >= DECK_SIZE || !others.length ? first : run(reused);
}

// Completa tutti i mazzi insieme. Con poche card (es. il mazzo iniziale) conviene riusare subito il massimo
// consentito dagli altri mazzi, così restano card nuove per l'ultimo.
export function fillDecks(cards: Card[], decks: Card[][], rng: Rng = Math.random): Card[][] {
  const attempt = (reuseFirst: boolean) => {
    const out = decks.map((d) => [...d]);
    for (let i = 0; i < out.length; i++)
      if (out[i].length < DECK_SIZE)
        out[i] = fillDeck(cards, out[i], CLASSIC, rng, false, out.filter((_, j) => j !== i), reuseFirst);
    return out;
  };
  const complete = (ds: Card[][]) => ds.every((d) => d.length === DECK_SIZE);
  const first = attempt(false);
  return complete(first) ? first : attempt(true);
}

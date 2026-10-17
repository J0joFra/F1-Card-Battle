import data from '../data/cards.json';
import type { Card, CardsData, Rarity, StatKey } from '../types';
import { getLang, translate, type TKey } from '../lib/i18n';

export const CARDS_DATA = data as unknown as CardsData;
export const ALL_CARDS: Card[] = CARDS_DATA.cards;
export const CARD_BY_ID = new Map(ALL_CARDS.map((c) => [c.id, c]));

export interface StatDef {
  key: StatKey;
  suffix?: string;
  decimals?: boolean;
  position?: boolean; // valore mostrato come posizione (1°, 2°…)
  lowerWins?: boolean;
}

// Vince il valore più alto, tranne dove lowerWins (come nel Top Quartetto classico).
// Metriche scelte perché quasi nessun pilota abbia 0: un mix di totali (premiano le carriere lunghe)
// e di medie/percentuali (premiano chi ha fatto bene anche in poche gare).
// Nomi e descrizioni sono nelle traduzioni: stat_<key>, statS_<key> (breve), statH_<key> (spiegazione).
export const STATS: StatDef[] = [
  { key: 'gare' },
  { key: 'top10' },
  { key: 'puntiGara', decimals: true },
  { key: 'migliorArrivo', position: true, lowerWins: true },
  { key: 'grigliaMedia', decimals: true, position: true, lowerWins: true },
  { key: 'percArrivi', suffix: '%' },
  { key: 'percCompagno', suffix: '%' },
];

export const statLabel = (k: StatKey) => translate(`stat_${k}` as TKey);
export const statShort = (k: StatKey) => translate(`statS_${k}` as TKey);
export const statHint = (k: StatKey) => translate(`statH_${k}` as TKey);
export const rarityLabel = (r: Rarity) => translate(`rar_${r}` as TKey);

export const STAT_BY_KEY = Object.fromEntries(STATS.map((s) => [s.key, s])) as Record<StatKey, StatDef>;

// Confronto: >0 se a batte b sulla statistica.
export const compareStat = (stat: StatKey, a: number, b: number) => (STAT_BY_KEY[stat].lowerWins ? b - a : a - b);

export const NO_FINISH = 99;

export function formatStat(stat: StatDef, v: number) {
  if (stat.position && v >= NO_FINISH) return '—';
  const n = stat.decimals ? v.toFixed(1).replace('.', getLang() === 'en' ? '.' : ',') : String(v);
  return stat.position ? `${n}°` : `${n}${stat.suffix ?? ''}`;
}

// rarità delle card giocabili (i Pionieri hanno la loro, solo da collezione)
export const RARITIES: Rarity[] = ['bronzo', 'argento', 'oro', 'platino', 'leggendaria'];

/*
 * Valutazione e rarità delle card.
 * Per ogni metrica si calcola il percentile della card rispetto a tutte le card scuderia
 * (1 = la migliore; per Miglior arrivo e Griglia media vince il valore più basso, quindi è girato).
 * La media dei 7 percentili, da 0 a 100, è la valutazione (OVR) e decide la rarità:
 * Platino ≥ 82, Oro ≥ 68, Argento ≥ 50, altrimenti Bronzo. Leggendaria: solo le card Carriera.
 */
export const RARITY_THRESHOLDS: [Rarity, number][] = [
  ['platino', 82],
  ['oro', 68],
  ['argento', 50],
  ['bronzo', 0],
];

function rateCards(cards: Card[]) {
  const team = cards.filter((c) => c.kind === 'team');
  const sorted = Object.fromEntries(STATS.map((s) => [s.key, team.map((c) => c.stats[s.key]).sort((a, b) => a - b)])) as Record<
    StatKey,
    number[]
  >;
  const pct = (s: StatDef, v: number) => {
    const arr = sorted[s.key];
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    let eq = lo;
    while (eq < arr.length && arr[eq] === v) eq++;
    const p = (lo + eq) / 2 / arr.length;
    return s.lowerWins ? 1 - p : p;
  };
  for (const c of cards) {
    c.ovr = Math.round((100 * STATS.reduce((sum, s) => sum + pct(s, c.stats[s.key]), 0)) / STATS.length);
    c.rarity =
      c.kind === 'career' ? 'leggendaria' : c.kind === 'pioneer' ? 'pioniere' : RARITY_THRESHOLDS.find(([, min]) => c.ovr >= min)![0];
  }
}
rateCards(ALL_CARDS);

// card che si possono giocare (tutte tranne i Pionieri)
export const PLAYABLE_CARDS = ALL_CARDS.filter((c) => c.kind !== 'pioneer');


export const cardsOfRarity = (rarity: Rarity) => ALL_CARDS.filter((c) => c.rarity === rarity);

// Card scuderia di un pilota: completarle tutte sblocca la sua Carriera.
export const teamCardsOfDriver = (driverId: string) =>
  ALL_CARDS.filter((c) => c.driver.id === driverId && c.kind === 'team');

export const careerCardOf = (driverId: string) => CARD_BY_ID.get(`${driverId}__career`);

// decennio della card (dal primo anno): 2004 → 2000
export const decadeOf = (c: Card) => Math.floor(c.firstYear / 10) * 10;

export const flagEmoji = (alpha2: string | null) =>
  alpha2 ? String.fromCodePoint(...[...alpha2.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : '🏁';

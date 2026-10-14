import data from '../data/cards.json';
import type { Card, CardsData, Rarity, StatKey } from '../types';

export const CARDS_DATA = data as CardsData;
export const ALL_CARDS: Card[] = CARDS_DATA.cards;
export const CARD_BY_ID = new Map(ALL_CARDS.map((c) => [c.id, c]));

export interface StatDef {
  key: StatKey;
  label: string;
  short: string; // etichetta breve per tabelle e mobile
  hint: string;
  suffix?: string;
  decimals?: boolean;
  position?: boolean; // valore mostrato come posizione (1°, 2°…)
  lowerWins?: boolean;
}

// Vince il valore più alto, tranne dove lowerWins (come nel Top Quartetto classico).
// Metriche scelte perché quasi nessun pilota abbia 0: un mix di totali (premiano le carriere lunghe)
// e di medie/percentuali (premiano chi ha fatto bene anche in poche gare).
export const STATS: StatDef[] = [
  { key: 'gare', label: 'Gran Premi', short: 'GP', hint: 'Gare disputate con la scuderia' },
  { key: 'top10', label: 'Arrivi in top 10', short: 'Top 10', hint: 'Gare concluse tra i primi 10' },
  {
    key: 'puntiGara', label: 'Punti a gara', short: 'Pt/GP', decimals: true,
    hint: 'Media punti a gara, calcolata con il punteggio attuale (25-18-15…) per tutte le epoche',
  },
  { key: 'migliorArrivo', label: 'Miglior arrivo', short: 'Best', position: true, lowerWins: true, hint: 'Miglior piazzamento in gara: vince il più basso' },
  {
    key: 'grigliaMedia', label: 'Griglia media', short: 'Griglia', decimals: true, position: true, lowerWins: true,
    hint: 'Posizione media di partenza: vince il più basso',
  },
  { key: 'percArrivi', label: '% Gare finite', short: 'Finite', suffix: '%', hint: 'Affidabilità: gare portate al traguardo' },
  { key: 'percCompagno', label: '% Batte compagno', short: 'Vs comp.', suffix: '%', hint: 'Gare chiuse davanti al compagno di squadra' },
];

export const STAT_BY_KEY = Object.fromEntries(STATS.map((s) => [s.key, s])) as Record<StatKey, StatDef>;

// Confronto: >0 se a batte b sulla statistica.
export const compareStat = (stat: StatKey, a: number, b: number) => (STAT_BY_KEY[stat].lowerWins ? b - a : a - b);

export const NO_FINISH = 99;

export function formatStat(stat: StatDef, v: number) {
  if (stat.position && v >= NO_FINISH) return '—';
  const n = stat.decimals ? v.toFixed(1).replace('.', ',') : String(v);
  return stat.position ? `${n}°` : `${n}${stat.suffix ?? ''}`;
}

export const RARITIES: Rarity[] = ['bronzo', 'argento', 'oro', 'leggendaria'];

export const RARITY_LABEL: Record<Rarity, string> = {
  bronzo: 'Bronzo',
  argento: 'Argento',
  oro: 'Oro',
  leggendaria: 'Leggendaria',
};

export const cardsOfRarity = (rarity: Rarity) => ALL_CARDS.filter((c) => c.rarity === rarity);

// Card scuderia di un pilota: completarle tutte sblocca la sua Carriera.
export const teamCardsOfDriver = (driverId: string) =>
  ALL_CARDS.filter((c) => c.driver.id === driverId && c.kind === 'team');

export const careerCardOf = (driverId: string) => CARD_BY_ID.get(`${driverId}__career`);

export const flagEmoji = (alpha2: string | null) =>
  alpha2 ? String.fromCodePoint(...[...alpha2.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : '🏁';

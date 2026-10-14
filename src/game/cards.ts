import data from '../data/cards.json';
import type { Card, CardsData, Rarity, StatKey } from '../types';

export const CARDS_DATA = data as CardsData;
export const ALL_CARDS: Card[] = CARDS_DATA.cards;
export const CARD_BY_ID = new Map(ALL_CARDS.map((c) => [c.id, c]));

export interface StatDef {
  key: StatKey;
  label: string;
  suffix?: string;
  lowerWins?: boolean;
}

// Vince il valore più alto, tranne dove lowerWins (come nel Top Quartetto classico).
export const STATS: StatDef[] = [
  { key: 'gare', label: 'Gran Premi' },
  { key: 'vittorie', label: 'Vittorie' },
  { key: 'podi', label: 'Podi' },
  { key: 'pole', label: 'Pole position' },
  { key: 'percVittorie', label: '% Vittorie', suffix: '%' },
  { key: 'migliorArrivo', label: 'Miglior arrivo', lowerWins: true },
  { key: 'mondiali', label: 'Mondiali' },
];

export const STAT_BY_KEY = Object.fromEntries(STATS.map((s) => [s.key, s])) as Record<StatKey, StatDef>;

// Confronto: >0 se a batte b sulla statistica.
export const compareStat = (stat: StatKey, a: number, b: number) => (STAT_BY_KEY[stat].lowerWins ? b - a : a - b);

export const NO_FINISH = 99;

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

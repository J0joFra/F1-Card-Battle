import data from '../data/cards.json';
import type { Card, CardsData, Rarity, StatKey } from '../types';
import { getLang, translate, type TKey } from '../lib/i18n';

export const CARDS_DATA = data as CardsData;
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

export const RARITIES: Rarity[] = ['bronzo', 'argento', 'oro', 'leggendaria'];


export const cardsOfRarity = (rarity: Rarity) => ALL_CARDS.filter((c) => c.rarity === rarity);

// Card scuderia di un pilota: completarle tutte sblocca la sua Carriera.
export const teamCardsOfDriver = (driverId: string) =>
  ALL_CARDS.filter((c) => c.driver.id === driverId && c.kind === 'team');

export const careerCardOf = (driverId: string) => CARD_BY_ID.get(`${driverId}__career`);

export const flagEmoji = (alpha2: string | null) =>
  alpha2 ? String.fromCodePoint(...[...alpha2.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : '🏁';

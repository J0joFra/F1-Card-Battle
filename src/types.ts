export type Rarity = 'bronzo' | 'argento' | 'oro' | 'platino' | 'leggendaria';

export type StatKey =
  | 'gare'
  | 'top10'
  | 'puntiGara'
  | 'migliorArrivo'
  | 'grigliaMedia'
  | 'percArrivi'
  | 'percCompagno';

export interface Palmares {
  vittorie: number;
  podi: number;
  pole: number;
  mondiali: number;
}

export interface Driver {
  id: string;
  name: string;
  lastName: string;
  abbreviation: string;
  country: string | null;
}

export interface Card {
  id: string;
  kind: 'team' | 'career';
  driver: Driver;
  team: { id: string; name: string };
  number: number | null;
  teams?: string[];
  period: string;
  firstYear: number;
  rarity: Rarity;
  ovr: number; // valutazione complessiva 0-100 (media dei percentili delle 7 metriche)
  stats: Record<StatKey, number>;
  palmares: Palmares;
}

export interface CardsData {
  source: string;
  generatedAt: string;
  latestSeason: number;
  seasonComplete: boolean;
  teams: Record<string, string>;
  cards: Card[];
}

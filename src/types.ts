export type Rarity = 'bronzo' | 'argento' | 'oro' | 'leggendaria';

export type StatKey = 'gare' | 'vittorie' | 'podi' | 'pole' | 'percVittorie' | 'migliorArrivo' | 'mondiali';

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
  stats: Record<StatKey, number>;
}

export interface CardsData {
  source: string;
  generatedAt: string;
  latestSeason: number;
  seasonComplete: boolean;
  teams: Record<string, string>;
  cards: Card[];
}

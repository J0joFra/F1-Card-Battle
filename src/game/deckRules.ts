import type { Card, Rarity } from '../types';
import { rarityLabel } from './cards';
import { translate } from '../lib/i18n';
import { DECK_SIZE } from './engine';

// Regole provvisorie per comporre il mazzo: impediscono un mazzo di sole leggende.
// Da rifinire: basta cambiare questi numeri.
export const MAX_PER_RARITY: Partial<Record<Rarity, number>> = {
  leggendaria: 1,
  platino: 1,
  oro: 2,
};

export function deckProblems(deck: Card[]): string[] {
  const problems: string[] = [];
  if (deck.length !== DECK_SIZE) problems.push(translate('deck_need', { n: DECK_SIZE, m: deck.length }));
  for (const [rarity, max] of Object.entries(MAX_PER_RARITY) as [Rarity, number][]) {
    const n = deck.filter((c) => c.rarity === rarity).length;
    if (n > max) problems.push(translate('deck_tooMany', { n: max, r: rarityLabel(rarity), m: n }));
  }
  return problems;
}

// Si può aggiungere questa card senza sforare i limiti di rarità?
export function canAdd(deck: Card[], card: Card): boolean {
  if (deck.length >= DECK_SIZE || deck.some((c) => c.id === card.id)) return false;
  const max = MAX_PER_RARITY[card.rarity];
  return max === undefined || deck.filter((c) => c.rarity === card.rarity).length < max;
}

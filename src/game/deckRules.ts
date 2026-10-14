import type { Card, Rarity } from '../types';
import { RARITY_LABEL } from './cards';
import { DECK_SIZE } from './engine';

// Regole provvisorie per comporre il mazzo: impediscono un mazzo di sole leggende.
// Da rifinire: basta cambiare questi numeri.
export const MAX_PER_RARITY: Partial<Record<Rarity, number>> = {
  leggendaria: 1,
  oro: 2,
};

export function deckProblems(deck: Card[]): string[] {
  const problems: string[] = [];
  if (deck.length !== DECK_SIZE) problems.push(`Servono ${DECK_SIZE} card (ora ${deck.length}).`);
  for (const [rarity, max] of Object.entries(MAX_PER_RARITY) as [Rarity, number][]) {
    const n = deck.filter((c) => c.rarity === rarity).length;
    if (n > max) problems.push(`Massimo ${max} ${RARITY_LABEL[rarity]} (ora ${n}).`);
  }
  return problems;
}

// Si può aggiungere questa card senza sforare i limiti di rarità?
export function canAdd(deck: Card[], card: Card): boolean {
  if (deck.length >= DECK_SIZE || deck.some((c) => c.id === card.id)) return false;
  const max = MAX_PER_RARITY[card.rarity];
  return max === undefined || deck.filter((c) => c.rarity === card.rarity).length < max;
}

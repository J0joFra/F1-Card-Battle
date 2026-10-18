import { createAvatar } from '@dicebear/core';
import * as notionists from '@dicebear/notionists';
import type { Driver } from '../types';

/*
 * Avatar disegnato di ogni pilota: stile "Notionists" di Zoish (CC0) generato da DiceBear (MIT).
 * È sempre lo stesso per lo stesso pilota (il "seme" è il suo id), ma non vuole somigliargli:
 * niente volti reali, quindi nessun problema di diritti d'immagine.
 * Caricato a parte (import dinamico): l'avvio dell'app non lo aspetta.
 */

// acconciature corte (piloti) e lunghe (pilote), scelte tra le 63 dello stile
const SHORT = [1, 5, 6, 7, 9, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 29, 30, 31, 32, 33, 34, 35, 38, 40, 43, 44, 49, 52, 53, 54, 55, 56, 60];
const LONG = [2, 3, 4, 10, 23, 28, 36, 37, 39, 41, 45, 46, 47, 48, 58];
const variants = (list: number[]) => list.map((n) => `variant${String(n).padStart(2, '0')}`) as never[];

const cache = new Map<string, string>();

export function avatarUri(driver: Driver): string {
  let uri = cache.get(driver.id);
  if (!uri) {
    uri = createAvatar(notionists, {
      seed: driver.id,
      hair: variants(driver.female ? LONG : SHORT),
      beardProbability: driver.female ? 0 : 18,
      glassesProbability: 12,
      gestureProbability: 0,
      bodyIconProbability: 0,
    }).toDataUri();
    cache.set(driver.id, uri);
  }
  return uri;
}

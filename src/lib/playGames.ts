import { Capacitor, registerPlugin } from '@capacitor/core';

/*
 * Play Giochi (solo app Android): codice monouso dell'account Play Giochi del giocatore.
 * Il server lo verifica con Google e così riconosce il giocatore anche su un telefono nuovo.
 */
interface PlayGamesPlugin {
  serverAuthCode(options: { interactive?: boolean }): Promise<{ code: string }>;
}

const PlayGames = registerPlugin<PlayGamesPlugin>('PlayGames');

export const playGamesAvailable = () => Capacitor.getPlatform() === 'android';

// null se Play Giochi non c'è o il giocatore non ha fatto l'accesso
export async function playGamesCode(interactive = false): Promise<string | null> {
  if (!playGamesAvailable()) return null;
  try {
    return (await PlayGames.serverAuthCode({ interactive })).code || null;
  } catch {
    return null;
  }
}

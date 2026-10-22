import { Capacitor, registerPlugin } from '@capacitor/core';

/*
 * Play Giochi (solo app Android): codice monouso dell'account Play Giochi del giocatore.
 * Il server lo verifica con Google e così riconosce il giocatore anche su un telefono nuovo.
 */
interface PlayGamesPlugin {
  serverAuthCode(options: { interactive?: boolean }): Promise<{ code: string }>;
  // obiettivi: steps per quelli incrementali, altrimenti si sbloccano
  reportAchievements(options: { items: { id: string; steps?: number }[] }): Promise<void>;
  showAchievements(): Promise<void>;
}

const PlayGames = registerPlugin<PlayGamesPlugin>('PlayGames');

export const playGamesAvailable = () => Capacitor.getPlatform() === 'android';

// null se Play Giochi non c'è o il giocatore non ha fatto l'accesso
export async function playGamesCode(interactive = false): Promise<string | null> {
  return (await playGamesCodeOrError(interactive)).code;
}

// come sopra, ma con il motivo dell'errore (per il collegamento fatto a mano dalle impostazioni)
export async function playGamesCodeOrError(interactive: boolean): Promise<{ code: string | null; error?: string }> {
  if (!playGamesAvailable()) return { code: null, error: 'unavailable' };
  try {
    return { code: (await PlayGames.serverAuthCode({ interactive })).code || null };
  } catch (e) {
    return { code: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// manda a Play Giochi gli obiettivi raggiunti; false se il giocatore non ha fatto l'accesso
export async function reportAchievements(items: { id: string; steps?: number }[]): Promise<boolean> {
  if (!playGamesAvailable() || !items.length) return false;
  try {
    await PlayGames.reportAchievements({ items });
    return true;
  } catch {
    return false;
  }
}

// schermata degli obiettivi di Play Giochi; il motivo dell'errore se non si apre
export async function showAchievements(): Promise<string | null> {
  try {
    await PlayGames.showAchievements();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

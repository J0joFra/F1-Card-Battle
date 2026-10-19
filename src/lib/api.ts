import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { translate, type TKey } from './i18n';
import type { GameRequest, GameResponse } from '../server/actions';

/*
 * Chiamate all'"arbitro" sul server (Edge Function "game"), usate da chi ha fatto l'accesso.
 * Chi non ha ancora creato il profilo gioca solo sul dispositivo e non passa di qui.
 */

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function callGame(req: GameRequest): Promise<GameResponse> {
  const { data, error } = await supabase.functions.invoke<GameResponse>('game', { body: req });
  if (error) {
    let code = 'network';
    if (error instanceof FunctionsHttpError) {
      try {
        code = ((await error.context.json()) as { error?: string }).error ?? 'server_error';
      } catch {
        code = 'server_error';
      }
    }
    throw new ApiError(code);
  }
  return data ?? {};
}

// messaggio da mostrare al giocatore per un errore del server
const MESSAGES: Record<string, TKey> = {
  network: 'err_network',
  busy: 'err_busy',
  daily_played: 'err_daily_played',
  not_enough_credits: 'err_not_enough_credits',
  no_packs: 'err_no_packs',
  bad_code: 'err_bad_code',
  own_match: 'err_own_match',
  decks_not_ready: 'err_decks_not_ready',
  decks_similar: 'err_decks_similar',
  not_friend: 'err_not_friend',
  nickname_taken: 'err_nickname_taken',
  bad_nickname: 'err_bad_nickname',
  bad_recovery: 'err_bad_recovery',
  bad_login: 'err_bad_login',
  code_permanent: 'err_code_permanent',
  anon_disabled: 'err_anon_disabled',
  has_profile: 'err_has_profile',
  account_moved: 'err_account_moved',
};

export const errorMessage = (e: unknown) =>
  translate(MESSAGES[e instanceof ApiError ? e.code : 'network'] ?? 'err_generic');

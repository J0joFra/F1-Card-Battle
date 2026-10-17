import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/*
 * Avvisi istantanei dal server (Supabase Realtime). Il server manda un segnale "aggiornato" sul canale
 * della sfida (`pvp-<id>`) o dell'utente (`user-<id>`): chi lo riceve rilegge subito lo stato dal server.
 * Il segnale non contiene dati di gioco. Se la connessione non c'è, si controlla comunque ogni pochi secondi.
 */
export interface Live {
  // aspetta il prossimo segnale, al massimo `ms` millisecondi
  wait(ms: number): Promise<void>;
  close(): void;
}

// un solo canale per argomento, condiviso (es. sala d'attesa e partita della stessa sfida)
const channels = new Map<string, { channel: RealtimeChannel | null; listeners: Set<() => void> }>();

function join(topic: string, listener: () => void) {
  let entry = channels.get(topic);
  if (!entry) {
    const listeners = new Set<() => void>();
    let channel: RealtimeChannel | null = null;
    try {
      channel = supabase
        .channel(topic)
        .on('broadcast', { event: 'update' }, () => listeners.forEach((l) => l()))
        .subscribe();
    } catch {
      channel = null; // niente Realtime: restano i controlli periodici
    }
    entry = { channel, listeners };
    channels.set(topic, entry);
  }
  entry.listeners.add(listener);
  const e = entry;
  return () => {
    e.listeners.delete(listener);
    if (e.listeners.size || channels.get(topic) !== e) return;
    channels.delete(topic);
    if (e.channel) void supabase.removeChannel(e.channel);
  };
}

export function listen(topic: string, onSignal?: () => void): Live {
  let wake: (() => void) | null = null;
  let flagged = false; // segnale arrivato mentre non si stava aspettando: il prossimo wait finisce subito
  const leave = join(topic, () => {
    onSignal?.();
    if (wake) wake();
    else flagged = true;
  });
  let closed = false;
  return {
    wait(ms) {
      if (flagged) {
        flagged = false;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          wake = null;
          resolve();
        };
        const timer = setTimeout(done, ms);
        wake = done;
      });
    },
    close() {
      if (closed) return;
      closed = true;
      wake?.();
      leave();
    },
  };
}

export const pvpTopic = (id: string) => `pvp-${id}`;
export const userTopic = (id: string) => `user-${id}`;

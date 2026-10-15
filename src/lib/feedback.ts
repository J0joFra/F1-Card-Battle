import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/*
 * Effetti sonori, vibrazione e musica.
 *
 * Suoni: di base sono generati dal codice (Web Audio), quindi non servono file né licenze.
 * Per sostituirne uno basta mettere un file in src/assets/sounds/ con lo stesso nome dell'effetto
 * (es. victory.mp3): viene usato al posto di quello generato. La musica di sottofondo si attiva solo se
 * esiste src/assets/sounds/music.mp3 (o .ogg). Istruzioni in src/assets/sounds/LEGGIMI.md.
 */

export type Sfx = 'tap' | 'select' | 'flip' | 'roundWin' | 'roundLose' | 'roundTie' | 'victory' | 'defeat' | 'pack' | 'reveal' | 'rare';

// ---------- impostazioni (salvate sul dispositivo) ----------

export interface FeedbackSettings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
}

const KEY = 'f1-card-battle:feedback';
let settings: FeedbackSettings = { sound: true, music: true, haptics: true };
try {
  settings = { ...settings, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
} catch {
  /* ignora */
}
const listeners = new Set<() => void>();

export function setFeedback(patch: Partial<FeedbackSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignora */
  }
  listeners.forEach((l) => l());
  syncMusic();
}

export function useFeedbackSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => settings,
  );
}

// ---------- file audio personalizzati ----------

const files = import.meta.glob('../assets/sounds/*.{mp3,ogg,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const CUSTOM = new Map(
  Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.(mp3|ogg|wav)$/, ''), url]),
);
export const hasMusic = CUSTOM.has('music');

// ---------- suoni generati ----------

let ctx: AudioContext | null = null;
const audio = () => {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'triangle', vol = 0.18, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(start: number, dur: number, from: number, to: number, vol = 0.15) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t);
}

// note: C5=523, E5=659, G5=784, C6=1047
const SYNTH: Record<Sfx, () => void> = {
  tap: () => tone(1400, 0, 0.04, 'square', 0.05),
  select: () => {
    tone(880, 0, 0.07, 'square', 0.06);
    tone(1320, 0.05, 0.08, 'square', 0.05);
  },
  flip: () => noise(0, 0.16, 600, 3200, 0.18),
  roundWin: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.18)),
  roundLose: () => {
    tone(392, 0, 0.16, 'sawtooth', 0.08);
    tone(294, 0.12, 0.28, 'sawtooth', 0.08);
  },
  roundTie: () => {
    tone(587, 0, 0.12);
    tone(587, 0.14, 0.12);
  },
  victory: () => {
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.11, 0.2, 'square', 0.09));
    tone(1047, 0.36, 0.6, 'square', 0.1);
    tone(784, 0.36, 0.6, 'triangle', 0.08);
  },
  defeat: () => [440, 392, 349, 294].forEach((f, i) => tone(f, i * 0.16, 0.28, 'triangle', 0.14)),
  pack: () => {
    noise(0, 0.45, 300, 4000, 0.16);
    tone(300, 0.05, 0.4, 'sine', 0.08, 900);
  },
  reveal: () => noise(0, 0.12, 1200, 4000, 0.1),
  rare: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.06, 0.35, 'sine', 0.09)),
};

const players = new Map<string, HTMLAudioElement>();

export function sfx(name: Sfx) {
  if (!settings.sound) return;
  const url = CUSTOM.get(name);
  try {
    if (url) {
      let base = players.get(name);
      if (!base) players.set(name, (base = new Audio(url)));
      const a = base.cloneNode() as HTMLAudioElement; // permette suoni sovrapposti
      a.volume = 0.8;
      void a.play().catch(() => {});
    } else SYNTH[name]();
  } catch {
    /* audio non disponibile: si gioca in silenzio */
  }
}

// ---------- musica di sottofondo (solo se c'è un file music.*) ----------

let musicEl: HTMLAudioElement | null = null;
let unlocked = false;

function syncMusic() {
  if (!hasMusic) return;
  if (!musicEl) {
    musicEl = new Audio(CUSTOM.get('music'));
    musicEl.loop = true;
    musicEl.volume = 0.35;
  }
  if (settings.music && unlocked && !document.hidden) void musicEl.play().catch(() => {});
  else musicEl.pause();
}

// i browser e le webview fanno partire l'audio solo dopo un tocco dell'utente
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true;
    audio();
    syncMusic();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  document.addEventListener('visibilitychange', syncMusic); // musica in pausa quando l'app va in background
}

// ---------- vibrazione ----------

export type Haptic = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning';

export function haptic(kind: Haptic) {
  if (!settings.haptics) return;
  if (Capacitor.isNativePlatform()) {
    if (kind === 'success' || kind === 'error' || kind === 'warning') {
      const type = kind === 'success' ? NotificationType.Success : kind === 'error' ? NotificationType.Error : NotificationType.Warning;
      void Haptics.notification({ type }).catch(() => {});
    } else {
      const style = kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy;
      void Haptics.impact({ style }).catch(() => {});
    }
    return;
  }
  const ms = { light: 10, medium: 20, heavy: 35, success: [15, 40, 25], error: [40, 30, 40], warning: [25, 30, 25] }[kind];
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignora */
  }
}

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

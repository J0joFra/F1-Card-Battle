import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/*
 * Effetti sonori, vibrazione e musica.
 *
 * Suoni: di base sono generati dal codice (Web Audio), quindi non servono file né licenze.
 * Per sostituirne uno basta mettere un file in src/assets/sounds/ con lo stesso nome dell'effetto
 * (es. victory.mp3): viene usato al posto di quello generato.
 * Musica: music-menu-1 e music-menu-2 si alternano fuori dalla partita, music-match suona in loop durante
 * la partita. Istruzioni in src/assets/sounds/LEGGIMI.md.
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
const MENU_TRACKS = ['music-menu-1', 'music-menu-2'].filter((n) => CUSTOM.has(n));
const MATCH_TRACK = CUSTOM.has('music-match') ? 'music-match' : null;
export const hasMusic = MENU_TRACKS.length > 0 || !!MATCH_TRACK;

// ---------- suoni generati ----------

// Suoni "morbidi" pensati per stare bene sopra il jazz: timbri tipo piano elettrico e vibrafono,
// registro medio-basso, attacco dolce, filtro che toglie gli acuti e una piccola eco da locale jazz.
let ctx: AudioContext | null = null;
let out: AudioNode | null = null; // ingresso della catena di uscita (filtro + eco)

const audio = () => {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // uscita: filtro passa-basso (niente suoni stridenti) + eco breve e scura
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    tone.Q.value = 0.4;
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.19;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1600;
    master.connect(tone).connect(ctx.destination);
    tone.connect(delay).connect(damp).connect(feedback).connect(delay);
    damp.connect(wet).connect(ctx.destination);
    out = master;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

// nota "piano elettrico/vibrafono": fondamentale sinusoidale + armonica leggera, attacco morbido, coda naturale
function keys(freq: number, start: number, dur = 0.5, vol = 0.12) {
  const a = audio();
  if (!a || !out) return;
  const t = a.currentTime + start;
  const env = a.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  env.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.12);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  env.connect(out);
  for (const [mult, gain, type] of [
    [1, 1, 'sine'],
    [2, 0.18, 'sine'],
    [3.01, 0.05, 'triangle'],
  ] as const) {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * mult, t);
    g.gain.value = gain;
    osc.connect(g).connect(env);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

// "tock" di legno: tocco breve e smorzato, per i pulsanti
function tock(freq: number, start = 0, vol = 0.09) {
  const a = audio();
  if (!a || !out) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const env = a.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.08);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + 0.14);
}

// "spazzola" sul rullante: fruscio filtrato e scuro, per carte che si girano e pacchetti
function brush(start: number, dur: number, from: number, to: number, vol = 0.07) {
  const a = audio();
  if (!a || !out) return;
  const t = a.currentTime + start;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const env = a.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(t);
}

// note (Hz): accordi "jazz" con settima e nona
const N = { C3: 131, D3: 147, F3: 175, G3: 196, A3: 220, Bb3: 233, C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, D5: 587, E5: 659 };

const SYNTH: Record<Sfx, () => void> = {
  tap: () => tock(420),
  select: () => {
    keys(N.G4, 0, 0.35, 0.07);
    keys(N.B4, 0.06, 0.4, 0.06);
  },
  flip: () => brush(0, 0.22, 500, 1400, 0.16),
  // round vinto: Cmaj7 che sale
  roundWin: () => [N.C4, N.E4, N.G4, N.B4].forEach((f, i) => keys(f, i * 0.07, 0.7, 0.09)),
  // round perso: due note che scendono piano (Dm)
  roundLose: () => {
    keys(N.F4, 0, 0.5, 0.08);
    keys(N.D4, 0.16, 0.7, 0.08);
  },
  roundTie: () => {
    keys(N.A4, 0, 0.35, 0.07);
    keys(N.A4, 0.18, 0.45, 0.06);
  },
  // vittoria: arpeggio Cmaj9 e accordo tenuto
  victory: () => {
    [N.C4, N.E4, N.G4, N.B4, N.D5].forEach((f, i) => keys(f, i * 0.09, 1.2, 0.08));
    [N.C4, N.E4, N.B4, N.D5].forEach((f) => keys(f, 0.55, 1.8, 0.06));
    keys(N.C3, 0.55, 1.8, 0.07); // basso
  },
  // sconfitta: Dm7 che scende lento, senza drammi
  defeat: () => [N.A4, N.F4, N.D4, N.A3].forEach((f, i) => keys(f, i * 0.18, 0.9, 0.07)),
  pack: () => {
    brush(0, 0.6, 300, 1600, 0.08);
    [N.D4, N.F4, N.A4, N.E5].forEach((f, i) => keys(f, 0.25 + i * 0.06, 0.8, 0.05));
  },
  reveal: () => {
    brush(0, 0.14, 700, 1500, 0.1);
    keys(N.G4, 0.04, 0.3, 0.04);
  },
  // card rara: luccichio di vibrafono (Fmaj9)
  rare: () => [N.F4, N.A4, N.E5, N.G4 * 2].forEach((f, i) => keys(f, i * 0.08, 1.2, 0.07)),
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

// ---------- musica di sottofondo ----------
//
// Fuori dalla partita i brani "menu" si alternano: finito uno parte l'altro, all'infinito.
// Durante la partita suona il brano "match" in loop. Finita la partita riparte il brano menu
// successivo a quello che suonava prima (jazz 1 → partita → jazz 2 → jazz 1 → …).

export type MusicMode = 'menu' | 'match';

const MUSIC_VOLUME = 0.35;
const FADE_MS = 700;

let mode: MusicMode = 'menu';
let menuIndex = 0; // brano menu corrente
let current: HTMLAudioElement | null = null; // brano che sta suonando (o in pausa)
let currentName: string | null = null;
const tracks = new Map<string, HTMLAudioElement>();

function track(name: string) {
  let el = tracks.get(name);
  if (!el) {
    el = new Audio(CUSTOM.get(name));
    el.preload = 'auto';
    el.loop = name === MATCH_TRACK;
    // finito un brano menu, parte l'altro
    if (name !== MATCH_TRACK)
      el.addEventListener('ended', () => {
        if (mode !== 'menu' || currentName !== name) return;
        menuIndex = (menuIndex + 1) % MENU_TRACKS.length;
        switchTo(MENU_TRACKS[menuIndex], true);
      });
    tracks.set(name, el);
  }
  return el;
}

function fade(el: HTMLAudioElement, to: number, done?: () => void) {
  const from = el.volume;
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / FADE_MS);
    el.volume = Math.min(1, Math.max(0, from + (to - from) * k)); // evita valori fuori da 0–1 per arrotondamento
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

// prova a suonare subito: nell'app Android (Capacitor) l'audio automatico è permesso; nei browser che lo
// bloccano, play() fallisce e si riprova al primo tocco (vedi sotto)
const canPlay = () => settings.music && !document.hidden;

// passa a un altro brano con dissolvenza; `restart` lo fa ripartire dall'inizio
function switchTo(name: string | null, restart: boolean) {
  const prev = current;
  if (name === currentName && prev) {
    if (canPlay()) void prev.play().catch(() => {});
    return;
  }
  currentName = name;
  current = name ? track(name) : null;
  if (prev) fade(prev, 0, () => prev !== current && prev.pause()); // se nel frattempo è tornato attuale, non fermarlo
  if (!current) return;
  if (restart) current.currentTime = 0;
  current.volume = 0;
  if (canPlay())
    void current
      .play()
      .then(() => fade(current!, MUSIC_VOLUME))
      .catch(() => {});
}

function syncMusic() {
  if (!hasMusic || !current) return;
  if (canPlay()) {
    if (current.paused) {
      current.volume = 0;
      void current
        .play()
        .then(() => fade(current!, MUSIC_VOLUME))
        .catch(() => {});
    }
  } else current.pause();
}

// Cambia la musica in base a dove si trova il giocatore (chiamata dall'app).
export function setMusicMode(next: MusicMode) {
  if (!hasMusic) return;
  const first = current === null;
  if (next === mode && !first) return;
  const leavingMatch = mode === 'match' && next === 'menu';
  mode = next;
  if (next === 'match') switchTo(MATCH_TRACK, true);
  else {
    if (!MENU_TRACKS.length) return switchTo(null, false);
    if (leavingMatch) menuIndex = (menuIndex + 1) % MENU_TRACKS.length; // dopo la partita: l'altro jazz
    switchTo(MENU_TRACKS[menuIndex], leavingMatch);
  }
}

// Nei browser che bloccano l'audio finché l'utente non tocca la pagina: al primo tocco si riprova.
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio();
    if (!current) setMusicMode(mode);
    syncMusic();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, unlock);
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
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

import { useEffect, useState } from 'react';

/*
 * Temi delle feste: si accendono da soli nei giorni dell'evento.
 * - Halloween: dal 25 ottobre al 3 novembre
 * - Natale: settimana di Natale, dal 21 al 27 dicembre
 * - Inverno: tutto dicembre e gennaio (tranne la settimana di Natale)
 * - Pasqua: dalla Domenica delle Palme a Pasquetta
 * Si possono spegnere dalle impostazioni. Per vederli in anteprima: ?tema=halloween (o winter, christmas, easter, off).
 */
export type Season = 'halloween' | 'winter' | 'christmas' | 'easter';
export const SEASONS: Season[] = ['halloween', 'winter', 'christmas', 'easter'];

// Domenica di Pasqua (calendario gregoriano, algoritmo di Meeus/Jones/Butcher)
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const DAY = 86_400_000;
const dayNumber = (d: Date) => Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY);

export function seasonOf(date = new Date()): Season | null {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if ((m === 10 && d >= 25) || (m === 11 && d <= 3)) return 'halloween';
  if (m === 12 && d >= 21 && d <= 27) return 'christmas';
  if (m === 12 || m === 1) return 'winter';
  const fromEaster = dayNumber(date) - dayNumber(easterSunday(date.getFullYear()));
  if (fromEaster >= -7 && fromEaster <= 1) return 'easter';
  return null;
}

// Tema in uso, leggibile anche fuori da React (testi, casco, coriandoli). Lo aggiorna useSeason.
let current: Season | null = null;
export const seasonNow = () => current;

// Le monete cambiano aspetto con la festa: caramelle, biscotti, ovetti di cioccolato.
const COINS: Record<Season, string> = { halloween: '🍬', winter: '🪙', christmas: '🍪', easter: '🍫' };
export const coin = () => (current ? COINS[current] : '🪙');

const KEY = 'f1-card-battle:seasons'; // 'on' | 'off'
const PREVIEW = 'f1-card-battle:season-preview';

const readOn = () => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};

// anteprima dall'indirizzo (?tema=halloween): resta valida finché non si chiude l'app
function preview(): Season | 'off' | null {
  try {
    const q = new URLSearchParams(location.search).get('tema');
    if (q && ([...SEASONS, 'off'] as string[]).includes(q)) sessionStorage.setItem(PREVIEW, q);
    const v = sessionStorage.getItem(PREVIEW);
    return v && ([...SEASONS, 'off'] as string[]).includes(v) ? (v as Season | 'off') : null;
  } catch {
    return null;
  }
}

export function useSeason() {
  const [on, setOn] = useState(readOn);
  const [today, setToday] = useState(() => new Date());
  // a mezzanotte il tema può cambiare (controllo ogni ora: basta e costa niente)
  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 3_600_000);
    return () => clearInterval(id);
  }, []);
  const forced = preview();
  const season = forced ? (forced === 'off' ? null : forced) : on ? seasonOf(today) : null;
  current = season; // subito, prima che si disegnino i figli

  useEffect(() => {
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      /* ignora */
    }
  }, [on]);
  useEffect(() => {
    if (season) document.documentElement.dataset.season = season;
    else delete document.documentElement.dataset.season;
  }, [season]);

  return { season, on, setOn, active: seasonOf(today) };
}

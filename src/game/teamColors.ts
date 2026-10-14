// Colori indicativi delle scuderie (nessun logo: solo tinte).
const COLORS: Record<string, string> = {
  ferrari: '#dc0000',
  mclaren: '#ff8000',
  mercedes: '#00a19c',
  'red-bull': '#1e41ff',
  williams: '#005aff',
  renault: '#ffd800',
  alpine: '#0090ff',
  'aston-martin': '#00594f',
  'racing-point': '#f596c8',
  'force-india': '#f596c8',
  jordan: '#ffd400',
  benetton: '#2bb24c',
  'toro-rosso': '#2b4562',
  alphatauri: '#2b4562',
  rb: '#6692ff',
  'racing-bulls': '#6692ff',
  sauber: '#9b0000',
  'kick-sauber': '#52e252',
  'bmw-sauber': '#0066b1',
  'alfa-romeo': '#900000',
  audi: '#a7a9ac',
  cadillac: '#c9a227',
  haas: '#b6babd',
  lotus: '#004225',
  'lotus-f1': '#c8a400',
  brabham: '#1c3d7a',
  tyrrell: '#0b3d91',
  ligier: '#0055a4',
  toyota: '#cc0000',
  honda: '#e8e8e8',
  brawn: '#c8ff00',
  bar: '#b0b0b0',
  jaguar: '#0b5f3a',
  stewart: '#ffffff',
  minardi: '#1a1a1a',
  arrows: '#f08c00',
  prost: '#0033a0',
  march: '#d81e2c',
  'leyton-house': '#4ecdc4',
  toleman: '#2d7ff9',
};

function hashColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}

export const teamColor = (id: string) => COLORS[id] ?? hashColor(id);

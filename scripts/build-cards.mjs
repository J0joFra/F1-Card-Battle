// Genera src/data/cards.json dai dati F1DB (https://github.com/f1db/f1db, CC BY 4.0).
// Uso: node scripts/build-cards.mjs <percorso-clone-f1db>
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const F1DB = process.argv[2] || process.env.F1DB_PATH;
if (!F1DB) {
  console.error('Uso: node scripts/build-cards.mjs <percorso-clone-f1db>');
  process.exit(1);
}
const DATA = path.join(F1DB, 'src/data');
const OUT = path.resolve('src/data/cards.json');

// Tre epoche, decise anno per anno (un pilota può avere card di più epoche):
// - Pionieri (1950-1960): 7-11 gare l'anno, la 500 Miglia di Indianapolis, 80-100 piloti diversi a stagione.
// - Classiche (1961-1972): stagioni di 8-13 gare.
// - Moderne (dal 1973): 14+ gare e griglie da ~24, come oggi. Sono le card da giocare: una per scuderia + Carriera.
// Pionieri e Classiche sono una card per pilota con le gare di quell'epoca, solo da collezionare.
const CLASSIC_FROM = 1961;
const MODERN_FROM = 1973;
const eraOf = (year) => (year < CLASSIC_FROM ? 'pioneer' : year < MODERN_FROM ? 'classic' : 'modern');
const MIN_STINT_RACES = 3;
// Esiti che non contano come gara disputata.
const NOT_STARTED = new Set(['DNQ', 'DNPQ', 'DNP', 'DNS']);
// "Miglior arrivo" di chi non è mai stato classificato (vince il più basso).
const NO_FINISH = 99;

const load = (p) => yaml.load(fs.readFileSync(p, 'utf8'));
const readDir = (dir) => fs.readdirSync(dir).filter((f) => !f.startsWith('.')).sort();

const drivers = {};
for (const f of readDir(path.join(DATA, 'drivers'))) {
  const d = load(path.join(DATA, 'drivers', f));
  drivers[d.id] = d;
}
const countries = {};
for (const f of readDir(path.join(DATA, 'countries'))) {
  const c = load(path.join(DATA, 'countries', f));
  countries[c.id] = c.alpha2Code;
}
const constructors = {};
for (const f of readDir(path.join(DATA, 'constructors'))) {
  const c = load(path.join(DATA, 'constructors', f));
  constructors[c.id] = c;
}

// Punteggio attuale (top 10) applicato a tutte le epoche, per confrontare piloti di anni diversi.
const MODERN_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

const newStint = () => ({
  races: 0, wins: 0, podiums: 0, poles: 0, titles: 0, best: NO_FINISH,
  points: 0, top10: 0, finished: 0, gridSum: 0, gridCount: 0, mateWins: 0, mateDuels: 0,
  years: new Set(), numbers: {},
});

// stints[epoca][driverId][constructorId] = statistiche accumulate (vedi newStint)
const stints = { pioneer: {}, classic: {}, modern: {} };
// racesBySeason[year][driverId][constructorId] = numero di gare (per assegnare i titoli)
const racesBySeason = {};
const seasons = readDir(path.join(DATA, 'seasons')).map(Number);
const latestSeason = Math.max(...seasons);
const completeSeasons = new Set();

for (const year of seasons) {
  const racesDir = path.join(DATA, 'seasons', String(year), 'races');
  if (!fs.existsSync(racesDir)) continue;
  const rounds = readDir(racesDir);
  let withResults = 0;
  racesBySeason[year] = {};
  for (const round of rounds) {
    const file = path.join(racesDir, round, 'race-results.yml');
    if (!fs.existsSync(file)) continue;
    withResults++;
    const seen = new Set();
    const entries = [];
    for (const r of load(file) || []) {
      const key = `${r.driverId}|${r.constructorId}`;
      if (seen.has(key)) continue; // auto condivise negli anni '50
      seen.add(key);
      if (NOT_STARTED.has(String(r.position))) continue;
      entries.push(r);
    }
    for (const r of entries) {
      const s = ((stints[eraOf(year)][r.driverId] ??= {})[r.constructorId] ??= newStint());
      s.races++;
      s.years.add(year);
      const pos = Number(r.position); // NaN se non classificato (DNF, DSQ, NC…)
      if (pos === 1) s.wins++;
      if (pos >= 1 && pos <= 3) s.podiums++;
      if (pos >= 1 && pos <= 10) {
        s.top10++;
        s.points += MODERN_POINTS[pos - 1];
      }
      if (pos >= 1) {
        s.finished++;
        if (pos < s.best) s.best = pos;
      }
      if (r.gridPosition === 1) s.poles++;
      if (r.gridPosition >= 1) {
        s.gridSum += r.gridPosition;
        s.gridCount++;
      }
      s.numbers[r.driverNumber] = (s.numbers[r.driverNumber] || 0) + 1;
      // sfida col compagno di squadra: conta chi arriva davanti (un ritiro perde contro un arrivo)
      for (const mate of entries) {
        if (mate === r || mate.constructorId !== r.constructorId) continue;
        const mp = Number(mate.position);
        const mine = pos >= 1 ? pos : Infinity;
        const theirs = mp >= 1 ? mp : Infinity;
        if (mine === theirs) continue; // entrambi ritirati
        s.mateDuels++;
        if (mine < theirs) s.mateWins++;
      }
      const bySeason = (racesBySeason[year][r.driverId] ??= {});
      bySeason[r.constructorId] = (bySeason[r.constructorId] || 0) + 1;
    }
  }
  if (withResults === rounds.length && rounds.length > 0) completeSeasons.add(year);
}

// Titoli mondiali: solo stagioni concluse, assegnati alla scuderia con più gare quell'anno.
for (const year of completeSeasons) {
  const file = path.join(DATA, 'seasons', String(year), 'driver-standings.yml');
  if (!fs.existsSync(file)) continue;
  const champ = (load(file) || []).find((s) => s.position === 1);
  if (!champ) continue;
  const teams = racesBySeason[year][champ.driverId] || {};
  const team = Object.entries(teams).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (team) stints[eraOf(year)][champ.driverId][team].titles++;
}

const formatYears = (years) => {
  const ys = [...years].sort((a, b) => a - b);
  const ranges = [];
  for (const y of ys) {
    const last = ranges[ranges.length - 1];
    if (last && y === last[1] + 1) last[1] = y;
    else ranges.push([y, y]);
  }
  return ranges
    .map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
    .join(', ');
};

// numero di gara usato più spesso
const mainNumber = (numbers) => Number(Object.entries(numbers).sort((a, b) => b[1] - a[1])[0]?.[0]) || null;

// Rarità provvisoria: il gioco la ricalcola all'avvio dalla valutazione delle 7 metriche (rateCards in src/game/cards.ts).
const rarityOf = (st, kind) => {
  if (kind === 'career') return 'leggendaria';
  const winPct = st.wins / st.races;
  if (st.titles > 0 || (st.wins >= 10 && winPct >= 0.25)) return 'oro';
  if (st.wins >= 1 || st.podiums >= 5) return 'argento';
  return 'bronzo';
};

const round1 = (v) => Math.round(v * 10) / 10;

// Metriche di gioco: scelte perché quasi nessun pilota abbia 0.
const toStats = (st) => ({
  gare: st.races,
  top10: st.top10,
  puntiGara: round1(st.points / st.races),
  migliorArrivo: st.best,
  grigliaMedia: st.gridCount ? round1(st.gridSum / st.gridCount) : 30,
  percArrivi: Math.round((st.finished / st.races) * 100),
  percCompagno: st.mateDuels ? Math.round((st.mateWins / st.mateDuels) * 100) : 50,
});

// Palmarès mostrato sulla card (non si gioca).
const toPalmares = (st) => ({ vittorie: st.wins, podi: st.podiums, pole: st.poles, mondiali: st.titles });

// somma delle statistiche di più scuderie (card Carriera, Classica e Pioniere)
function sumStints(all) {
  const total = newStint();
  for (const s of all) {
    for (const k of ['races', 'wins', 'podiums', 'poles', 'titles', 'points', 'top10', 'finished',
      'gridSum', 'gridCount', 'mateWins', 'mateDuels']) total[k] += s[k];
    total.best = Math.min(total.best, s.best);
    s.years.forEach((y) => total.years.add(y));
    for (const [n, k] of Object.entries(s.numbers)) total.numbers[n] = (total.numbers[n] || 0) + k;
  }
  return total;
}

const driverOf = (driverId) => {
  const d = drivers[driverId];
  return {
    id: driverId,
    name: d.name,
    lastName: d.lastName,
    abbreviation: d.abbreviation,
    country: countries[d.nationalityCountryId] ?? null,
  };
};
const COLLECT_RARITY = { pioneer: 'pioniere', classic: 'classica' };

const cards = [];
// Pionieri e Classiche: una card per pilota con tutte le gare di quell'epoca
for (const era of ['pioneer', 'classic']) {
  for (const [driverId, byTeam] of Object.entries(stints[era])) {
    const total = sumStints(Object.values(byTeam));
    const ys = [...total.years];
    const teamIds = Object.entries(byTeam).sort((a, b) => b[1].races - a[1].races).map(([teamId]) => teamId);
    cards.push({
      id: `${driverId}__${era}`,
      kind: era,
      driver: driverOf(driverId),
      team: { id: teamIds[0], name: constructors[teamIds[0]]?.name ?? teamIds[0] }, // la scuderia con più gare
      number: mainNumber(total.numbers),
      teams: teamIds,
      period: formatYears(total.years),
      firstYear: Math.min(...ys),
      rarity: COLLECT_RARITY[era],
      stats: toStats(total),
      palmares: toPalmares(total),
    });
  }
}

// Moderne (da giocare): una card per scuderia con almeno 3 gare, più la Carriera se le scuderie sono almeno 2
for (const [driverId, byTeam] of Object.entries(stints.modern)) {
  const all = Object.values(byTeam);
  const driver = driverOf(driverId);
  let teamStints = Object.entries(byTeam)
    .filter(([, s]) => s.races >= MIN_STINT_RACES)
    .sort((a, b) => Math.min(...a[1].years) - Math.min(...b[1].years));
  // chi ha corso pochissimo ha comunque una card: quella della scuderia con più gare
  if (!teamStints.length) teamStints = [Object.entries(byTeam).sort((a, b) => b[1].races - a[1].races)[0]];

  for (const [teamId, s] of teamStints) {
    cards.push({
      id: `${driverId}__${teamId}`,
      kind: 'team',
      driver,
      team: { id: teamId, name: constructors[teamId]?.name ?? teamId },
      number: mainNumber(s.numbers),
      period: formatYears(s.years),
      firstYear: Math.min(...s.years),
      rarity: rarityOf(s, 'team'),
      stats: toStats(s),
      palmares: toPalmares(s),
    });
  }

  if (teamStints.length >= 2) {
    const total = sumStints(all);
    const ys = [...total.years];
    cards.push({
      id: `${driverId}__career`,
      kind: 'career',
      driver,
      team: { id: 'career', name: 'Carriera' },
      number: drivers[driverId].permanentNumber ?? mainNumber(total.numbers),
      teams: teamStints.map(([teamId]) => teamId),
      period: `${Math.min(...ys)}–${Math.max(...ys)}`,
      firstYear: Math.min(...ys),
      rarity: 'leggendaria',
      stats: toStats(total),
      palmares: toPalmares(total),
    });
  }
}

cards.sort((a, b) =>
  a.driver.lastName.localeCompare(b.driver.lastName) || a.driver.id.localeCompare(b.driver.id) ||
  (a.kind === 'career') - (b.kind === 'career') || a.firstYear - b.firstYear);
const KIND_ORDER = { team: 0, career: 0, classic: 1, pioneer: 2 }; // le card da collezione in fondo
cards.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

const teams = {};
for (const c of cards) if (c.kind !== 'career') teams[c.team.id] = c.team.name;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  source: 'F1DB (https://github.com/f1db/f1db) – CC BY 4.0',
  generatedAt: new Date().toISOString().slice(0, 10),
  latestSeason,
  seasonComplete: completeSeasons.has(latestSeason),
  teams,
  cards,
}, null, 0));

const byRarity = cards.reduce((m, c) => ((m[c.rarity] = (m[c.rarity] || 0) + 1), m), {});
console.log(`${cards.length} card generate`, byRarity, `→ ${OUT}`);

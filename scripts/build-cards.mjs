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

// Selezione piloti: hanno corso dal FROM_YEAR in poi e hanno almeno un podio,
// oppure sono sulla griglia della stagione più recente.
const FROM_YEAR = 1980;
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

// stints[driverId][constructorId] = { races, wins, podiums, poles, years:Set, titles }
const stints = {};
// racesBySeason[year][driverId][constructorId] = numero di gare (per assegnare i titoli)
const racesBySeason = {};
const seasons = readDir(path.join(DATA, 'seasons')).map(Number);
const latestSeason = Math.max(...seasons);
const latestGrid = new Set();
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
    for (const r of load(file) || []) {
      const key = `${r.driverId}|${r.constructorId}`;
      if (seen.has(key)) continue; // auto condivise negli anni '50
      seen.add(key);
      if (NOT_STARTED.has(String(r.position))) continue;
      const s = ((stints[r.driverId] ??= {})[r.constructorId] ??= {
        races: 0, wins: 0, podiums: 0, poles: 0, best: NO_FINISH, years: new Set(), titles: 0, numbers: {},
      });
      s.races++;
      s.years.add(year);
      const pos = Number(r.position);
      if (pos === 1) s.wins++;
      if (pos >= 1 && pos <= 3) s.podiums++;
      if (r.gridPosition === 1) s.poles++;
      if (pos >= 1 && pos < s.best) s.best = pos;
      s.numbers[r.driverNumber] = (s.numbers[r.driverNumber] || 0) + 1;
      const bySeason = (racesBySeason[year][r.driverId] ??= {});
      bySeason[r.constructorId] = (bySeason[r.constructorId] || 0) + 1;
      if (year === latestSeason) latestGrid.add(r.driverId);
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
  if (team) stints[champ.driverId][team].titles++;
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

const rarityOf = (st, kind) => {
  if (kind === 'career') return 'leggendaria';
  const winPct = st.wins / st.races;
  if (st.titles > 0 || (st.wins >= 10 && winPct >= 0.25)) return 'oro';
  if (st.wins >= 1 || st.podiums >= 5) return 'argento';
  return 'bronzo';
};

const toStats = (st) => ({
  gare: st.races,
  vittorie: st.wins,
  podi: st.podiums,
  pole: st.poles,
  percVittorie: Math.round((st.wins / st.races) * 1000) / 10,
  migliorArrivo: st.best,
  mondiali: st.titles,
});

const cards = [];
for (const [driverId, byTeam] of Object.entries(stints)) {
  const all = Object.values(byTeam);
  const lastYear = Math.max(...all.flatMap((s) => [...s.years]));
  const podiums = all.reduce((n, s) => n + s.podiums, 0);
  const eligible = lastYear >= FROM_YEAR && (podiums > 0 || latestGrid.has(driverId));
  if (!eligible) continue;

  const d = drivers[driverId];
  const driver = {
    id: driverId,
    name: d.name,
    lastName: d.lastName,
    abbreviation: d.abbreviation,
    country: countries[d.nationalityCountryId] ?? null,
  };

  const teamStints = Object.entries(byTeam)
    .filter(([, s]) => s.races >= MIN_STINT_RACES)
    .sort((a, b) => Math.min(...a[1].years) - Math.min(...b[1].years));

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
    });
  }

  if (teamStints.length >= 2) {
    const total = { races: 0, wins: 0, podiums: 0, poles: 0, titles: 0, best: NO_FINISH, years: new Set(), numbers: {} };
    for (const s of all) {
      total.races += s.races; total.wins += s.wins; total.podiums += s.podiums;
      total.poles += s.poles; total.titles += s.titles; total.best = Math.min(total.best, s.best);
      s.years.forEach((y) => total.years.add(y));
      for (const [n, k] of Object.entries(s.numbers)) total.numbers[n] = (total.numbers[n] || 0) + k;
    }
    const ys = [...total.years];
    cards.push({
      id: `${driverId}__career`,
      kind: 'career',
      driver,
      team: { id: 'career', name: 'Carriera' },
      number: d.permanentNumber ?? mainNumber(total.numbers),
      teams: teamStints.map(([teamId]) => teamId),
      period: `${Math.min(...ys)}–${Math.max(...ys)}`,
      firstYear: Math.min(...ys),
      rarity: 'leggendaria',
      stats: toStats(total),
    });
  }
}

cards.sort((a, b) =>
  a.driver.lastName.localeCompare(b.driver.lastName) || a.driver.id.localeCompare(b.driver.id) ||
  (a.kind === 'career') - (b.kind === 'career') || a.firstYear - b.firstYear);

const teams = {};
for (const c of cards) if (c.kind === 'team') teams[c.team.id] = c.team.name;

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

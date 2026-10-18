// Foto dei piloti da Wikimedia Commons (licenze libere), con autore e licenza da citare.
// Uso: node scripts/fetch-portraits.mjs <percorso-clone-f1db>
// Scrive src/data/portraits.json: { idPilota: { thumb, page, author, license, licenseUrl } }.
// Le immagini non si scaricano: l'app mostra la miniatura di Commons (256 px) con i crediti.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const F1DB = process.argv[2] || process.env.F1DB_PATH;
if (!F1DB) {
  console.error('Uso: node scripts/fetch-portraits.mjs <percorso-clone-f1db>');
  process.exit(1);
}
const OUT = path.resolve('src/data/portraits.json');
const UA = 'F1CardBattle/1.0 (https://github.com/J0joFra/F1-Card-Battle)'; // richiesto dalle regole di Wikimedia
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// piloti del gioco, con data di nascita da F1DB (serve a trovarli su Wikidata senza omonimi)
const cards = JSON.parse(fs.readFileSync('src/data/cards.json', 'utf8')).cards;
const ids = [...new Set(cards.map((c) => c.driver.id))];
const drivers = ids
  .map((id) => yaml.load(fs.readFileSync(path.join(F1DB, 'src/data/drivers', `${id}.yml`), 'utf8')))
  .filter((d) => d.dateOfBirth);

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ');
const dobKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

async function getJson(url, init = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...init.headers } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    throw new Error(`${res.status} ${url.slice(0, 120)}`);
  }
  throw new Error(`troppi tentativi: ${url.slice(0, 120)}`);
}

// 1. Wikidata: persone nate in quelle date, piloti, con una foto (P18)
const byDob = new Map();
for (const d of drivers) {
  const k = dobKey(d.dateOfBirth);
  byDob.set(k, [...(byDob.get(k) ?? []), d]);
}
const dates = [...byDob.keys()];
const found = new Map(); // idPilota → nome file su Commons
for (let i = 0; i < dates.length; i += 120) {
  const values = dates.slice(i, i + 120).map((d) => `"${d}T00:00:00Z"^^xsd:dateTime`).join(' ');
  const query = `SELECT ?item ?label ?dob ?image WHERE {
    VALUES ?dob { ${values} }
    VALUES ?occ { wd:Q10841764 wd:Q378622 }
    ?item wdt:P569 ?dob ; wdt:P106 ?occ ; wdt:P18 ?image ; rdfs:label ?label .
    FILTER(LANG(?label) = "en")
  }`;
  const data = await getJson('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query }),
  });
  for (const b of data.results.bindings) {
    const dob = b.dob.value.slice(0, 10);
    const label = norm(b.label.value);
    for (const d of byDob.get(dob) ?? []) {
      if (found.has(d.id)) continue;
      const last = norm(d.lastName).trim().split(/\s+/).pop();
      if (!label.split(/\s+/).includes(last)) continue;
      found.set(d.id, decodeURIComponent(b.image.value.split('/').pop()));
    }
  }
  await sleep(1000);
}
console.log(`Wikidata: foto trovate per ${found.size} piloti su ${drivers.length}`);

// 2. Commons: miniatura, autore e licenza di ogni foto
const strip = (html = '') => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const FREE = /^(CC0|CC BY|CC-BY|Public domain|PD|GFDL|Attribution|FAL)/i;
const entries = [...found];
const out = {};
for (let i = 0; i < entries.length; i += 40) {
  const chunk = entries.slice(i, i + 40);
  const titles = chunk.map(([, file]) => `File:${file}`).join('|');
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=256&titles=${encodeURIComponent(titles)}`;
  const data = await getJson(url);
  const pages = Object.values(data.query?.pages ?? {});
  const norm2 = data.query?.normalized ?? [];
  for (const [driverId, file] of chunk) {
    const asked = `File:${file}`;
    const title = norm2.find((n) => n.from === asked)?.to ?? asked;
    const info = pages.find((p) => p.title === title)?.imageinfo?.[0];
    if (!info?.thumburl) continue;
    const meta = info.extmetadata ?? {};
    const license = strip(meta.LicenseShortName?.value);
    if (!FREE.test(license)) continue; // solo licenze libere
    out[driverId] = {
      thumb: info.thumburl,
      page: info.descriptionurl,
      author: strip(meta.Artist?.value).slice(0, 120) || 'Wikimedia Commons',
      license,
      licenseUrl: meta.LicenseUrl?.value ?? null,
    };
  }
  await sleep(500);
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 0) + '\n');
console.log(`${Object.keys(sorted).length} foto con licenza libera → ${OUT}`);

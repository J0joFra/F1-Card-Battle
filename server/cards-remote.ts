// Nel server il catalogo delle card non è incluso nel pacchetto: si scarica all'avvio dal repository
// (stesso file usato dall'app), così la funzione resta piccola e si aggiorna con i dati.
declare const Deno: { env: { get(k: string): string | undefined } };
const URL =
  Deno.env.get('CARDS_URL') ?? 'https://raw.githubusercontent.com/J0joFra/F1-Card-Battle/main/src/data/cards.json';
const res = await fetch(URL);
if (!res.ok) throw new Error(`catalogo card non disponibile (${res.status})`);
const data = await res.json();
export default data;

# F1 Card Battle

Gioco di carte F1 in stile **Top Quartetto**: ogni card è un pilota con una scuderia, con le statistiche reali ottenute in quella scuderia. Si sfida la CPU, si vincono pacchetti e si completa la collezione.

## Regole

- Ogni card ha 7 statistiche: Gran Premi, Vittorie, Podi, Pole position, % Vittorie, Miglior arrivo, Mondiali.
- Chi è di turno sceglie una statistica: vince il valore più alto (nel **miglior arrivo** vince il più basso) e chi vince prende entrambe le card.
- Pareggio: le card vanno nel piatto e le prende chi vince la mano successiva.
- La partita si gioca con 10 card per parte e finisce quando qualcuno resta senza card, oppure dopo 40 giri (vince chi ha più card).
- La CPU gioca con un mazzo che ha la stessa composizione di rarità del tuo.

## Collezione

- Si parte con 15 card e un pacchetto di benvenuto.
- **Ogni 5 vittorie** si riceve un pacchetto da 5 card (70% Bronzo, 22% Argento, 7% Oro, 1% Leggendaria; l'ultima card è sempre almeno Argento).
- I doppioni diventano **crediti**, che servono a comprare una card a scelta o un pacchetto.
- Un pilota ha una card per ogni scuderia (es. Hamilton: McLaren, Mercedes, Ferrari) più una card **Carriera** leggendaria. Completando tutte le card scuderia di un pilota si sblocca la sua Carriera.
- Rarità: *Leggendaria* = Carriera; *Oro* = mondiale vinto con quella scuderia o almeno 10 vittorie con il 25% di successi; *Argento* = almeno una vittoria o 5 podi; *Bronzo* = tutte le altre.

La collezione per ora si salva nel browser (localStorage).

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

### Aggiornare le statistiche

Le card sono in `src/data/cards.json` e vengono generate dai dati di [F1DB](https://github.com/f1db/f1db) con `scripts/build-cards.mjs`:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/f1db/f1db.git .f1db
git -C .f1db sparse-checkout set --no-cone '/src/data/seasons/*/races/*/race-results.yml' \
  '/src/data/seasons/*/driver-standings.yml' '/src/data/drivers/*' '/src/data/constructors/*' '/src/data/countries/*'
npm run cards
```

Sono inclusi i piloti che hanno corso dal 1980 in poi con almeno un podio, più tutta la griglia della stagione in corso. Le card scuderia richiedono almeno 3 gare con quel team. I titoli contano solo per le stagioni concluse.

## Pubblicazione

A ogni push su `main`, la GitHub Action in `.github/workflows/deploy.yml` pubblica il gioco su GitHub Pages. Va attivato una volta sola in *Settings → Pages → Source: GitHub Actions*.

## Crediti

Dati: [F1DB](https://github.com/f1db/f1db), licenza CC BY 4.0. Progetto amatoriale e non ufficiale, non affiliato a Formula 1, FIA o alle scuderie. Nomi di piloti e scuderie usati solo a scopo descrittivo; nessun logo o immagine ufficiale.

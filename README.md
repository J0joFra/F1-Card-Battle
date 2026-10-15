# F1 Card Battle

Gioco di carte F1 in stile **Top Quartetto**: ogni card è un pilota con una scuderia, con le statistiche reali ottenute in quella scuderia. Si sfida la CPU, si vincono pacchetti e si completa la collezione.

## Regole

- Prima di ogni partita crei un **mazzo di 7 card**, una per metrica (massimo 1 Leggendaria e 2 Oro: regole provvisorie in `src/game/deckRules.ts`). Se non hai un mazzo salvato, il gioco te ne prepara uno a caso.
- La partita dura **7 round**. A ogni round esce una card a caso dal mazzo di ognuno.
- Il primo round si tira a sorte; poi **la metrica la sceglie chi ha vinto il round precedente** (in caso di pareggio sceglie di nuovo lo stesso).
- **Ogni metrica si usa una sola volta per partita**: all'ultimo round resta quella rimasta.
- Vince il round il valore più alto (↓ = vince il più basso) e prende un punto. Chi fa più punti vince la partita.
- La CPU gioca con la stessa composizione di rarità del tuo mazzo, ma sceglie le sue card per coprire più metriche possibile; quando tocca a lei sceglie la metrica in cui la sua card è più forte.

### Metriche

Sono scelte perché quasi nessun pilota abbia 0: un mix di totali, che premiano le carriere lunghe, e di medie, che premiano chi ha fatto bene anche in poche gare.

| Metrica | Cosa misura |
|---|---|
| Gran Premi | gare disputate con la scuderia |
| Arrivi in top 10 | gare concluse tra i primi 10 |
| Punti a gara | media punti con il punteggio attuale (25-18-15…) applicato a tutte le epoche |
| Miglior arrivo ↓ | miglior piazzamento in gara |
| Griglia media ↓ | posizione media di partenza |
| % Gare finite | affidabilità: gare portate al traguardo |
| % Batte compagno | gare chiuse davanti al compagno di squadra |

Vittorie, podi, pole e mondiali restano sulla card come palmarès e servono per la rarità.

## Collezione

- Si parte con 15 card e un pacchetto di benvenuto.
- **Ogni 5 vittorie** si riceve un pacchetto da 5 card (70% Bronzo, 22% Argento, 7% Oro, 1% Leggendaria; l'ultima card è sempre almeno Argento).
- I doppioni diventano **crediti**, che servono a comprare una card a scelta o un pacchetto.
- Nel 20% dei pacchetti c'è anche un **Jolly** 🃏: una card scuderia a scelta di un pilota che stai completando (ne devi già avere almeno una).
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

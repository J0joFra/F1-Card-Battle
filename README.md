# F1 Card Battle

Gioco di carte F1 in stile **Top Quartetto**: ogni card è un pilota con una scuderia, con le statistiche reali ottenute in quella scuderia. Si sfida la CPU, si vincono pacchetti e si completa la collezione.
https://f1cardbattle.vercel.app/

## Regole

- Il gioco ha **4 pagine**: *Collezione*, *Mazzi*, *Gioca* e *Negozio*.
- Hai **3 mazzi salvati** (linguette 1-2-3, stile Clash Royale), che prepari nella pagina *Mazzi* (si salvano da soli). Nella pagina *Gioca* scegli il mazzo e premi ▶ (o tocchi le card a ventaglio) per sfidare la CPU.
- Nella pagina *Mazzi* le card si girano passandoci sopra (o toccandole si ingrandiscono): dietro c'è il **diagramma a ragnatela** delle 7 metriche (percentile rispetto a tutte le card), con il pulsante *Aggiungi* / *Togli*. *Ordina per* rarità, valutazione (OVR) o una delle 7 metriche. Con la vista **Tabella** vedi solo le statistiche di tutte le tue card una sotto l'altra: tocchi l'intestazione per ordinare e la riga per aggiungere o togliere la card.
- Anche nella *Collezione* le card si girano e mostrano il diagramma a ragnatela.
- Un mazzo ha **7 card**, una per metrica (massimo 1 Leggendaria, 1 Platino e 2 Oro: regole provvisorie in `src/game/deckRules.ts`). Se il mazzo è incompleto, il gioco lo completa a caso.
- La partita dura **7 round**. A ogni round esce una card a caso dal mazzo di ognuno.
- Il primo round sceglie sempre il giocatore; poi **la metrica la sceglie chi ha vinto il round precedente** (in caso di pareggio il turno passa all'altro).
- **Ogni metrica si usa una sola volta per partita**: all'ultimo round resta quella rimasta.
- Vince il round il valore più alto (↓ = vince il più basso) e prende un punto. Chi fa più punti vince la partita.
- Per scegliere la metrica hai **30 secondi**: allo scadere il gioco gioca per te la metrica migliore della tua card.
- La CPU gioca con la stessa composizione di rarità del tuo mazzo, ma sceglie le sue card per coprire più metriche possibile; quando tocca a lei sceglie, tra le metriche rimaste, la migliore della sua card (non vede la tua).

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

## Negozio

- **Pacchetti**: *Classico* (5 card, 🪙 40, va tra i pacchetti da aprire, come quello vinto ogni 10 vittorie), *Premium* (5 card, 🪙 150: niente Bronzo, l'ultima almeno Oro) e *Scuderia* (4 card, 🪙 80: solo card della scuderia del giorno, che cambia ogni giorno ed è uguale per tutti). Premium e Scuderia si aprono subito.
- **Carte del giorno**: 6 card da comprare con i crediti (Bronzo 15, Argento 40, Oro 120, Platino 200), scelte una volta al giorno e fisse fino a mezzanotte. Soprattutto card scuderia che ti mancano per completare un pilota (🎯 *Ti serve*), poi altre card che non hai (al massimo un Oro o Platino). Ogni card si compra una volta. Dalla Collezione non si comprano più card a scelta: solo nel negozio.
- Toccando una card (nel negozio o nel costruttore del mazzo) si gira e si ingrandisce, con il diagramma a ragnatela.

## Sfida un amico

- Serve l'accesso con Google: la partita la arbitra il server, così nessuno può barare né vedere le card dell'altro.
- **Al meglio di 3**: vince la serie chi vince 2 partite. La partita 1 si gioca con il mazzo salvato 1 di ognuno, la 2 con il mazzo 2, la 3 con il mazzo 3: i mazzi si preparano prima (*Prepara mazzi*). Nella partita successiva inizia a scegliere chi ha perso la precedente.
- **Amici**: a fine sfida si può aggiungere l'avversario agli amici (amicizia reciproca). Nella lista il pallino verde indica chi è online (visto negli ultimi 75 secondi); toccando *Sfida* l'amico riceve un invito (*Accetta* / *Rifiuta*) entro una ventina di secondi.
- In alternativa si crea una sfida con un **codice di 6 caratteri** da condividere; il codice scade dopo 15 minuti.
- Ognuno ha 30 secondi per scegliere: se non lo fa (o chiude l'app), il server gioca la metrica migliore della sua card.
- Premi a fine serie: la vittoria conta per il pacchetto (come contro la CPU) e vale **+10 crediti**, il pareggio **+5 crediti**. Chi abbandona perde la serie.
- Il telefono chiede al server ogni 2 secondi se l'avversario ha giocato, e ogni 20 secondi se ci sono inviti (è anche il "sono online"). Tabelle `pvp_matches` e `friends`, chiuse ai telefoni.

## Sfida del giorno e missioni

- **Sfida del giorno**: una sola partita al giorno contro un mazzo CPU a tema (una scuderia o un decennio, 1 Oro + 2 Argento + 4 Bronzo). Vincendo si ottengono 1 pacchetto e 25 crediti; vincerla più giorni di fila fa crescere la serie 🔥. Conta come giocata appena parte, quindi abbandonarla non dà un secondo tentativo.
- **Missioni del giorno**: tre obiettivi (vinci partite, vinci round con una metrica, vinci con una card di una scuderia o di un decennio, apri un pacchetto, vinci con almeno 5 punti…) che danno crediti da ritirare nella home. Quelle su scuderie e decenni usano solo card che possiedi.
- Sfida e missioni dipendono dalla data: lo stesso giorno tutti trovano la stessa sfida. Logica e test in `src/game/daily.ts`.

## Collezione

- Si parte con 15 card e un pacchetto di benvenuto.
- **Ogni 10 vittorie** (contro la CPU o contro un amico) si riceve un pacchetto da 5 card (65% Bronzo, 22% Argento, 9% Oro, 3% Platino, 1% Leggendaria; l'ultima card è sempre almeno Argento).
- I doppioni diventano **crediti**, che servono a comprare una card a scelta o un pacchetto.
- Nel 20% dei pacchetti c'è anche un **Jolly** 🃏: una card scuderia a scelta di un pilota che stai completando (ne devi già avere almeno una).
- Un pilota ha una card per ogni scuderia (es. Hamilton: McLaren, Mercedes, Ferrari) più una card **Carriera** leggendaria. Completando tutte le card scuderia di un pilota si sblocca la sua Carriera.
- Rarità: *Leggendaria* = Carriera. Le card scuderia hanno una **valutazione (OVR, 0-100)**, il numero in basso a destra sulla card: è la media dei percentili delle 7 metriche rispetto a tutte le card scuderia (per Best e Griglia vale il valore più basso). Da 82 in su è *Platino*, da 68 *Oro*, da 50 *Argento*, sotto *Bronzo* (soglie in `RARITY_THRESHOLDS`, `src/game/cards.ts`). La valutazione si calcola all'avvio sia nell'app sia sul server, quindi i due sono sempre d'accordo.

La collezione per ora si salva nel browser (localStorage).

## Lingue, tema e tutorial

- **Lingue**: italiano, inglese, francese, spagnolo e tedesco. Al primo avvio si usa la lingua del telefono (se non è tra queste, l'inglese); si cambia dalle impostazioni ⚙️ o dalla prima schermata. I testi sono in `src/lib/i18n.tsx`.
- **Tema** chiaro/scuro: di default segue il telefono, si può forzare dalle impostazioni.
- **Introduzione** a schede al primo avvio (riapribile dalle impostazioni) e **tutorial a tendina** in fondo a ogni schermata.

## Illustrazioni dei piloti

Le card mostrano l'immagine del pilota se trovano un file in `src/assets/drivers/` (istruzioni in `src/assets/drivers/LEGGIMI.md`):

- `lewis-hamilton.webp` → usata per tutte le card di Hamilton;
- `lewis-hamilton__ferrari.webp` → solo per la card Hamilton · Ferrari (ha la precedenza).

Formato consigliato: WebP 600 × 600 px con sfondo trasparente. Senza immagine la card mostra un casco disegnato con i colori della scuderia e il numero di gara.

## Suoni, vibrazione e animazioni

- Effetti sonori generati dal codice (nessun file, nessuna licenza), morbidi e in stile jazz (piano elettrico, vibrafono, spazzole): tocchi, scelta della metrica, carta che si gira, esito del round, vittoria/sconfitta, apertura pacchetto, card rara.
- Per usare suoni tuoi o aggiungere una musica di sottofondo basta mettere i file in `src/assets/sounds/` con il nome dell'effetto (elenco in `src/assets/sounds/LEGGIMI.md`).
- Musica: due brani jazz (`music-menu-1`, `music-menu-2`) che si alternano fuori dalla partita e un brano racing (`music-match`) in loop durante la partita; finita la partita riparte il jazz successivo. Nell'app la musica parte appena si apre; nel browser, che blocca l'audio automatico, parte al primo tocco. Brani da Pixabay Music, fonti in `src/assets/sounds/LEGGIMI.md`.
- Vibrazione con il plugin Haptics di Capacitor (sul web `navigator.vibrate`).
- Suoni, musica e vibrazione si disattivano dalle impostazioni; con "riduci animazioni" attivo sul telefono le animazioni si spengono.

## Account e salvataggio online

Il login con Google e il salvataggio della collezione usano [Supabase](https://supabase.com) (progetto `f1-card-battle`, piano gratuito).

- Senza login si gioca come prima: tutto resta salvato sul dispositivo, e decide il telefono.
- **Con il login decide il server.** Pacchetti, crediti, acquisti, Jolly, premi delle missioni e partite contro la CPU passano dalla Edge Function `game` (Supabase): il telefono chiede un'azione, il server la controlla con le stesse regole del gioco e salva. Nelle partite il server gioca un round alla volta, quindi il telefono non conosce mai in anticipo le carte della CPU.
- Al primo login la collezione del dispositivo diventa quella dell'account, ma solo se plausibile (limiti su card, crediti, pacchetti…); altrimenti si parte dal mazzo iniziale. Chi aveva già un account con la vecchia app riceve un'ultima unione con i dati del telefono, poi conta solo il server.
- Uscendo, il dispositivo torna "ospite" e la collezione resta sull'account.
- Tabelle: `profiles` (una riga per utente, con un numero di `version` per evitare che due richieste contemporanee si sovrascrivano) e `matches` (partite in corso). `matches` è chiusa ai telefoni: la usa solo il server. Lo schema è in `supabase/migrations/`.
- Codice del server: la logica è in `src/server/actions.ts` (con i test), l'aggancio a Supabase in `server/edge.ts`. `npm run build:server` crea `supabase/functions/game/index.js`, che si pubblica come Edge Function `game` (entrypoint `index.js`, JWT obbligatorio). Il catalogo delle card il server lo scarica da `src/data/cards.json` sul branch `main`.
- Quando tutti avranno l'app aggiornata, va eseguito `supabase/pending/close_client_writes.sql`: toglie ai telefoni il permesso di scrivere direttamente il profilo (la vecchia app lo faceva).
- URL e chiave *publishable* sono in `src/lib/supabase.ts`: sono pubblici per definizione (la protezione dei dati la fanno le regole RLS). Si possono sostituire con `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

### Configurare il login con Google (una volta sola)

1. **Google Cloud Console** → *API e servizi* → *Credenziali* → *Crea credenziali* → *ID client OAuth* → tipo *Applicazione web*.
   - *URI di reindirizzamento autorizzati*: `https://fheiutmpkglkpymkrrqt.supabase.co/auth/v1/callback`
   - Se richiesto, configura prima la *schermata di consenso OAuth* (tipo *Esterno*, nome app e la tua email).
2. **Supabase** → progetto `f1-card-battle` → *Authentication* → *Sign In / Providers* → *Google*: attivalo e incolla *Client ID* e *Client Secret*.
3. **Supabase** → *Authentication* → *URL Configuration*:
   - *Site URL*: `https://j0jofra.github.io/F1-Card-Battle/`
   - *Redirect URLs*: aggiungi `https://j0jofra.github.io/F1-Card-Battle/**` e `http://localhost:5173/**`

## App Android

L'app Android è fatta con [Capacitor](https://capacitorjs.com): è lo stesso gioco del sito, dentro un'app (cartella `android/`).

- **Login**: nell'app si usa il selettore account di Android (plugin `@capgo/capacitor-social-login`), senza aprire il browser. Il token di Google viene passato a Supabase (`signInWithIdToken`), quindi l'account e la collezione sono gli stessi del sito.
- **APK di prova**: a ogni push sui branch `claude/**` e `main`, la GitHub Action *App Android* compila un APK di debug. Lo trovi in *Actions* → ultima esecuzione → *Artifacts* → `f1-card-battle-debug-apk`.
- La chiave di firma di debug (`android/app/debug.keystore`) è fissa e versionata, così l'impronta SHA-1 non cambia:
  `SHA-1 06:36:44:09:26:59:CE:0A:2E:6C:39:EB:73:D1:2B:FF:43:BD:24:7E`
  Per la pubblicazione sul Play Store servirà una chiave di rilascio separata (mai nel repository).

### Configurare il login nell'app (una volta sola)

1. **Google Cloud Console** → *Credenziali* → *Crea credenziali* → *ID client OAuth* → tipo **Android**:
   - Nome pacchetto: `com.j0jofra.f1cardbattle`
   - Impronta SHA-1: quella qui sopra
2. **GitHub** → repository → *Settings* → *Secrets and variables* → *Actions* → scheda *Variables* → *New repository variable*:
   - Nome `GOOGLE_WEB_CLIENT_ID`, valore: l'ID client di tipo **Applicazione web** (quello già usato in Supabase, finisce con `.apps.googleusercontent.com`). Non è un segreto.
3. Rilancia la Action *App Android* (o fai un push) e installa il nuovo APK.

### Sviluppo locale dell'app

```bash
npm run build && npx cap sync android
npx cap open android   # apre Android Studio
```
Per il login in locale crea un file `.env.local` con `VITE_GOOGLE_WEB_CLIENT_ID=...`.

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

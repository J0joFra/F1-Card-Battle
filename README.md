# F1 Card Battle

Gioco di carte F1 in stile **Top Quartetto**: ogni card è un pilota con una scuderia, con le statistiche reali ottenute in quella scuderia. Si sfida la CPU, si vincono pacchetti e si completa la collezione.
https://f1cardbattle.vercel.app/

## Regole

- Il gioco ha **4 pagine**: *Collezione*, *Mazzi*, *Gioca* e *Negozio*.
- Hai **3 mazzi salvati** (linguette 1-2-3, stile Clash Royale), che prepari nella pagina *Mazzi* (si salvano da soli). I 3 mazzi devono essere diversi: due mazzi hanno al massimo 2 card in comune (almeno 5 diverse) e nessuna card può stare in tutti e 3.
- Nella pagina *Gioca* ci sono due pulsanti: **Partita veloce** (contro la CPU) e **Sfida amico**. La partita veloce ha 4 modalità:
  - *Classica*: giochi con il mazzo scelto (1, 2, 3).
  - *Rarità*: solo card di una rarità (es. solo Oro), senza limiti di rarità.
  - *Annata*: solo card di un decennio (dal primo anno della card: anni 2000 = 2000-2009).
  - *Nazionalità*: solo piloti di una nazione, tra quelle con almeno 7 piloti (13 nazioni: Italia, Francia, Regno Unito, Brasile, Germania, Giappone…).
  Nelle modalità a tema scegli le 7 card tra quelle adatte (il gioco propone le migliori) e la CPU gioca con card dello stesso tema. Servono almeno 7 card adatte.
- Nella pagina *Mazzi* le card si girano passandoci sopra (o toccandole si ingrandiscono): dietro c'è il **diagramma a ragnatela** delle 7 metriche (percentile rispetto a tutte le card), con il pulsante *Aggiungi* / *Togli*. *Ordina per* rarità, valutazione (OVR) o una delle 7 metriche. Con la vista **Tabella** vedi solo le statistiche di tutte le tue card una sotto l'altra: tocchi l'intestazione per ordinare e la riga per aggiungere o togliere la card.
- Anche nella *Collezione* le card si girano e mostrano il diagramma a ragnatela.
- Un mazzo ha **7 card**, una per metrica. Nella partita classica al massimo 2 Oro e 2 card tra Platino e Leggendaria, con al massimo 1 Leggendaria: quindi 1 Leggendaria + 1 Platino + 2 Oro, oppure 2 Platino + 2 Oro (regole in `src/game/deckRules.ts`). Se il mazzo è incompleto, il gioco lo completa a caso.
- La partita dura **7 round**. A ogni round esce una card a caso dal mazzo di ognuno.
- Sul tavolo la tua card occupa circa 2/3 dello spazio; quella dell'avversario è dietro e sporge per 1/3. Quando si gioca la metrica si gira e viene avanti, e sotto compare il confronto dei due valori. *Abbandona* è in basso al centro.
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

Sotto ogni metrica una **barretta colorata** dice quanto è forte rispetto a tutte le card giocabili (percentile): verde forte, gialla media, rossa debole. Per le due metriche di posizione si usa la scala da appassionato: *Griglia media* piena da 3° in su e vuota dal 20°, *Miglior arrivo* piena con la vittoria (1°) e vuota dal 15°. Nelle prime 5 partite un suggerimento spiega barre e frecce ↓.

Vittorie, podi, pole e mondiali restano sulla card come palmarès e servono per la rarità.

## Negozio

- **Pacchetti**: *Classico* (5 card, 🪙 40, va tra i pacchetti da aprire, come quello vinto ogni 10 vittorie), *Premium* (5 card, 🪙 150: niente Bronzo, l'ultima almeno Oro) e *Scuderia* (4 card, 🪙 80: solo card della scuderia del giorno, che cambia ogni giorno ed è uguale per tutti). Premium e Scuderia si aprono subito.
- **Carte del giorno**: 6 card da comprare con i crediti (Bronzo 15, Argento 40, Oro 120, Platino 200), scelte una volta al giorno e fisse fino a mezzanotte. Soprattutto card scuderia che ti mancano per completare un pilota (🎯 *Ti serve*), poi altre card che non hai (al massimo un Oro o Platino). Ogni card si compra una volta. Dalla Collezione non si comprano più card a scelta: solo nel negozio.
- Toccando una card (nel negozio o nel costruttore del mazzo) si gira e si ingrandisce, con il diagramma a ragnatela.

## Sfida un amico

- Serve il profilo (nickname e avatar): la partita la arbitra il server, così nessuno può barare né vedere le card dell'altro.
- **Al meglio di 3**: vince la serie chi vince 2 partite. La partita 1 si gioca con il mazzo salvato 1 di ognuno, la 2 con il mazzo 2, la 3 con il mazzo 3 (*Prepara mazzi*; se mancano, il gioco li completa da solo così si entra subito). Nella partita successiva inizia a scegliere chi ha perso la precedente.
- **Amici**: a fine sfida si può aggiungere l'avversario agli amici (amicizia reciproca). Nella lista il pallino verde indica chi è online (visto negli ultimi 75 secondi); toccando *Sfida* l'amico riceve, entro una ventina di secondi, un invito a tendina in alto che resta finché non risponde: *Accetta* lo porta subito in partita.
- In alternativa si crea una sfida con un **codice di 6 caratteri**: *Condividi* manda un messaggio con il **link diretto** alla sfida (`…/?sfida=CODICE`). Chi lo apre entra in partita (dopo aver creato il profilo). Il codice scade dopo 15 minuti.
- Ognuno ha 30 secondi per scegliere: se non lo fa (o chiude l'app), il server gioca la metrica migliore della sua card.
- **Turni sincronizzati**: appena uno sceglie, i due telefoni mostrano il risultato per 3 secondi e passano insieme alla carta successiva, senza premere *Prossimo round* (il server dice a ognuno da quanto è stata fatta la mossa).
- Premi a fine serie: la vittoria conta per il pacchetto (come contro la CPU) e vale **+10 crediti**, il pareggio **+5 crediti**. Chi abbandona perde la serie.
- **Aggiornamenti istantanei** (Supabase Realtime): dopo ogni cambiamento di una sfida (mossa, ingresso, abbandono, invito) il server manda un segnale sul canale della sfida (`pvp-<id>`) o dell'amico invitato (`user-<id>`) e i telefoni rileggono subito lo stato dal server. Il segnale non contiene dati di gioco. Se la connessione Realtime non c'è, i telefoni controllano comunque ogni 3 secondi (partita) e ogni 20 secondi (inviti; è anche il "sono online"). Codice in `src/lib/live.ts` e `server/edge.ts`. Tabelle `pvp_matches` e `friends`, chiuse ai telefoni.
- Con l'app chiusa non arriva nulla: per le notifiche sul telefono serve Firebase Cloud Messaging (da configurare).

## Sfida del giorno e missioni

- **Sfida del giorno**: una sola partita al giorno contro un mazzo CPU a tema (una scuderia o un decennio, 1 Oro + 2 Argento + 4 Bronzo). Anche tu giochi solo con card del tema: ne servono almeno 7; chi non ne ha abbastanza gioca con un **mazzo in prestito** (stesso mix di rarità della CPU, uguale per tutti nella giornata, deciso dal server). Vincendo si ottengono 1 pacchetto e 25 crediti; vincerla più giorni di fila fa crescere la serie 🔥. Conta come giocata appena parte, quindi abbandonarla non dà un secondo tentativo.
- **Missioni del giorno**: tre obiettivi (vinci partite, vinci round con una metrica, vinci con una card di una scuderia o di un decennio, apri un pacchetto, vinci con almeno 5 punti…) che danno crediti da ritirare nella home. Quelle su scuderie e decenni usano solo card che possiedi.
- Sfida e missioni dipendono dalla data: lo stesso giorno tutti trovano la stessa sfida. Logica e test in `src/game/daily.ts`.

## Collezione

- Si parte con 15 card e un pacchetto di benvenuto.
- **Crediti a ogni partita contro la CPU** giocata fino in fondo: vittoria +8, pareggio +5, sconfitta +3 (abbandonare non dà nulla). La **prima vittoria del giorno** vale +25 in più (anche contro un amico). Premi, avanzamento verso il pacchetto e **Rivincita** sono nella schermata di fine partita.
- **Ogni 10 vittorie** (contro la CPU o contro un amico) si riceve un pacchetto da 5 card (59% Bronzo, 3% Pioniere, 3% Classica, 22% Argento, 9% Oro, 3% Platino, 1% Leggendaria; l'ultima card è sempre almeno Argento).
- I doppioni diventano **crediti**, che servono a comprare una card a scelta o un pacchetto.
- Nel 20% dei pacchetti c'è anche un **Jolly** 🃏: una card scuderia a scelta di un pilota che stai completando (ne devi già avere almeno una). I Jolly si accumulano: si usano quando vuoi, dal Negozio o dalla Collezione, dopo aver confrontato le card (con conferma).
- Un pilota ha una card per ogni scuderia (es. Hamilton: McLaren, Mercedes, Ferrari) più una card **Carriera** leggendaria. Completando tutte le card scuderia di un pilota si sblocca la sua Carriera.
- Rarità: *Leggendaria* = Carriera. Le card scuderia hanno una **valutazione (OVR, 0-100)**, il numero in basso a destra sulla card: è la media dei percentili delle 7 metriche rispetto a tutte le card scuderia (per Best e Griglia vale il valore più basso). Da 87 in su è *Platino*, da 76 *Oro*, da 61 *Argento*, sotto *Bronzo* (soglie in `RARITY_THRESHOLDS`, `src/game/cards.ts`). La valutazione si calcola all'avvio sia nell'app sia sul server, quindi i due sono sempre d'accordo.
- **Tre epoche**, decise dai dati (vedi sotto): ogni card ha l'epoca degli anni in cui il pilota ha corso, quindi chi è stato in pista in più epoche ha una card per ognuna (es. Graham Hill: Pioniere, Classica e due card moderne).
  - 🏛 **Pionieri (1950–1960)**: una card per pilota, in toni seppia. **Solo da collezionare.**
  - 🎞️ **Classiche (1961–1972)**: una card per pilota, a colori sbiaditi. **Solo da collezionare.**
  - 🏁 **Moderne (dal 1973)**: una card per ogni scuderia (con almeno 3 gare; chi ha corso meno ha comunque la card della scuderia con più gare) più la Carriera. **Sono le card da giocare.**
- Ci sono **tutti i 794 piloti** della storia della F1 (1501 card). Pionieri e Classiche escono dai pacchetti (3% ciascuna); se un aggiornamento toglie una card che avevi, diventa la card d'epoca dello stesso pilota.
- Perché il 1961 e il 1973 (dati F1DB, `scripts/build-cards.mjs`): fino al 1960 contava anche la 500 Miglia di Indianapolis, con 80-100 piloti diversi a stagione, 7-11 gare e quasi nessuno che faceva tutto il campionato. Tra il 1961 e il 1972 le stagioni avevano 8-13 gare. Dal 1973 si corrono 14+ gare con griglie da ~24 partenti, come negli anni '80 e dopo: le statistiche (che sono in parte totali, come Gran Premi e Top 10) diventano confrontabili.

La collezione per ora si salva nel browser (localStorage).

## Lingue, tema e tutorial

- **Lingue**: italiano, inglese, francese, spagnolo e tedesco. Al primo avvio si usa la lingua del telefono (se non è tra queste, l'inglese); si cambia dalle impostazioni ⚙️ o dalla prima schermata. I testi sono in `src/lib/i18n.tsx`.
- **Tema** chiaro/scuro: di default segue il telefono, si può forzare dalle impostazioni.
- **Introduzione** a schede al primo avvio (riapribile dalle impostazioni) e **tutorial a tendina** in fondo a ogni schermata.

## Temi delle feste

Nei giorni delle feste l'app si traveste da sola (`src/lib/season.ts`):

| Tema | Quando | Pacchetti | Monete | Cappello sui caschi | Decorazioni |
|---|---|---|---|---|---|
| 🎃 Halloween | dal 25 ottobre al 3 novembre | zucche | 🍬 caramelle | cappello da strega | pipistrelli e fantasmi che volano, ragno che scende, ragnatela |
| ❄️ Inverno | tutto dicembre e gennaio (tranne la settimana di Natale) | pacchi innevati con pupazzo di neve | 🪙 | berretto di lana | neve che scende, neve su barre e riquadri |
| 🎄 Natale | dal 21 al 27 dicembre | regali con fiocco | 🍪 biscotti | cappello di Babbo Natale | luci di Natale che lampeggiano, neve e regali |
| 🐣 Pasqua | dalla Domenica delle Palme a Pasquetta (date calcolate ogni anno) | uova decorate | 🍫 cioccolatini | orecchie da coniglio | fiori e ovetti, prato con coniglio |

Cambiano anche i colori dei pulsanti, il dorso delle card, i coriandoli della vittoria, il riquadro di auguri nella home e il simbolo accanto al logo. Le decorazioni non si toccano, restano sotto le barre e si spengono durante la partita (anche i cappelli, per vedere bene il casco) e con "riduci animazioni". Si possono spegnere da *Impostazioni → Temi delle feste*. Anteprima di un tema in qualsiasi giorno: aggiungi `?tema=halloween` (oppure `winter`, `christmas`, `easter`, `off`) all'indirizzo.

## Illustrazioni dei piloti

Le card mostrano l'immagine del pilota se trovano un file in `src/assets/drivers/` (istruzioni in `src/assets/drivers/LEGGIMI.md`):

- `lewis-hamilton.webp` → usata per tutte le card di Hamilton;
- `lewis-hamilton__ferrari.webp` → solo per la card Hamilton · Ferrari (ha la precedenza).

Formato consigliato: WebP 600 × 600 px con sfondo trasparente. Senza immagine la card mostra un casco disegnato: colore di base della scuderia, numero di gara e un **disegno personale del pilota** (tagli diagonali, rombi, calotta, freccia, stelle, bande dritte, saetta, puntini, scacchi…, con secondo colore e visiera), uguale su tutte le sue card.

Le card rare si riconoscono anche dal bordo: *Argento* metallico, *Oro* in lamina dorata con scintillii, *Platino* olografico con riflesso arcobaleno, *Leggendaria* con bordo multicolore che gira, stelle e nome dorato. Nelle griglie le animazioni sono spente per non affaticare il telefono.

## Suoni, vibrazione e animazioni

- Effetti sonori generati dal codice (nessun file, nessuna licenza), morbidi e in stile jazz (piano elettrico, vibrafono, spazzole): tocchi, scelta della metrica, carta che si gira, esito del round, vittoria/sconfitta, apertura pacchetto, card rara.
- Per usare suoni tuoi o aggiungere una musica di sottofondo basta mettere i file in `src/assets/sounds/` con il nome dell'effetto (elenco in `src/assets/sounds/LEGGIMI.md`).
- Musica: due brani jazz (`music-menu-1`, `music-menu-2`) che si alternano fuori dalla partita e un brano racing (`music-match`) in loop durante la partita; finita la partita riparte il jazz successivo. Nell'app la musica parte appena si apre; nel browser, che blocca l'audio automatico, parte al primo tocco. Brani da Pixabay Music, fonti in `src/assets/sounds/LEGGIMI.md`.
- Vibrazione con il plugin Haptics di Capacitor (sul web `navigator.vibrate`).
- Suoni, musica e vibrazione si disattivano dalle impostazioni; con "riduci animazioni" attivo sul telefono le animazioni si spengono.

## Account e salvataggio online

Niente login con Google: ogni giocatore crea il suo **profilo** alla prima apertura (dopo il tutorial). Account e salvataggio usano [Supabase](https://supabase.com) (progetto `f1-card-battle`, piano gratuito).

- **Profilo**: *nickname* (3–16 caratteri, unico), **avatar umano** da costruire perché ti somigli (carnagione, 12 acconciature, colore dei capelli, occhi e colore degli occhi, sopracciglia, bocca, barba, occhiali, colore della tuta da pilota; `src/components/PlayerAvatar.tsx`) e **pilota preferito**. Si modifica da *Impostazioni → Account*. Il nickname è quello che vedono amici e avversari.
- **Account anonimo**: il profilo è legato a un account anonimo di Supabase, creato sul telefono quando si crea il profilo. Niente email né password.
- **Username e codice di recupero**: lo username è il nickname tutto minuscolo, con `_` al posto degli spazi (cambia da solo se cambi nickname, ed è unico). Il codice di recupero (es. `ABCD-EFGH-JKLM`) si crea con il profilo ed è la password dell'account: non cambia mai. Con username e codice si accede allo stesso account da qualsiasi telefono o dal sito (*Hai già un account? Accedi con username e codice*); in *Impostazioni* ci sono i dati di accesso ed *Esci dall'account*. Ogni dispositivo ha il suo utente anonimo, collegato all'account nella tabella `account_links`: le carte restano sull'account. Sul server si salva solo l'impronta SHA-256 del codice.
- Si può rimandare con *Più tardi*: si gioca sul dispositivo (come prima, da ospite) e la creazione si ripropone alla prossima apertura. Le carte del dispositivo passano al profilo quando lo crei, se plausibili.
- **Carte del vecchio accesso con Google**: per i profili creati con Google è stato fatto un codice di recupero apposta (si salva solo l'impronta). Finché il profilo non ha un nickname basta il codice per accedere; poi si completa il profilo con nickname e avatar. I profili ripresi con le versioni precedenti (segnati come spostati, `moved_to`) portano da soli al nuovo account. Un telefono che ha ancora l'accesso Google esce da solo.
- **Privacy ed eliminazione dell'account**: le pagine `public/privacy.html` ed `public/elimina-account.html` (pubblicate con il sito) servono anche per Google Play. In *Impostazioni → Elimina account* si cancella tutto dal server, comprese le copie dei profili da cui l'account era stato recuperato.
- **Decide il server.** Pacchetti, crediti, acquisti, Jolly, premi delle missioni e partite passano dalla Edge Function `game`: il telefono chiede un'azione, il server la controlla con le stesse regole del gioco e salva. Nelle partite il server gioca un round alla volta, quindi il telefono non conosce mai in anticipo le carte della CPU. I telefoni possono solo leggere il proprio profilo, non scriverlo.
- Tabelle: `profiles` (una riga per account, con un numero di `version` per evitare che due richieste contemporanee si sovrascrivano), `matches`, `pvp_matches`, `friends`. Lo schema è in `supabase/migrations/`.
- Codice del server: la logica è in `src/server/actions.ts` (con i test), l'aggancio a Supabase in `server/edge.ts`. `npm run build:server` crea `supabase/functions/game/index.js`, che si pubblica come Edge Function `game` (entrypoint `index.js`, JWT obbligatorio). Il catalogo delle card il server lo scarica da `src/data/cards.json` sul branch `main`.
- URL e chiave *publishable* sono in `src/lib/supabase.ts`: sono pubblici per definizione (la protezione dei dati la fanno le regole RLS). Si possono sostituire con `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

### Configurazione (una volta sola)

**Supabase** → progetto `f1-card-battle` → *Authentication* → *Sign In / Providers* → attiva **Allow anonymous sign-ins**. Il provider Google si può spegnere: l'app non lo usa più.

## App Android

L'app Android è fatta con [Capacitor](https://capacitorjs.com): è lo stesso gioco del sito, dentro un'app (cartella `android/`).

- **APK di prova**: a ogni push sui branch `claude/**` e `main`, la GitHub Action *App Android* compila un APK di debug. Lo trovi in *Actions* → ultima esecuzione → *Artifacts* → `f1-card-battle-debug-apk`.
- La chiave di firma di debug (`android/app/debug.keystore`) è fissa e versionata, così l'impronta SHA-1 non cambia:
  `SHA-1 06:36:44:09:26:59:CE:0A:2E:6C:39:EB:73:D1:2B:FF:43:BD:24:7E`
  Per la pubblicazione sul Play Store servirà una chiave di rilascio separata (mai nel repository).

### Sviluppo locale dell'app

```bash
npm run build && npx cap sync android
npx cap open android   # apre Android Studio
```

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

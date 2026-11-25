# Suoni e musica

Di base il gioco usa suoni generati dal codice, in stile "jazz club" (piano elettrico, vibrafono, spazzole) per stare bene sopra la musica. Per sostituirne uno, metti qui un file con il **nome dell'effetto**
(mp3, ogg o wav): viene usato al posto di quello generato, senza toccare il codice.

| File | Quando suona |
|---|---|
| `tap` | tocco su pulsanti e menu |
| `select` | scegli una metrica |
| `flip` | la carta della CPU si gira |
| `roundWin` / `roundLose` / `roundTie` | esito del round |
| `victory` / `defeat` | fine partita |
| `pack` | apertura del pacchetto |
| `reveal` | giri una card |
| `rare` | esce una card Oro o Leggendaria |
| `music-menu-1`, `music-menu-2`, `music-menu-3`, … | musica fuori dalla partita: si alternano in ordine, finito uno parte il successivo |
| `music-match` | musica durante la partita, in loop; finita la partita riparte il brano menu successivo |

Consigli: effetti brevi (0,1–1 s) e leggeri (sotto 50 KB), musica in mp3/ogg a 96–128 kbps che giri in loop senza stacchi.
Usa solo audio con licenza che permette l'uso nel gioco (es. CC0) e annota la fonte qui sotto.

## Fonti dei file usati

Effetti: generati dal codice. Musiche da [Pixabay Music](https://pixabay.com/music/) (licenza Pixabay: uso gratuito anche commerciale, senza obbligo di citazione), convertite a 128 kbps con volume normalizzato:

- `music-menu-1.mp3`: "Coffee Jazz" di Aurec (pixabay id 593167)
- `music-menu-2.mp3`: "Cool Jazz" di Aurec (pixabay id 598432)

Generati dal codice con `scripts/jazzgen.py` (sintesi con numpy, nessuna licenza esterna), volume normalizzato a -19 LUFS, mp3 64 kbps:

- `music-match.mp3`: swing tranquillo (`python3 scripts/jazzgen.py swing out.wav 7`)
- `music-menu-3.mp3`: bossa nova (`python3 scripts/jazzgen.py bossa out.wav 11`)
- `music-menu-4.mp3`: valzer jazz (`python3 scripts/jazzgen.py waltz out.wav 5`)

Conversione: `ffmpeg -i out.wav -af "loudnorm=I=-19:TP=-2:LRA=11" -b:a 64k file.mp3`

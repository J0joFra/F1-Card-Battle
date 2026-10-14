import { useState } from 'react';
import { RARITY_LABEL } from '../game/cards';
import { PACK_ODDS, PACK_PRICE, PACK_SIZE, type Progress, type UnlockResult } from '../game/collection';
import { CardBack, CardView } from '../components/CardView';

interface Props {
  progress: Progress;
  onOpen: () => UnlockResult | null;
  onBuyPack: () => void;
}

export function PacksScreen({ progress, onOpen, onBuyPack }: Props) {
  const [opened, setOpened] = useState<UnlockResult | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>([]);

  function open() {
    const res = onOpen();
    if (!res) return;
    setOpened(res);
    setRevealed(Array(res.added.length).fill(false));
  }

  const allRevealed = revealed.length > 0 && revealed.every(Boolean);
  const gained = opened?.added.reduce((n, a) => n + a.credits, 0) ?? 0;

  if (opened) {
    return (
      <div className="packs">
        <div className="section-head">
          <h2>Pacchetto</h2>
          <span className="muted">Tocca le card per girarle</span>
        </div>
        <div className="pack-cards">
          {opened.added.map((a, i) =>
            revealed[i] ? (
              <div key={i} className="pack-slot flip-in">
                <CardView card={a.card} size="sm" />
                <span className={`tag ${a.duplicate ? 'dup' : 'new'}`}>
                  {a.duplicate ? `Doppione +${a.credits} crediti` : 'Nuova!'}
                </span>
              </div>
            ) : (
              <div key={i} className="pack-slot">
                <CardBack size="sm" onClick={() => setRevealed((r) => r.map((v, j) => (j === i ? true : v)))} />
              </div>
            ),
          )}
        </div>
        {allRevealed ? (
          <>
            {gained > 0 && <p className="muted center">Hai guadagnato {gained} crediti dai doppioni.</p>}
            {opened.unlockedCareers.map((c) => (
              <div key={c.id} className="unlock">
                <p>★ Hai completato tutte le scuderie di {c.driver.name}: card Carriera sbloccata!</p>
                <CardView card={c} />
              </div>
            ))}
            <div className="actions">
              <button className="btn primary" onClick={() => setOpened(null)}>
                Fatto
              </button>
            </div>
          </>
        ) : (
          <div className="actions">
            <button className="btn ghost" onClick={() => setRevealed((r) => r.map(() => true))}>
              Gira tutte
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="packs">
      <div className="section-head">
        <h2>Pacchetti</h2>
        <span className="muted">{progress.credits} crediti</span>
      </div>
      <div className="pack-hero">
        <div className={`pack ${progress.packs > 0 ? 'ready' : ''}`}>
          <span>F1</span>
          <small>{PACK_SIZE} card</small>
          {progress.packs > 0 && <span className="badge">{progress.packs}</span>}
        </div>
        <div className="pack-info">
          {progress.packs > 0 ? (
            <button className="btn primary big" onClick={open}>
              Apri pacchetto
            </button>
          ) : (
            <p>Nessun pacchetto da aprire. Vinci 5 sfide per guadagnarne uno.</p>
          )}
          <button className="btn ghost" onClick={onBuyPack} disabled={progress.credits < PACK_PRICE}>
            Compra un pacchetto ({PACK_PRICE} crediti)
          </button>
          <ul className="odds">
            {PACK_ODDS.map(([r, p]) => (
              <li key={r}>
                <span className={`dot rarity-${r}`} /> {RARITY_LABEL[r]} {Math.round(p * 100)}%
              </li>
            ))}
            <li className="muted">L'ultima card è sempre almeno Argento.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

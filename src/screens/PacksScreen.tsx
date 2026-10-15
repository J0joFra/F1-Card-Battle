import { useState } from 'react';
import type { Card } from '../types';
import { RARITY_LABEL, CARD_BY_ID } from '../game/cards';
import { JOLLY_CHANCE, PACK_ODDS, PACK_PRICE, PACK_SIZE, jollyTargets, type Progress, type UnlockResult } from '../game/collection';
import { CardBack, CardView } from '../components/CardView';

interface Props {
  progress: Progress;
  onOpen: () => UnlockResult | null;
  onBuyPack: () => void;
  onUseJolly: (card: Card) => void;
}

export function PacksScreen({ progress, onOpen, onBuyPack, onUseJolly }: Props) {
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
          {opened.jolly && allRevealed && (
            <div className="pack-slot flip-in">
              <div className="card card-sm jolly-card">
                <span>🃏</span>
                <b>Jolly</b>
                <small>Una card scuderia a scelta</small>
              </div>
              <span className="tag new">Bonus!</span>
            </div>
          )}
        </div>
        {allRevealed ? (
          <>
            {opened.jolly && (
              <p className="center jolly-note">
                🃏 Hai trovato un Jolly: usalo qui sotto per prendere una card scuderia mancante di un pilota che stai
                completando.
              </p>
            )}
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
            {progress.jolly > 0 && <JollyPicker progress={progress} onPick={onUseJolly} />}
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
            <li className="muted">🃏 Jolly bonus nel {Math.round(JOLLY_CHANCE * 100)}% dei pacchetti.</li>
          </ul>
        </div>
      </div>
      {progress.jolly > 0 && <JollyPicker progress={progress} onPick={onUseJolly} />}
    </div>
  );
}

function JollyPicker({ progress, onPick }: { progress: Progress; onPick: (card: Card) => void }) {
  const targets = jollyTargets(progress);
  return (
    <div className="jolly-picker">
      <h3>
        🃏 Hai {progress.jolly} Jolly da usare
      </h3>
      <p className="muted">
        Scegli una card scuderia mancante di un pilota che stai completando. Completate tutte, si sblocca la sua
        Carriera ★.
      </p>
      {targets.length === 0 ? (
        <p className="muted">Nessun pilota da completare per ora: tienilo per dopo.</p>
      ) : (
        <ul>
          {targets.map((t) => {
            const driver = CARD_BY_ID.get(`${t.driverId}__career`)!.driver;
            return (
              <li key={t.driverId}>
                <div>
                  <b>{driver.name}</b>{' '}
                  <span className="muted">
                    {t.owned}/{t.total} scuderie
                  </span>
                </div>
                <div className="jolly-options">
                  {t.missing.map((c) => (
                    <button key={c.id} className="chip" onClick={() => onPick(c)}>
                      {c.team.name} · {c.period}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

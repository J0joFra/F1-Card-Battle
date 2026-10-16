import { useEffect, useState } from 'react';
import type { Card } from '../types';
import { CARD_BY_ID, rarityLabel } from '../game/cards';
import { useI18n } from '../lib/i18n';
import { HelpButton } from '../components/TutorialSection';
import { WINS_PER_PACK } from '../game/collection';
import { JOLLY_CHANCE, PACK_ODDS, PACK_PRICE, PACK_SIZE, jollyTargets, type Progress, type UnlockResult } from '../game/collection';

export type OpenedPack = Omit<UnlockResult, 'progress'>;
import { CardBack, CardView } from '../components/CardView';
import { haptic, sfx } from '../lib/feedback';

const TEAR_MS = 750; // durata dell'animazione del pacchetto che si apre

interface Props {
  progress: Progress;
  onOpen: () => Promise<OpenedPack | null>; // null: niente da aprire o errore (già segnalato)
  onBuyPack: () => void;
  onUseJolly: (card: Card) => void;
}

export function PacksScreen({ progress, onOpen, onBuyPack, onUseJolly }: Props) {
  const { t } = useI18n();
  const [opened, setOpened] = useState<OpenedPack | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [tearing, setTearing] = useState(false);

  function open() {
    if (tearing || progress.packs <= 0) return;
    sfx('pack');
    haptic('medium');
    setTearing(true);
  }

  // il pacchetto trema e si strappa (intanto si apre, anche sul server), poi escono le card coperte
  useEffect(() => {
    if (!tearing) return;
    let alive = true;
    const minDelay = new Promise((r) => setTimeout(r, TEAR_MS));
    Promise.all([onOpen(), minDelay]).then(([res]) => {
      if (!alive) return;
      setTearing(false);
      if (!res) return;
      setOpened(res);
      setRevealed(Array(res.added.length).fill(false));
    });
    return () => {
      alive = false;
    };
  }, [tearing]); // eslint-disable-line react-hooks/exhaustive-deps

  function reveal(i: number) {
    if (!opened || revealed[i]) return;
    const rare = opened.added[i].card.rarity === 'oro' || opened.added[i].card.rarity === 'leggendaria';
    sfx(rare ? 'rare' : 'reveal');
    haptic(rare ? 'success' : 'light');
    setRevealed((r) => r.map((v, j) => (j === i ? true : v)));
  }

  // "gira tutte": una alla volta, così ogni card ha il suo momento
  function revealAll() {
    revealed.forEach((done, i) => {
      if (!done) setTimeout(() => reveal(i), 160 * i);
    });
  }

  const allRevealed = revealed.length > 0 && revealed.every(Boolean);
  const gained = opened?.added.reduce((n, a) => n + a.credits, 0) ?? 0;

  if (opened) {
    return (
      <div className="screen packs">
        <header className="screen-head">
          <h2>{t('p_opened')}</h2>
          <span className="muted">{t('p_tapToFlip')}</span>
        </header>
        <div className="pack-cards">
          {opened.added.map((a, i) =>
            revealed[i] ? (
              <div key={i} className={`pack-slot flip-in ${a.card.rarity === 'oro' || a.card.rarity === 'leggendaria' ? `burst burst-${a.card.rarity}` : ''}`}>
                <CardView card={a.card} size="sm" />
                <span className={`tag ${a.duplicate ? 'dup' : 'new'}`}>
                  {a.duplicate ? t('p_dup', { n: a.credits }) : t('p_new')}
                </span>
              </div>
            ) : (
              <div key={i} className="pack-slot deal-in" style={{ animationDelay: `${i * 90}ms` }}>
                <CardBack size="sm" onClick={() => reveal(i)} />
              </div>
            ),
          )}
          {opened.jolly && allRevealed && (
            <div className="pack-slot flip-in">
              <div className="card card-sm jolly-card">
                <span>🃏</span>
                <b>{t('p_jolly')}</b>
                <small>{t('p_jollyDesc')}</small>
              </div>
              <span className="tag new">{t('p_bonus')}</span>
            </div>
          )}
        </div>
        {allRevealed ? (
          <>
            {opened.jolly && (
              <p className="center jolly-note">{t('p_jollyFound')}</p>
            )}
            {gained > 0 && <p className="muted center">{t('p_gained', { n: gained })}</p>}
            {opened.unlockedCareers.map((c) => (
              <div key={c.id} className="unlock">
                <p>{t('p_careerUnlocked', { name: c.driver.name })}</p>
                <CardView card={c} />
              </div>
            ))}
            <div className="actions">
              <button className="btn primary big" onClick={() => setOpened(null)}>
                {t('done')}
              </button>
            </div>
            {progress.jolly > 0 && <JollyPicker progress={progress} onPick={onUseJolly} />}
          </>
        ) : (
          <div className="actions">
            <button className="btn ghost" onClick={revealAll}>
              {t('p_flipAll')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="screen packs">
      <header className="screen-head">
        <h2>{t('p_title')}</h2>
        <HelpButton items={['tut_packs_1', 'tut_packs_2', 'tut_packs_3', 'tut_packs_4']} params={{ n: PACK_SIZE, j: Math.round(JOLLY_CHANCE * 100) }} />
      </header>
      <div className="pack-hero">
        <button className={`pack ${progress.packs > 0 ? 'ready' : ''} ${tearing ? 'tearing' : ''}`} onClick={open} disabled={progress.packs === 0}>
          <span>F1</span>
          <small>{t('p_cards', { n: PACK_SIZE })}</small>
          {progress.packs > 0 && <span className="badge">{progress.packs}</span>}
        </button>
        {progress.packs > 0 ? (
          <button className="btn primary big block" onClick={open} disabled={tearing}>
            {t('p_open')}
          </button>
        ) : (
          <p className="muted center">🏆 {progress.winsTowardPack}/{WINS_PER_PACK}</p>
        )}
        <button className="btn ghost block" onClick={onBuyPack} disabled={progress.credits < PACK_PRICE}>
          {t('p_buyShort')} · 🪙 {PACK_PRICE}
        </button>
      </div>
      {progress.jolly > 0 && <JollyPicker progress={progress} onPick={onUseJolly} />}
      <ul className="odds-chips" aria-label={t('p_odds')}>
        {PACK_ODDS.map(([r, p]) => (
          <li key={r} title={rarityLabel(r)}>
            <span className={`dot rarity-${r}`} /> {Math.round(p * 100)}%
          </li>
        ))}
        <li title={t('p_jolly')}>🃏 {Math.round(JOLLY_CHANCE * 100)}%</li>
      </ul>
    </div>
  );
}

function JollyPicker({ progress, onPick }: { progress: Progress; onPick: (card: Card) => void }) {
  const { t } = useI18n();
  const targets = jollyTargets(progress).slice(0, 6); // i piloti più vicini al completamento
  return (
    <div className="jolly-picker">
      <h3>{t('j_title', { n: progress.jolly })}</h3>
      <p className="muted">{t('j_desc')}</p>
      {targets.length === 0 ? (
        <p className="muted">{t('j_none')}</p>
      ) : (
        <ul>
          {targets.map((tg) => {
            const driver = CARD_BY_ID.get(`${tg.driverId}__career`)!.driver;
            return (
              <li key={tg.driverId}>
                <div>
                  <b>{driver.name}</b> <span className="muted">{t('j_teams', { a: tg.owned, b: tg.total })}</span>
                </div>
                <div className="jolly-options">
                  {tg.missing.map((c) => (
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

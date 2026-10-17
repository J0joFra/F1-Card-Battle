import { useEffect, useState, type CSSProperties } from 'react';
import type { Card } from '../types';
import { CARD_BY_ID } from '../game/cards';
import { useI18n } from '../lib/i18n';
import { HelpButton } from '../components/TutorialSection';
import { WINS_PER_PACK } from '../game/collection';
import { JOLLY_CHANCE, PACK_SIZE, jollyTargets, type Progress, type UnlockResult } from '../game/collection';
import { PACK_TYPES, isUseful, storePrice, teamOfDay, type PackKind } from '../game/shop';
import { teamColor } from '../game/teamColors';
import { FlipCard } from '../components/FlipCard';
import { askConfirm } from '../components/ConfirmDialog';

export type OpenedPack = Omit<UnlockResult, 'progress'>;
import { CardBack, CardView } from '../components/CardView';
import { haptic, sfx } from '../lib/feedback';

const TEAR_MS = 750; // durata dell'animazione del pacchetto che si apre

interface Props {
  progress: Progress;
  today: string;
  // apre un pacchetto: senza tipo uno dei tuoi; Premium o Scuderia vengono comprati e aperti subito.
  // null: niente da aprire o errore (già segnalato)
  onOpen: (kind?: BuyNowKind) => Promise<OpenedPack | null>;
  onBuyPack: () => void; // compra un Classico (va tra i tuoi pacchetti)
  onBuyCard: (card: Card) => void; // card del giorno
  onUseJolly: (card: Card) => void;
}

type BuyNowKind = Exclude<PackKind, 'classic'>;

// tempo fino a mezzanotte (quando cambiano le card del giorno)
function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const m = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function PacksScreen({ progress, today, onOpen, onBuyPack, onBuyCard, onUseJolly }: Props) {
  const { t } = useI18n();
  const [opened, setOpened] = useState<OpenedPack | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [tearing, setTearing] = useState<null | 'mine' | BuyNowKind>(null);
  const [clock, setClock] = useState(untilMidnight);
  useEffect(() => {
    const id = setInterval(() => setClock(untilMidnight()), 30_000);
    return () => clearInterval(id);
  }, []);
  const team = teamOfDay(today);
  const store = progress.store?.date === today ? progress.store : null;
  const packName = (k: PackKind) => (k === 'team' ? team.name : t(k === 'classic' ? 'shop_classic' : 'shop_premium'));

  function open() {
    if (tearing || progress.packs <= 0) return;
    sfx('pack');
    haptic('medium');
    setTearing('mine');
  }

  async function buy(kind: PackKind) {
    if (tearing) return;
    const { price } = PACK_TYPES[kind];
    if (!(await askConfirm(t('shop_confirm', { name: packName(kind) }), { confirmLabel: `🪙 ${price}` }))) return;
    if (kind === 'classic') return onBuyPack();
    sfx('pack');
    haptic('medium');
    setTearing(kind);
  }

  // il pacchetto trema e si strappa (intanto si apre, anche sul server), poi escono le card coperte
  useEffect(() => {
    if (!tearing) return;
    let alive = true;
    const minDelay = new Promise((r) => setTimeout(r, TEAR_MS));
    Promise.all([onOpen(tearing === 'mine' ? undefined : tearing), minDelay]).then(([res]) => {
      if (!alive) return;
      setTearing(null);
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
    const rare = ['oro', 'platino', 'leggendaria', 'pioniere'].includes(opened.added[i].card.rarity);
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
              <div key={i} className={`pack-slot flip-in ${['oro', 'platino', 'leggendaria', 'pioniere'].includes(a.card.rarity) ? `burst burst-${a.card.rarity}` : ''}`}>
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

  const heroKind: PackKind = tearing && tearing !== 'mine' ? tearing : 'classic';
  return (
    <div className="screen packs shop">
      <header className="screen-head">
        <h2>{t('shop_title')}</h2>
        <HelpButton
          items={['tut_packs_1', 'tut_packs_2', 'tut_packs_3', 'tut_packs_4', 'tut_shop_1', 'tut_shop_2']}
          params={{ n: PACK_SIZE, j: Math.round(JOLLY_CHANCE * 100) }}
        />
      </header>

      {/* i tuoi pacchetti (vinti o comprati) */}
      <div className="pack-hero">
        <button
          className={`pack pack-${heroKind} ${progress.packs > 0 ? 'ready' : ''} ${tearing ? 'tearing' : ''}`}
          style={heroKind === 'team' ? ({ '--team': teamColor(team.id) } as CSSProperties) : undefined}
          onClick={open}
          disabled={progress.packs === 0 && !tearing}
        >
          <span>F1</span>
          <small>{packName(heroKind)}</small>
          {progress.packs > 0 && !tearing && <span className="badge">{progress.packs}</span>}
        </button>
        {progress.packs > 0 ? (
          <button className="btn primary big block" onClick={open} disabled={!!tearing}>
            {t('p_open')}
          </button>
        ) : (
          <p className="muted center">🏆 {progress.winsTowardPack}/{WINS_PER_PACK}</p>
        )}
      </div>
      {progress.jolly > 0 && <JollyPicker progress={progress} onPick={onUseJolly} />}

      {/* tre tipi di pacchetto */}
      <h3 className="shop-title">{t('shop_packs')}</h3>
      <div className="shop-packs">
        {(['classic', 'premium', 'team'] as PackKind[]).map((k) => {
          const type = PACK_TYPES[k];
          return (
            <button
              key={k}
              className={`shop-pack shop-${k}`}
              style={k === 'team' ? ({ '--team': teamColor(team.id) } as CSSProperties) : undefined}
              onClick={() => buy(k)}
              disabled={!!tearing || progress.credits < type.price}
            >
              <span className="mini-pack">F1</span>
              <b>{packName(k)}</b>
              <small>{t(k === 'classic' ? 'shop_classic_sub' : k === 'premium' ? 'shop_premium_sub' : 'shop_team_sub', { n: type.size })}</small>
              <span className="price">🪙 {type.price}</span>
            </button>
          );
        })}
      </div>

      {/* card del giorno */}
      <h3 className="shop-title">
        {t('shop_daily')} <small className="muted">⏱ {clock}</small>
      </h3>
      {!store ? (
        <p className="muted center">…</p>
      ) : (
        <div className="shop-cards">
          {store.cards.map((id) => {
            const card = CARD_BY_ID.get(id);
            if (!card) return null;
            const owned = !!progress.owned[id];
            const bought = store.bought.includes(id);
            const price = storePrice(card);
            const buyBtn = (
              <button
                className={`btn ${owned || bought ? 'ghost' : 'primary'} block`}
                onClick={() => onBuyCard(card)}
                disabled={owned || bought || progress.credits < price}
              >
                {bought || owned ? `✓ ${t('shop_owned')}` : `🪙 ${price}`}
              </button>
            );
            return (
              <div key={id} className={`shop-card ${bought || owned ? 'sold' : ''}`}>
                <FlipCard
                  card={card}
                  badge={!owned && isUseful(progress, card) ? <span className="pick-badge useful">🎯 {t('shop_useful')}</span> : undefined}
                  action={!owned && !bought ? buyBtn : undefined}
                />
                {buyBtn}
              </div>
            );
          })}
        </div>
      )}
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

import { useEffect, useState, type CSSProperties } from 'react';
import { coin } from '../lib/season';
import type { Card } from '../types';
import { CARD_BY_ID } from '../game/cards';
import { useI18n } from '../lib/i18n';
import { HelpButton } from '../components/TutorialSection';
import { WINS_PER_PACK } from '../game/collection';
import { BOOST_MAX, BOOST_PRICE, JOLLY_CHANCE, PACK_SIZE, boostsOf, jollyTargets, type Progress, type UnlockResult } from '../game/collection';
import { JOLLY_KINDS, type JollyKind } from '../game/engine';
import { PACK_TYPES, isUseful, storePrice, teamOfDay, type PackKind } from '../game/shop';
import { teamColor } from '../game/teamColors';
import { FlipCard } from '../components/FlipCard';
import { askConfirm } from '../components/ConfirmDialog';

export type OpenedPack = Omit<UnlockResult, 'progress'>;
import { CardBack, CardView } from '../components/CardView';
import { haptic, sfx } from '../lib/feedback';
import { LOGIN_REWARDS, loginStatus, type LoginReward } from '../game/loginReward';

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
  onBuyJolly: (kind: JollyKind) => void; // jolly di gara (DRS, Safety Car)
  onClaimLogin: () => void; // premio giornaliero
}

type BuyNowKind = Exclude<PackKind, 'classic'>;

// tempo fino a mezzanotte (quando cambiano le card del giorno)
function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const m = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function PacksScreen({ progress, today, onOpen, onBuyPack, onBuyCard, onUseJolly, onBuyJolly, onClaimLogin }: Props) {
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
  const packName = (k: PackKind) => t(k === 'classic' ? 'shop_classic' : k === 'premium' ? 'shop_premium' : 'shop_team');

  function open() {
    if (tearing || progress.packs <= 0) return;
    sfx('pack');
    haptic('medium');
    setTearing('mine');
  }

  async function buy(kind: PackKind) {
    if (tearing) return;
    const { price } = PACK_TYPES[kind];
    if (!(await askConfirm(t('shop_confirm', { name: packName(kind) }), { confirmLabel: `${coin()} ${price}` }))) return;
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
    const rare = ['oro', 'platino', 'leggendaria', 'pioniere', 'classica'].includes(opened.added[i].card.rarity);
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
              <div key={i} className={`pack-slot flip-in ${['oro', 'platino', 'leggendaria', 'pioniere', 'classica'].includes(a.card.rarity) ? `burst burst-${a.card.rarity}` : ''}`}>
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

      <LoginRewardPanel progress={progress} today={today} onClaim={onClaimLogin} />

      {/* i tuoi pacchetti (vinti o comprati): il pacchetto sotto i riflettori, a fianco il conteggio e "Apri" */}
      <div className={`pack-hero shop-hero ${progress.packs > 0 ? 'has' : ''}`}>
        <span className="sh-spot" aria-hidden />
        <span className="sh-sparks" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </span>
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
        <div className="sh-side">
          <small>{t('shop_yourPacks')}</small>
          <b className="sh-count">{progress.packs}</b>
          {progress.packs > 0 ? (
            <button className="btn primary big block" onClick={open} disabled={!!tearing}>
              {t('p_open')}
            </button>
          ) : (
            <>
              <div className="bar small">
                <div style={{ width: `${(progress.winsTowardPack / WINS_PER_PACK) * 100}%` }} />
              </div>
              <small className="sh-next">
                🏆 {t('home_winsOf', { a: progress.winsTowardPack, b: WINS_PER_PACK })}
              </small>
            </>
          )}
        </div>
      </div>
      {progress.jolly > 0 && <JollyPicker progress={progress} onPick={onUseJolly} />}

      {/* tre tipi di pacchetto */}
      <h3 className="shop-title">
        <span>🎁 {t('shop_packs')}</span>
      </h3>
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
              <small>{t(k === 'classic' ? 'shop_classic_sub' : k === 'premium' ? 'shop_premium_sub' : 'shop_team_sub', { n: type.size, team: team.name })}</small>
              <span className="price">
                {coin()} {type.price}
              </span>
              <span className="sp-shine" aria-hidden />
            </button>
          );
        })}
      </div>

      {/* card del giorno */}
      <h3 className="shop-title">
        <span>🃏 {t('shop_daily')}</span> <small className="sh-clock">⏱ {clock}</small>
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
                className={`btn small ${owned || bought ? 'ghost' : 'primary'} block`}
                onClick={() => onBuyCard(card)}
                disabled={owned || bought || progress.credits < price}
              >
                {bought || owned ? '✓' : `${coin()} ${price}`}
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
      {/* jolly di gara: sempre in vendita, al massimo BOOST_MAX per tipo */}
      <h3 className="shop-title">
        <span>⚡ {t('rj_title')}</span>
      </h3>
      <p className="muted small rj-note">{t('rj_note', { n: BOOST_MAX })}</p>
      <div className="rj-list">
        {JOLLY_KINDS.map((k) => {
          const n = boostsOf(progress, k);
          return (
            <div key={k} className={`rj-item rj-${k}`}>
              <span className="rj-icon" aria-hidden>
                {k === 'drs' ? 'DRS' : 'SC'}
              </span>
              <div className="rj-text">
                <b>
                  {t(k === 'drs' ? 'rj_drs' : 'rj_sc')} <span className="muted">{n}/{BOOST_MAX}</span>
                </b>
                <small>{t(k === 'drs' ? 'rj_drs_desc' : 'rj_sc_desc')}</small>
              </div>
              <button
                className="btn primary small"
                onClick={() => onBuyJolly(k)}
                disabled={n >= BOOST_MAX || progress.credits < BOOST_PRICE}
              >
                {n >= BOOST_MAX ? t('rj_full') : `${coin()} ${BOOST_PRICE}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Jolly accumulati: restano salvati finché vuoi. Le card mancanti si possono girare per confrontare le metriche
// e si sceglie con calma; prima di usarlo si chiede conferma.
function JollyPicker({ progress, onPick }: { progress: Progress; onPick: (card: Card) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const targets = jollyTargets(progress);
  const shown = all ? targets : targets.slice(0, 4); // prima i piloti più vicini al completamento
  async function pick(c: Card) {
    const ok = await askConfirm(t('j_confirm', { card: `${c.driver.name} · ${c.team.name} ${c.period}` }), {
      confirmLabel: t('j_use'),
    });
    if (ok) onPick(c);
  }
  return (
    <div className="jolly-picker">
      <div className="jolly-head">
        <h3>{t('j_title', { n: progress.jolly })}</h3>
        {targets.length > 0 && (
          <button className="btn ghost small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? t('j_hide') : t('j_choose')}
          </button>
        )}
      </div>
      <p className="muted">{targets.length ? t('j_keep') : t('j_none')}</p>
      {open && (
        <>
          <p className="muted small">{t('j_desc')}</p>
          <ul>
            {shown.map((tg) => {
              const driver = CARD_BY_ID.get(`${tg.driverId}__career`)!.driver;
              return (
                <li key={tg.driverId}>
                  <div>
                    <b>{driver.name}</b> <span className="muted">{t('j_teams', { a: tg.owned, b: tg.total })}</span>
                  </div>
                  <div className="jolly-options">
                    {tg.missing.map((c) => (
                      <div key={c.id} className="jolly-option">
                        <FlipCard
                          card={c}
                          action={
                            <button className="btn primary" onClick={() => void pick(c)}>
                              🃏 {t('j_take')}
                            </button>
                          }
                        />
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          {targets.length > shown.length && (
            <button className="btn text block" onClick={() => setAll(true)}>
              {t('j_more', { n: targets.length - shown.length })}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Premio giornaliero: sette caselle, quella di oggi da ritirare; se salti un giorno si riparte dal giorno 1.
function rewardLabel(r: LoginReward) {
  const parts: string[] = [];
  if (r.jolly) parts.push(`🃏 ${r.jolly}`);
  if (r.packs) parts.push(`🎁 ${r.packs}`);
  if (r.boost) parts.push(r.boost === 'drs' ? 'DRS' : 'SC');
  if (r.credits) parts.push(`${coin()} ${r.credits}`);
  return parts;
}

function LoginRewardPanel({ progress, today, onClaim }: { progress: Progress; today: string; onClaim: () => void }) {
  const { t } = useI18n();
  const { day, claimed } = loginStatus(progress, today);
  return (
    <section className={`panel login-reward ${claimed ? 'claimed' : 'ready'}`}>
      <div className="lr-head">
        <b>🎁 {t('lr_title')}</b>
        <small className="muted">{t('lr_dayOf', { n: day, max: LOGIN_REWARDS.length })}</small>
      </div>
      <ol className="lr-days">
        {LOGIN_REWARDS.map((r, i) => {
          const n = i + 1;
          const state = n < day || (n === day && claimed) ? 'done' : n === day ? 'today' : 'next';
          return (
            <li key={n} className={`lr-day ${state} ${n === LOGIN_REWARDS.length ? 'big' : ''}`}>
              <small>{t('lr_day', { n })}</small>
              <span className="lr-gift">
                {rewardLabel(r).map((x) => (
                  <b key={x}>{x}</b>
                ))}
              </span>
              {state === 'done' && <span className="lr-check">✓</span>}
            </li>
          );
        })}
      </ol>
      {claimed ? (
        <p className="lr-note">{t('lr_tomorrow', { n: (day % LOGIN_REWARDS.length) + 1 })}</p>
      ) : (
        <button className="btn primary block lr-claim" onClick={onClaim}>
          {t('lr_claim')} · {rewardLabel(LOGIN_REWARDS[day - 1]).join(' + ')}
        </button>
      )}
      <small className="muted lr-hint">{t('lr_hint')}</small>
    </section>
  );
}

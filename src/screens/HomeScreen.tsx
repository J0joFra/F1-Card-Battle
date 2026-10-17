import { Check, Gift, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '../lib/i18n';
import {
  DECK_SLOTS,
  TOTAL_CARDS,
  WINS_PER_PACK,
  activeSlot,
  collectionSize,
  ownedCards,
  savedDeck,
  type Progress,
} from '../game/collection';
import { deckProblems } from '../game/deckRules';
import { DECK_SIZE } from '../game/engine';
import type { Account } from '../hooks/useAccount';
import { CardView } from '../components/CardView';
import { GoogleIcon } from '../components/GoogleIcon';
import { HelpButton } from '../components/TutorialSection';
import { DailyCard, MissionsPanel } from '../components/Daily';
import type { DailyChallenge, MissionsState } from '../game/daily';

interface Props {
  progress: Progress;
  account: Account;
  challenge: DailyChallenge;
  missions: MissionsState;
  onPlay: () => void; // partita contro la CPU con il mazzo in uso
  onDeck: (slot: number) => void; // cambia il mazzo in uso
  onDaily: () => void;
  onFriend: () => void;
  onClaim: (i: number) => void;
  onPacks: () => void;
}

export function HomeScreen({
  progress,
  account,
  challenge,
  missions,
  onPlay,
  onDeck,
  onDaily,
  onFriend,
  onClaim,
  onPacks,
}: Props) {
  const { t } = useI18n();
  const owned = collectionSize(progress);
  const canPlay = owned >= DECK_SIZE;

  const slot = activeSlot(progress);
  const decks = useMemo(() => Array.from({ length: DECK_SLOTS }, (_, i) => savedDeck(progress, i)), [progress]);
  // vetrina: le tre card migliori del mazzo in uso (o della collezione, se il mazzo è vuoto), a ventaglio
  const showcase = useMemo(
    () => [...(decks[slot].length ? decks[slot] : ownedCards(progress))].sort((a, b) => b.ovr - a.ovr).slice(0, 3),
    [decks, slot, progress]
  );

  return (
    <div className="screen home">
      <section className="garage">
        <div className="garage-help">
          <HelpButton
            items={['tut_home_1', 'tut_home_2', 'tut_home_3', 'tut_home_4', 'tut_home_5']}
            params={{ n: DECK_SIZE, w: WINS_PER_PACK }}
          />
        </div>
        <div className="fan" onClick={canPlay ? onPlay : undefined} role="button" aria-label={t('home_play')}>
          {showcase.map((c, i) => (
            <div key={c.id} className={`fan-card fan-${i}`}>
              <CardView card={c} size="sm" />
            </div>
          ))}
        </div>
        <h1>{t('home_title')}</h1>
        {canPlay && (
          <div className="deck-tabs home-decks" role="tablist" aria-label={t('home_deck')}>
            <span className="muted">{t('home_deck')}</span>
            {decks.map((d, i) => (
              <button key={i} role="tab" aria-selected={i === slot} className={i === slot ? 'on' : ''} onClick={() => onDeck(i)}>
                {i + 1}
                {d.length === DECK_SIZE && !deckProblems(d).length && <Check size={12} />}
              </button>
            ))}
          </div>
        )}
        <button className="btn ghost block friend-btn" onClick={onFriend}>
          <Users size={18} /> {t('home_friend')}
        </button>
        {!canPlay && <p className="muted">{t('home_needCards', { n: DECK_SIZE })}</p>}
      </section>

      <DailyCard challenge={challenge} state={progress.daily} canPlay={canPlay} onPlay={onDaily} />
      <MissionsPanel missions={missions} onClaim={onClaim} />

      <section className="panel pack-progress">
        <div className="row">
          <span>
            <Gift size={16} /> {t('home_nextPack')}
          </span>
          <span className="muted">{t('home_winsOf', { a: progress.winsTowardPack, b: WINS_PER_PACK })}</span>
        </div>
        <div className="bar">
          <div style={{ width: `${(progress.winsTowardPack / WINS_PER_PACK) * 100}%` }} />
        </div>
        {progress.packs > 0 && (
          <button className="btn accent block" onClick={onPacks}>
            🎁 {progress.packs === 1 ? t('home_packReady') : t('home_packsReady', { n: progress.packs })}
          </button>
        )}
      </section>

      <section className="stats-row">
        <div className="tile">
          <small>{t('home_wins')}</small>
          <b>{progress.wins}</b>
        </div>
        <div className="tile">
          <small>{t('home_losses')}</small>
          <b>{progress.losses}</b>
        </div>
        <div className="tile">
          <small>{t('home_collection')}</small>
          <b>
            {owned}
            <span className="muted">/{TOTAL_CARDS}</span>
          </b>
        </div>
      </section>

      {!account.session && (
        <button className="btn google block cloud-btn" onClick={account.signIn}>
          <GoogleIcon /> {t('home_cloud_t')}
        </button>
      )}
    </div>
  );
}

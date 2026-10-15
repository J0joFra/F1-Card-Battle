import { Gift, Play, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '../lib/i18n';
import { TOTAL_CARDS, WINS_PER_PACK, collectionSize, ownedCards, type Progress } from '../game/collection';
import { DECK_SIZE } from '../game/engine';
import type { Account } from '../hooks/useAccount';
import { CardView } from '../components/CardView';
import { GoogleIcon } from '../components/GoogleIcon';
import { TutorialSection } from '../components/TutorialSection';
import { DailyCard, MissionsPanel } from '../components/Daily';
import type { DailyChallenge, MissionsState } from '../game/daily';

const RARITY_RANK = { leggendaria: 3, oro: 2, argento: 1, bronzo: 0 } as const;

interface Props {
  progress: Progress;
  account: Account;
  challenge: DailyChallenge;
  missions: MissionsState;
  onPlay: () => void;
  onDaily: () => void;
  onFriend: () => void;
  onClaim: (i: number) => void;
  onPacks: () => void;
}

export function HomeScreen({ progress, account, challenge, missions, onPlay, onDaily, onFriend, onClaim, onPacks }: Props) {
  const { t } = useI18n();
  const owned = collectionSize(progress);
  const canPlay = owned >= DECK_SIZE;

  // vetrina: le tre card più rare della collezione, a ventaglio
  const showcase = useMemo(
    () =>
      ownedCards(progress)
        .sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.stats.puntiGara - a.stats.puntiGara)
        .slice(0, 3),
    [progress],
  );

  return (
    <div className="screen home">
      <section className="garage">
        <div className="fan">
          {showcase.map((c, i) => (
            <div key={c.id} className={`fan-card fan-${i}`}>
              <CardView card={c} size="sm" />
            </div>
          ))}
        </div>
        <h1>{t('home_title')}</h1>
        <p>{t('home_sub', { n: DECK_SIZE })}</p>
        <button className="play-btn" onClick={onPlay} disabled={!canPlay}>
          <Play size={28} fill="currentColor" />
          {t('home_play')}
        </button>
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
        <section className="panel cloud-cta">
          <div>
            <b>☁️ {t('home_cloud_t')}</b>
            <p className="muted">{t('home_cloud_d')}</p>
          </div>
          <button className="btn google block" onClick={account.signIn}>
            <GoogleIcon /> {t('signin_google')}
          </button>
        </section>
      )}

      <TutorialSection items={['tut_home_1', 'tut_home_2', 'tut_home_3', 'tut_home_4', 'tut_home_5']} params={{ n: DECK_SIZE, w: WINS_PER_PACK }} />
    </div>
  );
}

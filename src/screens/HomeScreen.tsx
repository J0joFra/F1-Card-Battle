import { Gift, Users, Zap } from 'lucide-react';
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
import { fitsMode, type MatchMode } from '../game/deckRules';
import { ModePicker, modeLabel, modeReady } from '../components/ModePicker';
import { DECK_SIZE } from '../game/engine';
import type { Account } from '../hooks/useAccount';
import { CardView } from '../components/CardView';
import { HelpButton } from '../components/TutorialSection';
import { DailyCard, MissionsPanel } from '../components/Daily';
import { themeMode, type DailyChallenge, type MissionsState } from '../game/daily';

interface Props {
  progress: Progress;
  account: Account;
  challenge: DailyChallenge;
  missions: MissionsState;
  mode: MatchMode; // modalità scelta per la partita veloce
  onMode: (m: MatchMode) => void;
  onPlay: () => void; // partita veloce contro la CPU
  onDeck: (slot: number) => void; // cambia il mazzo in uso (partita classica)
  onDaily: () => void;
  onFriend: () => void;
  onClaim: (i: number) => void;
  onPacks: () => void;
  onProfile: () => void; // crea il profilo (salvataggio online e sfide tra amici)
}

export function HomeScreen({
  progress,
  account,
  challenge,
  missions,
  mode,
  onMode,
  onPlay,
  onDeck,
  onDaily,
  onFriend,
  onClaim,
  onPacks,
  onProfile,
}: Props) {
  const { t } = useI18n();
  const owned = collectionSize(progress);
  const canPlay = owned >= DECK_SIZE;

  const slot = activeSlot(progress);
  const decks = useMemo(() => Array.from({ length: DECK_SLOTS }, (_, i) => savedDeck(progress, i)), [progress]);
  // vetrina: le tre card migliori del mazzo in uso (o della collezione, se il mazzo è vuoto), a ventaglio
  const mine = useMemo(() => ownedCards(progress), [progress]);
  const showcase = useMemo(() => {
    const base = mode.kind === 'classic' && decks[slot].length ? decks[slot] : mine.filter((c) => fitsMode(mode, c));
    return [...(base.length ? base : mine)].sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  }, [decks, slot, mine, mode]);
  const ready = useMemo(() => modeReady(mode, mine), [mode, mine]);
  const daily = useMemo(() => modeReady(themeMode(challenge.theme), mine), [challenge, mine]);

  return (
    <div className="screen home">
      <section className="garage">
        <div className="garage-help">
          <HelpButton
            items={['tut_home_1', 'tut_home_2', 'tut_home_3', 'tut_home_4', 'tut_home_5']}
            params={{ n: DECK_SIZE, w: WINS_PER_PACK }}
          />
        </div>
        <div className="fan" aria-hidden>
          {showcase.map((c, i) => (
            <div key={c.id} className={`fan-card fan-${i}`}>
              <CardView card={c} size="sm" />
            </div>
          ))}
        </div>
        {canPlay ? (
          <>
            <ModePicker mode={mode} owned={mine} decks={decks} slot={slot} onMode={onMode} onDeck={onDeck} />
            <div className="play-buttons">
              <button className="btn primary big play-quick" onClick={onPlay} disabled={!ready.ok}>
                <Zap size={20} fill="currentColor" />
                <span>
                  {t('home_quick')}
                  <small>{modeLabel(mode, t)}</small>
                </span>
              </button>
              <button className="btn big play-friend" onClick={onFriend}>
                <Users size={20} />
                <span>{t('home_friend')}</span>
              </button>
            </div>
            {!ready.ok && <p className="muted small-text">{t('mode_need', { n: DECK_SIZE, m: ready.have })}</p>}
          </>
        ) : (
          <p className="muted">{t('home_needCards', { n: DECK_SIZE })}</p>
        )}
      </section>

      <DailyCard challenge={challenge} state={progress.daily} canPlay={daily.ok} have={daily.have} onPlay={onDaily} />
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

      {!account.online && (
        <button className="btn primary block cloud-btn" onClick={onProfile}>
          {t('pr_createTitle')}
        </button>
      )}
    </div>
  );
}

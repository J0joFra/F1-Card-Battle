import { ChevronRight, Dumbbell, Gift, Trophy, Users, X, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import type { Rules } from '../App';
import { CPU_LEVELS, type CpuLevel } from '../game/engine';
import { LEVEL_CREDITS } from '../game/match';
import { coin } from '../lib/season';
import { CardView } from '../components/CardView';
import { HelpButton } from '../components/TutorialSection';
import { DailyCard, MissionsPanel } from '../components/Daily';
import { LeagueBadge, leagueName } from '../components/Ranked';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { leagueProgress, rankedOf } from '../game/ranked';
import { themeMode, type DailyChallenge, type MissionsState } from '../game/daily';

interface Props {
  progress: Progress;
  account: Account;
  challenge: DailyChallenge;
  missions: MissionsState;
  mode: MatchMode; // modalità scelta per la partita veloce
  onMode: (m: MatchMode) => void;
  rules: Rules; // Strategica (mano di 3 carte + jolly) o Tradizionale
  onRules: (r: Rules) => void;
  level: CpuLevel; // livello della CPU nella partita veloce
  onLevel: (l: CpuLevel) => void;
  onPlay: () => void; // partita veloce contro la CPU
  onDeck: (slot: number) => void; // cambia il mazzo in uso (partita classica)
  onDaily: () => void;
  onFriend: () => void;
  onRanked: () => void; // gara classificata online
  onLeagues: () => void; // sezione Campionati
  rankedBusy: boolean;
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
  rules,
  onRules,
  level,
  onLevel,
  onPlay,
  onDeck,
  onDaily,
  onFriend,
  onRanked,
  onLeagues,
  rankedBusy,
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

  const [training, setTraining] = useState(false);
  const { points } = rankedOf(progress);
  const { league, ratio } = leagueProgress(points);
  const profile = account.online ? account.profile : null;
  const trainingSub = [mode.kind !== 'classic' && modeLabel(mode, t), t(rules === 'hand' ? 'rules_hand' : 'rules_classic'), t(`lvl_${level}`)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="screen home">
      {/* il tuo profilo: nickname, campionato e coppe (tocca per la sezione Ranked) */}
      {profile ? (
        <button className="player-bar" onClick={onLeagues}>
          <PlayerAvatar avatar={profile.avatar} size={44} />
          <span className="pb-name">
            <b>{profile.nickname}</b>
            <small>{leagueName(league, t)}</small>
          </span>
          <span className="pb-cups">
            <Trophy size={16} /> {points}
          </span>
          <LeagueBadge league={league} size={40} />
        </button>
      ) : (
        <button className="player-bar guest" onClick={onProfile}>
          <span className="pb-name">
            <b>{t('pr_createTitle')}</b>
            <small>{t('rk_needProfile')}</small>
          </span>
          <ChevronRight size={20} />
        </button>
      )}

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
            {/* la gara classificata è il modo principale di giocare */}
            <button
              className={`btn primary big block race-btn lg-${['okj', 'ok', 'kz', 'f4', 'fr', 'f3', 'f2', 'f1'][league]}`}
              onClick={account.online ? onRanked : onProfile}
              disabled={rankedBusy}
            >
              <Trophy size={22} />
              <span>
                {t('rk_play')}
                <small>
                  {leagueName(league, t)} · 🏆 {points}
                </small>
              </span>
              <span className="race-bar" aria-hidden>
                <span style={{ width: `${Math.round(ratio * 100)}%` }} />
              </span>
            </button>
            <div className="play-tiles">
              <button className="play-tile" onClick={() => setTraining(true)}>
                <Dumbbell size={22} />
                <b>{t('home_training')}</b>
                <small>{trainingSub}</small>
              </button>
              <button className="play-tile" onClick={onFriend}>
                <Users size={22} />
                <b>{t('home_friend')}</b>
                <small>{t('fr_bo3')}</small>
              </button>
            </div>
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

      <p className="stats-line">
        <span>
          <b>{progress.wins}</b> {t('home_wins')}
        </span>
        <span>
          <b>{progress.losses}</b> {t('home_losses')}
        </span>
        <span>
          <b>{owned}</b>/{TOTAL_CARDS} {t('home_collection')}
        </span>
      </p>

      {/* Allenamento contro la CPU: modalità, mazzo, regole e livello in una finestra dal basso */}
      {training && (
        <div className="overlay sheet-backdrop" onClick={() => setTraining(false)}>
          <div className="sheet training-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sheet-grip" />
            <header className="sheet-head">
              <h2>{t('home_training')}</h2>
              <button className="icon-btn" onClick={() => setTraining(false)} aria-label={t('close')}>
                <X size={20} />
              </button>
            </header>
            <ModePicker mode={mode} owned={mine} decks={decks} slot={slot} onMode={onMode} onDeck={onDeck} />
            <div className="rules-pick" role="radiogroup" aria-label={t('rules_label')}>
              {(['hand', 'classic'] as Rules[]).map((r) => (
                <button key={r} role="radio" aria-checked={rules === r} className={rules === r ? 'on' : ''} onClick={() => onRules(r)}>
                  <b>{t(r === 'hand' ? 'rules_hand' : 'rules_classic')}</b>
                  <small>{t(r === 'hand' ? 'rules_hand_sub' : 'rules_classic_sub')}</small>
                </button>
              ))}
            </div>
            <div className="level-pick" role="radiogroup" aria-label={t('lvl_label')}>
              <span className="level-label">{t('lvl_label')}</span>
              {CPU_LEVELS.map((l) => (
                <button key={l} role="radio" aria-checked={level === l} className={`lvl-${l} ${level === l ? 'on' : ''}`} onClick={() => onLevel(l)}>
                  <b>{t(`lvl_${l}`)}</b>
                  <small>
                    {coin()} +{LEVEL_CREDITS[l].player}
                  </small>
                </button>
              ))}
            </div>
            <button
              className="btn primary big block play-quick"
              onClick={() => {
                setTraining(false);
                onPlay();
              }}
              disabled={!ready.ok}
            >
              <Zap size={20} fill="currentColor" />
              <span>
                {t('home_trainPlay')}
                <small>{trainingSub}</small>
              </span>
            </button>
            {!ready.ok && <p className="muted small-text">{t('mode_need', { n: DECK_SIZE, m: ready.have })}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

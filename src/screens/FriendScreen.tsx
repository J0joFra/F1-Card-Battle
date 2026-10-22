import { useEffect, useState } from 'react';
import { noteFriends } from '../lib/achievements';
import { coin } from '../lib/season';
import { Copy, Layers, Share2, Swords, UserMinus, Users } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { callGame } from '../lib/api';
import { DECK_SLOTS, FRIEND_DRAW_CREDITS, FRIEND_WIN_CREDITS, savedDeck, type Progress } from '../game/collection';
import { deckProblems } from '../game/deckRules';
import { DECK_SIZE, TURN_SECONDS } from '../game/engine';
import type { Account } from '../hooks/useAccount';
import type { Friend, GameResponse, PvpInfo } from '../server/actions';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { HelpButton } from '../components/TutorialSection';
import { askConfirm } from '../components/ConfirmDialog';
import { haptic, sfx } from '../lib/feedback';
import { challengeLink } from '../lib/links';
import { listen, pvpTopic } from '../lib/live';
import { Capacitor } from '@capacitor/core';

const POLL_MS = 3000; // controllo di riserva: di solito l'ingresso dell'amico arriva subito con il segnale
const FRIENDS_POLL_MS = 15_000;

interface Props {
  account: Account;
  progress: Progress;
  lobby: PvpInfo | null; // sfida creata, in attesa dell'avversario
  onCreate: (invite?: Friend) => void; // con un amico: invito diretto; senza: codice da condividere
  onJoin: (code: string) => void;
  onEditDecks: () => void;
  onStart: (res: GameResponse) => void; // l'avversario è entrato: si gioca
  onCancel: (declined?: boolean) => void;
  onProfile: () => void; // crea il profilo (serve per sfidare gli amici)
}

export function FriendScreen({ account, progress, lobby, onCreate, onJoin, onEditDecks, onStart, onCancel, onProfile }: Props) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<Friend[] | null>(null);

  // in attesa: appena l'amico entra il server manda un segnale; in ogni caso si controlla ogni pochi secondi
  useEffect(() => {
    if (!lobby) return;
    let alive = true;
    const live = listen(pvpTopic(lobby.id));
    void (async () => {
      while (alive) {
        await live.wait(POLL_MS);
        if (!alive) return;
        try {
          const res = await callGame({ action: 'pvp_state', match: lobby.id });
          if (!alive) return;
          if (res.pvp?.status === 'playing') {
            alive = false;
            sfx('select');
            haptic('success');
            onStart(res);
          } else if (res.pvp?.status === 'cancelled') {
            alive = false;
            onCancel(true);
          }
        } catch {
          /* rete assente: si riprova al giro dopo */
        }
      }
    })();
    return () => {
      alive = false;
      live.close();
    };
  }, [lobby?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // lista amici con il pallino verde di chi è online (aggiornata ogni 15 secondi)
  useEffect(() => {
    if (!account.online || lobby) return;
    let alive = true;
    const load = () =>
      callGame({ action: 'friends' })
        .then((r) => {
          noteFriends(r.friends?.length ?? 0);
          if (alive) setFriends(r.friends ?? []);
        })
        .catch(() => alive && setFriends((f) => f ?? []));
    load();
    const id = setInterval(load, FRIENDS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [account.online, lobby]);

  async function remove(f: Friend) {
    if (!(await askConfirm(t('fr_removeConfirm', { name: f.name ?? t('fr_opponent') }), { danger: true, confirmLabel: t('fr_remove') }))) return;
    setFriends((list) => list?.filter((x) => x.id !== f.id) ?? null);
    await callGame({ action: 'friend_remove', friend: f.id }).catch(() => {});
  }

  // si condivide un link diretto alla sfida: chi lo apre entra subito in partita
  async function share() {
    if (!lobby) return;
    const url = challengeLink(lobby.code);
    const text = t('fr_shareText', { code: lobby.code });
    try {
      if (Capacitor.isNativePlatform()) {
        // app Android: menu di condivisione del telefono (WhatsApp, Telegram…)
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: 'F1 Card Battle', text, url });
        return;
      }
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
    } catch {
      /* condivisione annullata: si copia e basta */
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* niente appunti: il codice resta a schermo */
    }
  }

  const help = (
    <HelpButton
      items={['tut_friend_1', 'tut_friend_2', 'tut_friend_3']}
      params={{ n: DECK_SIZE, s: TURN_SECONDS, w: FRIEND_WIN_CREDITS, d: FRIEND_DRAW_CREDITS }}
    />
  );

  if (!account.online) {
    return (
      <div className="screen friend">
        <header className="screen-head">
          <h2>{t('fr_title')}</h2>
          {help}
        </header>
        <section className="panel">
          <p>{t('fr_needLogin')}</p>
          <button className="btn primary block" onClick={onProfile}>
            {t('pr_createTitle')}
          </button>
        </section>
      </div>
    );
  }

  if (lobby) {
    return (
      <div className="screen friend">
        <header className="screen-head">
          <h2>{t('fr_title')}</h2>
        </header>
        <section className="panel">
          {lobby.invited ? (
            <p className="center waiting-dots">{t('fr_waitingFriend', { name: lobby.opponent ?? t('fr_opponent') })}</p>
          ) : (
            <>
              <p className="center">{t('fr_yourCode')}</p>
              <div className="code-big">{lobby.code}</div>
              <button className="btn primary big block friend-btn" onClick={share}>
                {copied ? <Copy size={18} /> : <Share2 size={18} />} {copied ? t('fr_copied') : t('fr_share')}
              </button>
              <p className="muted center waiting-dots">{t('fr_waiting')}</p>
            </>
          )}
          <button className="btn ghost block" onClick={() => onCancel()}>
            {t('fr_cancel')}
          </button>
        </section>
      </div>
    );
  }

  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return (
    <div className="screen friend">
      <header className="screen-head">
        <h2>{t('fr_title')}</h2>
        {help}
      </header>
      <ul className="odds-chips">
        <li>⚔️ {t('fr_bo3')}</li>
        <li>🏆 {coin()} +{FRIEND_WIN_CREDITS}</li>
        <li>🤝 {coin()} +{FRIEND_DRAW_CREDITS}</li>
      </ul>

      <section className="panel">
        <div className="decks-ready">
          <div>
            <b>{t('fr_decks')}</b>
            <div className="marks">
              {Array.from({ length: DECK_SLOTS }, (_, i) => {
                const d = savedDeck(progress, i);
                const ok = d.length === DECK_SIZE && !deckProblems(d).length;
                return (
                  <span key={i} className={ok ? 'ok' : ''}>
                    {ok ? '✓' : i + 1}
                  </span>
                );
              })}
            </div>
          </div>
          <button className="btn ghost friend-btn" onClick={onEditDecks}>
            <Layers size={16} /> {t('fr_editDecks')}
          </button>
        </div>
      </section>

      <section className="panel">
        <b>{t('fr_friends')}</b>
        {friends === null ? (
          <p className="muted">…</p>
        ) : friends.length === 0 ? (
          <p className="muted">{t('fr_noFriends')}</p>
        ) : (
          <ul className="friend-list">
            {friends.map((f) => (
              <li key={f.id}>
                {f.avatar ? (
                  <span className={`presence ${f.online ? 'online' : ''}`}>
                    <PlayerAvatar avatar={f.avatar} size={40} />
                  </span>
                ) : (
                  <span className={`avatar presence ${f.online ? 'online' : ''}`}>{(f.name ?? '?').trim().charAt(0).toUpperCase()}</span>
                )}
                <span className="who">
                  <b>{f.name ?? t('fr_opponent')}</b>
                  <small>{f.online ? t('fr_online') : t('fr_offline')}</small>
                </span>
                <button className="btn primary friend-btn" onClick={() => onCreate(f)}>
                  <Swords size={16} /> {t('fr_challenge')}
                </button>
                <button className="icon-btn" onClick={() => remove(f)} aria-label={t('fr_remove')}>
                  <UserMinus size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="code-row">
          <input
            className="code-input"
            value={clean}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('fr_codePh')}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={8}
            aria-label={t('fr_codePh')}
          />
          <button className="btn primary" onClick={() => onJoin(clean)} disabled={clean.length !== 6}>
            {t('fr_join')}
          </button>
        </div>
        <button className="btn ghost block friend-btn" onClick={() => onCreate()}>
          <Users size={18} /> {t('fr_create')}
        </button>
      </section>
    </div>
  );
}

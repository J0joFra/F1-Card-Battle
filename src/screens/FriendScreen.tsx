import { useEffect, useState, type ReactNode } from 'react';
import { noteFriends } from '../lib/achievements';
import { coin } from '../lib/season';
import { ArrowLeftRight, Copy, Layers, Share2, Swords, UserMinus, Users } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { callGame } from '../lib/api';
import { DECK_SLOTS, FRIEND_DRAW_CREDITS, FRIEND_WIN_CREDITS, maxOroOf, savedDeck, type Progress } from '../game/collection';
import { deckProblems } from '../game/deckRules';
import { DECK_SIZE, TURN_SECONDS } from '../game/engine';
import type { Account } from '../hooks/useAccount';
import type { Friend, GameRequest, GameResponse, PvpInfo, TradeView } from '../server/actions';
import { TradeSheet } from '../components/TradeSheet';
import { CardView } from '../components/CardView';
import { CARD_BY_ID } from '../game/cards';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { InviteFriend } from '../components/Ranked';
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
  tabs?: ReactNode; // schede Campionato / Amici (sezione Ranked)
  today: string;
  call: (req: GameRequest) => Promise<GameResponse | null>; // azioni con avviso d'errore e progressi aggiornati
}

export function FriendScreen({ account, progress, lobby, onCreate, onJoin, onEditDecks, onStart, onCancel, onProfile, tabs, today, call }: Props) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  // scambi: proposte in attesa, finestra di scambio aperta con un amico, avviso dell'ultimo scambio
  const [trades, setTrades] = useState<TradeView[]>([]);
  const [tradeWith, setTradeWith] = useState<Friend | null>(null);
  const [tradeNote, setTradeNote] = useState<string | null>(null);
  const [tradeBusy, setTradeBusy] = useState(false);

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
    const loadTrades = () =>
      callGame({ action: 'trade_list' })
        .then((r) => alive && setTrades(r.trades ?? []))
        .catch(() => {});
    load();
    loadTrades();
    const id = setInterval(() => {
      load();
      loadTrades();
    }, FRIENDS_POLL_MS);
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
        await Share.share({ title: 'Driver Clash', text, url });
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

  async function tradeAction(tr: TradeView, action: 'trade_accept' | 'trade_decline' | 'trade_cancel') {
    if (tradeBusy) return;
    setTradeBusy(true);
    const r = await call(action === 'trade_accept' ? { action, trade: tr.id, date: today } : { action, trade: tr.id });
    setTradeBusy(false);
    if (r?.trades) setTrades(r.trades);
    else callGame({ action: 'trade_list' }).then((x) => setTrades(x.trades ?? [])).catch(() => {});
    if (r && action === 'trade_accept') {
      const c = CARD_BY_ID.get(tr.want);
      setTradeNote(t('tr_done', { card: c ? `${c.driver.name} · ${c.team.name}` : '' }));
      sfx('select');
      haptic('success');
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
          {tabs ?? <h2>{t('fr_title')}</h2>}
          {help}
        </header>
        <section className="fr-hero">
          <span className="fr-emblem" aria-hidden>
            <Swords size={34} />
          </span>
          <h3>{t('fr_title')}</h3>
          <p>{t('fr_needLogin')}</p>
          <button className="btn primary big block" onClick={onProfile}>
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
          {tabs ?? <h2>{t('fr_title')}</h2>}
        </header>
        <section className="fr-hero fr-lobby">
          <span className="fr-emblem pulse" aria-hidden>
            <Swords size={34} />
          </span>
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
        {tabs ?? <h2>{t('fr_title')}</h2>}
        {help}
      </header>
      {/* sfida: regole, crea una sfida con codice o entra con il codice di un amico */}
      <section className="fr-hero">
        <span className="fr-emblem" aria-hidden>
          <Swords size={34} />
        </span>
        <h3>{t('fr_title')}</h3>
        <ul className="odds-chips fr-rules">
          <li>⚔️ {t('fr_bo3')}</li>
          <li>🃏 {t('rules_hand')}</li>
          <li>🏆 {coin()} +{FRIEND_WIN_CREDITS}</li>
          <li>🤝 {coin()} +{FRIEND_DRAW_CREDITS}</li>
        </ul>
        <button className="btn primary big block friend-btn" onClick={() => onCreate()}>
          <Users size={18} /> {t('fr_create')}
        </button>
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
          <button className="btn" onClick={() => onJoin(clean)} disabled={clean.length !== 6}>
            {t('fr_join')}
          </button>
        </div>
      </section>

      <section className="panel fr-friends">
        <div className="fr-friends-head">
          <b>
            <Users size={16} /> {t('fr_friends')}
          </b>
          {friends && friends.length > 0 && (
            <span className="fr-online-n">
              <i /> {t('fr_onlineN', { n: friends.filter((f) => f.online).length })}
            </span>
          )}
        </div>
        {friends === null ? (
          <p className="muted">…</p>
        ) : friends.length === 0 ? (
          <p className="muted">{t('fr_noFriends')}</p>
        ) : (
          <ul className="friend-list">
            {[...friends].sort((a, b) => Number(b.online) - Number(a.online)).map((f) => (
              <li key={f.id} className={f.online ? 'on' : ''}>
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
                <button className="btn primary small friend-btn" onClick={() => onCreate(f)}>
                  <Swords size={15} /> {t('fr_challenge')}
                </button>
                <button className="icon-btn tr-open" onClick={() => setTradeWith(f)} aria-label={t('tr_trade')} title={t('tr_trade')}>
                  <ArrowLeftRight size={18} />
                </button>
                <button className="icon-btn" onClick={() => remove(f)} aria-label={t('fr_remove')}>
                  <UserMinus size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* scambi: proposte ricevute (accetta / rifiuta) e inviate (ritira) */}
      <section className="panel fr-trades">
        <div className="fr-friends-head">
          <b>
            <ArrowLeftRight size={16} /> {t('tr_title')}
          </b>
          {trades.some((x) => x.incoming) && <span className="tr-badge">{trades.filter((x) => x.incoming).length}</span>}
        </div>
        {tradeNote && <p className="tr-done">{tradeNote}</p>}
        {trades.length === 0 ? (
          <p className="muted tr-hint">{t('tr_hint')}</p>
        ) : (
          <ul className="tr-list">
            {trades.map((tr) => {
              const give = CARD_BY_ID.get(tr.give);
              const want = CARD_BY_ID.get(tr.want);
              if (!give || !want) return null;
              const hours = Math.max(1, Math.ceil((tr.expiresAt - Date.now()) / 3_600_000));
              return (
                <li key={tr.id} className={tr.incoming ? 'in' : 'out'}>
                  <small className="tr-who">
                    {tr.incoming ? t('tr_in', { name: tr.friendName ?? '?' }) : t('tr_out', { name: tr.friendName ?? '?' })} · {t('tr_expires', { h: hours })}
                  </small>
                  <div className="tr-swap">
                    <div className="tr-card">
                      <small>{t('tr_give')}</small>
                      <CardView card={give} size="sm" />
                    </div>
                    <ArrowLeftRight size={22} className="tr-arrow" />
                    <div className="tr-card">
                      <small>{t('tr_receive')}</small>
                      <CardView card={want} size="sm" />
                    </div>
                  </div>
                  <div className="tr-actions">
                    {tr.incoming ? (
                      <>
                        <button className="btn primary small" disabled={tradeBusy} onClick={() => tradeAction(tr, 'trade_accept')}>
                          {t('tr_accept')}
                        </button>
                        <button className="btn ghost small" disabled={tradeBusy} onClick={() => tradeAction(tr, 'trade_decline')}>
                          {t('tr_decline')}
                        </button>
                      </>
                    ) : (
                      <button className="btn ghost small" disabled={tradeBusy} onClick={() => tradeAction(tr, 'trade_cancel')}>
                        {t('tr_cancel')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {tradeWith && (
        <TradeSheet
          friend={tradeWith}
          today={today}
          call={call}
          onClose={() => setTradeWith(null)}
          onSent={(list) => {
            setTrades(list);
            setTradeWith(null);
            setTradeNote(t('tr_sent', { name: tradeWith.name ?? '?' }));
          }}
        />
      )}

      {/* mazzi pronti per la sfida */}
      <section className="panel fr-decks">
        <div className="decks-ready">
          <div>
            <b>{t('fr_decks')}</b>
            <div className="marks">
              {Array.from({ length: DECK_SLOTS }, (_, i) => {
                const d = savedDeck(progress, i);
                const ok = d.length === DECK_SIZE && !deckProblems(d, undefined, maxOroOf(progress)).length;
                return (
                  <span key={i} className={ok ? 'ok' : ''}>
                    {ok ? '✓' : i + 1}
                  </span>
                );
              })}
            </div>
          </div>
          <button className="btn ghost small friend-btn" onClick={onEditDecks}>
            <Layers size={16} /> {t('fr_editDecks')}
          </button>
        </div>
      </section>

      <InviteFriend />
    </div>
  );
}

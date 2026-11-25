import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { CARD_BY_ID, rarityLabel } from '../game/cards';
import { TRADE_DAILY } from '../game/trade';
import type { GameRequest, GameResponse, TradeOptions, TradeView } from '../server/types';
import { CardView } from './CardView';

/*
 * Scambio con un amico: scegli una sua carta doppia che non hai, poi un tuo doppione della stessa rarità
 * che lui non ha, e mandi la proposta. Le regole le controlla il server (game/trade.ts).
 */
interface Props {
  friend: { id: string; name: string | null };
  today: string;
  call: (req: GameRequest) => Promise<GameResponse | null>; // con avviso d'errore e aggiornamento dei progressi
  onClose: () => void;
  onSent: (trades: TradeView[]) => void;
}

export function TradeSheet({ friend, today, call, onClose, onSent }: Props) {
  const { t } = useI18n();
  const [opts, setOpts] = useState<TradeOptions | null>(null);
  const [want, setWant] = useState<string | null>(null);
  const [give, setGive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = friend.name ?? '?';

  useEffect(() => {
    let alive = true;
    call({ action: 'trade_options', friend: friend.id, date: today }).then((r) => {
      if (!alive) return;
      if (r?.tradeOptions) setOpts(r.tradeOptions);
      else onClose();
    });
    return () => {
      alive = false;
    };
  }, [friend.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const wantCard = want ? CARD_BY_ID.get(want) : undefined;
  // in cambio: solo i tuoi doppioni della stessa rarità della carta scelta
  const mine = useMemo(
    () => (opts && wantCard ? opts.mine.map((id) => CARD_BY_ID.get(id)!).filter((c) => c && c.rarity === wantCard.rarity) : []),
    [opts, wantCard],
  );
  const theirs = useMemo(() => (opts ? opts.theirs.map((id) => CARD_BY_ID.get(id)!).filter(Boolean) : []), [opts]);
  const soon = opts ? opts.readyAt > Date.now() : false;
  const full = opts ? opts.today >= TRADE_DAILY : false;

  async function propose() {
    if (!want || !give || busy) return;
    setBusy(true);
    const r = await call({ action: 'trade_propose', friend: friend.id, give, want, date: today });
    setBusy(false);
    if (r?.trades) onSent(r.trades);
  }

  return (
    <div className="overlay sheet-backdrop" onClick={onClose}>
      <div className="sheet trade-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <header className="sheet-head">
          <h2>{t('tr_with', { name })}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('close')}>
            <X size={20} />
          </button>
        </header>
        {!opts ? (
          <p className="muted center">…</p>
        ) : soon ? (
          <p className="tr-note">{t('tr_soon', { date: new Date(opts.readyAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>
        ) : (
          <>
            <p className={`tr-today ${full ? 'full' : ''}`}>{t('tr_today', { n: opts.today, max: TRADE_DAILY })}</p>
            <section className="tr-step">
              <h3>
                {t('tr_receive')} <small className="muted">· {t('tr_pickWant')}</small>
              </h3>
              {theirs.length === 0 ? (
                <p className="muted">{t('tr_noTheirs', { name })}</p>
              ) : (
                <div className="tr-grid">
                  {theirs.map((c) => (
                    <button key={c.id} className={`tr-pick ${want === c.id ? 'on' : ''}`} onClick={() => { setWant(c.id); setGive(null); }}>
                      <CardView card={c} size="sm" />
                    </button>
                  ))}
                </div>
              )}
            </section>
            {wantCard && (
              <section className="tr-step">
                <h3>
                  {t('tr_give')} <small className="muted">· {t('tr_pickGive', { r: rarityLabel(wantCard.rarity) })}</small>
                </h3>
                {mine.length === 0 ? (
                  <p className="muted">{t('tr_noMine', { r: rarityLabel(wantCard.rarity), name })}</p>
                ) : (
                  <div className="tr-grid">
                    {mine.map((c) => (
                      <button key={c.id} className={`tr-pick ${give === c.id ? 'on' : ''}`} onClick={() => setGive(c.id)}>
                        <CardView card={c} size="sm" />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
            <div className="tr-footer">
              <button className="btn primary big block friend-btn" disabled={!want || !give || busy || full} onClick={propose}>
                <ArrowLeftRight size={18} /> {t('tr_propose')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

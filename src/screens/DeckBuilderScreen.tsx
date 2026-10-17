import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, Rarity, StatKey } from '../types';
import { ArrowDownWideNarrow, ArrowLeft, Check, Dices, LayoutGrid, Minus, Play, Plus, Table2, Trash2, X } from 'lucide-react';
import { STATS, formatStat, rarityLabel, statLabel, statShort } from '../game/cards';
import { useI18n } from '../lib/i18n';
import { HelpButton } from '../components/TutorialSection';
import { CardView } from '../components/CardView';
import { FlipCard } from '../components/FlipCard';
import { useProgressive } from '../hooks/useProgressive';
import { DECK_SLOTS, activeSlot, autoFillDeck, ownedCards, savedDeck, type Progress } from '../game/collection';
import { DECK_SIZE } from '../game/engine';
import { CLASSIC, canAdd, deckProblems, fillDeck, fitsMode, rarityCaps, type MatchMode } from '../game/deckRules';

interface Props {
  progress: Progress;
  onSave?: (decks: string[][], active: number) => void; // pagina Mazzi: salva i 3 mazzi e lo slot in uso
  // partita a tema (modalità o sfida del giorno): un solo mazzo con le card adatte, poi «Gioca»
  mode?: MatchMode;
  onPlay?: (deck: Card[]) => void;
  onBack?: () => void;
  title?: string;
  banner?: string;
}

type SortKey = StatKey | 'rarita' | 'ovr';
type View = 'cards' | 'table';

const RARITY_RANK: Record<Rarity, number> = {
  leggendaria: 4,
  platino: 3,
  oro: 2,
  argento: 1,
  bronzo: 0,
};
const VIEW_KEY = 'f1-card-battle:deck-view';

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
}

export function DeckBuilderScreen({ progress, onSave, mode = CLASSIC, onPlay, onBack, title, banner }: Props) {
  const { t } = useI18n();
  const themed = !!onPlay;
  // le card che si possono usare: tutte quelle possedute, o solo quelle adatte alla modalità
  const usable = useMemo(() => ownedCards(progress).filter((c) => fitsMode(mode, c)), [progress, mode]);
  // 3 mazzi salvati (stile Clash Royale): si passa dall'uno all'altro con le linguette 1-2-3
  const [slot, setSlot] = useState(() => (themed ? 0 : activeSlot(progress)));
  // uno slot vuoto (o incompleto) lo completiamo noi la prima volta che lo apri: si gioca subito
  const [initial] = useState(() => {
    if (themed) return { drafts: [fillDeck(usable, [], mode, Math.random, true)] };
    const active = activeSlot(progress);
    const saved = Array.from({ length: DECK_SLOTS }, (_, i) => savedDeck(progress, i));
    return {
      drafts: saved.map((d, i) => (i === active && d.length < DECK_SIZE ? autoFillDeck(progress, d) : d)),
    };
  });
  const [drafts, setDrafts] = useState<Card[][]>(initial.drafts);
  const [visited] = useState(() => new Set([activeSlot(progress)]));
  const deck = drafts[slot];
  const setDeck = (next: Card[] | ((d: Card[]) => Card[])) =>
    setDrafts((all) => all.map((d, i) => (i === slot ? (typeof next === 'function' ? next(d) : next) : d)));

  // salvataggio automatico: poco dopo ogni modifica e quando si lascia la pagina
  const pending = useRef<{ decks: string[][]; active: number } | null>(null);
  const lastSaved = useRef(
    JSON.stringify([Array.from({ length: DECK_SLOTS }, (_, i) => savedDeck(progress, i).map((c) => c.id)), activeSlot(progress)])
  );
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const flush = () => {
    const p = pending.current;
    pending.current = null;
    if (!p || !saveRef.current) return;
    const key = JSON.stringify([p.decks, p.active]);
    if (key === lastSaved.current) return;
    lastSaved.current = key;
    saveRef.current(p.decks, p.active);
  };
  useEffect(() => {
    if (themed) return;
    pending.current = {
      decks: drafts.map((d) => d.map((c) => c.id)),
      active: slot,
    };
    const id = setTimeout(flush, 700);
    return () => clearTimeout(id);
  }, [drafts, slot]);
  useEffect(() => () => flush(), []);

  function openSlot(i: number) {
    if (i === slot) return;
    if (!visited.has(i)) {
      visited.add(i);
      if (drafts[i].length < DECK_SIZE) {
        setDrafts((all) => all.map((d, j) => (j === i ? refill(d) : d)));
      }
    }
    setSlot(i);
  }
  const [sort, setSort] = useState<SortKey>('rarita');
  const [view, setViewRaw] = useState<View>(savedView);
  const setView = (v: View) => {
    setViewRaw(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* niente memoria: va bene lo stesso */
    }
  };
  const problems = deckProblems(deck, mode);
  const refill = (d: Card[]) => (themed ? fillDeck(usable, d, mode) : autoFillDeck(progress, d));

  // ordina per rarità (dalla più rara) o per una metrica (dal valore migliore)
  const rows = useMemo(() => {
    const cards = [...usable];
    const byName = (a: Card, b: Card) => a.driver.lastName.localeCompare(b.driver.lastName) || a.firstYear - b.firstYear;
    if (sort === 'rarita')
      return cards.sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.ovr - a.ovr || byName(a, b));
    if (sort === 'ovr') return cards.sort((a, b) => b.ovr - a.ovr || byName(a, b));
    const def = STATS.find((s) => s.key === sort)!;
    return cards.sort((a, b) => (def.lowerWins ? a.stats[sort] - b.stats[sort] : b.stats[sort] - a.stats[sort]) || byName(a, b));
  }, [usable, sort]);
  const { limit, sentinel } = useProgressive(rows.length, 40, `${sort}|${view}`);

  const toggle = (c: Card) =>
    setDeck((d) => (d.some((x) => x.id === c.id) ? d.filter((x) => x.id !== c.id) : canAdd(d, c, mode) ? [...d, c] : d));

  // per ogni metrica, il valore migliore presente nel mazzo: aiuta a vedere i punti deboli
  const bestInDeck = (key: StatKey) => {
    if (!deck.length) return null;
    const def = STATS.find((s) => s.key === key)!;
    const vals = deck.map((c) => c.stats[key]);
    return def.lowerWins ? Math.min(...vals) : Math.max(...vals);
  };

  return (
    <div className="screen builder">
      <header className="screen-head">
        {onBack && (
          <button className="icon-btn" onClick={onBack} aria-label={t('back')}>
            <ArrowLeft size={22} />
          </button>
        )}
        <h2>{title ?? t('nav_decks')}</h2>
        <HelpButton items={['tut_deck_1', 'tut_deck_2', 'tut_deck_3', 'tut_deck_4']} />
      </header>
      {!themed && (
        <div className="deck-tabs" role="tablist" aria-label={t('deck_slots')}>
          {drafts.map((d, i) => {
            const ok = d.length === DECK_SIZE && !deckProblems(d).length;
            return (
              <button
                key={i}
                role="tab"
                aria-selected={i === slot}
                className={i === slot ? 'on' : ''}
                onClick={() => openSlot(i)}
              >
                {i + 1}
                {ok && <Check size={12} />}
              </button>
            );
          })}
        </div>
      )}
      {banner && <p className="daily-banner">{banner}</p>}

      <div className="deck-bar">
        <div className="deck-count">
          <b className={deck.length === DECK_SIZE ? 'ok' : ''}>
            {deck.length}/{DECK_SIZE}
          </b>
          {mode.kind !== 'rarity' &&
            rarityCaps(deck).map(([r, n]) => {
              const used = deck.filter((c) => c.rarity === r).length;
              return (
                <span key={r} className={`limit ${used > n ? 'over' : ''}`} title={t('deck_maxRarity', { n, r: rarityLabel(r) })}>
                  <span className={`dot rarity-${r}`} /> {used}/{n}
                </span>
              );
            })}
        </div>
        <div className="deck-cards">
          {Array.from({ length: DECK_SIZE }, (_, i) => {
            const c = deck[i];
            return c ? (
              <div key={c.id} className="mini">
                <CardView card={c} size="sm" onClick={() => toggle(c)} />
                <button className="remove" onClick={() => toggle(c)} aria-label={t('deck_remove', { name: c.driver.name })}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div key={`empty-${i}`} className="empty" title={t('deck_emptySlot')}>
                {i + 1}
              </div>
            );
          })}
        </div>
        <div className="deck-best-label">{t('deck_bestLabel')}</div>
        <div className="deck-best">
          {STATS.map((s) => {
            const v = bestInDeck(s.key);
            return (
              <span key={s.key} title={statLabel(s.key)}>
                <small>{statShort(s.key)}</small>
                <b>{v === null ? '–' : formatStat(s, v)}</b>
              </span>
            );
          })}
        </div>
        {problems.length > 0 && deck.length > 0 && <p className="problems">{problems.join(' ')}</p>}
        <div className="actions start">
          <button className="btn ghost" onClick={() => setDeck(refill(deck))} disabled={deck.length >= DECK_SIZE}>
            <Dices size={16} /> {t('deck_fill')}
          </button>
          <button className="btn ghost" onClick={() => setDeck([])} disabled={!deck.length}>
            <Trash2 size={16} /> {t('deck_clear')}
          </button>
          {onPlay && (
            <button className="btn primary big grow" onClick={() => onPlay(deck)} disabled={problems.length > 0}>
              <Play size={18} fill="currentColor" /> {t('home_play')}
            </button>
          )}
        </div>
      </div>

      <div className="pick-head">
        <b>{t('deck_collection', { n: rows.length })}</b>
        <label className="sort-label" title={t('deck_sortBy')}>
          <ArrowDownWideNarrow size={18} aria-hidden />
          <select
            aria-label={t('deck_sortBy')}
            className="sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="rarita">{t('deck_sortRarity')}</option>
            <option value="ovr">OVR</option>
            {STATS.map((s) => (
              <option key={s.key} value={s.key}>
                {statLabel(s.key)}
                {s.lowerWins ? ' ↓' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="view-toggle" role="group">
          <button
            className={view === 'cards' ? 'on' : ''}
            onClick={() => setView('cards')}
            aria-label={t('deck_viewCards')}
            title={t('deck_viewCards')}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            className={view === 'table' ? 'on' : ''}
            onClick={() => setView('table')}
            aria-label={t('deck_viewTable')}
            title={t('deck_viewTable')}
          >
            <Table2 size={18} />
          </button>
        </div>
      </div>
      {view === 'table' ? (
        <div className="stat-table-wrap">
          <table className="stat-table">
            <thead>
              <tr>
                <th className="col-name">{t('deck_name')}</th>
                <th className={sort === 'ovr' ? 'on' : ''} onClick={() => setSort('ovr')}>
                  OVR
                </th>
                {STATS.map((s) => (
                  <th key={s.key} className={sort === s.key ? 'on' : ''} onClick={() => setSort(s.key)} title={statLabel(s.key)}>
                    {statShort(s.key)}
                    {s.lowerWins ? '↓' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((c) => {
                const selected = deck.some((x) => x.id === c.id);
                const blocked = !selected && !canAdd(deck, c, mode);
                return (
                  <tr
                    key={c.id}
                    className={`${selected ? 'in-deck' : ''} ${blocked ? 'blocked' : ''}`}
                    onClick={() => !blocked && toggle(c)}
                    aria-selected={selected}
                  >
                    <td className="col-name">
                      <div className="cell">
                        <span className={`pick-mark ${selected ? 'on' : ''}`}>
                          {selected ? <Check size={12} /> : blocked ? '–' : <Plus size={12} />}
                        </span>
                        <span className={`dot rarity-${c.rarity}`} />
                        <span className="nm">
                          <b>{c.driver.lastName}</b>
                          <small>{c.kind === 'career' ? `★ ${c.period}` : `${c.team.name} · ${c.period}`}</small>
                        </span>
                      </div>
                    </td>
                    <td className="ovr">{c.ovr}</td>
                    {STATS.map((s) => (
                      <td key={s.key} className={sort === s.key ? 'on' : ''}>
                        {formatStat(s, c.stats[s.key])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {limit < rows.length && <div ref={sentinel} className="grid-sentinel" />}
        </div>
      ) : (
        <div className="pick-grid">
          {rows.slice(0, limit).map((c) => {
            const selected = deck.some((x) => x.id === c.id);
            const blocked = !selected && !canAdd(deck, c, mode);
            return (
              <div key={c.id} className={`${selected ? 'in-deck' : ''} ${blocked ? 'blocked' : ''}`}>
                <FlipCard
                  card={c}
                  badge={selected ? <span className="pick-badge">{t('deck_inDeck')}</span> : undefined}
                  action={
                    <button
                      className={`btn ${selected ? 'ghost' : 'primary'}`}
                      onClick={() => toggle(c)}
                      disabled={blocked}
                      title={blocked ? t(deck.length >= DECK_SIZE ? 'deck_full' : 'deck_rarityFull') : undefined}
                    >
                      {selected ? <Minus size={14} /> : <Plus size={14} />}{' '}
                      {selected
                        ? t('deck_takeOut')
                        : blocked
                        ? t(deck.length >= DECK_SIZE ? 'deck_full' : 'deck_rarityFull')
                        : t('deck_add')}
                    </button>
                  }
                />
              </div>
            );
          })}
          {limit < rows.length && <div ref={sentinel} className="grid-sentinel" />}
        </div>
      )}
    </div>
  );
}

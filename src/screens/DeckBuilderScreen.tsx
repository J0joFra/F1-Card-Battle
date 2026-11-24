import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, Rarity, StatKey } from '../types';
import { ArrowLeft, Check, Dices, Gauge, LayoutGrid, List, Minus, Play, Plus, Search, Trash2, X, Sparkles } from 'lucide-react';
import { STATS, formatStat, rarityLabel, statLabel, statShort } from '../game/cards';
import { useI18n } from '../lib/i18n';
import { HelpButton } from '../components/TutorialSection';
import { CardView } from '../components/CardView';
import { FlipCard } from '../components/FlipCard';
import { useProgressive } from '../hooks/useProgressive';
import { DECK_SLOTS, activeSlot, autoFillDeck, maxOroOf, ownedCards, savedDeck, type Progress } from '../game/collection';
import { DECK_SIZE, percentile } from '../game/engine';
import { CLASSIC, addBlock, deckProblems, decksProblems, fillDeck, fitsMode, rarityCaps, MIN_DIFFERENT, type MatchMode, type SlotBlock } from '../game/deckRules';
import type { TKey } from '../lib/i18n';

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

type View = 'cards' | 'table';

const RARITY_RANK: Record<Rarity, number> = {
  leggendaria: 4,
  platino: 3,
  oro: 2,
  argento: 1,
  bronzo: 0,
  pioniere: -1,
  classica: -1,
};
const VIEW_KEY = 'f1-card-battle:deck-view';
const SHOW_FIRST = 24;
const BLOCK_LABEL: Record<SlotBlock, TKey> = {
  full: 'deck_full',
  rarity: 'deck_rarityFull',
  allDecks: 'deck_blockAll',
  similar: 'deck_blockSimilar',
};

// Fascia di una statistica rispetto a tutte le card giocabili (quartili della sua distribuzione):
// top 10% eccellente, top 25% forte, metà centrale nella media, ultimo 25% debole.
type Band = 'top' | 'good' | 'mid' | 'low';
const bandOf = (key: StatKey, value: number): Band => {
  const p = percentile(key, value); // 1 = il valore migliore tra tutte le card (già girato per le metriche ↓)
  return p >= 0.9 ? 'top' : p >= 0.75 ? 'good' : p >= 0.25 ? 'mid' : 'low';
};

// forza del mazzo: overall medio delle sue card
const avgOvr = (d: Card[]) => (d.length ? Math.round(d.reduce((n, c) => n + c.ovr, 0) / d.length) : null);

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
  // Oro ammesse: dipende dal campionato (più si sale, più Oro)
  const maxOro = maxOroOf(progress);
  // 3 mazzi salvati (stile Clash Royale): si passa dall'uno all'altro con le linguette 1-2-3
  const [slot, setSlot] = useState(() => (themed ? 0 : activeSlot(progress)));
  // uno slot vuoto (o incompleto) lo completiamo noi la prima volta che lo apri: si gioca subito
  const [initial] = useState(() => {
    if (themed) return { drafts: [fillDeck(usable, [], mode, Math.random, true, [], false, maxOro)] };
    const active = activeSlot(progress);
    const saved = Array.from({ length: DECK_SLOTS }, (_, i) => savedDeck(progress, i));
    return {
      drafts: saved.map((d, i) =>
        i === active && d.length < DECK_SIZE ? autoFillDeck(progress, d, Math.random, saved.filter((_, j) => j !== i)) : d,
      ),
    };
  });
  const [drafts, setDrafts] = useState<Card[][]>(initial.drafts);
  const [visited] = useState(() => new Set([activeSlot(progress)]));
  const deck = drafts[slot];
  // gli altri mazzi: il mazzo in modifica deve restare diverso da loro (nei mazzi a tema non conta)
  const others = themed ? [] : drafts.filter((_, i) => i !== slot);
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
        setDrafts((all) => all.map((d, j) => (j === i ? refill(d, all.filter((_, k) => k !== j)) : d)));
      }
    }
    setSlot(i);
  }
  const [query, setQuery] = useState('');
  const [rarityF, setRarityF] = useState<Rarity | 'tutte'>('tutte');
  const [view, setViewRaw] = useState<View>(savedView);
  const setView = (v: View) => {
    setViewRaw(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* niente memoria: va bene lo stesso */
    }
  };
  const problems = [...deckProblems(deck, mode, maxOro), ...(themed ? [] : decksProblems(drafts, slot))];
  const refill = (d: Card[], rest: Card[][] = others) =>
    themed ? fillDeck(usable, d, mode, Math.random, false, [], false, maxOro) : autoFillDeck(progress, d, Math.random, rest);
  // completa con le card dalla valutazione più alta, sempre nei limiti di rarità
  const fillBest = (d: Card[]) => fillDeck(usable, d, mode, Math.random, true, themed ? [] : others, false, maxOro);
  const blockOf = (c: Card) => addBlock(deck, c, mode, others, maxOro);

  // ordina per rarità (dalla più rara) o per una metrica (dal valore migliore)
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cards = usable.filter(
      (c) =>
        (!q || `${c.driver.name} ${c.team.name}`.toLowerCase().includes(q)) &&
        (rarityF === 'tutte' || c.rarity === rarityF),
    );
    const byName = (a: Card, b: Card) => a.driver.lastName.localeCompare(b.driver.lastName) || a.firstYear - b.firstYear;
    // dalla card più rara, poi per valutazione
    return cards.sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.ovr - a.ovr || byName(a, b));
  }, [usable, query, rarityF]);
  const listKey = `${view}|${query}|${rarityF}`;
  const { limit: loaded, sentinel } = useProgressive(rows.length, 48, listKey);
  // all'inizio si vedono solo le prime card dell'ordinamento scelto: con tante card non si scorre all'infinito
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [listKey]);
  const limit = showAll ? loaded : Math.min(SHOW_FIRST, rows.length);
  const deckRef = useRef<HTMLDivElement>(null);
  const moreButton =
    !showAll && rows.length > SHOW_FIRST ? (
      <button className="btn ghost block show-all" onClick={() => setShowAll(true)}>
        {t('deck_showAll', { a: SHOW_FIRST, n: rows.length })}
      </button>
    ) : null;
  // rarità presenti tra le card utilizzabili, con quante ne hai
  const rarityCounts = useMemo(() => {
    const n = new Map<Rarity, number>();
    for (const c of usable) n.set(c.rarity, (n.get(c.rarity) ?? 0) + 1);
    return [...n].sort((a, b) => RARITY_RANK[b[0]] - RARITY_RANK[a[0]]);
  }, [usable]);

  const toggle = (c: Card) =>
    setDeck((d) => (d.some((x) => x.id === c.id) ? d.filter((x) => x.id !== c.id) : !addBlock(d, c, mode, others, maxOro) ? [...d, c] : d));

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
        <HelpButton items={['tut_deck_1', 'tut_deck_2', 'tut_deck_3', 'tut_deck_4', 'tut_deck_5']} params={{ n: MIN_DIFFERENT }} />
      </header>
      {!themed && (
        <div className="deck-tabs" role="tablist" aria-label={t('deck_slots')}>
          {drafts.map((d, i) => {
            const ok = d.length === DECK_SIZE && !deckProblems(d, CLASSIC, maxOro).length && !decksProblems(drafts, i).length;
            return (
              <button
                key={i}
                role="tab"
                aria-selected={i === slot}
                className={i === slot ? 'on' : ''}
                onClick={() => openSlot(i)}
              >
                <span className="dt-num">
                  {i + 1}
                  {ok && <Check size={12} />}
                </span>
                {avgOvr(d) !== null && (
                  <small className="dt-ovr">
                    <Gauge size={11} /> {avgOvr(d)}
                  </small>
                )}
              </button>
            );
          })}
        </div>
      )}
      {banner && <p className="daily-banner">{banner}</p>}

      <div className="deck-bar" ref={deckRef}>
        <div className="deck-count">
          <b className={deck.length === DECK_SIZE ? 'ok' : ''}>
            {deck.length}/{DECK_SIZE}
          </b>
          {avgOvr(deck) !== null && (
            <span className="deck-ovr" title={t('deck_strength')}>
              <Gauge size={14} /> {t('deck_strength')} <b>{avgOvr(deck)}</b>
            </span>
          )}
          {mode.kind !== 'rarity' && (
            <div className="deck-limits">
              <small className="limits-label">{t('deck_limitsLabel')}</small>
              {rarityCaps(deck, maxOro).map(([r, n]) => {
              const used = deck.filter((c) => c.rarity === r).length;
              return (
                <span key={r} className={`limit ${used > n ? 'over' : ''}`} title={t('deck_maxRarity', { n, r: rarityLabel(r) })}>
                  <span className={`dot rarity-${r}`} /> {used}/{n}
                </span>
              );
              })}
            </div>
          )}
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
          <button className="btn ghost" onClick={() => setDeck(fillBest(deck))} disabled={deck.length >= DECK_SIZE}>
            <Sparkles size={16} /> {t('deck_fillBest')}
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

      {/* strumenti della lista, sempre a portata mentre scorri: mazzo, ricerca, ordinamento e filtri */}
      <div className="pick-tools">
        <div className="pt-row">
          <button className={`pt-deck ${deck.length === DECK_SIZE ? 'ok' : ''}`} onClick={() => deckRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            <b>
              {deck.length}/{DECK_SIZE}
            </b>
            {avgOvr(deck) !== null && (
              <small>
                <Gauge size={11} /> {avgOvr(deck)}
              </small>
            )}
          </button>
          <label className="search pick-search">
            <Search size={16} />
            <input type="search" placeholder={t('col_search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="view-toggle" role="group">
            <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')} aria-label={t('deck_viewCards')} title={t('deck_viewCards')}>
              <LayoutGrid size={18} />
            </button>
            <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')} aria-label={t('deck_viewTable')} title={t('deck_viewTable')}>
              <List size={18} />
            </button>
          </div>
        </div>
        <div className="chips pick-filters">
          <button className={`chip ${rarityF === 'tutte' ? 'on' : ''}`} onClick={() => setRarityF('tutte')}>
            {t('f_anyRarity')}
          </button>
          {rarityCounts.map(([r, n]) => (
            <button key={r} className={`chip ${rarityF === r ? 'on' : ''}`} onClick={() => setRarityF(rarityF === r ? 'tutte' : r)}>
              <span className={`dot rarity-${r}`} /> {rarityLabel(r)} <small>{n}</small>
            </button>
          ))}
        </div>
      </div>
      {view === 'table' ? (
        <>
          {/* lista: le 7 statistiche di ogni card, colorate dal debole (rosso) al forte (verde);
              ▲ = migliorerebbe il valore migliore del mazzo in quella statistica */}
          <p className="band-legend">
            <span className="band-top">{t('band_top')}</span>
            <span className="band-good">{t('band_good')}</span>
            <span className="band-mid">{t('band_mid')}</span>
            <span className="band-low">{t('band_low')}</span>
          </p>
          <ul className="stat-list">
            {rows.slice(0, limit).map((c) => {
              const selected = deck.some((x) => x.id === c.id);
              const block = selected ? null : blockOf(c);
              const blocked = !!block;
              return (
                <li
                  key={c.id}
                  className={`stat-row ${selected ? 'in-deck' : ''} ${blocked ? 'blocked' : ''}`}
                  onClick={() => !blocked && toggle(c)}
                  aria-selected={selected}
                >
                  <div className="sr-head">
                    <span className={`pick-mark ${selected ? 'on' : ''}`}>
                      {selected ? <Check size={12} /> : blocked ? '–' : <Plus size={12} />}
                    </span>
                    <span className={`dot rarity-${c.rarity}`} />
                    <span className="nm">
                      <b>{c.driver.name}</b>
                      <small>
                        {c.kind === 'career' ? `★ ${c.period}` : `${c.team.name} · ${c.period}`}
                        {block && block !== 'full' ? ` · ${t(BLOCK_LABEL[block])}` : ''}
                      </small>
                    </span>
                    <span className="sr-ovr">{c.ovr}</span>
                  </div>
                  <div className="sr-stats">
                    {STATS.map((st) => {
                      const v = c.stats[st.key];
                      const best = bestInDeck(st.key);
                      const up = !selected && best !== null && (st.lowerWins ? v < best : v > best);
                      return (
                        <span
                          key={st.key}
                          className={`sr-stat band-${bandOf(st.key, v)}`}
                          title={statLabel(st.key)}
                        >
                          <small>{statShort(st.key)}</small>
                          <b>
                            {formatStat(st, v)}
                            {up && <i className="sr-up">▲</i>}
                          </b>
                        </span>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
          {showAll && limit < rows.length && <div ref={sentinel} className="grid-sentinel" />}
          {moreButton}
        </>
      ) : (
        <div className="pick-grid compact">
          {rows.slice(0, limit).map((c) => {
            const selected = deck.some((x) => x.id === c.id);
            const block = selected ? null : blockOf(c);
            const blocked = !!block;
            return (
              <div key={c.id} className={`${selected ? 'in-deck' : ''} ${blocked ? 'blocked' : ''}`}>
                <FlipCard
                  card={c}
                  badge={
                    selected ? (
                      <span className="pick-badge">{t('deck_inDeck')}</span>
                    ) : block && block !== 'full' ? (
                      <span className="pick-badge blocked-badge">{t(BLOCK_LABEL[block])}</span>
                    ) : undefined
                  }
                  action={
                    <button
                      className={`btn ${selected ? 'ghost' : 'primary'}`}
                      onClick={() => toggle(c)}
                      disabled={blocked}
                      title={block ? t(BLOCK_LABEL[block]) : undefined}
                    >
                      {selected ? <Minus size={14} /> : <Plus size={14} />}{' '}
                      {selected
                        ? t('deck_takeOut')
                        : block
                        ? t(BLOCK_LABEL[block])
                        : t('deck_add')}
                    </button>
                  }
                />
              </div>
            );
          })}
          {showAll && limit < rows.length && <div ref={sentinel} className="grid-sentinel" />}
        </div>
      )}
      {view !== 'table' && moreButton}
    </div>
  );
}

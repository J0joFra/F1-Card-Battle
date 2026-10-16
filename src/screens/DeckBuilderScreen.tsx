import { useMemo, useState } from 'react';
import type { Card, Rarity, StatKey } from '../types';
import { ArrowLeft, Check, Dices, Minus, Play, Plus, Save, Trash2, X } from 'lucide-react';
import { STATS, formatStat, rarityLabel, statLabel, statShort } from '../game/cards';
import { useI18n } from '../lib/i18n';
import { TutorialSection } from '../components/TutorialSection';
import { CardView } from '../components/CardView';
import { FlipCard } from '../components/FlipCard';
import { DECK_SLOTS, activeSlot, autoFillDeck, ownedCards, savedDeck, type Progress } from '../game/collection';
import { DECK_SIZE } from '../game/engine';
import { MAX_PER_RARITY, canAdd, deckProblems } from '../game/deckRules';

interface Props {
  progress: Progress;
  onStart: (deck: Card[], slot: number) => void;
  onSave: (decks: string[][], active: number) => void; // salva i 3 mazzi e lo slot in uso
  onBack: () => void;
  banner?: string; // es. sfida del giorno
  editOnly?: boolean; // solo preparare i mazzi (sfida tra amici): niente "Gioca"
}

type SortKey = StatKey | 'rarita';

const RARITY_RANK: Record<Rarity, number> = { leggendaria: 3, oro: 2, argento: 1, bronzo: 0 };

export function DeckBuilderScreen({ progress, onStart, onSave, onBack, banner, editOnly }: Props) {
  const { t } = useI18n();
  // 3 mazzi salvati (stile Clash Royale): si passa dall'uno all'altro con le linguette 1-2-3
  const [slot, setSlot] = useState(() => activeSlot(progress));
  // uno slot vuoto (o incompleto) lo completiamo noi la prima volta che lo apri: si può giocare subito
  const [initial] = useState(() => {
    const active = activeSlot(progress);
    const saved = Array.from({ length: DECK_SLOTS }, (_, i) => savedDeck(progress, i));
    return {
      drafts: saved.map((d, i) => (i === active && d.length < DECK_SIZE ? autoFillDeck(progress, d) : d)),
      prefilled: saved.map((d, i) => i === active && d.length < DECK_SIZE),
    };
  });
  const [drafts, setDrafts] = useState<Card[][]>(initial.drafts);
  const [prefilled, setPrefilled] = useState<boolean[]>(initial.prefilled);
  const [visited] = useState(() => new Set([activeSlot(progress)]));
  const deck = drafts[slot];
  const setDeck = (next: Card[] | ((d: Card[]) => Card[])) =>
    setDrafts((all) => all.map((d, i) => (i === slot ? (typeof next === 'function' ? next(d) : next) : d)));
  const ids = () => drafts.map((d) => d.map((c) => c.id));

  function openSlot(i: number) {
    if (i === slot) return;
    if (!visited.has(i)) {
      visited.add(i);
      if (drafts[i].length < DECK_SIZE) {
        setDrafts((all) => all.map((d, j) => (j === i ? autoFillDeck(progress, d) : d)));
        setPrefilled((p) => p.map((v, j) => (j === i ? true : v)));
      }
    }
    setSlot(i);
  }
  const [sort, setSort] = useState<SortKey>('rarita');
  const problems = deckProblems(deck);

  // ordina per rarità (dalla più rara) o per una metrica (dal valore migliore)
  const rows = useMemo(() => {
    const cards = ownedCards(progress);
    const byName = (a: Card, b: Card) => a.driver.lastName.localeCompare(b.driver.lastName) || a.firstYear - b.firstYear;
    if (sort === 'rarita') return cards.sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || byName(a, b));
    const def = STATS.find((s) => s.key === sort)!;
    return cards.sort((a, b) => (def.lowerWins ? a.stats[sort] - b.stats[sort] : b.stats[sort] - a.stats[sort]) || byName(a, b));
  }, [progress, sort]);

  const toggle = (c: Card) =>
    setDeck((d) => (d.some((x) => x.id === c.id) ? d.filter((x) => x.id !== c.id) : canAdd(d, c) ? [...d, c] : d));

  // per ogni metrica, il valore migliore presente nel mazzo: aiuta a vedere i punti deboli
  const bestInDeck = (key: StatKey) => {
    if (!deck.length) return null;
    const def = STATS.find((s) => s.key === key)!;
    const vals = deck.map((c) => c.stats[key]);
    return def.lowerWins ? Math.min(...vals) : Math.max(...vals);
  };

  const limits = Object.entries(MAX_PER_RARITY)
    .map(([r, n]) => t('deck_maxRarity', { n: n!, r: rarityLabel(r as Rarity) }))
    .join(', ');

  return (
    <div className="screen builder">
      <header className="screen-head">
        <button
          className="icon-btn"
          onClick={() => {
            onSave(ids(), slot);
            onBack();
          }}
          aria-label={t('back')}
        >
          <ArrowLeft size={22} />
        </button>
        <h2>{t('deck_title')}</h2>
      </header>
      <div className="deck-tabs" role="tablist" aria-label={t('deck_slots')}>
        {drafts.map((d, i) => {
          const ok = d.length === DECK_SIZE && !deckProblems(d).length;
          return (
            <button key={i} role="tab" aria-selected={i === slot} className={i === slot ? 'on' : ''} onClick={() => openSlot(i)}>
              {i + 1}
              {ok && <Check size={12} />}
            </button>
          );
        })}
      </div>
      <p className="muted intro">
        {t('deck_intro', { n: DECK_SIZE })} {t('deck_limits', { limits })}
      </p>

      {banner && <p className="daily-banner">{banner}</p>}
      {prefilled[slot] && <p className="prefilled">{t('deck_prefilled')}</p>}

      <div className="deck-bar">
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
          <button className="btn ghost" onClick={() => setDeck(autoFillDeck(progress, deck))} disabled={deck.length >= DECK_SIZE}>
            <Dices size={16} /> {t('deck_fill')}
          </button>
          <button className="btn ghost" onClick={() => setDeck([])} disabled={!deck.length}>
            <Trash2 size={16} /> {t('deck_clear')}
          </button>
          {editOnly ? (
            <button
              className="btn primary big grow"
              onClick={() => {
                onSave(ids(), slot);
                onBack();
              }}
            >
              <Save size={18} /> {t('deck_save')}
            </button>
          ) : (
            <button
              className="btn primary big grow"
              onClick={() => {
                onSave(ids(), slot);
                onStart(deck, slot);
              }}
              disabled={problems.length > 0}
            >
              <Play size={18} fill="currentColor" /> {t('deck_start')}
            </button>
          )}
        </div>
      </div>

      <div className="pick-head">
        <b>{t('deck_collection', { n: rows.length })}</b>
        <label className="muted">
          {t('deck_sortBy')}{' '}
          <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="rarita">{t('deck_sortRarity')}</option>
            {STATS.map((s) => (
              <option key={s.key} value={s.key}>
                {statLabel(s.key)}
                {s.lowerWins ? ' ↓' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small-text">{t('deck_flipHint')}</p>
      <div className="pick-grid">
        {rows.map((c) => {
          const selected = deck.some((x) => x.id === c.id);
          const blocked = !selected && !canAdd(deck, c);
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
                    {selected ? t('deck_takeOut') : blocked ? t(deck.length >= DECK_SIZE ? 'deck_full' : 'deck_rarityFull') : t('deck_add')}
                  </button>
                }
              />
            </div>
          );
        })}
      </div>

      <TutorialSection
        items={['tut_deck_1', 'tut_deck_2', 'tut_deck_3', 'tut_deck_4']}
        params={{ leg: MAX_PER_RARITY.leggendaria ?? 0, gold: MAX_PER_RARITY.oro ?? 0 }}
      />
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { Card, Rarity, StatKey } from '../types';
import { ArrowLeft, Check, Dices, Play, Save, Trash2 } from 'lucide-react';
import { STATS, formatStat, rarityLabel, statHint, statLabel, statShort } from '../game/cards';
import { useI18n } from '../lib/i18n';
import { TutorialSection } from '../components/TutorialSection';
import { teamLabel } from '../components/CardView';
import { DECK_SLOTS, activeSlot, autoFillDeck, ownedCards, savedDeck, type Progress } from '../game/collection';
import { DECK_SIZE } from '../game/engine';
import { MAX_PER_RARITY, canAdd, deckProblems } from '../game/deckRules';
import { teamColor } from '../game/teamColors';

interface Props {
  progress: Progress;
  onStart: (deck: Card[], slot: number) => void;
  onSave: (decks: string[][], active: number) => void; // salva i 3 mazzi e lo slot in uso
  onBack: () => void;
  banner?: string; // es. sfida del giorno
  editOnly?: boolean; // solo preparare i mazzi (sfida tra amici): niente "Gioca"
}

type SortKey = StatKey | 'nome';

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
  const [sort, setSort] = useState<SortKey>('nome');
  const problems = deckProblems(deck);

  const rows = useMemo(() => {
    const cards = ownedCards(progress);
    if (sort === 'nome') return cards.sort((a, b) => a.driver.lastName.localeCompare(b.driver.lastName) || a.firstYear - b.firstYear);
    const def = STATS.find((s) => s.key === sort)!;
    return cards.sort((a, b) => (def.lowerWins ? a.stats[sort] - b.stats[sort] : b.stats[sort] - a.stats[sort]));
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
        <div className="deck-slots">
          {Array.from({ length: DECK_SIZE }, (_, i) => {
            const c = deck[i];
            return (
              <button
                key={i}
                className={`slot ${c ? `rarity-${c.rarity} filled` : ''}`}
                onClick={() => c && toggle(c)}
                title={c ? t('deck_remove', { name: c.driver.name }) : t('deck_emptySlot')}
              >
                {c ? (
                  <>
                    <b>{c.driver.abbreviation}</b>
                    <small>{c.kind === 'career' ? '★' : c.team.name}</small>
                  </>
                ) : (
                  i + 1
                )}
              </button>
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

      <div className="table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th className={sort === 'nome' ? 'on' : ''} onClick={() => setSort('nome')}>
                {t('deck_colCard')}
              </th>
              {STATS.map((s) => (
                <th key={s.key} className={sort === s.key ? 'on' : ''} onClick={() => setSort(s.key)} title={statHint(s.key)}>
                  {statShort(s.key)}
                  {s.lowerWins && ' ↓'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const selected = deck.some((x) => x.id === c.id);
              const blocked = !selected && !canAdd(deck, c);
              return (
                <tr
                  key={c.id}
                  className={`${selected ? 'selected' : ''} ${blocked ? 'blocked' : ''}`}
                  onClick={() => toggle(c)}
                >
                  <td className="who" style={{ borderLeftColor: c.kind === 'career' ? '#c9a227' : teamColor(c.team.id) }}>
                    <span className={`dot rarity-${c.rarity}`} />
                    <b>{c.driver.name}</b>
                    <small>
                      {teamLabel(c, t)} · {c.period}
                    </small>
                  </td>
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
      </div>

      <TutorialSection
        items={['tut_deck_1', 'tut_deck_2', 'tut_deck_3', 'tut_deck_4']}
        params={{ leg: MAX_PER_RARITY.leggendaria ?? 0, gold: MAX_PER_RARITY.oro ?? 0 }}
      />
    </div>
  );
}

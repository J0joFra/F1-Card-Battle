import { useMemo, useState } from 'react';
import type { Card, StatKey } from '../types';
import { RARITY_LABEL, STATS, formatStat } from '../game/cards';
import { autoFillDeck, ownedCards, savedDeck, type Progress } from '../game/collection';
import { DECK_SIZE } from '../game/engine';
import { MAX_PER_RARITY, canAdd, deckProblems } from '../game/deckRules';
import { teamColor } from '../game/teamColors';

interface Props {
  progress: Progress;
  onStart: (deck: Card[]) => void;
  onBack: () => void;
}

type SortKey = StatKey | 'nome';

export function DeckBuilderScreen({ progress, onStart, onBack }: Props) {
  // se non c'è un mazzo salvato (o è incompleto) lo prepariamo noi: si può giocare subito
  const [prefilled] = useState(() => savedDeck(progress).length < DECK_SIZE);
  const [deck, setDeck] = useState<Card[]>(() => autoFillDeck(progress, savedDeck(progress)));
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
    .map(([r, n]) => `max ${n} ${RARITY_LABEL[r as keyof typeof RARITY_LABEL]}`)
    .join(', ');

  return (
    <div className="builder">
      <div className="section-head">
        <h2>Crea il tuo mazzo</h2>
        <button className="btn ghost" onClick={onBack}>
          Indietro
        </button>
      </div>
      <p className="muted intro">
        Scegli {DECK_SIZE} card, una per round. A ogni round esce una tua card a caso; la metrica la sceglie chi ha
        vinto il round prima, e ogni metrica si usa una sola volta per partita. Conviene un mazzo forte su metriche
        diverse. Limiti: {limits}.
      </p>

      {prefilled && (
        <p className="prefilled">
          Ecco un mazzo pronto, scelto a caso dalla tua collezione: puoi giocare subito o cambiarlo toccando le card.
        </p>
      )}

      <div className="deck-bar">
        <div className="deck-slots">
          {Array.from({ length: DECK_SIZE }, (_, i) => {
            const c = deck[i];
            return (
              <button
                key={i}
                className={`slot ${c ? `rarity-${c.rarity} filled` : ''}`}
                onClick={() => c && toggle(c)}
                title={c ? `Togli ${c.driver.name}` : 'Slot libero'}
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
        <div className="deck-best">
          {STATS.map((s) => {
            const v = bestInDeck(s.key);
            return (
              <span key={s.key} title={`Miglior valore del mazzo: ${s.label}`}>
                <small>{s.short}</small>
                <b>{v === null ? '–' : formatStat(s, v)}</b>
              </span>
            );
          })}
        </div>
        {problems.length > 0 && deck.length > 0 && <p className="problems">{problems.join(' ')}</p>}
        <div className="actions start">
          <button className="btn ghost" onClick={() => setDeck(autoFillDeck(progress, deck))} disabled={deck.length >= DECK_SIZE}>
            Completa a caso
          </button>
          <button className="btn ghost" onClick={() => setDeck([])} disabled={!deck.length}>
            Svuota
          </button>
          <button className="btn primary" onClick={() => onStart(deck)} disabled={problems.length > 0}>
            Avvia partita
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th className={sort === 'nome' ? 'on' : ''} onClick={() => setSort('nome')}>
                Card
              </th>
              {STATS.map((s) => (
                <th key={s.key} className={sort === s.key ? 'on' : ''} onClick={() => setSort(s.key)} title={s.hint}>
                  {s.short}
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
                      {c.kind === 'career' ? '★ Carriera' : c.team.name} · {c.period}
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
    </div>
  );
}

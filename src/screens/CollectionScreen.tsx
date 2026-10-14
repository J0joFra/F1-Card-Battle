import { useMemo, useState } from 'react';
import type { Card, Rarity } from '../types';
import { ALL_CARDS, RARITIES, RARITY_LABEL, careerCardOf, teamCardsOfDriver } from '../game/cards';
import { CARD_PRICE, TOTAL_CARDS, collectionSize, type Progress } from '../game/collection';
import { DECK_SIZE } from '../game/engine';
import { CardView } from '../components/CardView';

interface Props {
  progress: Progress;
  onToggleDeck: (card: Card) => void;
  onBuy: (card: Card) => void;
}

type OwnedFilter = 'tutte' | 'mie' | 'mancanti';

export function CollectionScreen({ progress, onToggleDeck, onBuy }: Props) {
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<Rarity | 'tutte'>('tutte');
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('mie');
  const [selected, setSelected] = useState<Card | null>(null);

  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_CARDS.filter((c) => {
      const owned = !!progress.owned[c.id];
      if (ownedFilter === 'mie' && !owned) return false;
      if (ownedFilter === 'mancanti' && owned) return false;
      if (rarity !== 'tutte' && c.rarity !== rarity) return false;
      if (q && !`${c.driver.name} ${c.team.name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, rarity, ownedFilter, progress.owned]);

  const deck = progress.deck;
  const inDeck = (c: Card) => deck.includes(c.id);

  return (
    <div className="collection">
      <div className="section-head">
        <h2>Collezione</h2>
        <span className="muted">
          {collectionSize(progress)}/{TOTAL_CARDS} card · {progress.credits} crediti
        </span>
      </div>

      <div className="deck-bar">
        <div>
          <b>Il tuo mazzo</b>{' '}
          <span className="muted">
            {deck.length}/{DECK_SIZE} scelte
            {deck.length < DECK_SIZE && ' · le altre vengono pescate a caso dalla collezione'}
          </span>
        </div>
        <div className="deck-slots">
          {Array.from({ length: DECK_SIZE }, (_, i) => {
            const id = deck[i];
            const c = id ? ALL_CARDS.find((x) => x.id === id) : undefined;
            return (
              <span key={i} className={`slot ${c ? `rarity-${c.rarity} filled` : ''}`} title={c?.driver.name}>
                {c ? c.driver.abbreviation : ''}
              </span>
            );
          })}
        </div>
      </div>

      <div className="filters">
        <input
          type="search"
          placeholder="Cerca pilota o scuderia"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          {(['mie', 'mancanti', 'tutte'] as OwnedFilter[]).map((f) => (
            <button key={f} className={`chip ${ownedFilter === f ? 'on' : ''}`} onClick={() => setOwnedFilter(f)}>
              {f === 'mie' ? 'Le mie' : f === 'mancanti' ? 'Mancanti' : 'Tutte'}
            </button>
          ))}
          <span className="sep" />
          {(['tutte', ...RARITIES] as const).map((r) => (
            <button key={r} className={`chip ${rarity === r ? 'on' : ''}`} onClick={() => setRarity(r)}>
              {r === 'tutte' ? 'Ogni rarità' : RARITY_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="muted empty">Nessuna card con questi filtri.</p>
      ) : (
        <div className="grid">
          {cards.map((c) => (
            <div key={c.id} className={`grid-item ${inDeck(c) ? 'in-deck' : ''}`}>
              <CardView
                card={c}
                size="sm"
                dimmed={!progress.owned[c.id]}
                count={progress.owned[c.id]}
                onClick={() => setSelected(c)}
              />
            </div>
          ))}
        </div>
      )}

      {selected && (
        <CardModal
          card={selected}
          progress={progress}
          onClose={() => setSelected(null)}
          onToggleDeck={() => onToggleDeck(selected)}
          onBuy={() => onBuy(selected)}
        />
      )}
    </div>
  );
}

function CardModal({
  card,
  progress,
  onClose,
  onToggleDeck,
  onBuy,
}: {
  card: Card;
  progress: Progress;
  onClose: () => void;
  onToggleDeck: () => void;
  onBuy: () => void;
}) {
  const owned = !!progress.owned[card.id];
  const inDeck = progress.deck.includes(card.id);
  const price = CARD_PRICE[card.rarity];
  const teamCards = teamCardsOfDriver(card.driver.id);
  const career = careerCardOf(card.driver.id);
  const ownedTeams = teamCards.filter((c) => progress.owned[c.id]).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <CardView card={card} dimmed={!owned} />
        <div className="modal-side">
          {career && (
            <p className="muted">
              Card scuderia di {card.driver.lastName}: {ownedTeams}/{teamCards.length}.
              {progress.owned[career.id]
                ? ' Carriera sbloccata ★'
                : ' Completale tutte per sbloccare la card Carriera.'}
            </p>
          )}
          {owned ? (
            <button className="btn primary" onClick={onToggleDeck} disabled={!inDeck && progress.deck.length >= DECK_SIZE}>
              {inDeck ? 'Togli dal mazzo' : progress.deck.length >= DECK_SIZE ? 'Mazzo pieno' : 'Metti nel mazzo'}
            </button>
          ) : (
            <button className="btn primary" onClick={onBuy} disabled={progress.credits < price}>
              Compra per {price} crediti
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}

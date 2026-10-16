import { useMemo, useState } from 'react';
import type { Card, Rarity } from '../types';
import { Search, X } from 'lucide-react';
import { ALL_CARDS, RARITIES, careerCardOf, rarityLabel, teamCardsOfDriver } from '../game/cards';
import { useI18n } from '../lib/i18n';
import { HelpButton } from '../components/TutorialSection';
import { TOTAL_CARDS, collectionSize, type Progress } from '../game/collection';
import { CardView } from '../components/CardView';

interface Props {
  progress: Progress;
  today: string;
  onShop: () => void; // la card è tra quelle del giorno nel negozio
}

type OwnedFilter = 'tutte' | 'mie' | 'mancanti';

export function CollectionScreen({ progress, today, onShop }: Props) {
  const { t } = useI18n();
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


  return (
    <div className="screen collection">
      <header className="screen-head">
        <h2>{t('col_title')}</h2>
        <span className="muted">{t('col_count', { a: collectionSize(progress), b: TOTAL_CARDS })}</span>
        <HelpButton items={['tut_coll_1', 'tut_coll_2', 'tut_coll_3']} />
      </header>
      <div className="col-progress bar">
        <div style={{ width: `${(collectionSize(progress) / TOTAL_CARDS) * 100}%` }} />
      </div>

      <div className="filters">
        <label className="search">
          <Search size={16} />
          <input type="search" placeholder={t('col_search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="chips">
          {(['mie', 'mancanti', 'tutte'] as OwnedFilter[]).map((f) => (
            <button key={f} className={`chip ${ownedFilter === f ? 'on' : ''}`} onClick={() => setOwnedFilter(f)}>
              {f === 'mie' ? t('f_mine') : f === 'mancanti' ? t('f_missing') : t('f_all')}
            </button>
          ))}
          <span className="sep" />
          {(['tutte', ...RARITIES] as const).map((r) => (
            <button key={r} className={`chip ${rarity === r ? 'on' : ''}`} onClick={() => setRarity(r)}>
              {r === 'tutte' ? t('f_anyRarity') : rarityLabel(r)}
            </button>
          ))}
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="muted empty">{t('col_empty')}</p>
      ) : (
        <div className="grid">
          {cards.map((c) => (
            <div key={c.id} className="grid-item">
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
          inShop={progress.store?.date === today && progress.store.cards.includes(selected.id)}
          onClose={() => setSelected(null)}
          onShop={onShop}
        />
      )}

    </div>
  );
}

function CardModal({
  card,
  progress,
  inShop,
  onClose,
  onShop,
}: {
  card: Card;
  progress: Progress;
  inShop: boolean;
  onClose: () => void;
  onShop: () => void;
}) {
  const { t } = useI18n();
  const owned = !!progress.owned[card.id];
  const teamCards = teamCardsOfDriver(card.driver.id);
  const career = careerCardOf(card.driver.id);
  const ownedTeams = teamCards.filter((c) => progress.owned[c.id]).length;

  return (
    <div className="overlay modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label={t('close')}>
          <X size={20} />
        </button>
        <CardView card={card} dimmed={!owned} />
        <div className="modal-side">
          {career && (
            <p className="muted">
              {t('col_teamProgress', { name: card.driver.lastName, a: ownedTeams, b: teamCards.length })}{' '}
              {progress.owned[career.id] ? t('col_careerUnlocked') : t('col_careerHint')}
            </p>
          )}
          {!owned && inShop && (
            <button className="btn primary block" onClick={onShop}>
              🛒 {t('shop_inShopToday')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

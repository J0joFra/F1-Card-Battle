import { useMemo, useState } from 'react';
import type { Card, Rarity } from '../types';
import { Search } from 'lucide-react';
import { ALL_CARDS, RARITIES, careerCardOf, rarityLabel, teamCardsOfDriver } from '../game/cards';
import { useI18n } from '../lib/i18n';
import { HelpButton } from '../components/TutorialSection';
import { TOTAL_CARDS, collectionSize, jollyTargets, type Progress } from '../game/collection';
import { askConfirm } from '../components/ConfirmDialog';
import { FlipCard } from '../components/FlipCard';
import { useProgressive } from '../hooks/useProgressive';

interface Props {
  progress: Progress;
  today: string;
  onShop: () => void; // la card è tra quelle del giorno nel negozio
  onUseJolly: (card: Card) => void;
}

type OwnedFilter = 'tutte' | 'mie' | 'mancanti';

export function CollectionScreen({ progress, today, onShop, onUseJolly }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<Rarity | 'tutte'>('tutte');
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('mie');

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
  const inShop = (c: Card) => progress.store?.date === today && progress.store.cards.includes(c.id);
  const { limit, sentinel } = useProgressive(cards.length, 40, `${query}|${rarity}|${ownedFilter}`);

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
          {(['tutte', ...RARITIES, 'classica', 'pioniere'] as const).map((r) => (
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
          {cards.slice(0, limit).map((c) => (
            <div key={c.id} className="grid-item">
              <FlipCard
                card={c}
                dimmed={!progress.owned[c.id]}
                count={progress.owned[c.id]}
                action={<CardInfo card={c} progress={progress} inShop={inShop(c)} onShop={onShop} onUseJolly={onUseJolly} />}
              />
            </div>
          ))}
          {limit < cards.length && <div ref={sentinel} className="grid-sentinel" />}
        </div>
      )}
    </div>
  );
}

// sul retro della card: avanzamento verso la card carriera e, se manca, il negozio di oggi
function CardInfo({
  card,
  progress,
  inShop,
  onShop,
  onUseJolly,
}: {
  card: Card;
  progress: Progress;
  inShop: boolean;
  onShop: () => void;
  onUseJolly: (card: Card) => void;
}) {
  const { t } = useI18n();
  const owned = !!progress.owned[card.id];
  // card mancante che si può prendere con un Jolly (si chiede conferma: il Jolly non va sprecato)
  const jollyOk = !owned && progress.jolly > 0 && jollyTargets(progress).some((tg) => tg.missing.includes(card));
  async function useJolly() {
    const ok = await askConfirm(t('j_confirm', { card: `${card.driver.name} · ${card.team.name} ${card.period}` }), {
      confirmLabel: t('j_use'),
    });
    if (ok) onUseJolly(card);
  }
  const career = careerCardOf(card.driver.id);
  const teamCards = teamCardsOfDriver(card.driver.id);
  const ownedTeams = teamCards.filter((c) => progress.owned[c.id]).length;
  const progressLine = career && card.kind === 'team';
  if (card.kind === 'pioneer' || card.kind === 'classic')
    return (
      <div className="card-info">
        <small>
          {card.kind === 'pioneer' ? '🏛' : '🎞️'} {t('card_collectOnly')}
        </small>
      </div>
    );
  if (!progressLine && !(inShop && !owned) && !jollyOk) return null;
  return (
    <div className="card-info">
      {progressLine && (
        <small
          title={`${t('col_teamProgress', { name: card.driver.lastName, a: ownedTeams, b: teamCards.length })} ${t(
            progress.owned[career.id] ? 'col_careerUnlocked' : 'col_careerHint'
          )}`}
        >
          ★ {ownedTeams}/{teamCards.length} {progress.owned[career.id] ? '✓' : ''}
        </small>
      )}
      {jollyOk && (
        <button className="btn primary" onClick={() => void useJolly()}>
          🃏 {t('j_take')}
        </button>
      )}
      {!owned && inShop && (
        <button className="btn primary" onClick={onShop}>
          🛒 {t('shop_inShopToday')}
        </button>
      )}
    </div>
  );
}

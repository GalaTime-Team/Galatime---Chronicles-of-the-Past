import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CommonInput from '../../../components/common/CommonInput';
import { playSfx } from '../../../controllers/audioController';
import { fetchItemCatalogue } from '../../../controllers/inventoryController';
import type { ItemDefinition } from '../../../types/InventoryType';

/** One effect of an item, rendered as a short label for the details pane. */
function describeEffect(effect: ItemDefinition['effects'][number]): string {
    switch (effect.type) {
        case 'restore':
            return effect.amountMax !== undefined
                ? `restore ${effect.resource} ${effect.amount}–${effect.amountMax}`
                : `restore ${effect.resource} ${effect.amount}`;
        case 'restore_percent':
            return `restore ${effect.resource} ${effect.amountPercent}%`;
        case 'damage':
            return effect.element ? `damage ${effect.amount} (${effect.element})` : `damage ${effect.amount}`;
        case 'status':
            return effect.turns === null
                ? `status ${effect.statusEffect}`
                : `status ${effect.statusEffect} (${effect.turns} turns)`;
        case 'revive':
            return `revive ${effect.amountPercent}%`;
        case 'cleanse':
            return 'cleanse';
        case 'drain':
            return `drain ${effect.amount} (heals ${effect.drainPercent ?? 100}%)`;
        case 'mystery':
            return 'mystery';
    }
}

/**
 * Items tab of the Test Playground.
 *
 * A read-only browser over the item catalogue: search by id or name, pick an
 * entry and read what it does. It never mutates state — combat stock is
 * declared per slot in the combat setup, so there is nothing to seed here.
 */
export function TestItemsPanel() {
    const { t } = useTranslation('playground');
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const catalogue = useMemo(
        () => [...fetchItemCatalogue().values()].sort((a, b) => a.id.localeCompare(b.id)),
        [],
    );

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (needle === '') return catalogue;

        return catalogue.filter(
            (item) => item.id.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle),
        );
    }, [catalogue, query]);

    const selected = useMemo(
        () => (selectedId ? catalogue.find((item) => item.id === selectedId) ?? null : null),
        [catalogue, selectedId],
    );

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
                <p className="text-xs text-white/50">
                    {t('playground.items.catalogueCount', { total: catalogue.length })}
                </p>

                <div className="ml-auto w-full max-w-sm">
                    <CommonInput
                        variant="bare"
                        title={t('playground.items.searchTitle')}
                        value={query}
                        onChange={setQuery}
                        placeholder={t('playground.items.searchPlaceholder')}
                        maxCharacters={40}
                        containerClassName="items-end"
                        inputClassName="text-left"
                    />
                </div>
            </div>

            <div className="flex min-h-0 flex-1 gap-3">
                <div className="min-h-0 flex-1 overflow-y-auto border border-white/10">
                    <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-black/70 text-white/45">
                            <tr>
                                <th className="px-2 py-1.5 font-normal uppercase tracking-[0.15em]">ID</th>
                                <th className="px-2 py-1.5 font-normal uppercase tracking-[0.15em]">Name</th>
                                <th className="px-2 py-1.5 font-normal uppercase tracking-[0.15em]">Category</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((item) => (
                                <tr
                                    key={item.id}
                                    onClick={() => {
                                        playSfx('click');
                                        setSelectedId(item.id);
                                    }}
                                    className={`cursor-pointer border-t border-white/5 transition-colors ${
                                        selectedId === item.id ? 'bg-white/15' : 'hover:bg-white/5'
                                    }`}
                                >
                                    <td className="px-2 py-1.5 text-white/60">{item.id}</td>
                                    <td className="px-2 py-1.5 text-white/80">{item.name}</td>
                                    <td className="px-2 py-1.5 text-white/60">{item.category}</td>
                                </tr>
                            ))}
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-2 py-3 text-center text-white/50">
                                        {t('playground.items.noResults')}
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>

                <div className="min-h-0 w-72 shrink-0 overflow-y-auto border border-white/10 p-2">
                    <h3 className="mb-2 text-xs uppercase tracking-[0.15em] text-white/45">
                        {t('playground.items.detailsTitle')}
                    </h3>

                    {!selected ? (
                        <p className="text-xs text-white/50">{t('playground.items.selectPrompt')}</p>
                    ) : (
                        <ItemDetails key={selected.id} item={selected} />
                    )}
                </div>
            </div>
        </div>
    );
}

/** The right-hand pane: what the item is and what using it does. */
function ItemDetails({ item }: { item: ItemDefinition }) {
    const { t } = useTranslation('playground');

    return (
        <div className="flex flex-col gap-2 text-xs text-white/75">
            <p className="text-sm font-semibold text-white">{item.name}</p>
            <p className="text-white/50">{item.id}</p>
            <p className="text-white/70">{item.description}</p>

            <dl className="flex flex-col gap-1 border-t border-white/10 pt-2">
                <div className="flex justify-between gap-2">
                    <dt className="text-white/45">{t('playground.items.category')}</dt>
                    <dd>{item.category}</dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-white/45">{t('playground.items.target')}</dt>
                    <dd>{item.target}</dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-white/45">{t('playground.items.maxStack')}</dt>
                    <dd>{item.max_stack ?? t('playground.items.maxStackUnlimited')}</dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-white/45">{t('playground.items.usableInCombat')}</dt>
                    <dd>{item.usable_in_combat ? '✓' : '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-white/45">{t('playground.items.usableOutsideCombat')}</dt>
                    <dd>{item.usable_outside_combat ? '✓' : '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-white/45">{t('playground.items.consumedOnUse')}</dt>
                    <dd>{item.consumed_on_use ? '✓' : '—'}</dd>
                </div>
            </dl>

            <div className="border-t border-white/10 pt-2">
                <p className="mb-1 text-white/45">{t('playground.items.effects')}</p>
                {item.effects.length === 0 ? (
                    <p className="text-white/50">{t('playground.items.noEffects')}</p>
                ) : (
                    <ul className="flex flex-col gap-1">
                        {item.effects.map((effect, index) => (
                            <li key={index} className="text-white/75">
                                {describeEffect(effect)}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default TestItemsPanel;

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AddIcon, RemoveIcon } from '../../../../assets/GalatimeIcon';
import CommonInput from '../../../../components/common/CommonInput';
import CommonPopup from '../../../../components/common/CommonPopup';
import { MAX_CARRIED_WEAPONS } from '../../../../constants/CombatConstants';
import { playSfx } from '../../../../controllers/audioController';
import { fetchItemCatalogue } from '../../../../controllers/inventoryController';
import { listWeapons } from '../../../../services/weaponCatalogService';
import type { EntityInventoryState } from '../../../../types/InventoryType';
import type { WeaponDefinition } from '../../../../types/WeaponType';

type StockTab = 'items' | 'weapons';

interface TestSlotInventoryPopupProps {
    open: boolean;
    /** Name of the character being stocked, for the title. */
    entityName: string;
    /** Inventory the slot currently declares; the draft starts as a copy of it. */
    inventory: EntityInventoryState;
    /**
     * Weapon ids the slot carries now, the same id repeated once per copy; the draft
     * starts as a copy of it.
     */
    weapons: string[];
    /** Applied when the player confirms; the draft is discarded on cancel. */
    onConfirm: (inventory: EntityInventoryState, weapons: string[]) => void;
    onDismiss: () => void;
}

/** One stepper row, shared by both tabs: a name, an id, and a count with +/- on each side. */
function StockRow({
    name,
    id,
    quantity,
    canAdd,
    canRemove,
    onAdd,
    onRemove,
    addLabel,
    removeLabel,
}: {
    name: string;
    id: string;
    quantity: number;
    canAdd: boolean;
    canRemove: boolean;
    onAdd: () => void;
    onRemove: () => void;
    addLabel: string;
    removeLabel: string;
}) {
    return (
        <li
            className={`flex items-center gap-3 border-b border-white/5 px-2 py-1.5 ${
                quantity > 0 ? 'bg-white/10' : ''
            }`}
        >
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/85">{name}</p>
                <p className="font-mono text-[0.6rem] text-white/35">{id}</p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    aria-label={`${name}: ${removeLabel}`}
                    disabled={!canRemove}
                    onMouseEnter={() => playSfx('hover')}
                    onClick={() => {
                        playSfx('click');
                        onRemove();
                    }}
                    className="flex h-6 w-6 items-center justify-center text-white/50 transition-colors duration-200 ease-out enabled:hover:bg-white/15 enabled:hover:text-white disabled:opacity-30"
                >
                    <RemoveIcon className="h-3 w-3" />
                </button>

                <span className="w-8 text-center text-sm tabular-nums text-white/90">
                    {quantity}
                </span>

                <button
                    type="button"
                    aria-label={`${name}: ${addLabel}`}
                    disabled={!canAdd}
                    onMouseEnter={() => playSfx('hover')}
                    onClick={() => {
                        playSfx('click');
                        onAdd();
                    }}
                    className="flex h-6 w-6 items-center justify-center text-white/50 transition-colors duration-200 ease-out enabled:hover:bg-white/15 enabled:hover:text-white disabled:opacity-30"
                >
                    <AddIcon className="h-3 w-3" />
                </button>
            </div>
        </li>
    );
}

/**
 * Stock editor of one roster slot: what the character carries into the fight.
 *
 * Two tabs with the same layout: a search field, a count line and a row per entry with
 * +/- steppers. Items step their quantity up to their stack limit. Weapons step their
 * copies up, and the total weapons carried is capped at {@link MAX_CARRIED_WEAPONS}. The
 * draft is local: cancelling leaves the slot untouched, and confirming hands fresh values
 * back to the setup.
 */
export function TestSlotInventoryPopup({
    open,
    entityName,
    inventory,
    weapons,
    onConfirm,
    onDismiss,
}: TestSlotInventoryPopupProps) {
    const { t } = useTranslation('playground');
    const [tab, setTab] = useState<StockTab>('items');
    const [itemQuery, setItemQuery] = useState('');
    const [weaponQuery, setWeaponQuery] = useState('');
    const [draft, setDraft] = useState<EntityInventoryState>({});
    const [weaponDraft, setWeaponDraft] = useState<string[]>([]);
    const [weaponCatalogue, setWeaponCatalogue] = useState<WeaponDefinition[]>([]);

    // Every open starts from the slot's current stock and clean search fields.
    useEffect(() => {
        if (open) {
            setDraft({ ...inventory });
            setWeaponDraft([...weapons]);
            setItemQuery('');
            setWeaponQuery('');
            setTab('items');
        }
        // The slot's stock is read only when the popup opens, not on every keystroke.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // The weapon catalogue is read from disk once, the first time the popup opens.
    useEffect(() => {
        if (!open) return undefined;

        let cancelled = false;
        void listWeapons().then((entries) => {
            if (!cancelled) setWeaponCatalogue(entries);
        });

        return () => {
            cancelled = true;
        };
    }, [open]);

    /** The catalogue, sorted so browsing reads alphabetically. */
    const items = useMemo(
        () => [...fetchItemCatalogue().values()].sort((a, b) => a.name.localeCompare(b.name)),
        [],
    );

    /** Catalogue narrowed by the search field, matched on name or id. */
    const visibleItems = useMemo(() => {
        const needle = itemQuery.trim().toLowerCase();

        if (!needle) return items;

        return items.filter((item) => (
            item.name.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle)
        ));
    }, [items, itemQuery]);

    /** Weapons sorted by name, narrowed by the same search rule as items. */
    const visibleWeapons = useMemo(() => {
        const needle = weaponQuery.trim().toLowerCase();
        const sorted = [...weaponCatalogue].sort((a, b) => a.name.localeCompare(b.name));

        if (!needle) return sorted;

        return sorted.filter((weapon) => (
            weapon.name.toLowerCase().includes(needle) || weapon.id.toLowerCase().includes(needle)
        ));
    }, [weaponCatalogue, weaponQuery]);

    /** How many distinct items the draft carries, for the footer count. */
    const carriedKinds = useMemo(
        () => Object.values(draft).filter((quantity) => quantity > 0).length,
        [draft],
    );

    /** How many copies of each weapon the draft carries. */
    const weaponCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const id of weaponDraft) counts.set(id, (counts.get(id) ?? 0) + 1);
        return counts;
    }, [weaponDraft]);

    const changeQuantity = (itemId: string, delta: number, maxStack: number | null) => {
        setDraft((current) => {
            const next = Math.max(0, (current[itemId] ?? 0) + delta);
            const capped = maxStack === null ? next : Math.min(next, maxStack);

            if (capped === (current[itemId] ?? 0)) return current;

            const updated = { ...current };
            if (capped === 0) {
                delete updated[itemId];
            } else {
                updated[itemId] = capped;
            }

            return updated;
        });
    };

    /** Adds a copy of a weapon to the end of the carried list, if the cap allows it. */
    const addWeapon = (weaponId: string) => {
        setWeaponDraft((current) => (
            current.length >= MAX_CARRIED_WEAPONS ? current : [...current, weaponId]
        ));
    };

    /** Takes one copy of a weapon off, the last one carried. */
    const removeWeapon = (weaponId: string) => {
        setWeaponDraft((current) => {
            const at = current.lastIndexOf(weaponId);
            if (at < 0) return current;
            return current.filter((_, index) => index !== at);
        });
    };

    const confirm = () => {
        playSfx('click');
        onConfirm(draft, weaponDraft);
    };

    const tabClass = (active: boolean) => `px-3 py-1 text-xs uppercase tracking-[0.15em] transition-colors duration-200 ${
        active ? 'bg-white text-galatime-dark' : 'text-white/50 hover:bg-white/10 hover:text-white'
    }`;

    const weaponsFull = weaponDraft.length >= MAX_CARRIED_WEAPONS;

    return (
        <CommonPopup
            open={open}
            onDismiss={onDismiss}
            title={t('playground.combat.inventoryTitle', { name: entityName })}
            size="md"
            confirmAction={{
                label: t('playground.combat.inventoryConfirm'),
                onPress: confirm,
            }}
            cancelAction={{ label: t('playground.combat.cancel'), variant: 'ghost' }}
        >
            <div role="tablist" className="flex gap-1 border-b border-white/10 pb-2">
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'items'}
                    onMouseEnter={() => playSfx('hover')}
                    onClick={() => {
                        playSfx('click');
                        setTab('items');
                    }}
                    className={tabClass(tab === 'items')}
                >
                    {t('playground.combat.tabItems')}
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'weapons'}
                    onMouseEnter={() => playSfx('hover')}
                    onClick={() => {
                        playSfx('click');
                        setTab('weapons');
                    }}
                    className={tabClass(tab === 'weapons')}
                >
                    {t('playground.combat.tabWeapons')}
                </button>
            </div>

            {tab === 'items' && (
                <>
                    <div className="mx-auto mt-4 w-full max-w-sm">
                        <CommonInput
                            title={t('playground.combat.inventorySearchTitle')}
                            value={itemQuery}
                            onChange={setItemQuery}
                            placeholder={t('playground.combat.inventorySearchPlaceholder')}
                            maxCharacters={40}
                        />
                    </div>

                    <p className="mt-4 text-xs uppercase tracking-[0.15em] text-white/40">
                        {t('playground.combat.inventoryCount', { count: carriedKinds })}
                    </p>

                    <ul className="mt-2 max-h-72 overflow-y-auto border-t border-white/10">
                        {visibleItems.map((item) => {
                            const quantity = draft[item.id] ?? 0;

                            return (
                                <StockRow
                                    key={item.id}
                                    name={item.name}
                                    id={`${item.id}${item.max_stack !== null ? ` · ${t('playground.combat.inventoryMax', { max: item.max_stack })}` : ''}`}
                                    quantity={quantity}
                                    canAdd={item.max_stack === null || quantity < item.max_stack}
                                    canRemove={quantity > 0}
                                    onAdd={() => changeQuantity(item.id, 1, item.max_stack)}
                                    onRemove={() => changeQuantity(item.id, -1, item.max_stack)}
                                    addLabel={t('playground.combat.inventoryAddOne')}
                                    removeLabel={t('playground.combat.inventoryRemoveOne')}
                                />
                            );
                        })}

                        {visibleItems.length === 0 && (
                            <li className="px-2 py-3 text-sm text-white/45">
                                {t('playground.combat.inventoryNoResults')}
                            </li>
                        )}
                    </ul>
                </>
            )}

            {tab === 'weapons' && (
                <>
                    <div className="mx-auto mt-4 w-full max-w-sm">
                        <CommonInput
                            title={t('playground.combat.weaponSearchTitle')}
                            value={weaponQuery}
                            onChange={setWeaponQuery}
                            placeholder={t('playground.combat.inventorySearchPlaceholder')}
                            maxCharacters={40}
                        />
                    </div>

                    <p className="mt-4 text-xs uppercase tracking-[0.15em] text-white/40">
                        {weaponDraft.length === 0
                            ? t('playground.combat.weaponNone')
                            : t('playground.combat.weaponCount', { count: weaponDraft.length, max: MAX_CARRIED_WEAPONS })}
                    </p>

                    <ul className="mt-2 max-h-72 overflow-y-auto border-t border-white/10">
                        {visibleWeapons.map((weapon) => {
                            const quantity = weaponCounts.get(weapon.id) ?? 0;

                            return (
                                <StockRow
                                    key={weapon.id}
                                    name={weapon.name}
                                    id={weapon.id}
                                    quantity={quantity}
                                    canAdd={!weaponsFull}
                                    canRemove={quantity > 0}
                                    onAdd={() => addWeapon(weapon.id)}
                                    onRemove={() => removeWeapon(weapon.id)}
                                    addLabel={t('playground.combat.weaponAdd')}
                                    removeLabel={t('playground.combat.weaponRemove')}
                                />
                            );
                        })}

                        {visibleWeapons.length === 0 && (
                            <li className="px-2 py-3 text-sm text-white/45">
                                {t('playground.combat.inventoryNoResults')}
                            </li>
                        )}
                    </ul>
                </>
            )}
        </CommonPopup>
    );
}

export default TestSlotInventoryPopup;

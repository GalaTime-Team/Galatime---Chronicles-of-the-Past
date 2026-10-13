import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CommonButton from '../../../components/common/CommonButton';
import { playSfx } from '../../../controllers/audioController';
import {
    SETUP_LINES,
    SETUP_SIDES,
    SLOTS_PER_LINE,
    catalogueKey,
    countSide,
    defaultWeaponIds,
    isSetupValid,
    slotAt,
    type CatalogueEntity,
    type CombatSetup,
} from './combatSetupModel';
import type { CombatLine, CombatSide } from '../../../types/CombatType';
import type { EntityInventoryState } from '../../../types/InventoryType';
import { TestCombatPickerPopup } from './components/TestCombatPickerPopup';
import { TestCombatSlot } from './components/TestCombatSlot';
import { TestSlotInventoryPopup } from './components/TestSlotInventoryPopup';

/** Roster position the entity picker is currently filling. */
interface PickerTarget {
    side: CombatSide;
    line: CombatLine;
    index: number;
}

interface TestCombatSetupProps {
    setup: CombatSetup;
    /** Catalogue indexed by {@link catalogueKey}, so a filled slot can show its sprite. */
    entities: ReadonlyMap<string, CatalogueEntity>;
    onFill: (side: CombatSide, line: CombatLine, index: number, entity: CatalogueEntity) => void;
    onClear: (side: CombatSide, line: CombatLine, index: number) => void;
    onToggleControl: (side: CombatSide, line: CombatLine, index: number) => void;
    onSetLoadout: (
        side: CombatSide,
        line: CombatLine,
        index: number,
        inventory: EntityInventoryState,
        weapons: string[],
    ) => void;
    onStart: () => void;
}

/**
 * Roster setup of the combat tab.
 *
 * Both sides get one row per battle line, each row a fixed number of positions that
 * mirror what the formation board can draw. Which position holds which character is
 * the player's call, and so is which of them they play: the control mark is the only
 * thing that decides whose actions the battle's HUD shows. Each filled slot also
 * carries an inventory the player stocks item by item — the only stock the fight
 * will know, because playground entities exist for one battle.
 */
export function TestCombatSetup({
    setup,
    entities,
    onFill,
    onClear,
    onToggleControl,
    onSetLoadout,
    onStart,
}: TestCombatSetupProps) {
    const { t } = useTranslation('playground');
    const [target, setTarget] = useState<PickerTarget | null>(null);
    const [inventoryTarget, setInventoryTarget] = useState<PickerTarget | null>(null);

    const valid = isSetupValid(setup);
    const inventorySlot = inventoryTarget ? slotAt(setup, inventoryTarget.side, inventoryTarget.line, inventoryTarget.index) : null;
    const inventoryEntity = inventorySlot
        ? entities.get(catalogueKey(inventorySlot.entityType, inventorySlot.entityId))
        : undefined;

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="min-h-0 flex-1 overflow-y-auto pb-1">
                <div className="grid gap-4 md:grid-cols-2">
                    {SETUP_SIDES.map((side) => (
                        <section
                            key={side}
                            aria-label={t(`playground.combat.${side}`)}
                            className="flex flex-col gap-3 border border-white/10 bg-white/5 p-3"
                        >
                            <div className="flex items-baseline justify-between gap-2">
                                <h3 className="text-sm uppercase tracking-[0.15em] text-white/80">
                                    {t(`playground.combat.${side}`)}
                                </h3>
                                <span className="font-mono text-xs text-white/35">
                                    {countSide(setup, side)}
                                </span>
                            </div>

                            {SETUP_LINES.map((line) => {
                                if (line === 'rear' && !setup[side].front.some((slot) => slot !== null)) {
                                    return null;
                                }

                                const filledCount = setup[side][line].filter((slot) => slot !== null).length;
                                const showAddButton = filledCount < SLOTS_PER_LINE;
                                /** First open position, so the lone "add" slot always lands in a gap. */
                                const nextIndex = setup[side][line].findIndex((slot) => slot === null);

                                return (
                                    <div key={line}>
                                        <p className="mb-1 text-[0.65rem] uppercase tracking-[0.15em] text-white/40">
                                            {t(`playground.combat.${line}`)}
                                        </p>

                                        <div className="flex gap-2 overflow-x-auto pb-2">
                                            {setup[side][line].map((slot, index) => {
                                                if (!slot) return null;

                                                const entity = entities.get(catalogueKey(slot.entityType, slot.entityId));
                                                const label = `${t(`playground.combat.${side}`)} ${t(`playground.combat.${line}`)} ${index + 1}`;

                                                return (
                                                    <TestCombatSlot
                                                        key={index}
                                                        slot={slot}
                                                        entity={entity}
                                                        label={label}
                                                        onAdd={() => setTarget({ side, line, index })}
                                                        onRemove={() => onClear(side, line, index)}
                                                        onToggleControl={() => onToggleControl(side, line, index)}
                                                        onOpenInventory={() => setInventoryTarget({ side, line, index })}
                                                    />
                                                );
                                            })}

                                            {showAddButton && nextIndex >= 0 && (
                                                <TestCombatSlot
                                                    slot={null}
                                                    label={`${t(`playground.combat.${side}`)} ${t(`playground.combat.${line}`)} ${nextIndex + 1}`}
                                                    onAdd={() => setTarget({ side, line, index: nextIndex })}
                                                    onRemove={() => {}}
                                                    onToggleControl={() => {}}
                                                    onOpenInventory={() => {}}
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </section>
                    ))}
                </div>
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                {/* Only a blocked start needs saying; a ready setup speaks for itself. */}
                <p aria-live="polite" className="text-sm text-galatime-warning">
                    {valid ? '' : t('playground.combat.needsBothSides')}
                </p>

                <CommonButton
                    variant="primary"
                    size="md"
                    disabled={!valid}
                    onPress={() => {
                        playSfx('click');
                        onStart();
                    }}
                >
                    {t('playground.combat.start')}
                </CommonButton>
            </footer>

            <TestCombatPickerPopup
                open={target !== null}
                catalogue={[...entities.values()]}
                onDismiss={() => setTarget(null)}
                onPick={(entity) => {
                    if (target) onFill(target.side, target.line, target.index, entity);
                    setTarget(null);
                }}
            />

            <TestSlotInventoryPopup
                open={inventoryTarget !== null && inventorySlot !== null}
                entityName={inventoryEntity?.name ?? inventorySlot?.entityId ?? ''}
                inventory={inventorySlot?.inventory ?? {}}
                weapons={inventorySlot ? (inventorySlot.weapons ?? (inventoryEntity ? defaultWeaponIds(inventoryEntity) : [])) : []}
                onDismiss={() => setInventoryTarget(null)}
                onConfirm={(inventory, weapons) => {
                    if (inventoryTarget) {
                        onSetLoadout(inventoryTarget.side, inventoryTarget.line, inventoryTarget.index, inventory, weapons);
                    }
                    setInventoryTarget(null);
                }}
            />
        </div>
    );
}

export default TestCombatSetup;

import { useTranslation } from 'react-i18next';
import { AddIcon, CloseIcon, ControlIcon, InventoryIcon } from '../../../../assets/GalatimeIcon';
import CommonImage from '../../../../components/common/CommonImage';
import CommonButton from '../../../../components/common/CommonButton';
import type { CatalogueEntity, SetupSlot } from '../combatSetupModel';

const UNKNOWN_SPRITE = '/images/ui/misc/unknown.png';

interface TestCombatSlotProps {
    /** The character standing here, or `null` when the position is empty. */
    slot: SetupSlot | null;
    /** Catalogue entry the slot holds; absent only while the catalogue is resolving. */
    entity?: CatalogueEntity;
    /** Describes the position, e.g. "Allies front line, slot 2". */
    label: string;
    onAdd: () => void;
    onRemove: () => void;
    onToggleControl: () => void;
    /** Opens the inventory editor; only filled slots can be stocked. */
    onOpenInventory: () => void;
}

/**
 * One roster position of the combat setup.
 *
 * Empty, it is the "add" button that opens the entity picker. Filled, it shows the
 * character together with the three marks the setup cares about: the control mark —
 * the visible "I play this one" switch — the inventory button that opens the stock
 * editor, and the remove button.
 */
export function TestCombatSlot({
    slot,
    entity,
    label,
    onAdd,
    onRemove,
    onToggleControl,
    onOpenInventory,
}: TestCombatSlotProps) {
    const { t } = useTranslation('playground');

    if (!slot) {
        return (
            <CommonButton
                variant="ghost"
                icon={<AddIcon className="h-4 w-4" />}
                className="h-20 w-20 shrink-0 border-game border-dashed border-white/15"
                title={t('playground.combat.slotEmpty')}
                aria-label={`${label}: ${t('playground.combat.slotEmpty')}`}
                onPress={onAdd}
            />
        );
    }

    const name = entity?.name ?? slot.entityId;
    /** Distinct items the slot declares, shown as the badge on the inventory button. */
    const carriedKinds = Object.values(slot.inventory).filter((quantity) => quantity > 0).length;

    return (
        <div
            className={`group relative flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 border-game px-1.5 py-1 transition-colors duration-300 ease-out ${slot.controlled
                ? 'border-galatime-primary bg-galatime-primary/15'
                : 'border-white/20 bg-white/5'
                }`}
        >
            <CommonButton
                variant="ghost"
                icon={<CloseIcon className="h-3 w-3" />}
                className="absolute -right-1.5 -top-1.5 h-5 w-5"
                aria-label={`${label}: ${t('playground.combat.remove')}`}
                onPress={onRemove}
            />

            <CommonImage
                src={entity?.spriteUrl ?? UNKNOWN_SPRITE}
                fallbackSrc={UNKNOWN_SPRITE}
                alt=""
                className="h-7 w-7 shrink-0"
            />

            <p className="w-full truncate text-center text-[0.65rem] text-white/85" title={name}>
                {name}
            </p>

            <div className="flex items-center gap-1">
                <CommonButton
                    variant="ghost"
                    icon={<ControlIcon className="h-3 w-3" />}
                    className={`h-5 w-5 ${slot.controlled
                        ? 'bg-white text-galatime-dark'
                        : 'opacity-50 hover:opacity-100'
                        }`}
                    aria-pressed={slot.controlled}
                    aria-label={`${label}: ${t(slot.controlled ? 'playground.combat.controlOn' : 'playground.combat.controlOff')}`}
                    onPress={onToggleControl}
                />

                <CommonButton
                    variant="ghost"
                    icon={<>
                        <InventoryIcon className="h-3 w-3" />
                        {carriedKinds > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-3 min-w-3 items-center justify-center bg-galatime-accent px-0.5 font-pixel text-[0.5rem] text-galatime-dark">
                                {carriedKinds}
                            </span>
                        )}
                    </>}
                    className={`relative h-5 w-5 ${carriedKinds > 0
                            ? 'bg-white text-galatime-dark'
                            : 'opacity-50 hover:opacity-100'
                        }`}
                    aria-label={`${label}: ${t('playground.combat.inventoryOpen')}`}
                    onPress={onOpenInventory}
                />
            </div>
        </div>
    );
}

export default TestCombatSlot;

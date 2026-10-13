import { useTranslation } from 'react-i18next';
import { AddIcon, CloseIcon, ControlIcon, InventoryIcon } from '../../../../assets/GalatimeIcon';
import CommonImage from '../../../../components/common/CommonImage';
import { playSfx } from '../../../../controllers/audioController';
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
            <button
                type="button"
                aria-label={`${label}: ${t('playground.combat.slotEmpty')}`}
                title={t('playground.combat.slotEmpty')}
                onMouseEnter={() => playSfx('hover')}
                onClick={() => {
                    playSfx('click');
                    onAdd();
                }}
                className="flex h-20 w-20 shrink-0 items-center justify-center border-2 border-dashed border-white/15 text-white/30 transition-colors duration-300 ease-out hover:border-white/40 hover:text-white/75"
            >
                <AddIcon className="h-4 w-4" />
            </button>
        );
    }

    const name = entity?.name ?? slot.entityId;
    /** Distinct items the slot declares, shown as the badge on the inventory button. */
    const carriedKinds = Object.values(slot.inventory).filter((quantity) => quantity > 0).length;

    return (
        <div
            className={`group relative flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 border-2 px-1.5 py-1 transition-colors duration-300 ease-out ${slot.controlled
                ? 'border-galatime-primary bg-galatime-primary/15'
                : 'border-white/20 bg-white/5'
                }`}
        >
            <button
                type="button"
                aria-label={`${label}: ${t('playground.combat.remove')}`}
                title={t('playground.combat.remove')}
                onMouseEnter={() => playSfx('hover')}
                onClick={() => {
                    playSfx('click');
                    onRemove();
                }}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center bg-galatime-dark text-white/70 opacity-0 transition-opacity duration-300 ease-out hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
            >
                <CloseIcon className="h-3 w-3" />
            </button>

            <CommonImage
                src={entity?.spriteUrl ?? UNKNOWN_SPRITE}
                fallbackSrc={UNKNOWN_SPRITE}
                alt=""
                className="h-7 w-7 shrink-0"
            />

            <p className="w-full truncate text-center text-[0.65rem] leading-tight text-white/85" title={name}>
                {name}
            </p>

            <div className="flex items-center gap-1">
                <button
                    type="button"
                    aria-pressed={slot.controlled}
                    aria-label={`${label}: ${t(slot.controlled ? 'playground.combat.controlOn' : 'playground.combat.controlOff')}`}
                    title={t(slot.controlled ? 'playground.combat.controlOn' : 'playground.combat.controlOff')}
                    onMouseEnter={() => playSfx('hover')}
                    onClick={() => {
                        playSfx('click');
                        onToggleControl();
                    }}
                    className={`flex h-5 w-5 items-center justify-center transition-colors duration-300 ease-out ${slot.controlled
                        ? 'bg-white text-galatime-dark'
                        : 'text-white/40 hover:bg-white/15 hover:text-white'
                        }`}
                >
                    <ControlIcon className="h-3 w-3" />
                </button>

                <button
                    type="button"
                    aria-label={`${label}: ${t('playground.combat.inventoryOpen')}`}
                    title={t('playground.combat.inventoryOpen')}
                    onMouseEnter={() => playSfx('hover')}
                    onClick={() => {
                        playSfx('click');
                        onOpenInventory();
                    }}
                    className={`relative flex h-5 w-5 items-center justify-center transition-colors duration-300 ease-out ${
                        carriedKinds > 0
                            ? 'text-galatime-accent hover:bg-white/15'
                            : 'text-white/40 hover:bg-white/15 hover:text-white'
                    }`}
                >
                    <InventoryIcon className="h-3 w-3" />

                    {carriedKinds > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-3 min-w-3 items-center justify-center bg-galatime-accent px-0.5 font-mono text-[0.5rem] leading-none text-galatime-dark">
                            {carriedKinds}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}

export default TestCombatSlot;

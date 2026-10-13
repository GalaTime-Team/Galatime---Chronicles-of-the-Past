import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CommonButton from '../../../components/common/CommonButton';
import { CombatEncounter } from '../../../components/game/combat/CombatEncounter';
import { playSfx } from '../../../controllers/audioController';
import type {
    CombatEncounter as CombatEncounterData,
    CombatEvent,
    CombatState,
    CombatUnit,
} from '../../../types/CombatType';
import { TestCombatLog } from './components/TestCombatLog';
import {
    buildEncounter,
    catalogueKey,
    clearSlot,
    createEmptySetup,
    fillSlot,
    loadEntityCatalogue,
    resolveUnitSprite,
    setSlotInventory,
    setSlotWeapons,
    toggleControlled,
    type CatalogueEntity,
    type CombatSetup,
} from './combatSetupModel';
import { TestCombatSetup } from './TestCombatSetup';

/**
 * Combat tab of the Test Playground.
 *
 * Two steps, because a fight cannot be shown before it is composed: the setup screen,
 * where both rosters are filled and the player marks which characters they play, and
 * then the battle itself — one `CombatEncounter`, which owns the session, the turn
 * queue and the opponent's moves, beside a log of everything the fight resolved.
 */
export function TestCombatPanel() {
    const { t } = useTranslation('playground');
    const [catalogue, setCatalogue] = useState<CatalogueEntity[] | null>(null);
    const [setup, setSetup] = useState<CombatSetup>(createEmptySetup);
    const [encounter, setEncounter] = useState<CombatEncounterData | null>(null);
    const [logEvents, setLogEvents] = useState<CombatEvent[]>([]);
    const [logUnits, setLogUnits] = useState<CombatUnit[]>([]);

    useEffect(() => {
        let cancelled = false;

        void loadEntityCatalogue().then((entries) => {
            if (!cancelled) setCatalogue(entries);
        });

        return () => {
            cancelled = true;
        };
    }, []);

    /** Catalogue indexed the way a roster slot looks its entity up. */
    const entities = useMemo(
        () => new Map((catalogue ?? []).map((entry) => [catalogueKey(entry.entityType, entry.entityId), entry])),
        [catalogue],
    );

    /**
     * Adds to the combat log: the events of one resolved step, plus the roster
     * that turns their unit ids back into names.
     */
    const handleEvents = useCallback((events: readonly CombatEvent[], next: CombatState) => {
        setLogEvents((current) => [...current, ...events]);
        setLogUnits(next.units);
    }, []);

    const handleStart = () => {
        if (!catalogue) return;
        setLogEvents([]);
        setLogUnits([]);
        setEncounter(buildEncounter(setup, t('playground.tabs.combat')));
    };

    if (catalogue === null) {
        return <p className="text-sm text-white/60">{t('playground.combat.loading')}</p>;
    }

    if (encounter) {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2">
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <CommonButton
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                            playSfx('click');
                            setEncounter(null);
                        }}
                    >
                        {t('playground.combat.reconfigure')}
                    </CommonButton>
                </div>

                <div className="flex min-h-0 flex-1 gap-3">
                    <div className="min-w-0 flex-1">
                        <CombatEncounter
                            encounter={encounter}
                            resolveSpriteUrl={resolveUnitSprite}
                            onEvents={handleEvents}
                            inventoryPicker
                            startOptions={{ persistInventories: false }}
                            className="h-full"
                        />
                    </div>

                    {/* Where the maths is read back: actions, multipliers, damage and deaths. */}
                    <div className="w-52 shrink-0">
                        <TestCombatLog
                            events={logEvents}
                            units={logUnits}
                            onClear={() => setLogEvents([])}
                            className="h-full"
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <TestCombatSetup
            setup={setup}
            entities={entities}
            onFill={(side, line, index, entity) => setSetup((current) => fillSlot(current, side, line, index, entity))}
            onClear={(side, line, index) => setSetup((current) => clearSlot(current, side, line, index))}
            onToggleControl={(side, line, index) => setSetup((current) => toggleControlled(current, side, line, index))}
            onSetLoadout={(side, line, index, inventory, weapons) =>
                setSetup((current) => setSlotWeapons(
                    setSlotInventory(current, side, line, index, inventory),
                    side,
                    line,
                    index,
                    weapons,
                ))
            }
            onStart={handleStart}
        />
    );
}

export default TestCombatPanel;


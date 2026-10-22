/**
 * Generalized battle screen.
 *
 * The single component the game composes a fight with: the battlefield where the
 * characters stand, and below it the active character's HUD (vitals, four attack
 * slots and the extra movements). Everything it draws is derived from a
 * `CombatState` produced by the combat backend, so it is the seam between
 * `services/combatService` and the presentation components.
 *
 * Whose turn it is decides what is drawn. A unit the player owns gets the action
 * area; during anybody else's turn the battlefield stands alone, because there is
 * nobody to hand actions to. Clicks on the board are reported through
 * `onEntitySelect` and the caller decides what they mean.
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CombatAction } from '../../../../types/CombatType';
import type { CombatBattleProps } from './CombatBattle.types';
import { CombatFormationHUD } from '../formation/CombatFormationHUD';
import { CombatHUD } from '../hud/CombatHUD';
import {
    indexActionsById,
    selectTurnUnit,
    toAttackCards,
    toExtraMovements,
    toFormationSides,
    toHudStats,
} from './combatBattleView';

export type { CombatBattleProps } from './CombatBattle.types';
export type { CombatFormationSides, CombatSpriteResolver } from './combatBattleView';

export function CombatBattle({
    state,
    sequence,
    animationsEnabled = true,
    previews,
    pendingActionId = null,
    targetIds,
    targetPreviews,
    resolveSpriteUrl,
    onActionSelect,
    onExtraMovementSelect,
    onEntitySelect,
    tooltipVisible,
    gridConfig,
    className = '',
}: CombatBattleProps) {
    const turnUnit = useMemo(() => selectTurnUnit(state), [state]);
    // While a step is being narrated the turn has not really moved on yet: the actor keeps
    // the marker and nobody is offered actions until the choreography finishes.
    const busy = sequence != null;
    // Only the player's own turn offers actions; an opponent's turn is watched.
    const playerTurn = !busy && turnUnit?.isPlayerControlled === true;
    // The HUD stays up for the whole of a player unit's turn, including its animation, and
    // fades out only when the turn passes to someone the player does not control.
    const hudVisible = turnUnit?.isPlayerControlled === true;

    /**
     * The first living player-controlled unit, in turn order.
     *
     * Used as the HUD unit while the turn belongs to an opponent: the area is faded out, but
     * still rendered so its height is reserved. Without it, the area would collapse at the
     * opening of a fight (an opponent often acts first) and the battlefield would jump when
     * the player's first turn arrived.
     */
    const reserveUnit = useMemo(() => {
        for (const id of state.order) {
            const unit = state.units.find((candidate) => candidate.id === id);
            if (unit?.isPlayerControlled && unit.status === 'alive') return unit;
        }
        return state.units.find((unit) => unit.isPlayerControlled && unit.status === 'alive') ?? null;
    }, [state]);

    /** The HUD shows the acting player unit; during an opponent's turn, the reserve unit. */
    const hudUnit = hudVisible ? turnUnit : reserveUnit;

    const sides = useMemo(
        () => toFormationSides(state.units, resolveSpriteUrl),
        [state.units, resolveSpriteUrl],
    );
    const stats = useMemo(() => toHudStats(hudUnit), [hudUnit]);
    // Cards are only usable on the player's own (idle) turn; while a step plays out they are
    // shown as out of reach, so the HUD can stay on screen without inviting a click.
    const attacks = useMemo(
        () => toAttackCards(hudUnit?.actions ?? [], previews, hudUnit).map((attack) => (
            playerTurn ? attack : { ...attack, disabled: true, disabledReason: undefined }
        )),
        [hudUnit, previews, playerTurn],
    );
    const extraMovements = useMemo(
        () => toExtraMovements(hudUnit?.actions ?? [], previews, hudUnit).map((movement) => (
            playerTurn ? movement : { ...movement, disabled: true, disabledReason: undefined }
        )),
        [hudUnit, previews, playerTurn],
    );
    const actionsById = useMemo(() => indexActionsById(hudUnit?.actions ?? []), [hudUnit]);

    /**
     * Height the action area last occupied.
     *
     * The area is only drawn on the player's turn, but it is not *removed* on
     * anybody else's: the battlefield would grow into the gap, re-centring every
     * sprite and moving the unit under the pointer out from under it - which is
     * exactly the unit whose health is mid-animation. Reserving the measured
     * height keeps the board perfectly still from turn to turn.
     */
    const [actionAreaHeight, setActionAreaHeight] = useState<number | null>(null);
    const actionAreaRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        const area = actionAreaRef.current;
        if (!hudUnit || !area) return;

        const height = area.offsetHeight;
        setActionAreaHeight((current) => (current === height ? current : height));
    }, [hudUnit, state]);

    /** Traces a clicked card back to the action it stands for. */
    const emitAction = (actionId: string, handler?: (action: CombatAction) => void) => {
        const action = actionsById.get(actionId);
        if (action) handler?.(action);
    };

    return (
        <section
            aria-label={state.encounterName}
            className={`flex h-full min-h-0 flex-col bg-galatime-background text-white ${className}`}
        >
            {/* Battlefield — where the characters stand */}
            <div className="min-h-0 flex-1">
                <CombatFormationHUD
                    allies={sides.allies}
                    adversaries={sides.adversaries}
                    activeUnitId={sequence?.actorId ?? turnUnit?.id}
                    targetableIds={playerTurn ? targetIds : undefined}
                    targetPreviews={targetPreviews}
                    sequence={sequence}
                    animationsEnabled={animationsEnabled}
                    hour={state.hour}
                    timePhase={state.timePhase}
                    onEntitySelect={(entity) => {
                        if (entity) onEntitySelect?.(entity.id);
                    }}
                    tooltipVisible={tooltipVisible}
                    className="h-full"
                />
            </div>

            {/* Combat HUD — the active character's vitals, attacks and movements.
                Faded out, but never unmounted, while somebody the player does not own
                is acting: the reserved space is what stops the board from jumping. */}
            <div
                ref={actionAreaRef}
                style={actionAreaHeight === null ? undefined : { minHeight: actionAreaHeight }}
                aria-label="Combat actions"
                aria-hidden={!hudVisible}
                className={`shrink-0 bg-galatime-background px-2 pb-2 pt-1 transition-opacity duration-300 ${hudVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            >
                {hudUnit && (
                    <CombatHUD
                        hp={stats.hp}
                        mana={stats.mana}
                        stamina={stats.stamina}
                        attacks={attacks}
                        extraMovements={extraMovements}
                        gridConfig={gridConfig}
                        selectedActionId={pendingActionId}
                        onAttackClick={(attack) => emitAction(String(attack.id), onActionSelect)}
                        onExtraMovementClick={(movement) => emitAction(movement.id, onExtraMovementSelect)}
                    />
                )}
            </div>
        </section>
    );
}

export default CombatBattle;

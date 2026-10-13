/** Props of the generalized {@link CombatBattle} screen. */

import type {
    CombatAction,
    CombatActionImpact,
    CombatActionPreview,
    CombatState,
} from '../../../../types/CombatType';
import type { ArenaSequence } from './combatArenaSequence';
import type { CombatSpriteResolver } from './combatBattleView';

export interface CombatBattleProps {
    /** A fight described by the combat backend (`services/combatService`). */
    state: CombatState;
    /**
     * The choreography of the step being played, if any.
     *
     * While it is set the board is *busy*: the action area stays hidden and the marker
     * stays on the actor, so the turn cannot be handed on until the animation is over.
     */
    sequence?: ArenaSequence | null;
    /**
     * Whether the arena plays its reactions at all.
     *
     * Turned off, a defeated unit is dropped at once instead of sinking out of sight.
     */
    animationsEnabled?: boolean;
    /** Backend previews; when supplied, unusable actions are left out of the grid. */
    previews?: CombatActionPreview[];
    /** Id of the action being aimed, so the HUD can single it out. */
    pendingActionId?: string | null;
    /** Units the pending action may be aimed at; highlighted on the board. */
    targetIds?: readonly string[];
    /**
     * What the pending action would do to each unit, keyed by unit id.
     *
     * Supplied by the caller, which owns the fight session the preview is read
     * from; the board only draws the numbers.
     */
    targetPreviews?: ReadonlyMap<string, CombatActionImpact>;
    /** Resolves a unit's sprite. Supplied by the app, which owns the sprite index. */
    resolveSpriteUrl?: CombatSpriteResolver;
    /** Called with the action behind an attack card. */
    onActionSelect?: (action: CombatAction) => void;
    /** Called with the action behind an extra movement card. */
    onExtraMovementSelect?: (action: CombatAction) => void;
    /** Called with the unit id behind a sprite the player clicks. */
    onEntitySelect?: (unitId: string) => void;
    /** Overrides `gameState.settings.fightingTooltipVisible` for previews. */
    tooltipVisible?: boolean;
    /** Attack grid shape; defaults to the HUD's 2x2. */
    gridConfig?: { columns: number; rows: number };
    className?: string;
}

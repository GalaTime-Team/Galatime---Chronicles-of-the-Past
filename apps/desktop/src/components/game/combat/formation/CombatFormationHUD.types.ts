import type { AbilityDisplayEntry } from '../../../../types/AbilityType';
import type { CombatActionImpact, CombatStats, CombatUnitStatus } from '../../../../types/CombatType';
import type { ArenaSequence } from '../battle/combatArenaSequence';

/**
 * One status effect drawn as a chip on the unit's sprite.
 *
 * The tooltip already spells the effect out; this is the at-a-glance read — which units
 * are buffed, crippled, poisoned — without having to hover each one.
 */
export interface CombatStatusBadge {
    id: string;
    /** The authored label (`Frozen`, `Wet`), or a generic one for a pure stat change. */
    label: string;
    /** Element the effect came from, used for the chip's tint. */
    elementId: string | null;
    tone: 'buff' | 'debuff' | 'neutral';
    /** Remaining turns; `null` means "until the fight ends". */
    turns: number | null;
}

/**
 * One stat the unit's live effects have moved.
 *
 * `delta` is signed — a positive number is a buff, a negative one a debuff — and is the
 * difference between the stat with every effect folded in and the unit's own base value, so a
 * multiplier surfaces as the real amount it shifted instead of an abstract factor.
 */
export interface CombatStatModifier {
    stat: keyof CombatStats;
    delta: number;
}

/** The equipped weapon, flattened for the tooltip. */
export interface CombatWeaponDisplay {
    name: string;
    type: string;
    /** The weapon's special rule (`display.summary`). */
    summary?: string;
    /** Remaining durability, or `null` when the weapon has none. */
    durability: number | null;
    maxDurability: number | null;
    indestructible: boolean;
    /** Ammo item and rounds left, or `null` when the weapon takes no ammo. */
    ammo: { item: string; remaining: number } | null;
}

/** Display-only entity data. Supply HP only when live current/max values are available. */
export interface CombatFormationEntity {
    id: string;
    name: string;
    elementIds: string[];
    skillIds: string[];
    /** Authored abilities, already resolved to their display strings. */
    abilities: AbilityDisplayEntry[];
    /** The unit's equipped weapon, or `null` for an unarmed unit. */
    weapon?: CombatWeaponDisplay | null;
    /**
     * Whether the unit is still fighting.
     *
     * A defeated unit is on its way out: it plays its sink animation where it stands and the
     * lane then drops it, so it stops occupying a position on the board.
     */
    status: CombatUnitStatus;
    /** Net stat changes from live effects; empty while the unit is unmodified. */
    modifiers: CombatStatModifier[];
    /** Live status effects, drawn as chips on the sprite. */
    statusBadges: CombatStatusBadge[];
    spriteUrl?: string;
    currentHp?: number;
    maxHp?: number;
}

/** Front and rear rosters for one side of the formation. */
export interface CombatFormationLanes {
    front: CombatFormationEntity[];
    rear: CombatFormationEntity[];
}

export interface CombatFormationHUDProps {
    allies: CombatFormationLanes;
    adversaries: CombatFormationLanes;
    /**
     * The unit the turn queue put next, if any.
     *
     * The board marks it with a selector icon over its sprite, so whose turn it
     * is reads off the battlefield instead of a caption.
     */
    activeUnitId?: string;
    /**
     * Units the current action may be aimed at, if the player is choosing one.
     *
     * A single-target action may name anyone on the field, the actor's own side
     * included, so this is not simply "the other team". Highlighting is
     * display-only: it says which sprites answer a click, the same way
     * `onEntitySelect` reports the click itself.
     */
    targetableIds?: readonly string[];
    /**
     * What the pending action would do to each unit, keyed by unit id.
     *
     * Held apart from the entities because it belongs to the *action*, not to the
     * unit: it changes wholesale when the player picks a different attack.
     */
    targetPreviews?: ReadonlyMap<string, CombatActionImpact>;
    /**
     * The choreography of the step being played, if any.
     *
     * Present only while an action is being narrated; every reaction on the board (lunge,
     * hit, flash, numbers, entrance, shake, particles) is driven from it.
     */
    sequence?: ArenaSequence | null;
    /** Turns the reactions off entirely; a defeated unit then leaves at once. */
    animationsEnabled?: boolean;
    /** Selection is visual-only; clearing a pin reports `null`. */
    onEntitySelect?: (entity: CombatFormationEntity | null) => void;
    className?: string;
    /** Overrides `gameState.settings.fightingTooltipVisible` for previews. */
    tooltipVisible?: boolean;
}

export type CombatFormationSideId = 'allies' | 'adversaries';
export type CombatFormationLaneId = 'front' | 'rear';

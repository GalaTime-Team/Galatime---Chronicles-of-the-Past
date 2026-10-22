/**
 * View-model adapters for `CombatBattle`.
 *
 * The combat backend describes a fight with `CombatState`; the presentation
 * components expect the shapes they were built with (formation lanes, attack
 * cards, extra movement cards). Translating between the two lives here, as pure
 * functions, so neither side has to know about the other.
 */

import type {
    CombatAction,
    CombatActionPreview,
    CombatErrorCode,
    CombatLine,
    CombatSide,
    CombatState,
    CombatStats,
    CombatUnit,
} from '../../../../types/CombatType';
import { effectiveStats } from '../../../../services/combat/effectResolver';
import { effectiveActionCost } from '../../../../services/combat/weaponEffects';
import { AVAILABILITY_MESSAGES } from '../../../../services/combatService';
import type { Attack } from '../hud/AttackCard';
import type { CombatExtraMovement } from '../hud/CombatHUD';
import type {
    CombatFormationEntity,
    CombatFormationLanes,
    CombatStatModifier,
    CombatStatusBadge,
    CombatWeaponDisplay,
} from '../formation/CombatFormationHUD.types';

/** Attack slots the HUD grid shows (a 2x2 grid). */
export const MAX_ATTACK_SLOTS = 4;

/**
 * Resolves the sprite a unit is drawn with.
 *
 * Supplied by the app, which owns the sprite index (`entityImageService`), so
 * the adapters stay free of I/O.
 */
export type CombatSpriteResolver = (unit: CombatUnit) => string | undefined;

/** Both sides of the battlefield, split into their two lanes. */
export interface CombatFormationSides {
    allies: CombatFormationLanes;
    adversaries: CombatFormationLanes;
}

/**
 * The unit the turn queue puts next, or `null` when nobody is left to act.
 *
 * Whose turn it is decides everything the battle screen shows: a unit the player
 * owns gets the action HUD, any other unit is watched from the arena alone.
 */
export function selectTurnUnit(state: CombatState): CombatUnit | null {
    if (state.order.length === 0) return null;

    const activeId = state.order[state.turnIndex];
    return state.units.find((unit) => unit.id === activeId && unit.status === 'alive') ?? null;
}

/**
 * The stats a modifier row lists, in reading order.
 *
 * Buffs and debuffs are grouped at display time, so this order only decides how the entries
 * inside one group follow each other.
 */
const MODIFIER_STAT_ORDER: Array<keyof CombatStats> = [
    'physicalAttack',
    'magicalAttack',
    'physicalDefense',
    'magicalDefense',
    'speed',
    'maxHp',
    'maxMana',
    'maxStamina',
];

/**
 * How much the unit's live effects have moved each stat, buffs first.
 *
 * Measured against the unit's own base block rather than read off the effects, so a flat buff
 * and a multiplier both arrive as the real amount the stat changed by.
 */
function toStatModifiers(unit: CombatUnit): CombatStatModifier[] {
    if (unit.effects.length === 0) return [];

    const effective = effectiveStats(unit);
    const modifiers: CombatStatModifier[] = [];
    for (const stat of MODIFIER_STAT_ORDER) {
        // A multiplier leaves a fraction behind; a tenth is as precise as a stat board gets.
        const delta = Math.round((effective[stat] - unit.stats[stat]) * 10) / 10;
        if (delta !== 0) modifiers.push({ stat, delta });
    }

    // Raises before drops; `sort` is stable, so each group keeps the reading order above.
    return modifiers.sort((a, b) => Number(b.delta > 0) - Number(a.delta > 0));
}

/** Flattens a unit's equipped weapon for the tooltip, or `null` when unarmed. */function toWeaponDisplay(unit: CombatUnit): CombatWeaponDisplay | null {
    const weapon = unit.weapon;
    if (!weapon) return null;

    return {
        name: weapon.name,
        type: weapon.type,
        summary: weapon.summary || undefined,
        durability: weapon.durability,
        maxDurability: weapon.maxDurability,
        indestructible: weapon.indestructible,
        // The label is the pinned item id, or the ammo *type* the weapon feeds on.
        ammo: (weapon.ammoItem || weapon.ammoType) && weapon.ammo !== null
            ? { item: weapon.ammoItem ?? weapon.ammoType ?? 'ammo', remaining: weapon.ammo }
            : null,
    };
}

/**
 * A unit's live effects as the compact chips drawn on its sprite.
 *
 * The tone is read from the effect's own shape: a flat buff or a multiplier raises a stat,
 * a flat debuff or a forbidden action kind lowers it, and an effect that does neither (a
 * plain status such as `Wet`) is neutral. The label is the authored status name, falling
 * back to a generic word for a pure stat change; it feeds the sprite's accessible name,
 * since the chip itself is too small to carry text.
 */
function toStatusBadges(unit: CombatUnit): CombatStatusBadge[] {
    return unit.effects.map((effect) => {
        const buffed = effect.buff !== null || effect.statMultipliers !== null;
        const debuffed = effect.debuff !== null || (effect.preventActions?.length ?? 0) > 0;
        const tone: CombatStatusBadge['tone'] = buffed && !debuffed
            ? 'buff'
            : debuffed && !buffed
                ? 'debuff'
                : 'neutral';

        return {
            id: effect.effectId,
            label: effect.statusEffect
                ?? (tone === 'buff' ? 'Buff' : tone === 'debuff' ? 'Debuff' : 'Effect'),
            elementId: effect.elementId,
            tone,
            turns: effect.turns,
        };
    });
}

/** One unit as the formation HUD renders it. */
export function toFormationEntity(
    unit: CombatUnit,
    resolveSpriteUrl?: CombatSpriteResolver,
): CombatFormationEntity {
    return {
        id: unit.id,
        name: unit.name,
        elementIds: unit.elementIds,
        skillIds: unit.actions
            .filter((action) => action.kind === 'skill')
            .map((action) => action.id),
        // Abilities are authored data, not catalogue references, so they resolve
        // to display strings here rather than through a fetch like skills do.
        abilities: unit.abilities
            .filter((ability) => ability.definition.display?.visible !== false)
            .map((ability) => ({
                id: ability.definition.id,
                name: ability.definition.name,
                description: ability.definition.description,
            })),
        weapon: toWeaponDisplay(unit),
        status: unit.status,
        modifiers: toStatModifiers(unit),
        statusBadges: toStatusBadges(unit),
        spriteUrl: resolveSpriteUrl?.(unit),
        currentHp: unit.currentHp,
        maxHp: unit.stats.maxHp,
    };
}

function laneUnits(
    units: readonly CombatUnit[],
    side: CombatSide,
    line: CombatLine,
    resolveSpriteUrl?: CombatSpriteResolver,
): CombatFormationEntity[] {
    return units
        .filter((unit) => unit.side === side && unit.line === line)
        .sort((a, b) => a.slot - b.slot)
        .map((unit) => toFormationEntity(unit, resolveSpriteUrl));
}

/** Splits the units into the mirrored lanes the formation board draws. */
export function toFormationSides(
    units: readonly CombatUnit[],
    resolveSpriteUrl?: CombatSpriteResolver,
): CombatFormationSides {
    return {
        allies: {
            front: laneUnits(units, 'allies', 'front', resolveSpriteUrl),
            rear: laneUnits(units, 'allies', 'rear', resolveSpriteUrl),
        },
        adversaries: {
            front: laneUnits(units, 'enemies', 'front', resolveSpriteUrl),
            rear: laneUnits(units, 'enemies', 'rear', resolveSpriteUrl),
        },
    };
}

/** The icon/colour family an attack card shows. */
function attackType(action: CombatAction): Attack['type'] {
    if (action.heals) return 'buff';
    if (action.effects.some((effect) => effect.debuff)) return 'debuff';
    return action.damageType === 'physical' ? 'physical' : 'magical';
}

/**
 * The short labels of the traits an action carries.
 *
 * A solar skill, a guaranteed critical or a pierce are invisible in the
 * numbers on the card, so the card names them: the player can then read a
 * ×0.5 at night as the hour of the day rather than as a bug.
 */
function toTraitLabels(action: CombatAction): string[] {
    const labels: string[] = [];

    if (action.solar) labels.push('Solar');
    if (action.nocturnal) labels.push('Nocturnal');
    if (action.ignoreAccuracy) labels.push('Always hits');
    if (action.critChance > 0) labels.push(`Crit ${Math.round(action.critChance)}%`);
    if (action.defensePierce > 0) labels.push(`Pierce ${Math.round(action.defensePierce * 100)}%`);
    if (action.bonusVsHpBelow) {
        labels.push(`Exec ${Math.round(action.bonusVsHpBelow.threshold * 100)}%`);
    }

    return labels;
}

/** One backend action as an attack card. */
export function toAttackCard(action: CombatAction, actor?: CombatUnit | null): Attack {
    const costs = actor ? effectiveActionCost(actor, action) : action.costs;
    return {
        id: action.id,
        title: action.name,
        elementId: action.elementId,
        type: attackType(action),
        power: action.power,
        accuracy: action.accuracy,
        mana_cost: costs.mana,
        stamina_cost: costs.stamina,
        traits: toTraitLabels(action),
    };
}

/**
 * Reasons that keep an action off the HUD entirely.
 *
 * `not_implemented` is the only one: an item system that does not exist yet would offer a card
 * that can never succeed, in every turn of every fight. Every other refusal — a cost the unit
 * cannot pay, a cooldown still running, a line out of reach — describes *this* turn, so the card
 * is drawn disabled instead of disappearing.
 */
const HIDDEN_ACTION_REASONS: ReadonlySet<CombatErrorCode> = new Set<CombatErrorCode>(['not_implemented']);

/** Previews indexed for lookup, or `null` when the backend did not supply any. */
function indexPreviewsById(
    previews?: readonly CombatActionPreview[],
): Map<string, CombatActionPreview> | null {
    return previews ? new Map(previews.map((preview) => [preview.action.id, preview])) : null;
}

/** Whether an action stays off the HUD, and how a kept-but-unusable one is drawn. */
function toCardAvailability(preview: CombatActionPreview | undefined): {
    hidden: boolean;
    disabled: boolean;
    disabledReason?: string;
} {
    // Without a preview nothing is known about affordability, so the card is offered and the
    // backend gets to reject the click (the reason then arrives in the notice bar).
    if (!preview || preview.usable) return { hidden: false, disabled: false };

    return {
        hidden: preview.reason !== null && HIDDEN_ACTION_REASONS.has(preview.reason),
        disabled: true,
        disabledReason: preview.reason === null ? undefined : AVAILABILITY_MESSAGES[preview.reason],
    };
}

/**
 * The skills filling the attack grid.
 *
 * Only `skill` actions take a slot; the weapon and the universal movements are extra movements.
 * When the backend supplies previews, an action it reports as unusable keeps its place in the
 * grid and is drawn disabled — a card that vanishes and comes back as the pools drain is worse
 * than one that stays put and reads as out of reach.
 */
export function toAttackCards(
    actions: readonly CombatAction[],
    previews?: readonly CombatActionPreview[],
    actor?: CombatUnit | null,
): Attack[] {
    const previewsById = indexPreviewsById(previews);

    return actions
        .filter((action) => action.kind === 'skill')
        .map((action) => ({ action, availability: toCardAvailability(previewsById?.get(action.id)) }))
        .filter((entry) => !entry.availability.hidden)
        .slice(0, MAX_ATTACK_SLOTS)
        .map(({ action, availability }) => ({
            ...toAttackCard(action, actor),
            disabled: availability.disabled,
            disabledReason: availability.disabledReason,
        }));
}

/**
 * The weapon and universal movements, in the order the backend lists them.
 *
 * Affordability is carried the same way the attack grid carries it: the card stays, drawn
 * disabled, with the reason the backend gave for refusing it.
 */
export function toExtraMovements(
    actions: readonly CombatAction[],
    previews?: readonly CombatActionPreview[],
    actor?: CombatUnit | null,
): CombatExtraMovement[] {
    const previewsById = indexPreviewsById(previews);

    return actions
        .filter((action) => action.kind !== 'skill')
        .map((action) => ({ action, availability: toCardAvailability(previewsById?.get(action.id)) }))
        .filter((entry) => !entry.availability.hidden)
        .map(({ action, availability }) => {
            const costs = actor ? effectiveActionCost(actor, action) : action.costs;
            return {
                id: action.id,
                title: action.name,
                iconKind: action.kind,
                kind: action.kind,
                staminaCost: costs.stamina,
                manaCost: costs.mana,
                // The tooltip reads what the movement does; a weapon movement also
                // names the weapon, whose sprite the game derives as
                // `/images/weapons/<id>.png` — the path is never authored.
                description: action.description || undefined,
                weapon: action.kind === 'weapon' && action.weapon
                    ? {
                        id: action.weapon.weaponId,
                        name: action.name,
                        elementId: action.elementId,
                        durability: actor?.weapon?.durability ?? null,
                        indestructible: actor?.weapon?.indestructible,
                    }
                    : undefined,
                disabled: availability.disabled,
                disabledReason: availability.disabledReason,
            };
        });
}

/** The vitals the HUD bars read; a missing unit yields empty bars rather than `NaN`. */
export function toHudStats(unit: CombatUnit | null): {
    hp: { current: number; max: number };
    mana: { current: number; max: number };
    stamina: { current: number; max: number };
} {
    return {
        hp: { current: unit?.currentHp ?? 0, max: Math.max(1, unit?.stats.maxHp ?? 0) },
        mana: { current: unit?.currentMana ?? 0, max: Math.max(1, unit?.stats.maxMana ?? 0) },
        stamina: { current: unit?.currentStamina ?? 0, max: Math.max(1, unit?.stats.maxStamina ?? 0) },
    };
}

/** Indexes a unit's actions by id, so a card click can be traced back to its action. */
export function indexActionsById(actions: readonly CombatAction[]): Map<string, CombatAction> {
    return new Map(actions.map((action) => [action.id, action]));
}

import type { AbilityDefinition } from './AbilityType';
import type { AiProfileDefinition } from './AiType';
import type { EntityInventoryState } from './InventoryType';
import type { WeaponDefinition, WeaponReference } from './WeaponType';

export interface BaseStats {
    hp: number;
    mana: number;
    stamina: number;
    physical_attack: number;
    magical_attack: number;
    physical_defense: number;
    magical_defense: number;
    speed: number;
}

export interface LootEntry {
    /** Some entities declare the item by display name, others by id. */
    item?: string;
    item_id?: string;
    quantity?: number;
    chance: number;
}

/**
 * A passive/triggered mob ability (not a skill: it has a trigger, a condition
 * and an action). Authored inline in the entity YAML; the shape lives in
 * `types/AbilityType.ts` so the combat engine can normalise it once.
 */
export type AbilityEntry = AbilityDefinition;

/** Fields shared by characters and mobs (both are "entities"). */
export interface EntitiesData {
    id: string;
    height: string;
    weight: string;
    description: string;
    elements: string[];
    base_stats: BaseStats;
    /** Skill ids only — the full definitions live in the shared catalogue
     *  (`data/combat/skills/skills.yaml`) and are read through `attackController`. */
    skills: string[];
    /** Not every entity defines loot. */
    loot?: LootEntry[];
    /**
     * Both characters and mobs can carry a weapon; some declare none.
     *
     * A string is a catalogue id (`weapon: rusty_sword`); an object is an inline
     * definition (natural mob attacks and legacy blocks).
     */
    weapon?: WeaponReference | null;
    /** Only mobs declare triggered abilities; authored inline. */
    abilities?: AbilityDefinition[];
    /**
     * The unit's combat personality, authored inline like `abilities:`.
     *
     * Optional and read tolerantly: an absent or malformed block degrades to the
     * default (balanced) profile. See `docs/ai/PLANO_DESENVOLVIMENTO_IA_COMBATE.md`.
     */
    ai?: AiProfileDefinition;
    /** Items this entity carries. Key is item id, value is quantity. */
    inventory?: EntityInventoryState;
}

/**
 * An inline weapon definition.
 *
 * Kept as the name the rest of the codebase already imports; the authoritative
 * shape is {@link WeaponDefinition} in `types/WeaponType.ts`.
 */
export type WeaponEntry = WeaponDefinition;

export interface CharacterData extends EntitiesData {
    name: string;
    surname: string;
    gender: string;
    age: number | null;
    birthday: string | null;
    origin: string;
    starting_relationships?: { liking?: number; trust?: number };
    /** Legacy flat friendship/trust; newer files use `starting_relationships`. */
    friendship?: number;
    trust?: number;
}

export interface MobData extends EntitiesData {
    name: string;
    rarity: string;
}

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

/** A passive/triggered mob ability (not a skill: it has a condition and an action). */
export interface AbilityEntry {
    ability_name: string;
    condition?: Record<string, unknown>;
    action?: Record<string, unknown>;
    keep_triggered_after_once?: boolean;
    activation_message?: string;
}

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
    /** Both characters and mobs can carry a weapon; some declare none. */
    weapon?: WeaponEntry | null;
    /** Only mobs declare triggered abilities. */
    abilities?: AbilityEntry[];
}

export interface WeaponEntry {
    id: string;
    name: string;
    element?: string;
    damage_type?: string;
    target?: string;
    power?: number;
    stamina_cost?: number;
    hits?: number;
    accuracy?: number;
    damage_variance?: number[];
}

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

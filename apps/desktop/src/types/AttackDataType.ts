/** Public and source types for the shared skills catalogue and learning trees. */

export interface LearningCost {
    experience_points: number;
}

export interface LearningRequirements {
    required_attack_ids?: string[];
    [key: string]: unknown;
}

/** A resource an effect can pay out or take in. */
export type AttackResourceId = 'hp' | 'mana' | 'stamina';

/** A per-resource amount, as authored by `resource_regen` and friends. */
export type AttackResourceAmounts = Partial<Record<AttackResourceId, number>>;

/** Where a `move` effect sends its bearer. */
export interface AttackMoveSpec {
    /** `self` moves the caster, `target` moves whoever the effect landed on. */
    who?: 'self' | 'target';
    /** Destination line; `other` means "the line the bearer is not in". */
    to_line?: 'front' | 'rear' | 'other';
    /** Trades places with the caster instead of just stepping across. */
    swap_with_caster?: boolean;
}

/** How far back a `rewind` pulls its target, and what it restores. */
export interface AttackRewindSpec {
    /** How many of the target's own turns to undo; omitted means all of them. */
    turns?: number;
    /** Which pools are restored; omitted means every pool. */
    resources?: AttackResourceId[];
    /** Whether the statuses of the rewound turns are undone too. */
    cleanse?: boolean;
}

export interface AttackEffect {
    effect_id: string;
    /** Omit to inherit the attack's element. */
    element_id?: string;
    status_effect?: string;
    apply_to?: string;
    turns?: number | [number, number];
    effect_hit_chance?: number;
    buff?: Record<string, number>;
    debuff?: Record<string, number>;
    resource_regen?: AttackResourceAmounts;
    resource_drain?: AttackResourceAmounts;
    /** While the effect lives, its holder cannot switch targets. */
    locks_target?: boolean;
    /** Landing the effect inverts the victim's current buffs into debuffs. */
    invert_buffs?: boolean;
    /** Damage channels the holder cannot be hurt by while the effect lives. */
    damage_immunities?: Array<'physical' | 'magical'>;
    /**
     * Heals the caster by this fraction of the direct damage the hit dealt
     * (`0.15` = 15%).
     */
    drain_percent_of_damage?: number;
    /** Forces the battlefield's phase (`day`/`night`) while the effect lasts. */
    set_phase?: 'day' | 'night';
    /** Rounds the forced phase lasts; defaults to 5. */
    phase_rounds?: number;
    /** Flat damage the effect deals to its owner at the start of its turn. */
    damage_per_turn?: number;
    /** Variance rolled on each damage-over-time tick (`[min,max]`). */
    damage_variance?: number[];
    /** Heals the caster for this flat amount whenever any unit falls. */
    heal_on_kill?: number;
    /** Heals the caster for this fraction of its max HP whenever any unit falls. */
    heal_on_kill_percent?: number;
    /** The holder's hostile actions may hit its own side. */
    confuse?: boolean;
    /** Chance (`0…1`) the confusion turns an action; defaults to 0.5. */
    confusion_chance?: number;
    /** Extra damage against targets below a fraction of their health. */
    bonus_vs_hp_below?: { threshold: number; multiplier: number };
    /** The status is lifted when a Lux attack hits the holder. */
    removable_by_lux?: boolean;
    /** Lower a random number of random stats; the values fold into `debuff`. */
    random_debuff?: { count?: number; amount?: number; stats?: string[] };
    /** Raise a random number of random stats; the values fold into `buff`. */
    random_buff?: { count?: number; amount?: number; stats?: string[] };
    /** Apply to a random subset of the resolved scope. */
    random_targets?: { min?: number; max?: number };
    damage?: number;
    can_stack?: boolean;
    /** How the status reads to a cleanse (`negative`) or a dispel (`positive`). */
    polarity?: 'positive' | 'negative' | 'neutral';
    /** Removes up to this many negative statuses. */
    cleanse?: number;
    /** Removes every negative status. */
    cleanse_all?: boolean;
    /** Removes up to this many positive statuses. */
    dispel?: number;
    /** Removes every positive status. */
    dispel_all?: boolean;
    /** Removes one named status, whatever its polarity. */
    dispel_status?: string;
    /** Resources the holder regains on each of the effect's turns. */
    regen_per_turn?: AttackResourceAmounts;
    /** Status ids the holder cannot suffer while the effect lives. */
    status_immunities?: string[];
    /** The holder may not use skills. */
    prevent_skills?: boolean;
    /** The holder cannot be chosen as a target. */
    untargetable?: boolean;
    /** The holder cannot be healed by anybody else. */
    heal_block?: boolean;
    /** The holder reflects the next hit it takes. */
    counter?: boolean;
    /** How many turns the effect shifts the holder's place in the order. */
    turn_offset?: number;
    /** How many cooldown turns the effect takes off the holder's actions. */
    cooldown_tick?: number;
    /** Where the effect moves its bearer. */
    move?: AttackMoveSpec;
    /** How far back the effect rewinds its bearer. */
    rewind?: AttackRewindSpec;
    /** Where the drained resource goes: back to the caster, or nowhere. */
    drain_to?: 'target' | 'caster';
    /** Resources the holder pays on each of the effect's turns. */
    self_upkeep?: AttackResourceAmounts;
    /** Health the holder pays on the turn after the effect lands. */
    deferred_cost?: AttackResourceAmounts;
    /** Health the holder pays for every target the action reached. */
    self_damage_per_target?: number;
    /** The older spelling of a `debuff` on the attacker's own accuracy. */
    lower_accuracy?: number;
    [key: string]: unknown;
}

/** An authored skill (attack) in the single shared catalogue. */
export interface AttackSkill {
    id: string;
    name: string;
    description?: string;
    element_id: string;
    learning_cost?: LearningCost;
    learning_requirements?: LearningRequirements;
    damage?: Record<string, unknown>;
    targeting?: Record<string, unknown> | string;
    hit_count?: number;
    /** Fire `hit_count` independent rays, each picking a random living enemy. */
    scatter_targets?: boolean;
    /** Ray count for a scatter action; defaults to `hit_count`. */
    scatter_hits?: number;
    /** Scatter rays may pick any living enemy, ignoring reach and lane rules. */
    can_hit_any_enemy?: boolean;
    /** Skip the lane (front/rear) damage multiplier for this action. */
    ignore_position_penalty?: boolean;
    power?: Record<string, unknown> | number;
    accuracy?: number;
    costs?: Record<string, number>;
    effects?: AttackEffect[];
    collateral?: Record<string, unknown>;
    /** The skill is worth its full strength by day and fades to a quarter of it at night. */
    solar?: boolean;
    /** The mirror of `solar`: full strength at night, a quarter of it by day. */
    lunar?: boolean;
    /** The skill only works while the sun is up (the phase, not the hour). */
    only_during_day?: boolean;
    /** The skill only works while the sun is down. */
    only_during_night?: boolean;
    /** Base chance of a critical hit, in percent. */
    crit_chance?: number;
    /** The hit always lands. */
    ignore_accuracy?: boolean;
    /** Fraction of the target's defence the hit ignores (0 … 1). */
    defense_pierce?: number;
    /** Extra multipliers per element of the defender. */
    bonus_vs_elements?: Record<string, number>;
    /** Extra multiplier against a target below a fraction of its health. */
    bonus_vs_hp_below?: { threshold: number; multiplier: number };
    /** Health fraction below which the target panics and flees the fight. */
    flee_below_hp?: number;
    /** The status that guarantees a critical hit against its bearer. */
    guaranteed_crit_vs_status?: string;
    /** The kind of skill, for the catalogue's own bookkeeping. */
    kind?: string;
    /** The reach of the skill (`short`, `medium`, `long`). */
    range?: string;
    /** The variance of each hit, as `[min, max]`. */
    damage_variance?: number[];
    [key: string]: unknown;
}

/** A definition as stored in skills/skills.yaml. */
export interface SkillCatalog {
    skills: AttackSkill[];
}

/** Only gameplay fields are exposed to the game client. */
export type PublicAttack = Pick<AttackSkill,
    | 'id'
    | 'name'
    | 'description'
    | 'element_id'
    | 'learning_cost'
    | 'learning_requirements'
    | 'damage'
    | 'targeting'
    | 'hit_count'
    | 'scatter_targets'
    | 'scatter_hits'
    | 'can_hit_any_enemy'
    | 'ignore_position_penalty'
    | 'power'
    | 'accuracy'
    | 'costs'
    | 'effects'
    | 'collateral'
    | 'solar'
    | 'lunar'
    | 'only_during_day'
    | 'only_during_night'
    | 'crit_chance'
    | 'ignore_accuracy'
    | 'defense_pierce'
    | 'bonus_vs_elements'
    | 'bonus_vs_hp_below'
    | 'flee_below_hp'
    | 'guaranteed_crit_vs_status'
    | 'kind'
    | 'range'
    | 'damage_variance'
>;

export interface SkillTreeNode {
    attack_id: string;
    tree_id: string;
    element_id: string;
    required_attack_ids: string[];
    external_requirements: Array<{
        attack_id: string;
        tree_id: string;
        element_id: string;
    }>;
    learning_cost: LearningCost;
    skill: PublicAttack;
    children: string[];
}

export interface PublicSkillTree {
    id: string;
    element_id: string;
    name: string;
    root_attack_ids: string[];
    nodes: SkillTreeNode[];
}

/** Tree data as included in a whole-content snapshot: references only. */
export interface SkillTreeReference {
    id: string;
    element_id: string;
    name: string;
    nodes: Array<{
        attack_id: string;
    }>;
}

export interface AttackFilters {
    element_id?: string;
    tree_id?: string;
    damage_type?: string;
    order_by?: 'name' | 'id';
    direction?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
}

/** Public and source types for the shared skills catalogue and learning trees. */

export interface LearningCost {
    experience_points: number;
}

export interface LearningRequirements {
    required_attack_ids?: string[];
    [key: string]: unknown;
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
    resource_regen?: Partial<Record<'hp' | 'mana' | 'stamina', number>>;
    resource_drain?: Partial<Record<'hp' | 'mana' | 'stamina', number>>;
    damage?: number;
    damage_variance?: number[];
    can_stack?: boolean;
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
    power?: Record<string, unknown> | number;
    accuracy?: number;
    costs?: Record<string, number>;
    effects?: AttackEffect[];
    collateral?: Record<string, unknown>;
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
    | 'power'
    | 'accuracy'
    | 'costs'
    | 'effects'
    | 'collateral'
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

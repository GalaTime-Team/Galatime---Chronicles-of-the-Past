import type {
    AttackEffect,
    AttackSkill,
    LearningCost,
    PublicAttack,
    PublicSkillTree,
    SkillTreeNode,
    SkillTreeReference,
} from '../types/AttackDataType';

const PUBLIC_SKILL_FIELDS = [
    'id',
    'name',
    'description',
    'element_id',
    'learning_cost',
    'learning_requirements',
    'damage',
    'targeting',
    'hit_count',
    'power',
    'accuracy',
    'costs',
    'effects',
    'collateral',
] as const;

const PUBLIC_EFFECT_FIELDS = [
    'effect_id',
    'element_id',
    'status_effect',
    'apply_to',
    'turns',
    'effect_hit_chance',
    'apply_chance',
    'lower_accuracy',
    'buff',
    'debuff',
    'resource_regen',
    'resource_drain',
    'damage',
    'damage_variance',
    'can_stack',
    'regen_variance',
    'heal',
    'drain',
] as const;

function clone(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value));
}

function pickFields(value: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
        if (value[field] !== undefined) result[field] = clone(value[field]);
    }
    return result;
}

function publicEffect(effect: AttackEffect, inheritedElement: string) {
    const result = pickFields(effect as Record<string, unknown>, PUBLIC_EFFECT_FIELDS);
    const elementId = effect.element_id;
    result.element_id = typeof elementId === 'string' && elementId.trim() ? elementId : inheritedElement;
    return result;
}

/** Copies gameplay fields and resolves each effect's inherited element. */
export function toPublicAttack(skill: AttackSkill): PublicAttack {
    const result: Record<string, unknown> = {};

    for (const field of PUBLIC_SKILL_FIELDS) {
        if (skill[field] !== undefined) {
            if (field === 'effects' && Array.isArray(skill.effects)) {
                result.effects = skill.effects.map((effect) => publicEffect(effect, skill.element_id));
            } else if (field === 'learning_requirements') {
                result.learning_requirements = {
                    required_attack_ids: attackRequirements(skill),
                };
            } else if (field === 'learning_cost') {
                result.learning_cost = { experience_points: skill.learning_cost?.experience_points ?? 0 };
            } else if (field === 'costs') {
                result.costs = pickFields(skill.costs ?? {}, ['mana', 'stamina', 'cooldown']);
            } else if (field === 'collateral') {
                result.collateral = pickFields(skill.collateral ?? {}, [
                    'chance', 'apply_to', 'include_primary_targets', 'include_primary_target',
                    'include_caster', 'damage_multiplier',
                ]);
            } else if (field === 'targeting' && typeof skill.targeting === 'object' && skill.targeting !== null) {
                result.targeting = pickFields(skill.targeting, [
                    'area', 'target', 'can_target_self', 'can_target_allies', 'can_target_enemies', 'can_target_neutral',
                ]);
            } else if (field === 'damage' && skill.damage) {
                const damage = pickFields(skill.damage, ['kind', 'damage_type', 'area']);
                if (skill.damage.power !== undefined) {
                    damage.power = typeof skill.damage.power === 'object' && skill.damage.power !== null
                        ? pickFields(skill.damage.power as Record<string, unknown>, ['kind', 'value', 'min', 'max', 'stat', 'multiplier'])
                        : skill.damage.power;
                }
                result.damage = damage;
            } else if (field === 'power' && typeof skill.power === 'object' && skill.power !== null) {
                result.power = pickFields(skill.power as Record<string, unknown>, ['kind', 'value', 'min', 'max', 'stat', 'multiplier']);
            } else {
                result[field] = clone(skill[field]);
            }
        }
    }

    return result as PublicAttack;
}

export function attackRequirements(skill: AttackSkill): string[] {
    const requirements = skill.learning_requirements?.required_attack_ids;
    return Array.isArray(requirements) ? [...new Set(requirements)] : [];
}

/** Game catalogue projection, deduplicated and ordered by element then stable ID. */
export function selectGameSkills(skills: unknown[]): AttackSkill[] {
    const unique = new Map<string, AttackSkill>();
    for (const value of skills) {
        const skill = value as Partial<AttackSkill> | null;
        if (!skill || typeof skill !== 'object'
            || typeof skill.id !== 'string' || !skill.id.trim()
            || typeof skill.name !== 'string' || !skill.name.trim()
            || typeof skill.element_id !== 'string' || !skill.element_id.trim()
            || skill.damage?.kind === 'pure'
            || skill.damage?.damage_type === 'pure'
            || skill.damage_type === 'pure'
            || unique.has(skill.id)) continue;
        unique.set(skill.id, skill as AttackSkill);
    }
    return [...unique.values()].sort((a, b) =>
        a.element_id.localeCompare(b.element_id) || a.id.localeCompare(b.id));
}

export function learningCost(skill: AttackSkill): LearningCost {
    const value = skill.learning_cost?.experience_points;
    return { experience_points: typeof value === 'number' && value >= 0 ? value : 0 };
}

/**
 * Materializes one element's learning tree straight from the catalogue:
 * membership comes from `element_id` and edges from `learning_requirements`
 * (there are no tree files — skills.yaml is the single source of truth).
 */
export function buildSkillTreeFromSkills(
    elementId: string,
    skills: AttackSkill[],
): PublicSkillTree {
    const treeId = `${elementId}_tree`;
    const skillsById = new Map(skills.map((skill) => [skill.id, skill]));

    const nodes: SkillTreeNode[] = skills
        .filter((skill) => skill.element_id === elementId)
        .map((skill) => {
            const requiredAttackIds = attackRequirements(skill);

            return {
                attack_id: skill.id,
                tree_id: treeId,
                element_id: skill.element_id,
                required_attack_ids: requiredAttackIds,
                external_requirements: requiredAttackIds.flatMap((requiredId) => {
                    const requiredSkill = skillsById.get(requiredId);
                    if (!requiredSkill || requiredSkill.element_id === elementId) return [];
                    return [{
                        attack_id: requiredId,
                        tree_id: `${requiredSkill.element_id}_tree`,
                        element_id: requiredSkill.element_id,
                    }];
                }),
                learning_cost: learningCost(skill),
                skill: toPublicAttack(skill),
                children: [],
            };
        });

    const childrenByParent = new Map<string, string[]>();

    for (const skill of skills) {
        for (const requiredId of attackRequirements(skill)) {
            if (!skillsById.has(requiredId)) continue;
            const children = childrenByParent.get(requiredId) ?? [];
            children.push(skill.id);
            childrenByParent.set(requiredId, children);
        }
    }

    for (const node of nodes) {
        node.children = [...new Set(childrenByParent.get(node.attack_id) ?? [])].sort((a, b) => a.localeCompare(b));
    }

    const roots = nodes
        .filter((node) => node.required_attack_ids.length === 0)
        .map((node) => node.attack_id)
        .sort((a, b) => a.localeCompare(b));

    return {
        id: treeId,
        element_id: elementId,
        name: `Árvore de ${elementId}`,
        root_attack_ids: roots,
        nodes,
    };
}

/** Strips resolved skill data for the one-copy full snapshot contract. */
export function toSkillTreeReference(tree: PublicSkillTree): SkillTreeReference {
    return {
        id: tree.id,
        element_id: tree.element_id,
        name: tree.name,
        nodes: tree.nodes.map((node) => ({ attack_id: node.attack_id })),
    };
}

/** Returns a global prerequisite-first path, including cross-tree skills. */
export function buildLearningPath(attackId: string, skills: AttackSkill[]): PublicAttack[] {
    const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
    const visited = new Set<string>();
    const active = new Set<string>();
    const ordered: AttackSkill[] = [];

    function visit(id: string): void {
        if (visited.has(id) || active.has(id)) return;
        const skill = skillsById.get(id);
        if (!skill) return;

        active.add(id);
        for (const requiredId of attackRequirements(skill).sort((a, b) => a.localeCompare(b))) {
            visit(requiredId);
        }
        active.delete(id);
        visited.add(id);
        ordered.push(skill);
    }

    visit(attackId);
    return ordered.map(toPublicAttack);
}

/** Finds every attack that directly or indirectly requires the given attack. */
export function buildAttackDependents(attackId: string, skills: AttackSkill[]): PublicAttack[] {
    const directDependents = new Map<string, string[]>();
    for (const skill of skills) {
        for (const requiredId of attackRequirements(skill)) {
            const dependents = directDependents.get(requiredId) ?? [];
            dependents.push(skill.id);
            directDependents.set(requiredId, dependents);
        }
    }

    const resultIds = new Set<string>();
    const pending = [...(directDependents.get(attackId) ?? [])];

    while (pending.length) {
        const next = pending.pop()!;
        if (resultIds.has(next)) continue;
        resultIds.add(next);
        pending.push(...(directDependents.get(next) ?? []));
    }

    return skills
        .filter((skill) => resultIds.has(skill.id))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(toPublicAttack);
}

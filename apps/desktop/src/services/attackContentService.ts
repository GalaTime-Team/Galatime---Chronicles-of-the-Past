import * as yaml from 'js-yaml';
import type {
    AttackFilters,
    AttackEffect,
    AttackSkill,
    PublicAttack,
    PublicSkillTree,
    SkillCatalog,
} from '../types/AttackDataType';
import {
    attackRequirements,
    buildAttackDependents,
    buildLearningPath,
    buildSkillTreeFromSkills,
    selectGameSkills,
    toSkillTreeReference,
    toPublicAttack,
} from './contentGraphService';

const SKILLS_GLOB_PREFIX = '../data/combat/skills/';

function cloneContent<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

type RawYamlLoader = Record<string, () => Promise<{ default: string }>>;

let skillsGlob: RawYamlLoader | null = null;
let catalogCache: SkillCatalog | null = null;
let treeCache: PublicSkillTree[] | null = null;

async function initializeGlobs(): Promise<void> {
    if (skillsGlob === null) {
        skillsGlob = import.meta.glob('../data/combat/skills/*.yaml', { query: '?raw' }) as RawYamlLoader;
    }
}

function parseYaml<T>(text: string): T {
    return yaml.load(text) as T;
}

/** Loads the game catalogue, containing gameplay content only. */
async function loadSkillCatalog(): Promise<SkillCatalog> {
    if (catalogCache) return catalogCache;
    await initializeGlobs();

    const catalogPath = `${SKILLS_GLOB_PREFIX}skills.yaml`;
    const loader = skillsGlob?.[catalogPath];
    if (!loader) {
        catalogCache = { skills: [] };
        return catalogCache;
    }

    try {
        const module = await loader();
        const parsed = parseYaml<SkillCatalog | AttackSkill[]>(module.default);
        const catalog: SkillCatalog = Array.isArray(parsed) ? { skills: parsed } : parsed;
        const skills = selectGameSkills(Array.isArray(catalog?.skills) ? catalog.skills : []);

        catalogCache = {
            skills,
        };
    } catch (error) {
        console.error('Failed to load skills catalogue:', error);
        catalogCache = { skills: [] };
    }

    return catalogCache;
}

/** Derives one tree per element straight from the catalogue (no tree files). */
function buildTrees(skills: AttackSkill[]): PublicSkillTree[] {
    const elements = [...new Set(skills.map((skill) => skill.element_id))]
        .sort((a, b) => a.localeCompare(b));
    return elements.map((elementId) => buildSkillTreeFromSkills(elementId, skills));
}

async function loadContent(): Promise<{ catalog: SkillCatalog; trees: PublicSkillTree[] }> {
    const catalog = await loadSkillCatalog();
    if (treeCache === null) treeCache = buildTrees(catalog.skills);
    return { catalog, trees: treeCache };
}

export async function getAttackList(filters: AttackFilters = {}): Promise<PublicAttack[]> {
    const { catalog, trees } = await loadContent();
    let result = catalog.skills;

    if (filters.element_id) result = result.filter((skill) => skill.element_id === filters.element_id);
    if (filters.tree_id) {
        const treeElementId = filters.tree_id.endsWith('_tree')
            ? filters.tree_id.slice(0, -'_tree'.length)
            : filters.tree_id;
        const tree = trees.find((entry) => entry.element_id === treeElementId);
        const nodeIds = new Set(tree?.nodes.map((node) => node.attack_id) ?? []);
        result = result.filter((skill) => nodeIds.has(skill.id));
    }
    if (filters.damage_type) {
        result = result.filter((skill) => {
            const damageType = skill.damage?.damage_type ?? skill.damage?.type ?? skill.damage?.kind;
            return damageType === filters.damage_type;
        });
    }

    const direction = filters.direction === 'desc' ? -1 : 1;
    result = [...result].sort((a, b) => {
        if (!filters.order_by) {
            return (a.element_id.localeCompare(b.element_id) || a.id.localeCompare(b.id)) * direction;
        }
        const key = filters.order_by;
        return String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * direction;
    });

    const offset = Number.isInteger(filters.offset) && filters.offset! > 0 ? filters.offset! : 0;
    const limit = Number.isInteger(filters.limit) && filters.limit! >= 0 ? filters.limit! : result.length;
    return result.slice(offset, offset + limit).map(toPublicAttack);
}

export async function getAttack(attackId: string): Promise<PublicAttack | null> {
    const { catalog } = await loadContent();
    const skill = catalog.skills.find((entry) => entry.id === attackId);
    return skill ? toPublicAttack(skill) : null;
}

export async function getAttackRequirementsData(attackId: string, includeDependencies = false) {
    const { catalog } = await loadContent();
    const skill = catalog.skills.find((entry) => entry.id === attackId);
    if (!skill) return null;

    const requirements = attackRequirements(skill).flatMap((requiredId) => {
        const required = catalog.skills.find((entry) => entry.id === requiredId);
        if (!required) return [];
        return [{
            attack_id: required.id,
            tree_id: `${required.element_id}_tree`,
            element_id: required.element_id,
            cross_tree: required.element_id !== skill.element_id,
        }];
    });

    const result: Record<string, unknown> = {
        attack_id: skill.id,
        learning_cost: { experience_points: skill.learning_cost?.experience_points ?? 0 },
        learning_requirements: { required_attack_ids: attackRequirements(skill) },
        direct_requirements: requirements,
    };

    if (includeDependencies) {
        const path = buildLearningPath(skill.id, catalog.skills);
        result.indirect_dependencies = path.filter((entry) => entry.id !== skill.id);
        result.accumulated_experience_points = path.reduce(
            (sum, entry) => sum + (Number(entry.learning_cost?.experience_points) || 0),
            0,
        );
    }
    return result;
}

export async function getAttackDependentsData(attackId: string): Promise<PublicAttack[] | null> {
    const { catalog } = await loadContent();
    if (!catalog.skills.some((skill) => skill.id === attackId)) return null;
    return buildAttackDependents(attackId, catalog.skills);
}

export async function getAttackEffectsData(attackId: string): Promise<AttackEffect[] | null> {
    const skill = await getAttack(attackId);
    if (!skill) return null;
    return Array.isArray(skill.effects) ? skill.effects : [];
}

export async function getAttackAreaData(attackId: string): Promise<unknown | null> {
    const skill = await getAttack(attackId);
    if (!skill) return null;
    return skill.targeting ?? skill.damage?.area ?? {};
}

export async function getLearningTrees(): Promise<PublicSkillTree[]> {
    return cloneContent((await loadContent()).trees);
}

export async function getLearningTree(treeId: string): Promise<PublicSkillTree | null> {
    const elementId = treeId.endsWith('_tree') ? treeId.slice(0, -'_tree'.length) : treeId;
    const trees = await getLearningTrees();
    const tree = trees.find((entry) => entry.id === `${elementId}_tree`);
    return tree ? cloneContent(tree) : null;
}

export async function getLearningTreeNodes(treeId: string) {
    const tree = await getLearningTree(treeId);
    return tree?.nodes ?? null;
}

export async function getLearningTreeAttack(treeId: string, attackId: string) {
    const tree = await getLearningTree(treeId);
    return tree?.nodes.find((node) => node.attack_id === attackId) ?? null;
}

export async function getAttackLearningPathData(attackId: string) {
    const { catalog } = await loadContent();
    if (!catalog.skills.some((skill) => skill.id === attackId)) return null;
    const path = buildLearningPath(attackId, catalog.skills).map((skill) => ({
        ...skill,
        tree_id: `${skill.element_id}_tree`,
        learning_cost: skill.learning_cost ?? { experience_points: 0 },
    }));
    return {
        attack_id: attackId,
        path,
        total_experience_points: path.reduce((sum, skill) => sum + skill.learning_cost.experience_points, 0),
    };
}

export async function getAttackContentSnapshot() {
    const { catalog, trees } = await loadContent();
    return {
        attacks: catalog.skills.map(toPublicAttack),
        learning_trees: trees.map(toSkillTreeReference),
    };
}

/** Clears bundled-data caches for tests and development reloads. */
export function clearAttackContentCache(): void {
    catalogCache = null;
    treeCache = null;
}

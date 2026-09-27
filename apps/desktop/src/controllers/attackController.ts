import {
    getAttackAreaData,
    getAttackContentSnapshot,
    getAttackDependentsData,
    getAttackEffectsData,
    getAttackLearningPathData,
    getAttackRequirementsData,
    getLearningTreeAttack,
    getLearningTreeNodes,
    getAttack,
    getAttackList,
    getLearningTree,
    getLearningTrees,
} from '../services/attackContentService';
import type {
    AttackEffect,
    AttackFilters,
    PublicAttack,
    PublicSkillTree,
} from '../types/AttackDataType';

/** Read-only gameplay content controller. A missing id maps to `null` (HTTP 404 at an API adapter). */
export function fetchAttacks(filters: AttackFilters = {}): Promise<PublicAttack[]> {
    return getAttackList(filters);
}

export function fetchAttack(attackId: string): Promise<PublicAttack | null> {
    return getAttack(attackId);
}

export function fetchAttackRequirements(attackId: string, includeDependencies = false) {
    return getAttackRequirementsData(attackId, includeDependencies);
}

export function fetchAttackDependents(attackId: string): Promise<PublicAttack[] | null> {
    return getAttackDependentsData(attackId);
}

export function fetchAttackEffects(attackId: string): Promise<AttackEffect[] | null> {
    return getAttackEffectsData(attackId);
}

export function fetchAttackArea(attackId: string): Promise<unknown | null> {
    return getAttackAreaData(attackId);
}

export function fetchLearningTrees(): Promise<PublicSkillTree[]> {
    return getLearningTrees();
}

export function fetchLearningTree(treeId: string): Promise<PublicSkillTree | null> {
    return getLearningTree(treeId);
}

export function fetchLearningTreeNodes(treeId: string) {
    return getLearningTreeNodes(treeId);
}

export function fetchLearningTreeAttack(treeId: string, attackId: string) {
    return getLearningTreeAttack(treeId, attackId);
}

export function fetchAttackLearningPath(attackId: string) {
    return getAttackLearningPathData(attackId);
}

export function fetchAttackContentSnapshot() {
    return getAttackContentSnapshot();
}

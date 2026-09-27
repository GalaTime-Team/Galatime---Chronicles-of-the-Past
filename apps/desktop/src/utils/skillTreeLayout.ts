/**
 * Layout for the skill-tree playground.
 *
 * The learned-from relation is a DAG (a skill can require several others, including ones from a
 * different element), so dagre does the layering, the crossing minimisation and the coordinate
 * assignment. A skill therefore sits next to the branch it belongs to instead of in a fixed row
 * slot, which is what keeps the connector lines from criss-crossing the map.
 */

import { Graph, layout } from '@dagrejs/dagre';
import type { PublicAttack } from '../types/AttackDataType';

/** Elements that every tree is rooted in, whatever the selection is. */
export const BASE_ELEMENT_IDS = ['vis', 'corporis'] as const;
/** Sentinel for "no element selected"; `inanus` owns no skills of its own. */
export const INANUS_ID = 'inanus';

/** Box dagre reserves for a skill. The sprite is drawn inside it. */
export const SKILL_NODE_SIZE = 72;
/** Sprite box inside a node. */
export const SKILL_ICON_SIZE = 64;
/** Gap between two nodes of the same rank — 232px centre-to-centre, up from the old 220. */
export const HORIZONTAL_NODE_SPACING = 160;
/** Gap between two ranks — 242px centre-to-centre, up from the old 220. */
export const VERTICAL_RANK_SPACING = 170;
/** Gap kept between edges that run through the same rank. */
export const EDGE_SPACING = 50;
/** Empty space around the whole map. */
export const MAP_PADDING = 88;

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 1.5;
/** Fitting a deep tree can shrink the sprites past legibility, so fitting stops here. */
export const FIT_ZOOM_FLOOR = 0.25;
/** Share of the viewport a fitted tree fills. */
export const FIT_ZOOM_RATIO = 0.95;
/** Wheel-to-zoom response: `exp(-deltaY * this)`. */
export const ZOOM_WHEEL_SENSITIVITY = 0.0015;
/** Multiplier of the `+` / `-` buttons. */
export const ZOOM_BUTTON_STEP = 1.25;

export interface SkillTreeLayoutNode {
    skill: PublicAttack;
    /** Centre of the node, in map units. */
    x: number;
    y: number;
}

export interface SkillTreeLayoutEdge {
    parentId: string;
    childId: string;
}

export interface SkillTreeLayout {
    nodes: SkillTreeLayoutNode[];
    edges: SkillTreeLayoutEdge[];
    /** Size of the laid-out map, including `MAP_PADDING` on each side. */
    width: number;
    height: number;
}

export function getRequiredAttackIds(attack: PublicAttack): string[] {
    const ids = attack.learning_requirements?.required_attack_ids;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Includes only skills whose entire prerequisite path can be learned from the selected
 * elements and the two always-present foundation elements.
 */
export function getLearnableAttacks(attacks: PublicAttack[], selectedElementIds: string[]): PublicAttack[] {
    const isInanusOnly = selectedElementIds.length === 1 && selectedElementIds[0] === INANUS_ID;
    const allowedElements = new Set(isInanusOnly
        ? ['corporis', INANUS_ID]
        : [...BASE_ELEMENT_IDS, ...selectedElementIds]);
    const attacksById = new Map(attacks.map((attack) => [attack.id, attack]));
    const availability = new Map<string, boolean>();

    function canLearn(attackId: string, activePath = new Set<string>()): boolean {
        const cached = availability.get(attackId);
        if (cached !== undefined) return cached;

        const attack = attacksById.get(attackId);
        if (!attack || !allowedElements.has(attack.element_id) || activePath.has(attackId)) {
            availability.set(attackId, false);
            return false;
        }

        activePath.add(attackId);
        const result = getRequiredAttackIds(attack).every((requiredId) => canLearn(requiredId, activePath));
        activePath.delete(attackId);
        availability.set(attackId, result);
        return result;
    }

    return attacks.filter((attack) => allowedElements.has(attack.element_id) && canLearn(attack.id));
}

/**
 * Places every attack with dagre and returns the node **centres** in map units.
 *
 * `rankdir: 'BT'` keeps the game's reading order: prerequisites at the bottom, the skills they
 * unlock above them. The default `network-simplex` ranker assigns the tightest ranks it can, so
 * long prerequisite chains are not stretched onto rows they do not need.
 */
export function buildSkillTreeLayout(attacks: PublicAttack[]): SkillTreeLayout {
    const graph = new Graph({ multigraph: false, compound: false });
    graph.setGraph({
        rankdir: 'BT',
        nodesep: HORIZONTAL_NODE_SPACING,
        ranksep: VERTICAL_RANK_SPACING,
        edgesep: EDGE_SPACING,
        marginx: MAP_PADDING,
        marginy: MAP_PADDING,
        ranker: 'network-simplex',
    });
    graph.setDefaultEdgeLabel(() => ({}));

    for (const attack of attacks) {
        graph.setNode(attack.id, { width: SKILL_NODE_SIZE, height: SKILL_NODE_SIZE });
    }

    const laidOutIds = new Set(attacks.map((attack) => attack.id));
    const edges: SkillTreeLayoutEdge[] = [];

    for (const attack of attacks) {
        // A duplicated prerequisite would only add a second overlapping connector.
        for (const parentId of new Set(getRequiredAttackIds(attack))) {
            if (!laidOutIds.has(parentId)) continue;
            graph.setEdge(parentId, attack.id, {});
            edges.push({ parentId, childId: attack.id });
        }
    }

    layout(graph);

    const graphLabel = graph.graph();
    const nodes = attacks.map((skill) => {
        const node = graph.node(skill.id);
        return { skill, x: node?.x ?? 0, y: node?.y ?? 0 };
    });

    return {
        nodes,
        edges,
        width: graphLabel.width ?? 0,
        height: graphLabel.height ?? 0,
    };
}

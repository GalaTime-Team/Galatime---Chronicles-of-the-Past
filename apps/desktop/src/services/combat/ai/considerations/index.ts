/**
 * The consideration registry.
 *
 * One module per consideration, keyed by id. The decider iterates the profile's
 * weights, so adding a consideration is: write the module, add its id to
 * `AiConsiderationId` and `DEFAULT_AI_WEIGHTS`, and register it here — nothing
 * else changes.
 */

import type { AiConsideration, AiConsiderationId } from '../../../../types/AiType';
import { defendValue } from './defendValue';
import { effectValue } from './effectValue';
import { elementEdge } from './elementEdge';
import { expectedDamage } from './expectedDamage';
import { healAlly } from './healAlly';
import { healSelf } from './healSelf';
import { itemValue } from './itemValue';
import { killSecure } from './killSecure';
import { repositionValue } from './repositionValue';
import { resourceGuard } from './resourceGuard';
import { restValue } from './restValue';
import { survival } from './survival';

/** Every consideration, keyed by its id. */
export const AI_CONSIDERATIONS: Record<AiConsiderationId, AiConsideration> = {
    expected_damage: expectedDamage,
    kill_secure: killSecure,
    element_edge: elementEdge,
    effect_value: effectValue,
    survival,
    heal_ally: healAlly,
    heal_self: healSelf,
    defend: defendValue,
    rest: restValue,
    reposition: repositionValue,
    resource_guard: resourceGuard,
    item: itemValue,
};

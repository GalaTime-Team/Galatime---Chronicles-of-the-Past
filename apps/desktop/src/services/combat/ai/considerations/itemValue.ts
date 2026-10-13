/**
 * `item` — using an item from the inventory.
 *
 * Dormant for now: the `inventory` action is advertised but resolves to
 * `not_implemented`, so it is excluded from the candidate list and this
 * consideration never runs. It exists so the registry is complete and a future
 * inventory-in-combat pass has a slot to fill without touching the decider.
 */

import type { AiConsideration } from '../../../../types/AiType';

export const itemValue: AiConsideration = {
    id: 'item',
    evaluate() {
        return 0;
    },
};

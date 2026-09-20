/**
 * Central registry of every input the chronicle understands.
 *
 * Components must never hardcode a physical key or button. They ask `GameContext`
 * for a `ControlId` (`useControls` / `useControlListener`), so this file is the only
 * place that declares which actions exist, what the Settings screen calls them and
 * which inputs are bound to them by default — on the keyboard and on a controller.
 */

import type { GamepadButtonId } from './GamepadConstants';

/**
 * Bindable actions, in the order the Settings screen lists them.
 *
 * Only controls that a component actually listens to belong here: the Settings
 * screen renders this registry as-is, so an unused id would show a binding that
 * does nothing. Declare the id when a component starts consuming it.
 */
export const CONTROL_DEFINITIONS = [
    {
        id: 'advance',
        label: 'settings.controls.advance',
        // Bottom and right face buttons, which are A/B on Xbox, ✕/○ on PlayStation
        // and B/A on Nintendo — the label follows the connected controller.
        defaultBinding: { keyboard: ['Space', 'ArrowRight'], gamepad: ['south', 'east'] },
    },
] as const;

export type ControlDefinition = (typeof CONTROL_DEFINITIONS)[number];

/** Identifier of a bindable action. */
export type ControlId = ControlDefinition['id'];

/** The inputs a single action answers to. */
export interface ControlBinding {
    /** `KeyboardEvent.code` values. */
    keyboard: string[];
    /** Controller button positions of the W3C standard mapping. */
    gamepad: GamepadButtonId[];
}

/** Inputs bound to each control. An empty list means that device cannot trigger it. */
export type ControlBindings = Record<ControlId, ControlBinding>;

/** Default binding of a single control. Always fresh arrays, safe to mutate. */
export function getDefaultControlBinding(id: ControlId): ControlBinding {
    const definition = CONTROL_DEFINITIONS.find((candidate) => candidate.id === id);

    return {
        keyboard: [...(definition?.defaultBinding.keyboard ?? [])],
        gamepad: [...(definition?.defaultBinding.gamepad ?? [])],
    };
}

/** Fresh copy of the default bindings for every declared control. */
export function buildDefaultControlBindings(): ControlBindings {
    return CONTROL_DEFINITIONS.reduce((bindings, definition) => {
        bindings[definition.id] = getDefaultControlBinding(definition.id);
        return bindings;
    }, {} as ControlBindings);
}

/** Copies the bindings so callers can replace one control without touching the original. */
export function cloneControlBindings(bindings: ControlBindings): ControlBindings {
    return CONTROL_DEFINITIONS.reduce((copy, definition) => {
        const binding = bindings[definition.id];
        copy[definition.id] = {
            keyboard: [...(binding?.keyboard ?? [])],
            gamepad: [...(binding?.gamepad ?? [])],
        };
        return copy;
    }, {} as ControlBindings);
}

/** Replaces the inputs of one control, leaving the other bindings untouched. */
export function withControlBinding(bindings: ControlBindings, id: ControlId, binding: ControlBinding): ControlBindings {
    const next: ControlBindings = { ...bindings };
    next[id] = binding;
    return next;
}

/**
 * Gamepad domain: the browser Gamepad API normalises every controller to the W3C
 * "standard" mapping, so what a button *is* (a position) and what it is *called*
 * (a label) are two different things. Positions live here; labels are per family,
 * because the same position is `A` on Xbox, `✕` on PlayStation and `B` on Nintendo.
 */

/** Face/shoulder/stick/d-pad positions of the W3C standard mapping. */
export const GAMEPAD_BUTTON_IDS = [
    'south',
    'east',
    'west',
    'north',
    'l1',
    'r1',
    'l2',
    'r2',
    'select',
    'start',
    'l3',
    'r3',
    'dpadUp',
    'dpadDown',
    'dpadLeft',
    'dpadRight',
] as const;

export type GamepadButtonId = (typeof GAMEPAD_BUTTON_IDS)[number];

/** Position of each button inside `Gamepad.buttons` when `mapping === 'standard'`. */
export const GAMEPAD_BUTTON_INDEX: Record<GamepadButtonId, number> = {
    south: 0,
    east: 1,
    west: 2,
    north: 3,
    l1: 4,
    r1: 5,
    l2: 6,
    r2: 7,
    select: 8,
    start: 9,
    l3: 10,
    r3: 11,
    dpadUp: 12,
    dpadDown: 13,
    dpadLeft: 14,
    dpadRight: 15,
};

export const GAMEPAD_FAMILIES = ['xbox', 'playstation', 'nintendo', 'generic'] as const;

export type GamepadFamily = (typeof GAMEPAD_FAMILIES)[number];

/** Proper names, used as-is in the interface. */
export const GAMEPAD_FAMILY_LABELS: Record<GamepadFamily, string> = {
    xbox: 'Xbox',
    playstation: 'PlayStation',
    nintendo: 'Nintendo',
    generic: 'Generic',
};

/** D-pad labels are the same on every controller. */
const DPAD_LABELS: Pick<Record<GamepadButtonId, string>, 'dpadUp' | 'dpadDown' | 'dpadLeft' | 'dpadRight'> = {
    dpadUp: 'D-Pad ↑',
    dpadDown: 'D-Pad ↓',
    dpadLeft: 'D-Pad ←',
    dpadRight: 'D-Pad →',
};

/**
 * Physical label of each position per family. Nintendo keeps its own layout: the
 * bottom button is `B` and the right one is `A`, the mirror image of Xbox.
 */
export const GAMEPAD_BUTTON_LABELS: Record<GamepadFamily, Record<GamepadButtonId, string>> = {
    xbox: {
        south: 'A',
        east: 'B',
        west: 'X',
        north: 'Y',
        l1: 'LB',
        r1: 'RB',
        l2: 'LT',
        r2: 'RT',
        select: 'View',
        start: 'Menu',
        l3: 'LS',
        r3: 'RS',
        ...DPAD_LABELS,
    },
    playstation: {
        south: '✕',
        east: '○',
        west: '□',
        north: '△',
        l1: 'L1',
        r1: 'R1',
        l2: 'L2',
        r2: 'R2',
        select: 'Create',
        start: 'Options',
        l3: 'L3',
        r3: 'R3',
        ...DPAD_LABELS,
    },
    nintendo: {
        south: 'B',
        east: 'A',
        west: 'Y',
        north: 'X',
        l1: 'L',
        r1: 'R',
        l2: 'ZL',
        r2: 'ZR',
        select: '−',
        start: '+',
        l3: 'LS',
        r3: 'RS',
        ...DPAD_LABELS,
    },
    generic: {
        south: 'A',
        east: 'B',
        west: 'X',
        north: 'Y',
        l1: 'L1',
        r1: 'R1',
        l2: 'L2',
        r2: 'R2',
        select: 'Select',
        start: 'Start',
        l3: 'LS',
        r3: 'RS',
        ...DPAD_LABELS,
    },
};

/**
 * `Gamepad.vibrationActuator` is a non-standard extension (Chromium and Safari only),
 * so it is typed locally instead of relying on `lib.dom`.
 */
export interface GamepadVibrationEffect {
    startDelay?: number;
    duration?: number;
    weakMagnitude?: number;
    strongMagnitude?: number;
    leftTrigger?: number;
    rightTrigger?: number;
}

export interface GamepadVibrationActuator {
    /** `dual-rumble` works on every Chromium version; `trigger-rumble` needs Chrome/Edge 126+. */
    playEffect?: (type: 'dual-rumble' | 'trigger-rumble', effect: GamepadVibrationEffect) => Promise<unknown>;
    reset?: () => Promise<unknown>;
}

/** Rumble used when a caller does not specify magnitudes: a short, full-strength pulse. */
export const DEFAULT_RUMBLE_DURATION = 200;
export const DEFAULT_RUMBLE_MAGNITUDE = 1;

import {
    GAMEPAD_BUTTON_IDS,
    GAMEPAD_BUTTON_INDEX,
    GAMEPAD_BUTTON_LABELS,
    type GamepadButtonId,
    type GamepadFamily,
    type GamepadVibrationActuator,
} from '../constants/GamepadConstants';

/** USB vendor ids Chromium writes into `Gamepad.id` as `Vendor: xxxx`. */
const VENDOR_FAMILIES: Record<string, GamepadFamily> = {
    '045e': 'xbox', // Microsoft
    '054c': 'playstation', // Sony
    '057e': 'nintendo', // Nintendo
};

/** Fallback for drivers that only expose a product name. */
const NAME_FAMILIES: [RegExp, GamepadFamily][] = [
    [/xbox|xinput|x-input|microsoft/i, 'xbox'],
    [/dualsense|dualshock|playstation|sony/i, 'playstation'],
    [/nintendo|switch|joy-?con|pro controller/i, 'nintendo'],
];

/**
 * Best-effort identification of the controller family from `Gamepad.id`, which is
 * the only hint the Gamepad API gives about the physical brand of the device.
 */
export function detectGamepadFamily(id: string): GamepadFamily {
    const vendor = id.match(/vendor:\s*([0-9a-f]{4})/i)?.[1]?.toLowerCase();
    if (vendor && VENDOR_FAMILIES[vendor]) return VENDOR_FAMILIES[vendor];

    for (const [pattern, family] of NAME_FAMILIES) {
        if (pattern.test(id)) return family;
    }

    return 'generic';
}

/** Physical label of a position for the connected controller (`south` -> `A`/`✕`/`B`). */
export function getGamepadButtonLabel(button: GamepadButtonId, family: GamepadFamily): string {
    return GAMEPAD_BUTTON_LABELS[family][button];
}

/** Positions currently held down, read off the per-frame snapshot. */
export function readPressedGamepadButtons(gamepad: Gamepad): GamepadButtonId[] {
    return GAMEPAD_BUTTON_IDS.filter((button) => gamepad.buttons[GAMEPAD_BUTTON_INDEX[button]]?.pressed);
}

/**
 * First connected controller, preferring one Chromium mapped to the standard
 * layout: non-standard devices report arbitrary button orders.
 */
export function getActiveGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;

    const connected = Array.from(navigator.getGamepads()).filter(
        (gamepad): gamepad is Gamepad => Boolean(gamepad?.connected),
    );

    return connected.find((gamepad) => gamepad.mapping === 'standard') ?? connected[0] ?? null;
}

/** Reads the non-standard haptics extension defensively; `null` when unsupported. */
export function getVibrationActuator(gamepad: Gamepad): GamepadVibrationActuator | null {
    const { vibrationActuator } = gamepad as unknown as { vibrationActuator?: GamepadVibrationActuator };
    return vibrationActuator?.playEffect ? vibrationActuator : null;
}

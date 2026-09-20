import { CONTROL_DEFINITIONS, getDefaultControlBinding, type ControlBindings, type ControlId } from '../constants/ControlConstants';
import { GAMEPAD_BUTTON_IDS, type GamepadButtonId } from '../constants/GamepadConstants';

/** Codes whose `KeyboardEvent.code` is not readable enough for the Settings screen. */
const KEY_CODE_LABELS: Record<string, string> = {
    Space: 'Space',
    Escape: 'Esc',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Del',
    Insert: 'Ins',
    Home: 'Home',
    End: 'End',
    PageUp: 'PgUp',
    PageDown: 'PgDn',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    NumpadEnter: 'Num Enter',
    NumpadAdd: '+',
    NumpadSubtract: '-',
    NumpadMultiply: '*',
    NumpadDivide: '/',
    NumpadDecimal: '.',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Backquote: '`',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    AltLeft: 'Alt',
    AltRight: 'Alt',
    MetaLeft: 'Meta',
    MetaRight: 'Meta',
    CapsLock: 'Caps',
};

/**
 * Friendly names accepted while normalising bindings, including the plain values
 * (`W`, `Escape`, …) written by builds that predate `KeyboardEvent.code`.
 */
const KEY_CODE_ALIASES: Record<string, string> = {
    ' ': 'Space',
    space: 'Space',
    spacebar: 'Space',
    esc: 'Escape',
    escape: 'Escape',
    return: 'Enter',
    enter: 'Enter',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
    tab: 'Tab',
    backspace: 'Backspace',
    del: 'Delete',
    delete: 'Delete',
    insert: 'Insert',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    shift: 'ShiftLeft',
    ctrl: 'ControlLeft',
    control: 'ControlLeft',
    alt: 'AltLeft',
    meta: 'MetaLeft',
    cmd: 'MetaLeft',
};

for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    KEY_CODE_ALIASES[letter] = `Key${letter.toUpperCase()}`;
}

for (let digit = 0; digit <= 9; digit += 1) {
    KEY_CODE_ALIASES[String(digit)] = `Digit${digit}`;
}

/** A control cannot be triggered by an unlimited number of inputs. */
const MAX_BINDINGS_PER_INPUT = 4;

/** Readable representation of a `KeyboardEvent.code` (`KeyW` -> `W`, `ArrowUp` -> `↑`). */
export function formatControlKey(code: string): string {
    if (!code) return '';

    const knownLabel = KEY_CODE_LABELS[code];
    if (knownLabel) return knownLabel;

    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;

    return code;
}

/** Converts one stored value to a `KeyboardEvent.code`, or `null` when unusable. */
function toKeyCode(value: string): string | null {
    // Checked before trimming: `event.key` for the space bar is a single space.
    const alias = KEY_CODE_ALIASES[value] ?? KEY_CODE_ALIASES[value.trim().toLowerCase()];
    if (alias) return alias;

    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 20) return null;

    return trimmed;
}

/** Normalises a control's keys: accepts legacy strings, drops duplicates and caps the count. */
export function normalizeControlKeys(raw: unknown): string[] {
    const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
    const codes = values
        .map((value) => (typeof value === 'string' ? toKeyCode(value) : null))
        .filter((code): code is string => Boolean(code));

    return Array.from(new Set(codes)).slice(0, MAX_BINDINGS_PER_INPUT);
}

/** Normalises a control's controller buttons, discarding positions the pad does not have. */
export function normalizeGamepadButtons(raw: unknown): GamepadButtonId[] {
    const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
    const buttons = values.filter(
        (value): value is GamepadButtonId => typeof value === 'string' && (GAMEPAD_BUTTON_IDS as readonly string[]).includes(value),
    );

    return Array.from(new Set(buttons)).slice(0, MAX_BINDINGS_PER_INPUT);
}

/**
 * Normalises persisted bindings: reads the legacy shapes (a plain array of keys, or
 * a single string) and converts friendly names to `KeyboardEvent.code`. An explicitly
 * empty list is kept as-is (the player unbound that device); a control missing from the
 * stored object keeps its defaults, which is how a control added by a later build — or a
 * device added to an existing build — starts out playable.
 */
export function normalizeControlBindings(raw: unknown): Partial<ControlBindings> {
    if (!raw || typeof raw !== 'object') return {};

    const source = raw as Record<string, unknown>;
    const normalized: Partial<ControlBindings> = {};

    for (const definition of CONTROL_DEFINITIONS) {
        if (!(definition.id in source)) continue;

        const stored = source[definition.id];

        // Builds predating controller support stored only the keyboard keys.
        if (Array.isArray(stored) || typeof stored === 'string') {
            normalized[definition.id] = {
                keyboard: normalizeControlKeys(stored),
                gamepad: getDefaultControlBinding(definition.id).gamepad,
            };
            continue;
        }

        const binding = (stored ?? {}) as { keyboard?: unknown; gamepad?: unknown };
        normalized[definition.id] = {
            keyboard: normalizeControlKeys(binding.keyboard),
            gamepad: normalizeGamepadButtons(binding.gamepad),
        };
    }

    return normalized;
}

/**
 * Resolves the control triggered by a keyboard event, or `null` when the key is
 * unbound. When a key is shared by several controls, the first declaration in
 * `CONTROL_DEFINITIONS` wins.
 */
export function findControlForEvent(event: KeyboardEvent, bindings: ControlBindings): ControlId | null {
    const code = event.code || event.key;

    for (const definition of CONTROL_DEFINITIONS) {
        if (bindings[definition.id]?.keyboard?.includes(code)) return definition.id;
    }

    return null;
}

/** Same resolution for a controller button, dispatched by the gamepad polling loop. */
export function findControlForGamepadButton(button: GamepadButtonId, bindings: ControlBindings): ControlId | null {
    for (const definition of CONTROL_DEFINITIONS) {
        if (bindings[definition.id]?.gamepad?.includes(button)) return definition.id;
    }

    return null;
}

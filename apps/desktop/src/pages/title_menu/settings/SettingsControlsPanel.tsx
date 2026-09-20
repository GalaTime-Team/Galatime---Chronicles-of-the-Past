import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    CONTROL_DEFINITIONS,
    getDefaultControlBinding,
    type ControlBinding,
    type ControlId,
} from '../../../constants/ControlConstants';
import { GAMEPAD_FAMILY_LABELS } from '../../../constants/GamepadConstants';
import { useControls, useGamepadListener } from '../../../context/GameContext';
import { formatControlKey, isInputShared, normalizeControlKeys } from '../../../utils/controlUtils';
import { getGamepadButtonLabel } from '../../../utils/gamepadUtils';
import type { SettingsPanelProps } from './types';

/** Device a pending rebinding is waiting for. */
type RebindingDevice = 'keyboard' | 'gamepad';

/** Badge shaped like a key cap; the `group-hover` tone comes from the button wrapping it. */
function KeyCap({ variant = 'default', children }: { variant?: 'default' | 'listening' | 'empty' | 'conflict'; children: ReactNode }) {
    const variantStyles = {
        default: 'border-2 border-galatime-primary/50 text-galatime-accent group-hover:border-galatime-accent',
        listening: 'animate-pulse border-2 border-galatime-accent bg-galatime-primary/20 text-galatime-accent',
        empty: 'border-2 border-dashed border-white/30 text-white/40',
        conflict: 'border-2 border-galatime-error/70 text-galatime-error group-hover:border-galatime-error',
    } as const;

    return <kbd className={`min-w-16 px-3 py-1 text-center ${variantStyles[variant]}`}>{children}</kbd>;
}

export function SettingsControlsPanel({ settings }: SettingsPanelProps) {
    const { t } = useTranslation('common');
    const { setControlBinding, gamepad } = useControls();
    const [rebinding, setRebinding] = useState<{ id: ControlId; device: RebindingDevice } | null>(null);

    // Button labels follow the connected controller: the same position is A, ✕ or B.
    const family = gamepad?.family ?? 'generic';

    //region — Helpers
    const bindingOf = (id: ControlId): ControlBinding => settings.controls[id] ?? { keyboard: [], gamepad: [] };

    /**
     * While a control is being rebound the listener runs in the capture phase, so the
     * pressed key is assigned instead of being acted on by the game. The same listener
     * stays active while waiting for a controller button, only to allow cancelling.
     */
    useEffect(() => {
        if (!rebinding) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            // Escape always aborts the rebinding instead of being bound.
            if (event.code === 'Escape') {
                setRebinding(null);
                return;
            }

            if (rebinding.device !== 'keyboard') return;

            event.preventDefault();
            event.stopPropagation();

            const [pressedCode] = normalizeControlKeys([event.code || event.key]);
            if (!pressedCode) {
                setRebinding(null);
                return;
            }

            // The same key may serve several controls — controllers have few buttons —
            // so it is kept on whoever else holds it and only flagged as a conflict.
            setControlBinding(rebinding.id, { ...bindingOf(rebinding.id), keyboard: [pressedCode] });
            setRebinding(null);
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [rebinding, settings.controls, setControlBinding]);

    // Same idea for controllers: the next button pressed becomes the binding.
    useGamepadListener((button) => {
        if (rebinding?.device !== 'gamepad') return;

        setControlBinding(rebinding.id, { ...bindingOf(rebinding.id), gamepad: [button] });
        setRebinding(null);
    });
    //endregion — Helpers

    //region — Render
    return (
        <div className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2">
                <span className="text-xs uppercase tracking-widest text-white/40">
                    {gamepad
                        ? t('settings.controls.gamepadConnected', { family: GAMEPAD_FAMILY_LABELS[gamepad.family] })
                        : t('settings.controls.gamepadMissing')}
                </span>
            </div>

            {/* Controls List — comes from the registry, so a new control is listed as soon as it is declared. */}
            {CONTROL_DEFINITIONS.map((definition) => {
                const binding = bindingOf(definition.id);
                const defaults = getDefaultControlBinding(definition.id);
                const isCustom =
                    binding.keyboard.join('|') !== defaults.keyboard.join('|') ||
                    binding.gamepad.join('|') !== defaults.gamepad.join('|');

                const isListening = (device: RebindingDevice) => rebinding?.id === definition.id && rebinding.device === device;
                const toggle = (device: RebindingDevice) =>
                    setRebinding(isListening(device) ? null : { id: definition.id, device });

                return (
                    <div key={definition.id} className="setting-line border-b-4 border-white/10 py-3">
                        <span className="text-lg text-white">{t(definition.label)}</span>

                        <span className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                            {isCustom && (
                                <button
                                    type="button"
                                    onClick={() => setControlBinding(definition.id, defaults)}
                                    className="cursor-pointer text-xs uppercase tracking-widest text-white/40 transition-colors hover:text-white"
                                >
                                    {t('settings.controls.reset')}
                                </button>
                            )}
                            
                            {gamepad ? (
                                /* Gamepad connected — show only the controller binding. */
                                <span className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => toggle('gamepad')}
                                        aria-label={t('settings.controls.changeButton', { label: t(definition.label) })}
                                        className="group flex cursor-pointer items-center gap-2"
                                    >
                                        {isListening('gamepad') ? (
                                            <KeyCap variant="listening">{t('settings.controls.listeningGamepad')}</KeyCap>
                                        ) : binding.gamepad.length > 0 ? (
                                            binding.gamepad.map((button) => (
                                                <KeyCap
                                                    key={button}
                                                    variant={isInputShared(definition.id, button, 'gamepad', settings.controls) ? 'conflict' : 'default'}
                                                >
                                                    {getGamepadButtonLabel(button, family)}
                                                </KeyCap>
                                            ))
                                        ) : (
                                            <KeyCap variant="empty">{t('settings.controls.unbound')}</KeyCap>
                                        )}
                                    </button>
                                </span>
                            ) : (
                                /* No gamepad — show only the keyboard binding. */
                                <span className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => toggle('keyboard')}
                                        aria-label={t('settings.controls.changeKey', { label: t(definition.label) })}
                                        className="group flex cursor-pointer items-center gap-2"
                                    >
                                        {isListening('keyboard') ? (
                                            <KeyCap variant="listening">{t('settings.controls.listening')}</KeyCap>
                                        ) : binding.keyboard.length > 0 ? (
                                            binding.keyboard.map((code) => (
                                                <KeyCap
                                                    key={code}
                                                    variant={isInputShared(definition.id, code, 'keyboard', settings.controls) ? 'conflict' : 'default'}
                                                >
                                                    {formatControlKey(code)}
                                                </KeyCap>
                                            ))
                                        ) : (
                                            <KeyCap variant="empty">{t('settings.controls.unbound')}</KeyCap>
                                        )}
                                    </button>
                                </span>
                            )}
                        </span>
                    </div>
                );
            })}
        </div>
    );
    //endregion — Render
}

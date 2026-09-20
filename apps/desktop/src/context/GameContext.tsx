import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_AUDIO_VOLUMES, DEFAULT_MUSIC_TRACK_ID } from '../constants/AudioConstants';
import {
  buildDefaultControlBindings,
  cloneControlBindings,
  withControlBinding,
  type ControlBinding,
  type ControlBindings,
  type ControlId,
} from '../constants/ControlConstants';
import {
  DEFAULT_RUMBLE_DURATION,
  DEFAULT_RUMBLE_MAGNITUDE,
  type GamepadButtonId,
  type GamepadFamily,
  type GamepadVibrationEffect,
} from '../constants/GamepadConstants';
import type { Difficulty } from '../constants/DifficultyConstants';
import {
  findControlsForEvent,
  findControlsForGamepadButton,
  normalizeControlBindings,
  normalizeControlKeys,
  normalizeGamepadButtons,
} from '../utils/controlUtils';
import {
  detectGamepadFamily,
  getActiveGamepad,
  getVibrationActuator,
  readPressedGamepadButtons,
} from '../utils/gamepadUtils';
import {
  DEFAULT_IMAGE_RENDERING,
  DEFAULT_RENDER_SCALE,
  IMAGE_RENDERING_MODES,
  RENDER_SCALE_MAX,
  RENDER_SCALE_MIN,
  type ImageRenderingMode,
} from '../constants/DisplayConstants';
import { setAllVolumes } from '../controllers/audioController';
import { applyDisplaySettings } from '../services/displayService';
import { loadSettings, saveSettings } from '../services/settingsService';

export interface GameSettings {
  saveName: string;
  difficulty: Difficulty;
  fightingTooltipVisible: boolean;
  actionsTooltipVisible: boolean;
  audio: {
    master: number;
    music: number;
    sfx: number;
    ambient: number;
  };
  currentMusicTrackId: string;
  /** Inputs bound to each control: keyboard keys and controller buttons. */
  controls: ControlBindings;
  display: {
    fullscreen: boolean;
    /** Image scaling algorithm applied to every image and canvas of the game. */
    imageRendering: ImageRenderingMode;
    /** Percentage of the render surface: 100 is native, lower values magnify the interface. */
    renderScale: number;
  };
  language: string;
}

interface LegacyDisplaySettings {
  pixelScale?: boolean;
}

/**
 * Normalises persisted display settings, including the `pixelScale` boolean written by older
 * builds, which maps to one of the image rendering modes.
 */
function normalizeDisplay(raw: unknown): Partial<GameSettings['display']> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const { fullscreen, imageRendering, renderScale, pixelScale } = raw as Partial<GameSettings['display']> & LegacyDisplaySettings;
  const normalized: Partial<GameSettings['display']> = {};

  if (typeof fullscreen === 'boolean') {
    normalized.fullscreen = fullscreen;
  }

  const legacyMode: ImageRenderingMode | undefined = typeof pixelScale === 'boolean'
    ? (pixelScale ? 'pixelated' : 'smooth')
    : undefined;
  const mode = IMAGE_RENDERING_MODES.find((candidate) => candidate === imageRendering) ?? legacyMode;
  if (mode) {
    normalized.imageRendering = mode;
  }

  if (typeof renderScale === 'number' && Number.isFinite(renderScale)) {
    normalized.renderScale = Math.min(RENDER_SCALE_MAX, Math.max(RENDER_SCALE_MIN, Math.round(renderScale)));
  }

  return normalized;
}

export interface GameState {
  settings: GameSettings;
  player?: {
    hp: { current: number; max: number };
    mana: { current: number; max: number };
    stamina: { current: number; max: number };
  };
}

/** Controller currently in use, identified by its `Gamepad.id` and brand family. */
export interface ActiveGamepad {
  id: string;
  family: GamepadFamily;
}

interface GameContextType {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  /** Inputs currently bound to each control. */
  controls: ControlBindings;
  /** Resolves every control triggered by a keyboard event; the same key may be shared on purpose. */
  getControlIds: (event: KeyboardEvent) => ControlId[];
  /** `true` when the event triggers the given control. */
  isControl: (event: KeyboardEvent, id: ControlId) => boolean;
  /** Rebinds a single control; an empty list leaves that device unable to trigger it. */
  setControlBinding: (id: ControlId, binding: ControlBinding) => void;
  /** Controller in use, or `null` when none is connected. */
  gamepad: ActiveGamepad | null;
  /** Plays a rumble pulse on the active controller; `false` when it is unsupported. */
  rumble: (effect?: GamepadVibrationEffect) => Promise<boolean>;
  /** Subscribes to controls resolved from controller input. */
  subscribeToControl: (listener: (id: ControlId) => void) => () => void;
  /** Subscribes to raw controller buttons, for interfaces that bind them. */
  subscribeToButton: (listener: (button: GamepadButtonId) => void) => () => void;
}

export const DEFAULT_SETTINGS: GameSettings = {
  saveName: 'Chronicles',
  difficulty: 'normal',
  fightingTooltipVisible: true,
  actionsTooltipVisible: true,
  audio: { ...DEFAULT_AUDIO_VOLUMES },
  currentMusicTrackId: DEFAULT_MUSIC_TRACK_ID,
  controls: buildDefaultControlBindings(),
  display: {
    fullscreen: false,
    imageRendering: DEFAULT_IMAGE_RENDERING,
    renderScale: DEFAULT_RENDER_SCALE,
  },
  language: 'en-US',
};

export const DEFAULT_GAME_STATE: GameState = {
  settings: {
    ...DEFAULT_SETTINGS,
    audio: { ...DEFAULT_SETTINGS.audio },
    controls: cloneControlBindings(DEFAULT_SETTINGS.controls),
    display: { ...DEFAULT_SETTINGS.display },
  },
  player: {
    hp: { current: 800, max: 1000 },
    mana: { current: 400, max: 600 },
    stamina: { current: 500, max: 700 },
  },
};

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [gameState, setGameState] = useState<GameState>(DEFAULT_GAME_STATE);
  const hydrated = useRef(false);

  const { controls } = gameState.settings;

  /** Controller in use; replaced only when a pad connects, disconnects or changes. */
  const [gamepad, setGamepad] = useState<ActiveGamepad | null>(null);
  /** Latest bindings, so the polling loop never needs to re-subscribe. */
  const controlsRef = useRef(controls);
  const activeGamepadRef = useRef<Gamepad | null>(null);
  /** Listeners registered by `useControlListener` (controls) and `useGamepadListener` (buttons). */
  const controlSubscribers = useRef(new Set<(id: ControlId) => void>());
  const buttonSubscribers = useRef(new Set<(button: GamepadButtonId) => void>());

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  const getControlIds = useCallback(
    (event: KeyboardEvent) => findControlsForEvent(event, controls),
    [controls],
  );

  const isControl = useCallback(
    (event: KeyboardEvent, id: ControlId) => getControlIds(event).includes(id),
    [getControlIds],
  );

  const setControlBinding = useCallback((id: ControlId, binding: ControlBinding) => {
    const normalized: ControlBinding = {
      keyboard: normalizeControlKeys(binding.keyboard),
      gamepad: normalizeGamepadButtons(binding.gamepad),
    };

    setGameState((state) => ({
      ...state,
      settings: {
        ...state.settings,
        controls: withControlBinding(state.settings.controls, id, normalized),
      },
    }));
  }, []);

  const subscribeToControl = useCallback((listener: (id: ControlId) => void) => {
    controlSubscribers.current.add(listener);
    return () => {
      controlSubscribers.current.delete(listener);
    };
  }, []);

  const subscribeToButton = useCallback((listener: (button: GamepadButtonId) => void) => {
    buttonSubscribers.current.add(listener);
    return () => {
      buttonSubscribers.current.delete(listener);
    };
  }, []);

  const rumble = useCallback(async (effect: GamepadVibrationEffect = {}) => {
    const active = activeGamepadRef.current;
    const actuator = active ? getVibrationActuator(active) : null;
    if (!actuator?.playEffect) return false;

    try {
      await actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: DEFAULT_RUMBLE_DURATION,
        strongMagnitude: DEFAULT_RUMBLE_MAGNITUDE,
        weakMagnitude: DEFAULT_RUMBLE_MAGNITUDE,
        ...effect,
      });
      return true;
    } catch {
      // The controller can be unplugged while an effect is playing.
      return false;
    }
  }, []);

  useEffect(() => {
    void loadSettings().then((saved) => {
      if (saved) {
        setGameState((previous) => ({
          ...previous,
          settings: {
            ...previous.settings,
            ...saved,
            audio: { ...previous.settings.audio, ...saved.audio },
            controls: { ...previous.settings.controls, ...normalizeControlBindings(saved.controls) },
            display: { ...previous.settings.display, ...normalizeDisplay(saved.display) },
          },
        }));
      }
      hydrated.current = true;
    });
  }, []);

  useEffect(() => {
    setAllVolumes(gameState.settings.audio);
    if (hydrated.current) {
      void saveSettings(gameState.settings);
    }
  }, [gameState.settings]);

  useEffect(() => {
    void applyDisplaySettings(gameState.settings.display);
  }, [gameState.settings.display]);

  // The Gamepad API exposes no button events, so the active pad is polled once per
  // frame and only newly pressed buttons are dispatched to the subscribers.
  useEffect(() => {
    let frame = requestAnimationFrame(poll);
    let previousButtons = new Set<GamepadButtonId>();

    function poll() {
      frame = requestAnimationFrame(poll);

      const active = getActiveGamepad();
      activeGamepadRef.current = active;

      const id = active?.id ?? null;
      setGamepad((current) => (current?.id === id ? current : id ? { id, family: detectGamepadFamily(id) } : null));

      const pressed = new Set(active ? readPressedGamepadButtons(active) : []);

      if (active) {
        for (const button of pressed) {
          if (previousButtons.has(button)) continue;

          buttonSubscribers.current.forEach((listener) => listener(button));

          for (const controlId of findControlsForGamepadButton(button, controlsRef.current)) {
            controlSubscribers.current.forEach((listener) => listener(controlId));
          }
        }
      }

      previousButtons = pressed;
    }

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <GameContext.Provider
      value={{
        gameState,
        setGameState,
        controls,
        getControlIds,
        isControl,
        setControlBinding,
        gamepad,
        rumble,
        subscribeToControl,
        subscribeToButton,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}

/**
 * Focused access to the centralized bindings, the controller and its haptics.
 *
 * Components must ask for a `ControlId` here instead of listening to a physical
 * key or button, so rebinding a control in Settings keeps working everywhere.
 */
export function useControls() {
  const { controls, getControlIds, isControl, setControlBinding, gamepad, rumble } = useGame();
  return { controls, getControlIds, isControl, setControlBinding, gamepad, rumble };
}

/** Handlers keyed by the control they respond to. */
export type ControlHandlers = Partial<Record<ControlId, () => void>>;

/**
 * Runs the handler registered for each control when it is triggered — the source is
 * abstracted away, so the same `advance` handler answers a key, a face button or a
 * future input without the component knowing about it.
 *
 * Handlers are read through a ref, so they do not need to be memoised to avoid
 * re-subscribing. `preventDefault` (on by default) stops the browser from acting on
 * keys the game already handled, such as scrolling with Space or the arrow keys.
 */
export function useControlListener(handlers: ControlHandlers, options: { preventDefault?: boolean } = {}) {
  const { getControlIds, subscribeToControl } = useGame();
  const { preventDefault = true } = options;

  const handlersRef = useRef(handlers);
  const getControlIdsRef = useRef(getControlIds);
  const preventDefaultRef = useRef(preventDefault);

  useEffect(() => {
    handlersRef.current = handlers;
    getControlIdsRef.current = getControlIds;
    preventDefaultRef.current = preventDefault;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // A shared key fires every control bound to it, so each listening component reacts.
      const triggered = getControlIdsRef.current(event).filter((controlId) => handlersRef.current[controlId]);
      if (triggered.length === 0) return;

      if (preventDefaultRef.current) event.preventDefault();
      for (const controlId of triggered) handlersRef.current[controlId]?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Controller input is polled centrally, so only the resolved control is handled here.
  useEffect(() => subscribeToControl((controlId) => handlersRef.current[controlId]?.()), [subscribeToControl]);
}

/**
 * Raw controller buttons, for interfaces that must know the physical input itself
 * rather than the action it performs — rebinding a control, for example.
 */
export function useGamepadListener(handler: (button: GamepadButtonId) => void) {
  const { subscribeToButton } = useGame();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => subscribeToButton((button) => handlerRef.current(button)), [subscribeToButton]);
}

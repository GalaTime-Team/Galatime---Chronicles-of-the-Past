import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FolderIcon } from '../../../assets/GalatimeIcon';
import { playSfx } from '../../../controllers/audioController';
import { revealSettingsFolder } from '../../../services/settingsService';

/**
 * Reveal of the folder shortcut: it starts tucked behind the label (shifted left, shrunk and
 * fully transparent) and slides out to its right, using the signature fast-start/silky-settle
 * ease shared by the rest of the title-menu chrome.
 */
const FOLDER_REVEAL_TRANSITION = { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const };

/**
 * Grace period before the shortcut retracts. Without it the icon snaps away the instant the
 * pointer leaves the label, which reads as a glitch when the cursor merely drifts off the
 * title on its way somewhere else.
 */
const FOLDER_HIDE_DELAY = 0.6;

/** Same motion as the reveal, held back by {@link FOLDER_HIDE_DELAY}. */
const FOLDER_HIDE_TRANSITION = { ...FOLDER_REVEAL_TRANSITION, delay: FOLDER_HIDE_DELAY };

/**
 * Header title of the Settings screen.
 *
 * Hovering the label makes the folder icon emerge from behind it and settle to the right, where
 * it becomes clickable; clicking it opens the OS folder that stores `settings.json`. The icon
 * also reveals itself while it holds keyboard focus, so the shortcut stays reachable without a
 * mouse.
 */
export function SettingsHeaderTitle() {
    const { t } = useTranslation('common');
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const revealed = hovered || focused;

    const openFolder = async () => {
        playSfx('click');
        await revealSettingsFolder();
    };

    return (
        <div
            className="relative inline-flex items-center justify-center"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
        >
            <h1 className="relative z-10 pl-[0.18em] text-3xl uppercase text-white sm:text-4xl">
                {t('settings.title')}
            </h1>

            {/* Positioning shell: kept out of the layout flow so the centred label never
                shifts while the icon slides in. Its font-size mirrors the title's so the
                icon scales with it. */}
            <div className="absolute left-full top-1/2 z-0 ml-1.5 -translate-y-1/2 text-3xl sm:text-4xl">
                <motion.button
                    type="button"
                    aria-label={t('settings.openFolder')}
                    title={t('settings.openFolder')}
                    onMouseEnter={() => playSfx('hover')}
                    onClick={openFolder}
                    initial={false}
                    animate={revealed ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -30, scale: 0.7 }}
                    transition={revealed ? FOLDER_REVEAL_TRANSITION : FOLDER_HIDE_TRANSITION}
                    className="flex items-center justify-center p-1 text-white/60 transition-colors duration-300 ease-out hover:text-white"
                    // Hidden means non-interactive too, otherwise an invisible button would
                    // swallow clicks aimed at the header.
                    style={{ pointerEvents: revealed ? 'auto' : 'none' }}
                >
                    <FolderIcon />
                </motion.button>
            </div>
        </div>
    );
}

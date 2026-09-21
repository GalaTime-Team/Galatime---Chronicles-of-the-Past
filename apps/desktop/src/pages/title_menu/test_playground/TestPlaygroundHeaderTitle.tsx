import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FolderIcon } from '../../../assets/GalatimeIcon';
import { playSfx } from '../../../controllers/audioController';

const FOLDER_REVEAL_TRANSITION = { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const };
const FOLDER_HIDE_DELAY = 0.6;
const FOLDER_HIDE_TRANSITION = { ...FOLDER_REVEAL_TRANSITION, delay: FOLDER_HIDE_DELAY };

export function TestPlaygroundHeaderTitle() {
    const { t } = useTranslation('common');
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const revealed = hovered || focused;

    return (
        <div
            className="relative inline-flex items-center justify-center"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
        >
            <h1 className="relative z-10 pl-[0.18em] text-3xl uppercase text-white sm:text-4xl">
                {t('playground.title')}
            </h1>

            <div className="absolute left-full top-1/2 z-0 ml-1.5 -translate-y-1/2 text-3xl sm:text-4xl">
                <motion.button
                    type="button"
                    aria-label={t('playground.openFolder')}
                    title={t('playground.openFolder')}
                    onMouseEnter={() => playSfx('hover')}
                    onClick={() => playSfx('click')}
                    initial={false}
                    animate={revealed ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -30, scale: 0.7 }}
                    transition={revealed ? FOLDER_REVEAL_TRANSITION : FOLDER_HIDE_TRANSITION}
                    className="flex items-center justify-center p-1 text-white/60 transition-colors duration-300 ease-out hover:text-white"
                    style={{ pointerEvents: revealed ? 'auto' : 'none' }}
                >
                    <FolderIcon />
                </motion.button>
            </div>
        </div>
    );
}

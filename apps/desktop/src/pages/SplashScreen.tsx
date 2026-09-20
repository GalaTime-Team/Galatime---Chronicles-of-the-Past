import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DEFAULT_MUSIC_TRACK_ID } from '../constants/AudioConstants';
import { playMusic } from '../controllers/audioController';
import { loadAndCacheBootstrap } from '../services/bootstrapService';

interface SplashScreenProps {
    onComplete: () => void;
}

/** Fade-out duration (in seconds) before handing control to the title menu. */
const FADE_DURATION = 0.5;
/** How long the splash lingers before auto-advancing once bootstrap is done (ms). */
const AUTO_ADVANCE_DELAY = 2000;

export function SplashScreen({ onComplete }: SplashScreenProps) {
    const { t, i18n } = useTranslation('common');
    const [isLeaving, setIsLeaving] = useState(false);
    const completedRef = useRef(false);

    const leave = useCallback(() => {
        // A click is a user gesture, so try to start the theme right away.
        // Autoplay without a gesture is retried by the title menu.
        void playMusic(DEFAULT_MUSIC_TRACK_ID);
        setIsLeaving(true);
    }, []);

    useEffect(() => {
        if (!isLeaving) return;

        const timer = window.setTimeout(() => {
            if (completedRef.current) return;
            completedRef.current = true;
            onComplete();
        }, FADE_DURATION * 1000);

        return () => window.clearTimeout(timer);
    }, [isLeaving, onComplete]);

    useEffect(() => {
        let active = true;
        let readyTimer: number | undefined;
        const load = async () => {
            await loadAndCacheBootstrap(i18n.language, i18n.getResourceBundle(i18n.language, 'common') as Record<string, unknown>);
            if (active) {
                readyTimer = window.setTimeout(() => {
                    if (active) setIsLeaving(true);
                }, AUTO_ADVANCE_DELAY);
            }
        };
        void load();
        return () => {
            active = false;
            if (readyTimer) window.clearTimeout(readyTimer);
        };
    }, [i18n.language, t]);

    return (
        <motion.main
            className="screen-center cursor-pointer px-6 text-center"
            role="button"
            tabIndex={0}
            aria-label={t('splash.skip')}
            initial={{ opacity: 0 }}
            animate={{ opacity: isLeaving ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: FADE_DURATION, ease: 'easeOut' }}
            onClick={leave}
            onKeyDown={leave}
        >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7 }}>
                <img src="/GT_Team_logo.png" alt={t('splash.teamAlt')} className="mx-auto h-64 w-auto object-contain" />
            </motion.div>
        </motion.main>
    );
}

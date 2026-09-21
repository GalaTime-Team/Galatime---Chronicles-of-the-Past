import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DEFAULT_MUSIC_TRACK_ID } from '../../constants/AudioConstants';
import {
    SPLASH_TITLE_CONTAINER_VARIANTS,
    SPLASH_TITLE_ITEM_VARIANTS,
    SPLASH_TO_TITLE_TRANSITION,
    PAGE_ENTER_TRANSITION,
    PAGE_FADE_TRANSITION,
} from '../../constants/AnimationConstants';
import { playMusic } from '../../controllers/audioController';
import CommonButton from '../../components/common/CommonButton';
import CommonImage from '../../components/common/CommonImage';
import { CommonPopup } from '../../components/common/CommonPopup';
import { useControlListener } from '../../context/GameContext';
import { invoke } from '@tauri-apps/api/core';

interface TitleMenuProps {
    onNewGame: () => void;
    onSettings: () => void;
    onCredits: () => void;
    onPlayground: () => void;
}

//region — Helpers
async function exitGame(): Promise<void> {
    try {
        await invoke('exit_app');
        return;
    } catch {
        // Browser preview and older builds use the window fallback below.
    }

    try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
        return;
    } catch {
        window.close();
    }
}
//endregion — Helpers

/**
 * Tracks whether the splash -> title reveal has already played for this app session. Kept at module
 * level so it survives `TitleMenu` re-mounts (returning from Settings/Credits) and the reveal stays
 * exclusive to the very first handoff from the splash screen.
 */
let titleRevealed = false;

export function TitleMenu({ onNewGame, onSettings, onCredits, onPlayground }: TitleMenuProps) {
    const { t } = useTranslation('common');
    const [confirmExit, setConfirmExit] = useState(false);

    // `deny` (Escape / the east face button) mirrors the Exit button: it opens the very same
    // confirmation. `mutedByModal` keeps this listener quiet while that popup is up, so the
    // popup answers `deny` itself — cancelling — instead of the menu reopening the prompt.
    useControlListener({ deny: () => setConfirmExit(true) }, { mutedByModal: true });

    //region — Music Hooks
    const musicStarted = useRef(false);
    const musicPending = useRef(false);
    const [isMusicReady, setMusicReady] = useState(false);

    const startMusic = useCallback(async () => {
        if (musicStarted.current || musicPending.current) return;
        musicPending.current = true;
        const started = await playMusic(DEFAULT_MUSIC_TRACK_ID);
        musicPending.current = false;
        if (started) {
            musicStarted.current = true;
            setMusicReady(true);
        }
    }, []);

    // Play the main theme automatically as soon as the menu appears.
    useEffect(() => {
        void startMusic();
    }, [startMusic]);

    // Browsers can block autoplay until the first interaction; retry silently
    // on any input instead of asking the player to press a button.
    useEffect(() => {
        if (isMusicReady) return;

        const retry = () => void startMusic();
        window.addEventListener('pointerdown', retry);
        window.addEventListener('keydown', retry);
        return () => {
            window.removeEventListener('pointerdown', retry);
            window.removeEventListener('keydown', retry);
        };
    }, [isMusicReady, startMusic]);
    //endregion — Music Hooks

    //region — Menu Data
    const menuItems: { label: string; onClick: () => void; disabled?: boolean }[] = [
        { label: t('titleMenu.newGame'), onClick: onNewGame },
        { label: t('titleMenu.settings'), onClick: onSettings },
        { label: t('titleMenu.credits'), onClick: onCredits },
        { label: t('titleMenu.playground'), onClick: onPlayground },
    ];
    //endregion — Menu Data

    //region — Render
    // The splash -> title handoff is a one-time reveal: it plays only when the menu is reached
    // straight from the splash and never again on later re-mounts (e.g. returning from Settings).
    const [fromSplash] = useState(() => !titleRevealed);
    if (fromSplash) titleRevealed = true;

    return (
        <motion.main
            className="relative flex min-h-screen items-center justify-center px-6 py-10"
            initial={fromSplash ? 'hidden' : { opacity: 0 }}
            animate={fromSplash ? 'visible' : { opacity: 1, transition: PAGE_ENTER_TRANSITION }}
            exit={{ opacity: 0, transition: PAGE_FADE_TRANSITION }}
            variants={fromSplash ? SPLASH_TITLE_CONTAINER_VARIANTS : undefined}
            transition={fromSplash ? SPLASH_TO_TITLE_TRANSITION : undefined}
        >
            <div className="w-full max-w-sm text-center">
                {/* Logo */}
                <motion.div
                    className="mx-auto mb-12 w-full max-w-76"
                    variants={SPLASH_TITLE_ITEM_VARIANTS}
                >
                    <CommonImage
                        src="/images/ui/menu-title.png"
                        alt={t('titleMenu.logoAlt')}
                        className="w-full"
                    />
                </motion.div>

                {/* Menu Buttons */}
                <div className="flex flex-col items-stretch gap-2">
                    {menuItems.map((item) => (
                        <motion.div key={item.label} variants={SPLASH_TITLE_ITEM_VARIANTS}>
                            <CommonButton
                                variant="ghost"
                                size="lg"
                                disabled={item.disabled}
                                onPress={item.onClick}
                                particles={true}
                                className="w-full text-center uppercase tracking-[0.16em]"
                            >
                                {item.label}
                            </CommonButton>
                        </motion.div>
                    ))}

                    {/* Exit Button */}
                    <motion.div variants={SPLASH_TITLE_ITEM_VARIANTS}>
                        <CommonButton
                            variant="ghost"
                            size="lg"
                            onPress={() => setConfirmExit(true)}
                            particles={true}
                            className="mt-4 w-full text-center uppercase tracking-[0.16em]"
                        >
                            {t('titleMenu.exit')}
                        </CommonButton>
                    </motion.div>
                </div>
            </div>

            {/* Exit Confirmation */}
            <CommonPopup
                open={confirmExit}
                variant="danger"
                title={t('titleMenu.exitTitle')}
                message={t('titleMenu.exitMessage')}
                onDismiss={() => setConfirmExit(false)}
                cancelAction={{ label: t('common.cancel'), onPress: () => setConfirmExit(false) }}
                confirmAction={{ label: t('common.confirm'), variant: 'danger', onPress: () => void exitGame() }}
            />
        </motion.main>
    );
    //endregion — Render
}

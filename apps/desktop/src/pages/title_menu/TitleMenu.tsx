import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DEFAULT_MUSIC_TRACK_ID } from '../../constants/AudioConstants';
import { playMusic } from '../../controllers/audioController';
import CommonButton from '../../components/common/CommonButton';
import { CommonPopup } from '../../components/common/CommonPopup';
import { invoke } from '@tauri-apps/api/core';

interface TitleMenuProps {
    onSettings: () => void;
    onCredits: () => void;
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

export function TitleMenu({ onSettings, onCredits }: TitleMenuProps) {
    const { t } = useTranslation('common');
    const [confirmExit, setConfirmExit] = useState(false);

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
    const menuItems = [
        { label: t('titleMenu.newGame'), disabled: true },
        { label: t('titleMenu.settings'), onClick: onSettings },
        { label: t('titleMenu.credits'), onClick: onCredits },
        { label: t('titleMenu.playground'), disabled: true },
    ];
    //endregion — Menu Data

    //region — Render
    return (
        <motion.main className="relative flex min-h-screen items-center justify-center px-6 py-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="w-full max-w-sm text-center">
                {/* Logo */}
                <img src="/images/ui/menu-title.png" alt={t('titleMenu.logoAlt')} className="mx-auto mb-12 w-full max-w-76" />

                {/* Menu Buttons */}
                <div className="flex flex-col items-stretch gap-2">
                    {menuItems.map((item) => (
                        <CommonButton key={item.label} variant="ghost" size="lg" disabled={item.disabled} onPress={item.onClick} particles={true} className="text-center uppercase tracking-[0.16em]">
                            {item.label}
                        </CommonButton>
                    ))}

                    {/* Exit Button */}
                    <CommonButton variant="ghost" size="lg" onPress={() => setConfirmExit(true)} particles={true} className="mt-4 text-center uppercase tracking-[0.16em]">
                        {t('titleMenu.exit')}
                    </CommonButton>
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

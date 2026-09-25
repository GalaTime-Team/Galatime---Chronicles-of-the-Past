import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CommonPopupCard from './CommonPopupCard';
import { MusicNote } from '../../assets/GalatimeIcon';
import { subscribeToMusicStarted } from '../../controllers/audioController';
import { useGame } from '../../context/GameContext';
import type { AudioTrackDefinition } from '../../types/AudioType';

/**
 * Announces the music that just started playing, using the same `CommonPopupCard` as the rest
 * of the interface. It is opt-in through the "Now Playing" switch in the Sound settings
 * (`showNowPlayingMusic`, off by default) and mounted once at the app root, so the card shows
 * on every screen — splash, title menu, settings and credits alike.
 */
export function NowPlayingCard() {
    const { t } = useTranslation('settings');
    const { gameState } = useGame();
    const enabled = gameState.settings.showNowPlayingMusic;

    const [track, setTrack] = useState<AudioTrackDefinition | null>(null);

    useEffect(() => {
        // Turning the switch off drops whatever card is on screen and stops listening.
        if (!enabled) {
            setTrack(null);
            return;
        }

        return subscribeToMusicStarted(setTrack);
    }, [enabled]);

    const handleClose = useCallback(() => setTrack(null), []);

    return (
        <CommonPopupCard
            isOpen={enabled && track !== null}
            title={t('settings.sound.nowPlaying.title')}
            message={track?.title ?? track?.id ?? ''}
            icon={<MusicNote />}
            iconAnimation="music"
            mode="normal"
            position="top-left"
            autoCloseTime={6000}
            onClose={handleClose}
        />
    );
}

export default NowPlayingCard;

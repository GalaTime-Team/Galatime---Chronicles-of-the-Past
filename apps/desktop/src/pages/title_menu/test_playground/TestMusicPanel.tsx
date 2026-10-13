import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MUSIC_TRACKS } from '../../../constants/AudioConstants';
import { getCurrentMusicTrackId, playMusic, stopMusic } from '../../../controllers/audioController';
import { MusicNote } from '../../../assets/GalatimeIcon';
import CommonButton from '../../../components/common/CommonButton';
import CommonInput from '../../../components/common/CommonInput';

export function TestMusicPanel() {
    const { t } = useTranslation('playground');
    const [currentTrackId, setCurrentTrackId] = useState<string | null>(getCurrentMusicTrackId());
    const [query, setQuery] = useState('');

    useEffect(() => {
        setCurrentTrackId(getCurrentMusicTrackId());
    }, []);

    const handlePlay = useCallback(async (trackId: string) => {
        await playMusic(trackId, { restartIfSame: true });
        setCurrentTrackId(trackId);
    }, []);

    const handleStop = useCallback(() => {
        stopMusic();
        setCurrentTrackId(null);
    }, []);

    const visibleTracks = useMemo(() => {
        const needle = query.trim().toLowerCase();

        if (!needle) return MUSIC_TRACKS;

        return MUSIC_TRACKS.filter(
            (track) =>
                track.title.toLowerCase().includes(needle) || track.id.toLowerCase().includes(needle),
        );
    }, [query]);

    return (
        <div className="space-y-2">
            {/* Now Playing */}
            <div className="border-b-4 border-white/10 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <MusicNote className="text-galatime-accent" />
                        <div>
                            <h2 className="text-lg text-white">{t('playground.music.nowPlaying')}</h2>
                            <p className="text-sm text-white/60">
                                {currentTrackId
                                    ? MUSIC_TRACKS.find((track) => track.id === currentTrackId)?.title ?? currentTrackId
                                    : t('playground.music.nothingPlaying')}
                            </p>
                        </div>
                    </div>
                    {currentTrackId && (
                        <CommonButton variant="ghost" size="sm" onPress={handleStop}>
                            {t('playground.music.stop')}
                        </CommonButton>
                    )}
                </div>
            </div>

            {/* Track List */}
            <div className="ml-auto w-full max-w-sm">
                <CommonInput
                    variant="bare"
                    title={t('playground.music.searchTitle')}
                    value={query}
                    onChange={setQuery}
                    placeholder={t('playground.music.searchPlaceholder')}
                    maxCharacters={40}
                    containerClassName="items-end"
                    inputClassName="text-left"
                />
            </div>

            <div className="space-y-1">
                {visibleTracks.map((track) => {
                    const isPlaying = currentTrackId === track.id;

                    return (
                        <div
                            key={track.id}
                            className={`flex items-center justify-between border-b border-white/10 py-3 ${isPlaying ? 'text-galatime-accent' : 'text-white'}`}
                        >
                            <div className="flex-1">
                                <p className="text-sm font-medium">{track.title}</p>
                                <p className="text-xs text-white/40">{track.id}</p>
                            </div>
                            <CommonButton
                                variant={isPlaying ? 'primary' : 'ghost'}
                                size="sm"
                                onPress={() => void handlePlay(track.id)}
                            >
                                {isPlaying ? t('playground.music.playing') : t('playground.music.play')}
                            </CommonButton>
                        </div>
                    );
                })}

                {visibleTracks.length === 0 && (
                    <p className="px-2 py-3 text-sm text-white/45">{t('playground.music.noResults')}</p>
                )}
            </div>
        </div>
    );
}

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setChannelVolume, setMasterVolume } from '../../../controllers/audioController';
import CommonSlider from '../../../components/common/CommonSlider';
import CommonSwitch from '../../../components/common/CommonSwitch';
import CommonPopupCard, { type PopupMode } from '../../../components/common/CommonPopupCard';
import type { SettingsPanelProps } from './types';

/** Volume at which the sliders sit on the far right. */
const MAX_VOLUME = 100;

/** Volume at or below which a slider counts as "practically muted". */
const QUIET_THRESHOLD = 20;

/** Which running joke the player just triggered; drives the card's copy and tone. */
type VolumeHintId = 'turnItUp' | 'sneaky' | 'fullBlast';

/** Tone of each hint: warnings for the jabs, a cheerful card for the full-volume payoff. */
const HINT_MODES: Record<VolumeHintId, PopupMode> = {
    turnItUp: 'warning',
    sneaky: 'warning',
    fullBlast: 'success',
};

interface VolumeHint {
    id: VolumeHintId;
    mode: PopupMode;
    /** Bumped on every trigger so the card remounts and its auto-close timer restarts. */
    seq: number;
}

export function SettingsSoundPanel({ settings, updateSettings }: SettingsPanelProps) {
    const { t } = useTranslation('settings');

    //region — Bits of state the joke needs to remember
    // Last value of every channel, so a raise can be told from a drop without trusting the
    // props, which lag behind the rapid stream of onChange events a slider drag produces.
    const lastVolumesRef = useRef({ ...settings.audio });
    // Set once the player drops the music slider: unlocks the master-volume jab later on.
    const musicLoweredRef = useRef(false);
    // Set when the player raises the music back up after that drop — the setup for the jab.
    const musicRestoredRef = useRef(false);
    // Latch so the "both at max" celebration only fires once per full-volume streak.
    const fullBlastRef = useRef(false);

    const [hint, setHint] = useState<VolumeHint | null>(null);
    const [hintOpen, setHintOpen] = useState(false);
    //endregion — Bits of state the joke needs to remember

    //region — Helpers
    const showHint = useCallback((id: VolumeHintId) => {
        setHint((previous) => ({ id, mode: HINT_MODES[id], seq: (previous?.seq ?? 0) + 1 }));
        setHintOpen(true);
    }, []);

    /**
     * Runs the running gag alongside the actual volume update.
     *
     * The joke only lands when the player plays out the whole sequence: they drop the music into
     * the "practically muted" zone (and get scolded for it), raise it back above that zone as if
     * they had listened, and then quietly drop the master into the same zone instead. Only that
     * final move earns the "I know what you're doing" line. Pinning both sliders at the top earns
     * a congratulatory card instead.
     */
    const checkVolumeGag = (channel: keyof typeof settings.audio, value: number, previous: number) => {
        const crossedDown = previous > QUIET_THRESHOLD && value <= QUIET_THRESHOLD;
        const crossedUp = previous <= QUIET_THRESHOLD && value > QUIET_THRESHOLD;

        if (channel === 'music') {
            if (crossedDown) {
                musicLoweredRef.current = true;
                musicRestoredRef.current = false;
                showHint('turnItUp');
            } else if (crossedUp && musicLoweredRef.current) {
                // Music was put back up after the scolding: the player is now "trusted" again.
                musicRestoredRef.current = true;
            }
        }

        if (channel === 'master' && crossedDown && musicRestoredRef.current) {
            musicRestoredRef.current = false;
            showHint('sneaky');
        }

        const { master, music } = lastVolumesRef.current;
        if (master >= MAX_VOLUME && music >= MAX_VOLUME) {
            if (!fullBlastRef.current) {
                fullBlastRef.current = true;
                showHint('fullBlast');
            }
        } else {
            fullBlastRef.current = false;
        }
    };

    const updateVolume = (channel: keyof typeof settings.audio, value: number) => {
        const previous = lastVolumesRef.current[channel];
        lastVolumesRef.current = { ...lastVolumesRef.current, [channel]: value };

        checkVolumeGag(channel, value, previous);

        updateSettings({ audio: { ...settings.audio, [channel]: value } });
        if (channel === 'master') setMasterVolume(value);
        else setChannelVolume(channel, value);
    };
    //endregion — Helpers

    //region — Render
    return (
        <div className="space-y-2">
            {/* Now Playing Card Toggle */}
            <CommonSwitch
                key={`nowPlaying-${settings.showNowPlayingMusic}`}
                title={t('settings.sound.nowPlaying.title')}
                description={t('settings.sound.nowPlaying.description')}
                defaultChecked={settings.showNowPlayingMusic}
                onChange={(checked) => updateSettings({ showNowPlayingMusic: checked })}
                showDescription
                containerClassName="setting-line border-b-4 border-white/10 py-4"
            />

            {/* Volume Sliders (master, music, sfx, ambient) */}
            {(['master', 'music', 'sfx', 'ambient'] as const).map((channel) => (
                <div key={channel} className="border-b-4 border-white/10 py-4">
                    <CommonSlider title={t(`settings.sound.${channel}`)} min={0} max={100} value={settings.audio[channel]} onChange={(value) => updateVolume(channel, value)} sliderContainerClassName="w-36 sm:w-48" />
                </div>
            ))}

            {/* The sound mixer's sense of humour, sneaking in from the corner. */}
            {hint && (
                <CommonPopupCard
                    key={hint.seq}
                    isOpen={hintOpen}
                    mode={hint.mode}
                    message={t(`settings.sound.hints.${hint.id}`)}
                    showLoading={false}
                    position="bottom-right"
                    autoCloseTime={3000}
                    messageClassName="whitespace-normal leading-snug"
                    onClose={() => setHintOpen(false)}
                />
            )}
        </div>
    );
    //endregion — Render
}

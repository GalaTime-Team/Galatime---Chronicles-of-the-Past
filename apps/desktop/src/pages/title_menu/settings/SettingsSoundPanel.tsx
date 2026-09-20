import { useTranslation } from 'react-i18next';
import { setChannelVolume, setMasterVolume } from '../../../controllers/audioController';
import CommonSlider from '../../../components/common/CommonSlider';
import CommonSwitch from '../../../components/common/CommonSwitch';
import type { SettingsPanelProps } from './types';

export function SettingsSoundPanel({ settings, updateSettings }: SettingsPanelProps) {
    const { t } = useTranslation('common');

    //region — Helpers
    const updateVolume = (channel: keyof typeof settings.audio, value: number) => {
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
        </div>
    );
    //endregion — Render
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    IMAGE_RENDERING_OPTIONS,
    RENDER_SCALE_MAX,
    RENDER_SCALE_MIN,
    RENDER_SCALE_STEP,
    type ImageRenderingMode,
} from '../../../constants/DisplayConstants';

import CommonSelector from '../../../components/common/CommonSelector';
import CommonSlider from '../../../components/common/CommonSlider';
import CommonSwitch from '../../../components/common/CommonSwitch';
import type { SettingsPanelProps } from './types';

export function SettingsDisplayPanel({ settings, updateSettings }: SettingsPanelProps) {
    const { t } = useTranslation('common');

    //region — Helpers
    const [draftScale, setDraftScale] = useState(settings.display.renderScale);

    const updateDisplay = (patch: Partial<typeof settings.display>) => updateSettings({ display: { ...settings.display, ...patch } });
    //endregion — Helpers

    //region — Render
    return (
        <div className="space-y-2">
            {/* Fullscreen Toggle */}
            <CommonSwitch
                title={t('settings.display.fullscreen')}
                description={t('settings.display.fullscreenDescription')}
                defaultChecked={settings.display.fullscreen}
                onChange={(checked) => updateDisplay({ fullscreen: checked })}
                showDescription
                containerClassName="setting-line border-b-4 border-white/10 py-4"
            />

            {/* Image Rendering Selector */}
            <CommonSelector
                title={t('settings.display.imageRendering')}
                items={IMAGE_RENDERING_OPTIONS}
                defaultId={settings.display.imageRendering}
                onChange={(item) => updateDisplay({ imageRendering: item.id as ImageRenderingMode })}
                orientation="horizontal"
                showDescription
                containerClassName="setting-line border-b-4 border-white/10 py-4"
                titleClassName="uppercase tracking-[0.1em] text-white/75"
                optionsWidthClassName="w-40 flex-none"
            />

            {/* Render Scale Slider */}
            <div className="border-b-4 border-white/10 py-4">
                <CommonSlider
                    title={t('settings.display.scale')}
                    min={RENDER_SCALE_MIN}
                    max={RENDER_SCALE_MAX}
                    step={RENDER_SCALE_STEP}
                    numBars={10}
                    value={draftScale}
                    onChange={(val) => setDraftScale(val)}
                    onValueCommitted={(val) => updateDisplay({ renderScale: val })}
                    formatValue={(val) => `${val}%`}
                    sliderContainerClassName="w-36 sm:w-48"
                />
            </div>
        </div>
    );
    //endregion — Render
}

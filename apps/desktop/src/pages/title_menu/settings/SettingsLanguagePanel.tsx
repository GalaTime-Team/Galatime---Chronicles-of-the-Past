import { useTranslation } from 'react-i18next';
import CommonSelector from '../../../components/common/CommonSelector';
import type { SettingsPanelProps } from './types';

const LANGUAGES = [{ id: 'en-US', title: 'settings.language.english' }];

export function SettingsLanguagePanel({ settings, updateSettings }: SettingsPanelProps) {
    const { t } = useTranslation('common');

    //region — Render
    return (
        <div>
            {/* Language Selector */}
            <CommonSelector
                title={t('settings.language.title')}
                items={LANGUAGES}
                defaultId={settings.language}
                onChange={(item) => updateSettings({ language: item.id })}
                orientation="horizontal"
                containerClassName="setting-line border-b-4 border-white/10 py-4"
                titleClassName="uppercase tracking-[0.1em] text-white/75"
                optionsWidthClassName="w-40 flex-none"
            />
        </div>
    );
    //endregion — Render
}

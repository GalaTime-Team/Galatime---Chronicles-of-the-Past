import { useTranslation } from 'react-i18next';
import CommonSelector from '../../../components/common/CommonSelector';
import type { SettingsPanelProps } from './types';

const LANGUAGES = [{ id: 'en-US', title: 'settings.language.english' }];

export function SettingsLanguagePanel({ settings, updateSettings }: SettingsPanelProps) {
    const { t } = useTranslation('settings');

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
                ns="settings"
                containerClassName="setting-line border-b-4 border-white/10 py-4"
                optionsWidthClassName="w-20 flex-none"
            />
        </div>
    );
    //endregion — Render
}

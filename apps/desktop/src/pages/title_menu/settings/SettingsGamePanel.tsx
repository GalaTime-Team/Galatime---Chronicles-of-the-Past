import { useTranslation } from 'react-i18next';
import CommonSwitch from '../../../components/common/CommonSwitch';
import type { SettingsPanelProps } from './types';

export function SettingsGamePanel({ settings, updateSettings }: SettingsPanelProps) {
    const { t } = useTranslation('common');

    //region — Render
    return (
        <div className="space-y-2">
            {/* Fighting Tips Toggle */}
            <CommonSwitch
                key={`fightingTips-${settings.fightingTooltipVisible}`}
                title={t('game.settings.fightingTips.title')}
                description={t('game.settings.fightingTips.description')}
                defaultChecked={settings.fightingTooltipVisible}
                onChange={(checked) => updateSettings({ fightingTooltipVisible: checked })}
                showDescription
                containerClassName="setting-line border-b-4 border-white/10 py-4"
            />

            {/* Action Tips Toggle */}
            <CommonSwitch
                key={`actionTips-${settings.actionsTooltipVisible}`}
                title={t('game.settings.actionTips.title')}
                description={t('game.settings.actionTips.description')}
                defaultChecked={settings.actionsTooltipVisible}
                onChange={(checked) => updateSettings({ actionsTooltipVisible: checked })}
                showDescription
                containerClassName="setting-line border-b-4 border-white/10 py-4"
            />
        </div>
    );
    //endregion — Render
}

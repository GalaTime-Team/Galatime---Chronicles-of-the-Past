import { useTranslation } from 'react-i18next';

export function TestCombatPanel() {
    const { t } = useTranslation('common');

    return (
        <div className="space-y-4">
            <p className="text-sm text-white/60">{t('playground.comingSoon')}</p>
        </div>
    );
}

export function TestObjectivesPanel() {
    const { t } = useTranslation('common');

    return (
        <div className="space-y-4">
            <p className="text-sm text-white/60">{t('playground.comingSoon')}</p>
        </div>
    );
}

export function TestMovementPanel() {
    const { t } = useTranslation('common');

    return (
        <div className="space-y-4">
            <p className="text-sm text-white/60">{t('playground.comingSoon')}</p>
        </div>
    );
}

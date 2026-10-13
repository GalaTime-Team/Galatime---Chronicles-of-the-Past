import { useTranslation } from 'react-i18next';

export function TestObjectivesPanel() {
    const { t } = useTranslation('playground');

    return (
        <div className="space-y-4">
            <p className="text-sm text-white/60">{t('playground.comingSoon')}</p>
        </div>
    );
}

export function TestMovementPanel() {
    const { t } = useTranslation('playground');

    return (
        <div className="space-y-4">
            <p className="text-sm text-white/60">{t('playground.comingSoon')}</p>
        </div>
    );
}

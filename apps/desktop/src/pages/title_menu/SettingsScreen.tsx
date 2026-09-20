import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGame, DEFAULT_SETTINGS } from '../../context/GameContext';
import { cloneControlBindings } from '../../constants/ControlConstants';
import { BackButton } from '../../components/common/BackButton';
import CommonButton from '../../components/common/CommonButton';
import { CommonPopup } from '../../components/common/CommonPopup';
import { SettingsSidebar, type SettingsTab } from './settings/SettingsSidebar';
import { SettingsControlsPanel } from './settings/SettingsControlsPanel';
import { SettingsDisplayPanel } from './settings/SettingsDisplayPanel';
import { SettingsGamePanel } from './settings/SettingsGamePanel';
import { SettingsLanguagePanel } from './settings/SettingsLanguagePanel';
import { SettingsSoundPanel } from './settings/SettingsSoundPanel';

interface SettingsScreenProps {
    onBack: () => void;
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
    const { t } = useTranslation('common');
    const { gameState, setGameState } = useGame();
    const [activeTab, setActiveTab] = useState<SettingsTab>('game');
    const [confirmReset, setConfirmReset] = useState(false);

    //region — Helpers
    const updateSettings = (patch: Partial<typeof gameState.settings>) => {
        setGameState((state) => ({ ...state, settings: { ...state.settings, ...patch } }));
    };

    const restoreDefaults = () => {
        setGameState((state) => ({ ...state, settings: { ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio }, controls: cloneControlBindings(DEFAULT_SETTINGS.controls), display: { ...DEFAULT_SETTINGS.display } } }));
        setConfirmReset(false);
    };
    //endregion — Helpers

    //region — Tab Data
    const labels: Record<SettingsTab, string> = {
        game: t('settings.tabs.game'),
        controls: t('settings.tabs.controls'),
        display: t('settings.tabs.display'),
        sound: t('settings.tabs.sound'),
        language: t('settings.tabs.language'),
    };

    const panel = {
        game: <SettingsGamePanel settings={gameState.settings} updateSettings={updateSettings} />,
        controls: <SettingsControlsPanel settings={gameState.settings} updateSettings={updateSettings} />,
        display: <SettingsDisplayPanel settings={gameState.settings} updateSettings={updateSettings} />,
        sound: <SettingsSoundPanel settings={gameState.settings} updateSettings={updateSettings} />,
        language: <SettingsLanguagePanel settings={gameState.settings} updateSettings={updateSettings} />,
    }[activeTab];
    //endregion — Tab Data

    //region — Render
    return (
        <motion.main className="fixed inset-0 z-10 flex flex-col overflow-hidden px-5 py-6 sm:px-10 sm:py-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-hidden">
                {/* Header — Back | Title */}
                <header className="mb-8 mt-8 flex items-center gap-3">
                    <BackButton label={t('common.back')} onClick={onBack} />
                    <span className="h-6 w-1 bg-white/20" aria-hidden="true" />
                    <h1 className="text-4xl uppercase tracking-[0.14em] text-white">{t('settings.title')}</h1>
                </header>

                {/* Left Column — Sidebar | Right Column — Tab Panel */}
                <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-4">
                    {/* Left Column — Sidebar */}
                    <SettingsSidebar activeTab={activeTab} onChange={setActiveTab} labels={labels} />

                    {/* Right Column — Tab Panel */}
                    <section className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-4 pr-2">
                        <AnimatePresence mode="wait">
                            <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>{panel}</motion.div>
                        </AnimatePresence>
                    </section>
                </div>

                {/* Footer — Restore Defaults (right, below everything) */}
                <footer className="mt-4 flex justify-end border-t border-white/10 pt-4">
                    <CommonButton variant="ghost" size="sm" onPress={() => setConfirmReset(true)}>
                        {t('settings.restoreDefaults')}
                    </CommonButton>
                </footer>
            </div>

            {/* Confirmation Dialog — Restore Defaults */}
            <CommonPopup
                open={confirmReset}
                variant="danger"
                title={t('settings.restoreTitle')}
                message={t('settings.restoreMessage')}
                onDismiss={() => setConfirmReset(false)}
                cancelAction={{ label: t('common.cancel'), onPress: () => setConfirmReset(false) }}
                confirmAction={{ label: t('common.confirm'), variant: 'danger', onPress: restoreDefaults }}
            />
        </motion.main>
    );
    //endregion — Render
}

import CommonButton from '../../../components/common/CommonButton';

export type SettingsTab = 'game' | 'controls' | 'display' | 'sound' | 'language';

interface SettingsSidebarProps {
    activeTab: SettingsTab;
    onChange: (tab: SettingsTab) => void;
    labels: Record<SettingsTab, string>;
}

export function SettingsSidebar({ activeTab, onChange, labels }: SettingsSidebarProps) {
    const tabs: SettingsTab[] = ['game', 'controls', 'display', 'sound', 'language'];

    return (
        <nav aria-label="Settings" className="grid shrink-0 grid-cols-2 gap-1 border-b border-white/10 pb-2 sm:flex sm:flex-row md:flex-col md:gap-2 md:overflow-y-auto md:border-b-0 md:pb-0 md:pr-2">
            {tabs.map((tab) => {
                const isActive = activeTab === tab;

                // Active tab keeps the established look (white fill, dark text). Resting
                // tabs express their tone through opacity so the standard ghost hover
                // (white fill, dark text) applies, like every other button in the app.
                return (
                    <CommonButton
                        key={tab}
                        variant="ghost"
                        size="sm"
                        onPress={() => onChange(tab)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`justify-start w-full px-3 py-1.5 tracking-[0.15em] border-0 ${isActive
                                ? 'bg-white font-semibold text-galatime-dark'
                                : 'opacity-60 hover:opacity-100'
                            }`}
                    >
                        {labels[tab]}
                    </CommonButton>
                );
            })}
        </nav>
    );
}

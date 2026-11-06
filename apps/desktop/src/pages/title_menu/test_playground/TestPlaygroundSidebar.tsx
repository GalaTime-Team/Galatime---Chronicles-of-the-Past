import CommonButton from '../../../components/common/CommonButton';
import type { PlaygroundTab } from './types';

interface TestPlaygroundSidebarProps {
    activeTab: PlaygroundTab;
    onChange: (tab: PlaygroundTab) => void;
    labels: Record<PlaygroundTab, string>;
}

export function TestPlaygroundSidebar({ activeTab, onChange, labels }: TestPlaygroundSidebarProps) {
    const tabs: PlaygroundTab[] = ['music', 'entities', 'dialogue', 'skills', 'combat', 'items', 'objectives', 'movement'];

    return (
        <nav aria-label="Test Playground" className="grid shrink-0 grid-cols-2 gap-1 border-b-game border-white/10 pb-2 sm:flex sm:flex-row md:flex-col md:gap-2 md:overflow-y-auto md:border-b-0 md:pb-0 md:pr-2">
            {tabs.map((tab) => {
                const isActive = activeTab === tab;

                // Same tab look as SettingsSidebar: white fill + dark text when active,
                // ghost's own white-fill hover when not.
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

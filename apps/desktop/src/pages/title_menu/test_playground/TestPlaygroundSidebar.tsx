import { playSfx } from '../../../controllers/audioController';
import type { PlaygroundTab } from './types';

interface TestPlaygroundSidebarProps {
    activeTab: PlaygroundTab;
    onChange: (tab: PlaygroundTab) => void;
    labels: Record<PlaygroundTab, string>;
}

export function TestPlaygroundSidebar({ activeTab, onChange, labels }: TestPlaygroundSidebarProps) {
    const tabs: PlaygroundTab[] = ['music', 'dialogue', 'combat', 'objectives', 'movement'];

    return (
        <nav aria-label="Test Playground" className="grid shrink-0 grid-cols-2 gap-1 border-b border-white/10 pb-2 sm:flex sm:flex-row md:flex-col md:gap-2 md:overflow-y-auto md:border-b-0 md:pb-0 md:pr-2">
            {tabs.map((tab) => {
                const isActive = activeTab === tab;

                return (
                    <button
                        type="button"
                        key={tab}
                        onMouseEnter={() => playSfx('hover')}
                        onClick={() => {
                            playSfx('click');
                            onChange(tab);
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        className={`whitespace-nowrap px-3 py-1.5 text-left text-xs uppercase tracking-[0.15em] transition-colors duration-300 ease-out md:w-full ${isActive
                                ? 'bg-white font-semibold text-galatime-dark'
                                : 'text-white/60 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        {labels[tab]}
                    </button>
                );
            })}
        </nav>
    );
}

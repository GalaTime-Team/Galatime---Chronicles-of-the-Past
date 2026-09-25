import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PAGE_ENTER_TRANSITION, PAGE_FADE_TRANSITION } from '../../constants/AnimationConstants';
import { BackButton } from '../../components/common/BackButton';
import { TestPlaygroundSidebar } from './test_playground/TestPlaygroundSidebar';
import type { PlaygroundTab } from './test_playground/types';
import { TestMusicPanel } from './test_playground/TestMusicPanel';
import { TestDialoguePanel } from './test_playground/TestDialoguePanel';
import { TestCombatPanel, TestObjectivesPanel, TestMovementPanel } from './test_playground/TestPlaceholderPanels';
import { TestEntitiesPanel } from './test_playground/TestEntitiesPanel';

interface TestPlaygroundScreenProps {
    onBack: () => void;
}

export function TestPlaygroundScreen({ onBack }: TestPlaygroundScreenProps) {
    const { t } = useTranslation(['playground', 'common']);
    const [activeTab, setActiveTab] = useState<PlaygroundTab>('music');

    //region — Tab Data
    const labels: Record<PlaygroundTab, string> = {
        music: t('playground.tabs.music'),
        dialogue: t('playground.tabs.dialogue'),
        combat: t('playground.tabs.combat'),
        objectives: t('playground.tabs.objectives'),
        movement: t('playground.tabs.movement'),
        entities: t('playground.tabs.entities'),
    };

    const panels: Record<PlaygroundTab, React.ReactNode> = {
        music: <TestMusicPanel />,
        // Resolves its own labels, like the music and entities panels: the dialogue
        // panel now owns enough strings that passing them all down would be noise.
        dialogue: <TestDialoguePanel />,
        combat: <TestCombatPanel />,
        objectives: <TestObjectivesPanel />,
        movement: <TestMovementPanel />,
        entities: <TestEntitiesPanel />,
    };

    const panel = panels[activeTab];
    //endregion — Tab Data

    //region — Render
    return (
        <motion.main
            className="relative h-dvh overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: PAGE_ENTER_TRANSITION }}
            exit={{ opacity: 0, transition: PAGE_FADE_TRANSITION }}
        >
            <div className="relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-6 py-5 sm:px-10 sm:py-6">
                {/* Header */}
                <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center">
                    <div className="justify-self-start">
                        <BackButton label={t('back')} onClick={onBack} />
                    </div>
                    <div
                        className="relative inline-flex items-center text-center justify-center"
                    >
                        <h1 className="relative z-10 pl-[0.18em] text-3xl uppercase text-white sm:text-4xl">
                            {t('playground.title')}
                        </h1>
                    </div>
                    <span aria-hidden="true" />
                </header>

                {/* Content — Sidebar + Panel */}
                <div className="flex min-h-0 flex-1 flex-col justify-center gap-8 py-6">
                    <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-4">
                        {/* Left Column — Sidebar */}
                        <TestPlaygroundSidebar activeTab={activeTab} onChange={setActiveTab} labels={labels} />

                        {/* Right Column — Tab Panel */}
                        {/*
                          `scrollbar-gutter: stable` is load-bearing, not cosmetic. This
                          section is what scrolls the panels, and a panel inside it can
                          decide its own layout from its own measured width — the dialogue
                          panel stacks its halves below a threshold. Without the reserved
                          gutter the two feed each other: the panel's content height decides
                          whether this section scrolls, the scrollbar then takes 10px off
                          the width the panel measures, and a threshold inside that 10px band
                          makes the layout flip back — forever, several times a second. The
                          reserved gutter keeps the measured width constant whether or not
                          there is a scrollbar.
                        */}
                        <section className="min-h-0 min-w-0 flex-1 [scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto p-2">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    className="h-full"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                >
                                    {panel}
                                </motion.div>
                            </AnimatePresence>
                        </section>
                    </div>
                </div>
            </div>
        </motion.main>
    );
    //endregion — Render
}

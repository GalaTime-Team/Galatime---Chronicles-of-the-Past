import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../components/common/BackButton';

interface CreditsScreenProps { onBack: () => void; }

/** A single credited line: an optional role label plus the people who filled it. */
interface CreditEntry {
    role?: string;
    names: string[];
}

/** One section of the credits (Story, Art, Code, Sound, Thanks). */
interface CreditGroup {
    key: string;
    title: string;
    entries: CreditEntry[];
    /** Wide sections stretch across the whole grid instead of one column. */
    wide?: boolean;
}

export function CreditsScreen({ onBack }: CreditsScreenProps) {
    const { t } = useTranslation('common');

    //region — Credits Data
    const groups: CreditGroup[] = [
        {
            key: 'story',
            title: t('credits.groups.story'),
            entries: [
                { role: t('credits.roles.narrativeWriter'), names: ['Sérgio Gabriel', 'GamerKnight64'] },
                { role: t('credits.roles.storyWriter'), names: ['Sérgio Gabriel', 'GamerKnight64'] },
            ],
        },
        {
            key: 'art',
            title: t('credits.groups.art'),
            entries: [
                { role: t('credits.roles.environment'), names: ['Sérgio Gabriel'] },
                { role: t('credits.roles.visualEffects'), names: ['Sérgio Gabriel', 'GamerKnight64'] },
                { role: t('credits.roles.extras'), names: ['Sérgio Gabriel', 'GamerKnight64'] },
                { role: t('credits.roles.characterDesigner'), names: ['Sérgio Gabriel', 'GamerKnight64', 'Mr Sann'] },
            ],
        },
        {
            key: 'code',
            title: t('credits.groups.code'),
            entries: [
                { role: t('credits.roles.coder'), names: ['Sérgio Gabriel'] },
                { role: t('credits.roles.gameEnvironmentDesigner'), names: ['Sérgio Gabriel', 'GamerKnight64'] },
            ],
        },
        {
            key: 'sound',
            title: t('credits.groups.sound'),
            entries: [
                { role: t('credits.roles.soundtrackComposer'), names: ['Nihhiu', 'Lukas R'] },
                { role: t('credits.roles.soundtrackProducer'), names: ['Nihhiu'] },
                { role: t('credits.roles.soundEffects'), names: ['Nihhiu', 'Lukas R'] },
            ],
        },
        {
            key: 'thanks',
            title: t('credits.groups.thanks'),
            wide: true,
            entries: [{ names: [t('credits.thanks.playtesters'), t('credits.thanks.contributors')] }],
        },
    ];
    //endregion — Credits Data

    //region — Render
    return (
        <motion.main className="min-h-screen px-5 py-6 sm:px-10 sm:py-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mx-auto flex w-full max-w-5xl flex-col">
                {/* Header — Back | Title */}
                <header className="mb-10 mt-8 flex items-center gap-3">
                    <BackButton label={t('common.back')} onClick={onBack} />
                    <span className="h-6 w-1 bg-white/20" aria-hidden="true" />
                    <h1 className="text-4xl uppercase tracking-[0.14em] text-white">{t('credits.title')}</h1>
                </header>

                {/* Credits Grid */}
                <div className="grid gap-x-16 gap-y-10 sm:grid-cols-2">
                    {groups.map((group, index) => (
                        <motion.section
                            key={group.key}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.06 * index, duration: 0.35, ease: 'easeOut' }}
                            className={group.wide ? 'sm:col-span-2' : ''}
                        >
                            {/* Section Title — flanked by fading rules */}
                            <div className="flex items-center gap-4">
                                <span className="h-px flex-1 bg-linear-to-r from-transparent to-galatime-warning/50" aria-hidden="true" />
                                <h2 className="whitespace-nowrap text-lg uppercase tracking-[0.22em] text-galatime-warning">{group.title}</h2>
                                <span className="h-px flex-1 bg-linear-to-l from-transparent to-galatime-warning/50" aria-hidden="true" />
                            </div>

                            {/* Entries — Role: Names */}
                            <ul className="mt-5 space-y-2 text-center leading-relaxed">
                                {group.entries.map((entry) => (
                                    <li key={entry.role ?? entry.names.join(', ')}>
                                        {entry.role && <span className="text-white/40">{entry.role}: </span>}
                                        <span className="text-white/80">{entry.names.join(', ')}</span>
                                    </li>
                                ))}
                            </ul>
                        </motion.section>
                    ))}
                </div>

                {/* Footer — Logo | Credits */}
                <footer className="mt-14 border-t border-white/10 pt-8 text-center">
                    <img src="/GT_Team_logo.png" alt={t('splash.teamAlt')} className="mx-auto h-20 w-auto max-w-[80vw] object-contain" />
                    <p className="mt-6 text-sm uppercase tracking-[0.22em] text-white/45">{t('credits.madeWith')}</p>
                </footer>
            </div>
        </motion.main>
    );
    //endregion — Render
}

import { Fragment } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PAGE_ENTER_TRANSITION, PAGE_FADE_TRANSITION } from '../../constants/AnimationConstants';
import { BackButton } from '../../components/common/BackButton';

interface CreditEntry {
    role?: string;
    names: string[];
}

interface CreditGroup {
    key: string;
    title: string;
    entries: CreditEntry[];
    wide?: boolean;
}

interface CreditsScreenProps {
    onBack: () => void;
}

function CreditSection({ group, className = '' }: { group: CreditGroup; className?: string }) {
    return (
        <section className={className}>
            <div className="flex items-center justify-center mb-4">
                <h2 className="whitespace-nowrap text-sm uppercase tracking-[0.28em] text-galatime-warning sm:text-base">
                    {group.title}
                </h2>
            </div>

            <ul className="space-y-3 text-center">
                {group.entries.map((entry) => (
                    <li key={entry.role ?? entry.names.join(', ')} className="flex flex-col items-center gap-0.5">
                        {entry.role && <span className="text-xs tracking-wide text-white/40">{entry.role}</span>}
                        <span className="flex flex-wrap items-center justify-center gap-x-2.5 text-[15px] leading-snug text-white/90 sm:text-base">
                            {entry.names.map((name, i) => (
                                <Fragment key={name}>
                                    {i > 0 && (
                                        <span className="size-1 rotate-45 bg-galatime-warning/60" aria-hidden="true" />
                                    )}
                                    <span className="whitespace-nowrap">{name}</span>
                                </Fragment>
                            ))}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function CreditsScreen({ onBack }: CreditsScreenProps) {
    const { t } = useTranslation('common');

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

    const columns = groups.filter((group) => !group.wide);
    const finale = groups.filter((group) => group.wide);

    return (
        <motion.main
            className="relative h-dvh overflow-y-auto overflow-x-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: PAGE_ENTER_TRANSITION }}
            exit={{ opacity: 0, transition: PAGE_FADE_TRANSITION }}
        >
            <div className="relative z-10 mx-auto flex min-h-full w-full max-w-7xl flex-col px-6 py-5 sm:px-10 sm:py-6">
                <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center">
                    <div className="justify-self-start">
                        <BackButton label={t('common.back')} onClick={onBack} />
                    </div>
                    <div className="text-center">
                        <h1 className="pl-[0.18em] text-3xl uppercase text-white sm:text-4xl">
                            {t('credits.title')}
                        </h1>
                    </div>
                    <span aria-hidden="true" />
                </header>

                <div className="flex flex-1 flex-col justify-center gap-8 py-6">
                    <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-0 lg:gap-y-0">
                        {columns.map((group) => (
                            <CreditSection
                                key={group.key}
                                group={group}
                                className="lg:border-l lg:border-white/10 lg:px-4 lg:first:border-l-0"
                            />
                        ))}
                    </div>

                    {finale.map((group) => (
                        <CreditSection key={group.key} group={group} className="mx-auto w-full max-w-2xl" />
                    ))}
                </div>

                <footer className="shrink-0 border-t border-white/10 pt-4 text-center">
                    <img
                        src="/GT_Team_logo.png"
                        alt={t('splash.teamAlt')}
                        className="mx-auto h-14 w-auto max-w-[70vw] object-contain sm:h-16"
                    />
                    <p className="mt-3 text-xs uppercase tracking-[0.25em] text-white/45">
                        {t('credits.madeWith')}
                    </p>
                </footer>
            </div>
        </motion.main>
    );
}
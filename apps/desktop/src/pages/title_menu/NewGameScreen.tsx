import { Fragment, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PAGE_ENTER_TRANSITION, PAGE_FADE_TRANSITION } from '../../constants/AnimationConstants';
import { BackButton } from '../../components/common/BackButton';
import CommonButton from '../../components/common/CommonButton';
import { CommonPopup } from '../../components/common/CommonPopup';
import { AddIcon, EditIcon, FolderIcon, TrashIcon } from '../../assets/GalatimeIcon';
import { createSave, deleteSave, hasSave, revealSavesFolder, SAVE_SLOTS, type SaveSlot } from '../../services/saveService';
import { playSfx } from '../../controllers/audioController';

/**
 * Reveal of the folder shortcut: it starts tucked behind the label (shifted left, shrunk and
 * fully transparent) and slides out to its right, using the signature fast-start/silky-settle
 * ease shared by the rest of the title-menu chrome.
 */
const FOLDER_REVEAL_TRANSITION = { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const };

/**
 * Grace period before the shortcut retracts. Without it the icon snaps away the instant the
 * pointer leaves the label, which reads as a glitch when the cursor merely drifts off the
 * title on its way somewhere else.
 */
const FOLDER_HIDE_DELAY = 0.6;

/** Same motion as the reveal, held back by {@link FOLDER_HIDE_DELAY}. */
const FOLDER_HIDE_TRANSITION = { ...FOLDER_REVEAL_TRANSITION, delay: FOLDER_HIDE_DELAY };

const Diamond = () => (
    <span className="size-1 shrink-0 rotate-45 bg-white/40" aria-hidden="true" />
);

export function NewGameScreen({ onBack }: { onBack: () => void }) {
    const { t } = useTranslation('common');
    const [occupied, setOccupied] = useState<Record<SaveSlot, boolean>>({ 1: false, 2: false, 3: false, 4: false, 5: false });
    const [deleteSlot, setDeleteSlot] = useState<SaveSlot | null>(null);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const revealed = hovered || focused;

    const openFolder = async () => {
        playSfx('click');
        await revealSavesFolder();
    };

    useEffect(() => {
        let active = true;
        void Promise.all(SAVE_SLOTS.map(async (slot) => [slot, await hasSave(slot)] as const)).then((entries) => {
            if (!active) return;
            setOccupied(Object.fromEntries(entries) as Record<SaveSlot, boolean>);
        });
        return () => { active = false; };
    }, []);

    const makeSave = async (slot: SaveSlot) => {
        await createSave(slot);
        setOccupied((previous) => ({ ...previous, [slot]: true }));
    };

    const removeSave = async () => {
        if (deleteSlot === null) return;
        const slot = deleteSlot;
        await deleteSave(slot);
        setOccupied((previous) => ({ ...previous, [slot]: false }));
        setDeleteSlot(null);
    };

    return (
        <motion.main
            className="relative h-dvh overflow-y-auto overflow-x-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: PAGE_ENTER_TRANSITION }}
            exit={{ opacity: 0, transition: PAGE_FADE_TRANSITION }}
        >
            <div className="relative z-10 mx-auto flex min-h-full w-full max-w-7xl flex-col px-6 py-5 sm:px-10 sm:py-6">
                <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center">
                    <div className="justify-self-start"><BackButton label={t('common.back')} onClick={onBack} /></div>
                    <div
                        className="relative inline-flex items-center justify-center"
                        onMouseEnter={() => setHovered(true)}
                        onMouseLeave={() => setHovered(false)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                    >
                        <h1 className="relative z-10 pl-[0.18em] text-center text-3xl uppercase text-white sm:text-4xl">{t('newGame.title')}</h1>
                        <div className="absolute left-full top-1/2 z-0 ml-1.5 -translate-y-1/2 text-3xl sm:text-4xl">
                            <motion.button
                                type="button"
                                aria-label={t('newGame.openFolder')}
                                title={t('newGame.openFolder')}
                                onMouseEnter={() => playSfx('hover')}
                                onClick={openFolder}
                                initial={false}
                                animate={revealed ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -30, scale: 0.7 }}
                                transition={revealed ? FOLDER_REVEAL_TRANSITION : FOLDER_HIDE_TRANSITION}
                                className="flex items-center justify-center p-1 text-white/60 transition-colors duration-300 ease-out hover:text-white"
                                style={{ pointerEvents: revealed ? 'auto' : 'none' }}
                            >
                                <FolderIcon />
                            </motion.button>
                        </div>
                    </div>
                    <span aria-hidden="true" />
                </header>

                <div className="flex flex-1 items-center justify-center py-8">
                    <div className="flex w-full max-w-5xl flex-col gap-2.5">
                        {SAVE_SLOTS.map((slot) => (
                            <motion.article
                                key={slot}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: slot * 0.04, duration: 0.25 }}
                                className="flex w-full flex-col border-2 border-white/15 bg-galatime-dark/60 py-2.5 px-4 leading-2.5 transition-colors duration-300 hover:border-galatime-primary/70 sm:flex-row sm:items-center sm:gap-3"
                            >
                                {occupied[slot] ? (
                                    <>
                                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                            <span className="text-xs tracking-wide text-galatime-warning/70">{t('newGame.slot', { slot })}</span>
                                            {/* Title */}
                                            <h2 className="text-lg font-semibold tracking-wide text-white sm:text-xl">Arteta</h2>
                                            {/* Description */}
                                            <div className="flex items-center gap-3 text-md text-white/50">
                                                {([
                                                    ['Fire, Force', t('newGame.labels.elements')],
                                                    ['4.200 G', t('newGame.labels.money')],
                                                    ['Find the question', t('newGame.labels.mainObjective')],
                                                ] as [string, string][]).map(([info, label], idx) => (
                                                    <Fragment key={label}>
                                                        {idx > 0 && <Diamond />}
                                                        <span className="whitespace-nowrap">
                                                            {label}: <span className="text-white/75">{info}</span>
                                                        </span>
                                                    </Fragment>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 flex-row justify-end gap-2 border-t border-white/10 pt-2 sm:ml-5 sm:w-8 sm:flex-col sm:justify-center sm:border-l sm:border-t-0 sm:border-white/10 sm:pt-0 sm:pl-3">
                                            <CommonButton
                                                variant="ghost"
                                                size="sm"
                                                aria-label={t('newGame.edit')}
                                                title={t('newGame.edit')}
                                                onPress={() => undefined}
                                                className="h-7! w-7! border-2! p-0! text-white/55 hover:text-galatime-dark"
                                                icon={<EditIcon className="h-3.5! w-3.5!" />}
                                            />
                                            <CommonButton
                                                variant="ghost"
                                                size="sm"
                                                aria-label={t('newGame.remove')}
                                                title={t('newGame.remove')}
                                                onPress={() => setDeleteSlot(slot)}
                                                className="h-7! w-7! border-2! p-0! text-galatime-error hover:text-galatime-dark"
                                                icon={<TrashIcon className="h-3.5! w-3.5!" />}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        aria-label={t('newGame.create', { slot })}
                                        onClick={() => void makeSave(slot)}
                                        className="group flex min-h-16 flex-1 flex-row items-center justify-center gap-3 text-white/45 transition-colors duration-300 hover:text-white"
                                    >
                                        <AddIcon className="h-7! w-7! text-galatime-primary transition-transform duration-300 group-hover:scale-110" />
                                        <span className="text-xs uppercase tracking-[0.22em]">{t('newGame.emptySlot', { slot })}</span>
                                    </button>
                                )}
                            </motion.article>
                        ))}
                    </div>
                </div>
            </div>

            <CommonPopup
                open={deleteSlot !== null}
                variant="danger"
                title={t('newGame.removeTitle')}
                message={t('newGame.removeMessage')}
                icon={<TrashIcon className="h-10! w-10!" />}
                onDismiss={() => setDeleteSlot(null)}
                cancelAction={{ label: t('common.cancel'), onPress: () => setDeleteSlot(null) }}
                confirmAction={{ label: t('common.confirm'), variant: 'danger', onPress: () => void removeSave() }}
            />
        </motion.main>
    );
}

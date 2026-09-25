import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { DialogueChoiceView } from '../../../types/DialogueType';
import { playSfx } from '../../../controllers/audioController';
import {
    DIALOGUE_CHOICE_CONTAINER_VARIANTS,
    DIALOGUE_CHOICE_ITEM_VARIANTS,
} from '../../../constants/DialogueAnimationConstants';
import { DIALOGUE_CHOICE_STACK_GAP_CLASS } from '../../../constants/DialogueConstants';

/**
 * The options of a `choice` node.
 *
 * It sits outside the dialogue box on purpose: the box belongs to whoever is
 * speaking, and the options belong to the player, so keeping them apart makes it
 * obvious at a glance which half of the screen is waiting for a decision.
 *
 * The list renders whatever the backend sent and never filters: an option the
 * backend marked unavailable is still shown, because "you cannot say that yet"
 * is information the player needs. Only `visible_if` failures are absent, and
 * those the backend already removed.
 */

export interface DialogueChoiceListProps {
    choices: DialogueChoiceView[];
    /** Index into `choices` of the highlighted option. */
    selectedIndex: number;
    /** The pointer or keyboard moved onto another option. */
    onHighlight: (index: number) => void;
    onSelect: (choice: DialogueChoiceView) => void;
    /** True while a step is in flight, so a second pick cannot be queued. */
    disabled?: boolean;
    className?: string;
}

export function DialogueChoiceList({
    choices,
    selectedIndex,
    onHighlight,
    onSelect,
    disabled = false,
    className = '',
}: DialogueChoiceListProps) {
    const { t } = useTranslation('dialogue');

    if (choices.length === 0) {
        return null;
    }

    return (
        <motion.div
            role="group"
            aria-label={t('dialogue.choicesHint')}
            variants={DIALOGUE_CHOICE_CONTAINER_VARIANTS}
            initial="hidden"
            animate="visible"
            className={`flex flex-col items-end ${DIALOGUE_CHOICE_STACK_GAP_CLASS} ${className}`}
        >
            {choices.map((choice, index) => {
                const isSelected = index === selectedIndex;
                const isLocked = !choice.enabled;

                // The reason is only worth showing on the highlighted option:
                // printing it under every locked option turns the list into a wall.
                const showReason = isLocked && isSelected && Boolean(choice.disabled_reason);

                return (
                    <motion.button
                        key={choice.choice_id}
                        type="button"
                        variants={DIALOGUE_CHOICE_ITEM_VARIANTS}
                        // Not `disabled`: a locked option must stay reachable so the
                        // player can find out why it is locked, which is exactly what
                        // a disabled button would hide from them.
                        aria-disabled={isLocked || disabled}
                        onMouseEnter={() => {
                            if (disabled) {
                                return;
                            }

                            if (!isLocked) {
                                void playSfx('hover');
                            }

                            onHighlight(index);
                        }}
                        onFocus={() => {
                            if (!disabled) {
                                onHighlight(index);
                            }
                        }}
                        onClick={(event) => {
                            event.stopPropagation();

                            if (disabled) {
                                return;
                            }

                            if (isLocked) {
                                void playSfx('denied');
                                return;
                            }

                            void playSfx('click');
                            onSelect(choice);
                        }}
                        // Options are the one thing here that is genuinely pressable,
                        // so they carry the pointer cursor themselves — the dialogue
                        // box deliberately does not hand it down to its prose.
                        className={`flex items-center justify-end gap-2 border-r-4 px-3 py-1.5 text-right transition-colors duration-300 ease-out ${
                            isLocked
                                ? 'cursor-not-allowed border-transparent text-white/25'
                                : disabled
                                    ? 'cursor-default border-transparent text-white/25'
                                    : isSelected
                                        ? 'cursor-pointer border-galatime-accent bg-galatime-dark text-white'
                                        : 'cursor-pointer border-transparent text-white/60 hover:bg-galatime-dark/60 hover:text-white'
                        }`}
                    >
                        <span className="flex flex-col items-end">
                            <span className="text-sm leading-2.5 font-custom">{choice.text}</span>

                            {showReason && (
                                <span className="text-xs leading-2.5 text-white/40">
                                    {choice.disabled_reason}
                                </span>
                            )}
                        </span>

                        {/* Fixed width so the label does not shift when the marker appears. */}
                        <span
                            aria-hidden="true"
                            className="w-3 shrink-0 text-galatime-accent"
                        >
                            {isSelected ? '>' : ''}
                        </span>
                    </motion.button>
                );
            })}
        </motion.div>
    );
}

export default DialogueChoiceList;

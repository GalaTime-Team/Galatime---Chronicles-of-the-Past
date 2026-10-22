import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DialogueInputRequest } from '../../../types/DialogueType';
import { playSfx } from '../../../controllers/audioController';
import CommonButton from '../../common/CommonButton';
import CommonInput from '../../common/CommonInput';

/**
 * The question the game asks the player.
 *
 * A "call to action" node stops the conversation and waits: the player types
 * an answer or picks one from a list, and the answer is stored under the
 * node's own variable — `input.<variable>` — which is what a later line
 * speaks back and what a condition compares against.
 *
 * **The question is asked by the game, not by anybody on stage**, so there is
 * no name plate: the panel reads as the game's own voice, which is also what
 * tells the player that this is not a line somebody is saying.
 *
 * A text answer is confirmed with the button or with Enter; a list is picked
 * with a click. The answer is trimmed before it is sent, so the value the
 * conversation stores is what the player meant to write.
 */

export interface DialoguePlayerInputProps {
    /** The question, as the dialogue asked it. */
    request: DialogueInputRequest;
    /** Called with the answer. */
    onSubmit: (value: string) => void;
    /** Ignores input while a step is in flight. */
    disabled?: boolean;
    className?: string;
}

export function DialoguePlayerInput({
    request,
    onSubmit,
    disabled = false,
    className = '',
}: DialoguePlayerInputProps) {
    const { t } = useTranslation('dialogue');
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLInputElement | null>(null);

    const isChoice = request.input_type === 'choice';

    // A new question starts from an empty answer, and the field takes the
    // keyboard: the player is being asked something, so the caret is where
    // they should be.
    useEffect(() => {
        setValue('');

        if (!isChoice) {
            inputRef.current?.focus();
        }
    }, [request.variable, isChoice]);

    const submit = (answer: string) => {
        const trimmed = answer.trim();

        if (trimmed === '' || disabled) {
            return;
        }

        void playSfx('click');
        onSubmit(trimmed);
    };

    return (
        <div
            onKeyDown={(event) => {
                // Enter answers the question: it is the key the player is
                // already holding when they finish typing.
                if (event.key === 'Enter' && !isChoice) {
                    event.preventDefault();
                    submit(value);
                }
            }}
            className={`flex w-full flex-col gap-3 bg-galatime-dark p-4 outline-2 outline-white ${className}`}
        >
            <p className="font-custom text-lg leading-snug text-white">
                {request.question}
            </p>

            {isChoice ? (
                <div className="flex flex-col gap-2">
                    {request.options.map((option) => (
                        <CommonButton
                            key={option}
                            variant="outline"
                            size="md"
                            disabled={disabled}
                            onPress={() => submit(option)}
                            className="w-full justify-start"
                        >
                            {option}
                        </CommonButton>
                    ))}
                </div>
            ) : (
                <div className="flex items-end gap-2">
                    <CommonInput
                        variant="bare"
                        title={request.question}
                        value={value}
                        onChange={setValue}
                        placeholder={request.placeholder || t('dialogue.input.placeholder')}
                        maxCharacters={60}
                        disabled={disabled}
                        inputRef={inputRef}
                        containerClassName="flex-1"
                    />

                    <CommonButton
                        variant="primary"
                        size="md"
                        disabled={disabled || value.trim() === ''}
                        onPress={() => submit(value)}
                    >
                        {t('dialogue.input.confirm')}
                    </CommonButton>
                </div>
            )}
        </div>
    );
}

export default DialoguePlayerInput;

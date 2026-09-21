import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from '../../../assets/GalatimeIcon';
import { playSfx } from '../../../controllers/audioController';
import CommonInput from '../../../components/common/CommonInput';

interface TestDialoguePanelProps {
    title: string;
    placeholder: string;
    notFoundMessage: string;
    foundMessage: string;
}

export function TestDialoguePanel({ title, placeholder, notFoundMessage, foundMessage }: TestDialoguePanelProps) {
    const { t } = useTranslation('common');
    const [dialogueId, setDialogueId] = useState('');
    const [checkResult, setCheckResult] = useState<'found' | 'not_found' | null>(null);

    const handleCheck = () => {
        if (!dialogueId.trim()) {
            playSfx('denied');
            return;
        }

        playSfx('click');

        // Simulated check — dialogues are loaded from data files at runtime,
        // so for now we just check against a known pattern.
        const knownPrefixes = ['intro', 'ch1', 'ch2', 'npc', 'boss', 'secret'];
        const isValid = knownPrefixes.some((prefix) => dialogueId.toLowerCase().startsWith(prefix));

        setCheckResult(isValid ? 'found' : 'not_found');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCheck();
        }
    };

    return (
        <div className="space-y-4">
            <CommonInput
                title={title}
                value={dialogueId}
                onChange={(value) => {
                    setDialogueId(value);
                    setCheckResult(null);
                }}
                placeholder={placeholder}
                maxCharacters={50}
                showDescription
                showCounter
                orientation="vertical"
            />

            <div className="flex items-center justify-center">
                <button
                    type="button"
                    onClick={handleCheck}
                    onKeyDown={handleKeyDown}
                    onMouseEnter={() => playSfx('hover')}
                    className="flex items-center gap-2 px-4 py-2 text-galatime-accent transition-colors duration-300 ease-out hover:text-white"
                >
                    <span className="text-xs uppercase tracking-[0.15em]">{t('playground.check')}</span>
                    <ArrowRight />
                </button>
            </div>

            {checkResult && (
                <div
                    className={`border-l-4 py-2 pl-4 text-sm ${checkResult === 'found'
                            ? 'border-galatime-success text-galatime-success'
                            : 'border-galatime-error text-galatime-error'
                        }`}
                >
                    {checkResult === 'found' ? foundMessage : notFoundMessage}
                </div>
            )}
        </div>
    );
}

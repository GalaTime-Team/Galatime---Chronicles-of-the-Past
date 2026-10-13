import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CommonImage from '../../../../components/common/CommonImage';
import CommonInput from '../../../../components/common/CommonInput';
import CommonPopup from '../../../../components/common/CommonPopup';
import { playSfx } from '../../../../controllers/audioController';
import { filterCatalogue, type CatalogueEntity } from '../combatSetupModel';

const UNKNOWN_SPRITE = '/images/ui/misc/unknown.png';

interface TestCombatPickerPopupProps {
    open: boolean;
    /** Every entity the picker can offer, characters and mobs together. */
    catalogue: readonly CatalogueEntity[];
    onDismiss: () => void;
    onPick: (entity: CatalogueEntity) => void;
}

/**
 * Entity picker of the combat setup.
 *
 * Type an id and the catalogue narrows under the field; picking a suggestion fills
 * the slot straight away. The primary action repeats the top suggestion so the id
 * can also be confirmed without reaching for the pointer.
 */
export function TestCombatPickerPopup({ open, catalogue, onDismiss, onPick }: TestCombatPickerPopupProps) {
    const { t } = useTranslation('playground');
    const [query, setQuery] = useState('');

    // Every open starts from a clean field, so the next slot is not filtered by the last search.
    useEffect(() => {
        if (open) setQuery('');
    }, [open]);

    const suggestions = useMemo(() => filterCatalogue(catalogue, query), [catalogue, query]);
    const topSuggestion = suggestions[0];

    const pick = (entity: CatalogueEntity) => {
        playSfx('click');
        onPick(entity);
    };

    return (
        <CommonPopup
            open={open}
            onDismiss={onDismiss}
            title={t('playground.combat.pickerTitle')}
            size="md"
            confirmAction={{
                label: t('playground.combat.pickerAdd'),
                disabled: !topSuggestion,
                onPress: () => {
                    if (topSuggestion) pick(topSuggestion);
                },
            }}
            cancelAction={{ label: t('playground.combat.cancel'), variant: 'ghost' }}
        >
            <div className="mx-auto w-full max-w-sm">
                <CommonInput
                    title={t('playground.combat.pickerInput')}
                    value={query}
                    onChange={setQuery}
                    placeholder={t('playground.combat.pickerPlaceholder')}
                    maxCharacters={40}
                />
            </div>

            <p className="mt-4 text-xs uppercase tracking-[0.15em] text-white/40">
                {t('playground.combat.pickerSuggestions')}
            </p>

            <ul className="mt-2 max-h-64 overflow-y-auto border-t border-white/10">
                {suggestions.map((entry) => (
                    <li key={`${entry.entityType}:${entry.entityId}`}>
                        <button
                            type="button"
                            onMouseEnter={() => playSfx('hover')}
                            onClick={() => pick(entry)}
                            className="flex w-full items-center gap-3 px-2 py-1.5 text-left transition-colors duration-200 ease-out hover:bg-white/10"
                        >
                            <CommonImage
                                src={entry.spriteUrl ?? UNKNOWN_SPRITE}
                                fallbackSrc={UNKNOWN_SPRITE}
                                alt=""
                                className="h-7 w-7 shrink-0"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm text-white/85">{entry.name}</span>
                            <span className="shrink-0 font-mono text-xs text-white/35">{entry.entityId}</span>
                            <span className="shrink-0 border border-white/15 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-white/45">
                                {entry.entityType}
                            </span>
                        </button>
                    </li>
                ))}

                {suggestions.length === 0 && (
                    <li className="px-2 py-3 text-sm text-white/45">{t('playground.combat.pickerNoResults')}</li>
                )}
            </ul>
        </CommonPopup>
    );
}

export default TestCombatPickerPopup;

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CommonInput from '../../../../components/common/CommonInput';
import type { CharacterData, MobData } from '../../../../types/EntityDataType';
import type { EntityItem } from '../types';

interface TestEntitiesSidebarProps {
    characters: CharacterData[];
    mobs: MobData[];
    selected: EntityItem | null;
    onSelect: (item: EntityItem) => void;
}

/**
 * Entity list column of the Test Entities playground. Owns its own scrollbar so the
 * surrounding panel (and the detail tab) can scroll independently.
 */
export function TestEntitiesSidebar({ characters, mobs, selected, onSelect }: TestEntitiesSidebarProps) {
    const { t } = useTranslation('playground');
    const [query, setQuery] = useState('');

    const needle = query.trim().toLowerCase();
    const filteredCharacters = useMemo(() => {
        if (!needle) return characters;
        return characters.filter(
            (c) =>
                c.id.toLowerCase().includes(needle) ||
                c.name.toLowerCase().includes(needle) ||
                c.surname.toLowerCase().includes(needle) ||
                `${c.name} ${c.surname}`.toLowerCase().includes(needle),
        );
    }, [characters, needle]);
    const filteredMobs = useMemo(() => {
        if (!needle) return mobs;
        return mobs.filter(
            (m) => m.id.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle),
        );
    }, [mobs, needle]);

    return (
        <div className="flex w-48 shrink-0 flex-col gap-4 overflow-y-auto p-2">
            <CommonInput
                variant="bare"
                title={t('playground.entities.searchTitle')}
                value={query}
                onChange={setQuery}
                placeholder={t('playground.entities.searchPlaceholder')}
                maxCharacters={40}
                containerClassName="items-end"
                inputClassName="text-left"
            />
            <div>
                <h3 className="mb-2 text-xs uppercase tracking-[0.15em] text-white/40">{t('playground.entities.characters')}</h3>
                <div className="flex flex-col gap-1">
                    {filteredCharacters.map((c) => (
                        <button
                            key={c.id}
                            onClick={() => onSelect({ id: c.id, name: `${c.name} ${c.surname}`, type: 'character', data: c })}
                            className={`px-3 py-2 text-left text-sm transition-colors ${selected?.id === c.id && selected?.type === 'character'
                                    ? 'bg-white font-semibold text-galatime-dark'
                                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            {c.name} {c.surname}
                        </button>
                    ))}
                </div>
            </div>
            <div>
                <h3 className="mb-2 text-xs uppercase tracking-[0.15em] text-white/40">{t('playground.entities.mobs')}</h3>
                <div className="flex flex-col gap-1">
                    {filteredMobs.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => onSelect({ id: m.id, name: m.name, type: 'mob', data: m })}
                            className={`px-3 py-2 text-left text-sm transition-colors ${selected?.id === m.id && selected?.type === 'mob'
                                    ? 'bg-white font-semibold text-galatime-dark'
                                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            {m.name}
                        </button>
                    ))}
                </div>
            </div>
            {filteredCharacters.length === 0 && filteredMobs.length === 0 && (
                <p className="px-2 py-3 text-sm text-white/45">{t('playground.entities.noResults')}</p>
            )}
        </div>
    );
}

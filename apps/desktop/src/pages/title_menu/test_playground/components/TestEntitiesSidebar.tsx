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
    return (
        <div className="flex w-48 shrink-0 flex-col gap-4 overflow-y-auto p-2">
            <div>
                <h3 className="mb-2 text-xs uppercase tracking-[0.15em] text-white/40">Characters</h3>
                <div className="flex flex-col gap-1">
                    {characters.map((c) => (
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
                <h3 className="mb-2 text-xs uppercase tracking-[0.15em] text-white/40">Mobs</h3>
                <div className="flex flex-col gap-1">
                    {mobs.map((m) => (
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
        </div>
    );
}

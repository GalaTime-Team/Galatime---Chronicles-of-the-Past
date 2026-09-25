import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAllCharacters, fetchAllMobs } from '../../../controllers/entityController';
import type { CharacterData, MobData } from '../../../types/EntityDataType';
import type { EntityItem } from './types';
import { TestEntitiesSidebar } from './components/TestEntitiesSidebar';
import { TestEntitiesTab } from './components/TestEntitiesTab';

export function TestEntitiesPanel() {
    const { t } = useTranslation('playground');
    const [characters, setCharacters] = useState<CharacterData[]>([]);
    const [mobs, setMobs] = useState<MobData[]>([]);
    const [selected, setSelected] = useState<EntityItem | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setLoading(true);
            const [chars, mobsData] = await Promise.all([fetchAllCharacters(), fetchAllMobs()]);
            setCharacters(chars);
            setMobs(mobsData);
            setLoading(false);
        }
        load();
    }, []);

    if (loading) {
        return <p className="text-sm text-white/60">{t('playground.comingSoon')}</p>;
    }

    return (
        <div className="flex h-full min-h-0 gap-4 overflow-hidden">
            {/* Sidebar: scroll próprio */}
            <div className="min-h-0 w-54 shrink-0 overflow-y-auto">
                <TestEntitiesSidebar characters={characters} mobs={mobs} selected={selected} onSelect={setSelected} />
            </div>

            {/* Tab: scroll próprio */}
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                <TestEntitiesTab item={selected} />
            </div>
        </div>
    );
}


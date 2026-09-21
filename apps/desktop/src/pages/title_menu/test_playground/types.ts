import type { CharacterData, MobData } from '../../../types/EntityDataType';

export type PlaygroundTab = 'music' | 'dialogue' | 'combat' | 'objectives' | 'movement' | 'entities';

/** A selectable entity shown in the playground's entity sidebar/tab. */
export type EntityItem = {
    id: string;
    name: string;
    type: 'character' | 'mob';
    data: CharacterData | MobData;
};

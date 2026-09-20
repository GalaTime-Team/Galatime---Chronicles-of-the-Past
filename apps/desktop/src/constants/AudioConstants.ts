import { load } from 'js-yaml';
import type { AudioTrackDefinition, AudioVolumes } from '../types/AudioType';

import musicYamlRaw from '../data/audio/music.yaml?raw';
import sfxYamlRaw from '../data/audio/sfx.yaml?raw';
import ambientYamlRaw from '../data/audio/ambient.yaml?raw';

// Carrega dinamicamente os ficheiros de áudio por padrão (sem imports individuais)
const audioModules = import.meta.glob<string>('../assets/**/*.{ogg,mp3,wav}', {
    query: '?url',
    import: 'default',
});

function resolveAudioPath(yamlPath: string): string {
    // Converte "../assets/music/Filename.ogg" para chave do glob
    const normalizedPath = yamlPath.replace(/\.\.\//g, '').replace(/^\//, '');
    const fullPath = `../assets/${normalizedPath}`;
    
    // Procura no módulo glob
    if (fullPath in audioModules) {
        return audioModules[fullPath as keyof typeof audioModules] as unknown as string;
    }
    
    // Fallback: tenta resolver directamente
    return new URL(yamlPath, import.meta.url).href;
}

function loadAudioTracksFromYaml(yamlContent: string): AudioTrackDefinition[] {
    try {
        const parsed = load(yamlContent);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.map((item: any) => ({
            id: item.id,
            src: resolveAudioPath(item.src),
            // YAML tracks declare their display name as `name`; `title` is kept as an alias.
            title: item.title ?? item.name,
            description: item.description,
            loop: item.loop ?? false,
        }));
    } catch {
        return [];
    }
}

export const MUSIC_TRACKS: AudioTrackDefinition[] = loadAudioTracksFromYaml(musicYamlRaw);
export const SFX_TRACKS: AudioTrackDefinition[] = loadAudioTracksFromYaml(sfxYamlRaw);
export const AMBIENT_TRACKS: AudioTrackDefinition[] = loadAudioTracksFromYaml(ambientYamlRaw);

export const DEFAULT_MUSIC_TRACK_ID = MUSIC_TRACKS[0]?.id ?? 'galatime_theme';
export const BUTTON_SFX_ID = 'hover';

export const DEFAULT_AUDIO_VOLUMES: AudioVolumes = {
    master: 80,
    music: 80,
    sfx: 80,
    ambient: 80,
};
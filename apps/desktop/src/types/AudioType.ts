export type AudioChannel = 'master' | 'music' | 'sfx' | 'ambient';

export interface AudioVolumes {
    master: number;
    music: number;
    sfx: number;
    ambient: number;
}

export interface AudioTrackDefinition {
    id: string;
    src: string;
    title?: string;
    description?: string;
    loop?: boolean;
}

export interface AudioCatalog {
    music: AudioTrackDefinition[];
    sfx: AudioTrackDefinition[];
    ambient: AudioTrackDefinition[];
}

export interface PlayOptions {
    restartIfSame?: boolean;
}

export interface PlaySfxOptions {
    gain?: number;
}
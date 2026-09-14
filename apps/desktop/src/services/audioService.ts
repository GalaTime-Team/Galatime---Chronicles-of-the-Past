import type {
    AudioCatalog,
    AudioChannel,
    AudioTrackDefinition,
    AudioVolumes,
    PlayOptions,
    PlaySfxOptions,
} from '../types/AudioType';

function clampVolume(value: number): number {
    if (Number.isNaN(value)) {
        return 0;
    }

    return Math.max(0, Math.min(100, Math.round(value)));
}

/** Extra attenuation applied to the SFX channel so effects don't overpower music/ambient. */
const SFX_ATTENUATION = 0.7;

function toNormalizedVolume(value: number): number {
    const clamped = clampVolume(value) / 100;
    // Perceptual curve (quadratic): makes each slider step feel
    // roughly equally spaced to human ears instead of linear.
    return clamped * clamped;
}

export class AudioService {
    private readonly trackMap: {
        music: Map<string, AudioTrackDefinition>;
        sfx: Map<string, AudioTrackDefinition>;
        ambient: Map<string, AudioTrackDefinition>;
    };

    private volumes: AudioVolumes;

    private musicPlayer: HTMLAudioElement | null = null;
    private ambientPlayer: HTMLAudioElement | null = null;
    private activeSfxPlayers = new Set<HTMLAudioElement>();

    private currentMusicTrackId: string | null = null;
    private currentAmbientTrackId: string | null = null;

    constructor(catalog: AudioCatalog, initialVolumes: AudioVolumes) {
        this.trackMap = {
            music: new Map(catalog.music.map((track) => [track.id, track])),
            sfx: new Map(catalog.sfx.map((track) => [track.id, track])),
            ambient: new Map(catalog.ambient.map((track) => [track.id, track])),
        };

        this.volumes = {
            master: clampVolume(initialVolumes.master),
            music: clampVolume(initialVolumes.music),
            sfx: clampVolume(initialVolumes.sfx),
            ambient: clampVolume(initialVolumes.ambient),
        };
    }

    getVolumes(): AudioVolumes {
        return { ...this.volumes };
    }

    getCurrentMusicTrackId(): string | null {
        return this.currentMusicTrackId;
    }

    setMasterVolume(value: number): void {
        this.volumes.master = clampVolume(value);
        this.applyAllVolumes();
    }

    setChannelVolume(channel: AudioChannel, value: number): void {
        this.volumes[channel] = clampVolume(value);
        this.applyAllVolumes();
    }

    setVolumes(partial: Partial<AudioVolumes>): void {
        this.volumes = {
            master: clampVolume(partial.master ?? this.volumes.master),
            music: clampVolume(partial.music ?? this.volumes.music),
            sfx: clampVolume(partial.sfx ?? this.volumes.sfx),
            ambient: clampVolume(partial.ambient ?? this.volumes.ambient),
        };

        this.applyAllVolumes();
    }

    async playMusic(trackId: string, options: PlayOptions = {}): Promise<boolean> {
        const track = this.trackMap.music.get(trackId);
        if (!track) {
            return false;
        }

        const restartIfSame = options.restartIfSame ?? false;
        if (this.currentMusicTrackId === trackId && this.musicPlayer) {
            if (!this.musicPlayer.paused && !restartIfSame) {
                return true;
            }

            if (restartIfSame) {
                this.stopMusic();
            }
        }

        if (!this.musicPlayer || this.currentMusicTrackId !== trackId) {
            this.stopMusic();

            const player = new Audio(track.src);
            player.loop = track.loop ?? true;
            player.preload = 'auto';
            player.volume = this.getEffectiveVolume('music');

            this.musicPlayer = player;
            this.currentMusicTrackId = track.id;
        }

        try {
            await this.musicPlayer.play();
            return true;
        } catch {
            return false;
        }
    }

    stopMusic(): void {
        if (!this.musicPlayer) {
            this.currentMusicTrackId = null;
            return;
        }

        this.musicPlayer.pause();
        this.musicPlayer.currentTime = 0;
        this.musicPlayer = null;
        this.currentMusicTrackId = null;
    }

    async playAmbient(trackId: string, options: PlayOptions = {}): Promise<boolean> {
        const track = this.trackMap.ambient.get(trackId);
        if (!track) {
            return false;
        }

        const restartIfSame = options.restartIfSame ?? false;
        if (this.currentAmbientTrackId === trackId && this.ambientPlayer) {
            if (!this.ambientPlayer.paused && !restartIfSame) {
                return true;
            }

            if (restartIfSame) {
                this.stopAmbient();
            }
        }

        if (!this.ambientPlayer || this.currentAmbientTrackId !== trackId) {
            this.stopAmbient();

            const player = new Audio(track.src);
            player.loop = track.loop ?? true;
            player.preload = 'auto';
            player.volume = this.getEffectiveVolume('ambient');

            this.ambientPlayer = player;
            this.currentAmbientTrackId = track.id;
        }

        try {
            await this.ambientPlayer.play();
            return true;
        } catch {
            return false;
        }
    }

    stopAmbient(): void {
        if (!this.ambientPlayer) {
            this.currentAmbientTrackId = null;
            return;
        }

        this.ambientPlayer.pause();
        this.ambientPlayer.currentTime = 0;
        this.ambientPlayer = null;
        this.currentAmbientTrackId = null;
    }

    async playSfx(trackId: string, options: PlaySfxOptions = {}): Promise<boolean> {
        const track = this.trackMap.sfx.get(trackId);
        if (!track) {
            return false;
        }

        const player = new Audio(track.src);
        player.loop = false;
        player.preload = 'auto';

        const gain = options.gain ?? 1;
        player.volume = Math.max(0, Math.min(1, this.getEffectiveVolume('sfx') * gain));

        const cleanup = () => {
            player.removeEventListener('ended', cleanup);
            player.removeEventListener('error', cleanup);
            this.activeSfxPlayers.delete(player);
        };

        player.addEventListener('ended', cleanup);
        player.addEventListener('error', cleanup);
        this.activeSfxPlayers.add(player);

        try {
            await player.play();
            return true;
        } catch {
            cleanup();
            return false;
        }
    }

    stopAll(): void {
        this.stopMusic();
        this.stopAmbient();

        for (const player of this.activeSfxPlayers) {
            player.pause();
            player.currentTime = 0;
        }

        this.activeSfxPlayers.clear();
    }

    private getEffectiveVolume(channel: Exclude<AudioChannel, 'master'>): number {
        const volume = toNormalizedVolume(this.volumes.master) * toNormalizedVolume(this.volumes[channel]);
        return channel === 'sfx' ? volume * SFX_ATTENUATION : volume;
    }

    private applyAllVolumes(): void {
        if (this.musicPlayer) {
            this.musicPlayer.volume = this.getEffectiveVolume('music');
        }

        if (this.ambientPlayer) {
            this.ambientPlayer.volume = this.getEffectiveVolume('ambient');
        }

        const sfxVolume = this.getEffectiveVolume('sfx');
        for (const player of this.activeSfxPlayers) {
            player.volume = sfxVolume;
        }
    }
}

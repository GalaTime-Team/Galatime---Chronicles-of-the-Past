import {
    AMBIENT_TRACKS,
    DEFAULT_AUDIO_VOLUMES,
    MUSIC_TRACKS,
    SFX_TRACKS,
} from '../constants/AudioConstants';
import { AudioService } from '../services/audioService';
import type { AudioChannel, AudioTrackDefinition, AudioVolumes, PlayOptions, PlaySfxOptions } from '../types/AudioType';

const audioService = new AudioService(
    {
        music: MUSIC_TRACKS,
        sfx: SFX_TRACKS,
        ambient: AMBIENT_TRACKS,
    },
    DEFAULT_AUDIO_VOLUMES
);

export function getAudioVolumes(): AudioVolumes {
    return audioService.getVolumes();
}

export function getCurrentMusicTrackId(): string | null {
    return audioService.getCurrentMusicTrackId();
}

export function setMasterVolume(value: number): void {
    audioService.setMasterVolume(value);
}

export function setChannelVolume(channel: AudioChannel, value: number): void {
    audioService.setChannelVolume(channel, value);
}

export function setAllVolumes(volumes: Partial<AudioVolumes>): void {
    audioService.setVolumes(volumes);
}

export async function playMusic(trackId: string, options?: PlayOptions): Promise<boolean> {
    return audioService.playMusic(trackId, options);
}

/** Notifies the caller every time a music track starts playing; returns an unsubscribe function. */
export function subscribeToMusicStarted(listener: (track: AudioTrackDefinition) => void): () => void {
    return audioService.subscribeToMusicStarted(listener);
}

export function stopMusic(): void {
    audioService.stopMusic();
}

export async function playAmbient(trackId: string, options?: PlayOptions): Promise<boolean> {
    return audioService.playAmbient(trackId, options);
}

export function stopAmbient(): void {
    audioService.stopAmbient();
}

export async function playSfx(trackId: string, options?: PlaySfxOptions): Promise<boolean> {
    return audioService.playSfx(trackId, options);
}

export function stopAllAudio(): void {
    audioService.stopAll();
}

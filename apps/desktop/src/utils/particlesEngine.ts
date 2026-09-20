import { tsParticles, type Container, type ISourceOptions } from '@tsparticles/engine';
import { loadSlim } from '@tsparticles/slim';

/** Loads the tsParticles plugins exactly once per app lifetime. */
let pluginsPromise: Promise<void> | null = null;

function initParticlesEngine(): Promise<void> {
    pluginsPromise ??= loadSlim(tsParticles);
    return pluginsPromise;
}

/**
 * Mounts a particle layer inside `element` and returns its container.
 *
 * Particles are purely decorative, so this never rejects: if the engine or the plugins
 * fail to load, the caller simply ends up without a burst instead of a broken button.
 * The element is passed directly (instead of an id) so the engine can never fall back to
 * appending a stray canvas to `document.body`.
 */
export async function createParticleLayer(
    element: HTMLElement,
    options: ISourceOptions,
): Promise<Container | undefined> {
    try {
        await initParticlesEngine();

        const container = await tsParticles.load({ element, options });

        return container && !container.destroyed ? container : undefined;
    } catch {
        return undefined;
    }
}

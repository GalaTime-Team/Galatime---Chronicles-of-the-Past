import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the operating system asks for less motion.
 *
 * The arena's choreography is decorative, so a player who asked their system to calm
 * animations down gets the fight resolved instantly instead — no beats, no waiting.
 */
export function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(
        () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
    );

    useEffect(() => {
        const media = window.matchMedia(QUERY);
        const update = () => setReduced(media.matches);
        update();
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);

    return reduced;
}

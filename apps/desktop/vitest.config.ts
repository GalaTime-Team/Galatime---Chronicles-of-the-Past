import { defineConfig } from 'vitest/config';

/**
 * Test configuration for the desktop app.
 *
 * The dialogue backend is plain TypeScript with no DOM dependencies, so the
 * fast `node` environment is enough. Keeping this separate from
 * `vite.config.ts` means the app's custom sprite-scanning plugin never runs
 * during tests.
 *
 * Tests import `describe`/`it`/`expect` from `vitest` explicitly rather than
 * relying on globals, so no extra type wiring is needed.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['__tests__/**/*.test.ts'],
    },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// `package.json` is the single source of truth for the app version. Inlining it at build time
// keeps the title-menu build stamp in step with the released bundle, with no second copy to
// remember to update.
const { version: appVersion } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Exposed to the app as the global `__APP_VERSION__` (declared in `src/vite-env.d.ts`).
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  // React must resolve to exactly one physical copy. This workspace contains both
  // an npm-hoisted tree (`node_modules/react`) and a pnpm virtual store
  // (`node_modules/.pnpm/react@.../node_modules/react`). Without pinning them,
  // Vite can pre-bundle `react-dom` and the app code against different copies,
  // which surfaces at runtime as "Invalid hook call" /
  // `Cannot read properties of null (reading 'useState')`.
  resolve: {
    dedupe: ["react", "react-dom"],
  },

  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

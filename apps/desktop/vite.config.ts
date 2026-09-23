import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// `package.json` is the single source of truth for the app version. Inlining it at build time
// keeps the title-menu build stamp in step with the released bundle, with no second copy to
// remember to update.
const { version: appVersion } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

/**
 * Folder under the public dir that holds the entity sprites, laid out as
 * `<characters|mobs>/<entity id>/<subfolder>/<sprite>.png`.
 */
const ENTITY_IMAGES_DIR = "images/entities";

/** Id of the virtual module the app reads the scanned sprite list from. */
const ENTITY_IMAGES_MODULE_ID = "virtual:entity-images";

/** One sprite, mirrored by the `virtual:entity-images` declaration in `src/vite-env.d.ts`. */
interface EntityImageEntry {
  name: string;
  url: string;
}

/** Every `.png` under `directory`, at any depth. */
function collectSprites(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSprites(fullPath, found);
    } else if (entry.name.toLowerCase().endsWith(".png")) {
      found.push(fullPath);
    }
  }
  return found;
}

/**
 * Builds the `{ "<category>/<entity id>": [{ name, url }] }` manifest of the sprites on disk.
 *
 * The sprites live in `public/`, which Vite copies verbatim and keeps out of the module graph,
 * so they cannot be discovered with `import.meta.glob`. Walking the folder here — when the dev
 * server starts and when a build runs — is what keeps the manifest in step with the files
 * without a generation script that has to be remembered before every build.
 */
function readEntityImages(publicDir: string): Record<string, EntityImageEntry[]> {
  const root = join(publicDir, ENTITY_IMAGES_DIR);
  const manifest: Record<string, EntityImageEntry[]> = {};

  if (!existsSync(root)) {
    return manifest;
  }

  for (const category of readdirSync(root, { withFileTypes: true })) {
    if (!category.isDirectory()) {
      continue;
    }

    const categoryDir = join(root, category.name);
    for (const entity of readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entity.isDirectory()) {
        continue;
      }

      const sprites = collectSprites(join(categoryDir, entity.name))
        .map((file) => ({
          // The extension is dropped: every sprite is a `.png`, so the caption is the bare name.
          name: basename(file).replace(/\.png$/i, ""),
          url: `/${ENTITY_IMAGES_DIR}/${relative(root, file).split(sep).join("/")}`,
        }))
        // Folder by folder, then alphabetically, so paging through a gallery is predictable.
        .sort((a, b) => a.url.localeCompare(b.url));

      if (sprites.length > 0) {
        manifest[`${category.name}/${entity.name}`] = sprites;
      }
    }
  }

  return manifest;
}

/**
 * Exposes the entity sprites as `virtual:entity-images`, imported by
 * `src/services/entityImageService.ts`.
 */
function entityImages(): Plugin {
  let publicDir = "";

  return {
    name: "galatime:entity-images",

    configResolved(config) {
      publicDir = config.publicDir;
    },

    resolveId(id) {
      return id === ENTITY_IMAGES_MODULE_ID ? `\0${ENTITY_IMAGES_MODULE_ID}` : null;
    },

    load(id) {
      if (id !== `\0${ENTITY_IMAGES_MODULE_ID}`) {
        return null;
      }
      return `export const entityImages = ${JSON.stringify(readEntityImages(publicDir), null, 2)};\n`;
    },

    configureServer(server) {
      // The manifest is read once, so a sprite added or deleted while the dev server is running
      // would otherwise stay invisible until the next restart.
      const root = join(publicDir, ENTITY_IMAGES_DIR);
      server.watcher.add(root);

      const reload = (file: string) => {
        if (!file.toLowerCase().endsWith(".png") || !file.startsWith(root)) {
          return;
        }
        const module = server.moduleGraph.getModuleById(`\0${ENTITY_IMAGES_MODULE_ID}`);
        if (module) {
          server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: "full-reload" });
      };

      server.watcher.on("add", reload);
      server.watcher.on("unlink", reload);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), entityImages()],

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

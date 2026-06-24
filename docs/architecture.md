# Architecture Overview

## Layers

1. Frontend UI layer in apps/desktop/src/components and apps/desktop/src/pages.
2. Frontend orchestration layer in apps/desktop/src/controllers and apps/desktop/src/services.
3. IPC bridge through @tauri-apps/api invoke calls.
4. Backend command layer in apps/desktop/src-tauri/src/commands.
5. Game business layer in apps/desktop/src-tauri/src/game.
6. Static game information in apps/desktop/src/static/game-data and apps/desktop/src-tauri/src/data/static.

## Runtime flow

UI -> Controller -> Service -> Tauri command -> Game business -> Serializable response -> Store/UI

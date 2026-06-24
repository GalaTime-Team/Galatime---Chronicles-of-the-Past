import { invoke } from "@tauri-apps/api/core";

export async function callCommand<T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(command, payload);
}

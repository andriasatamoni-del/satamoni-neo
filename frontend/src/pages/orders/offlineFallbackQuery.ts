import { apiRequest } from "../../shared/api/client";
import { loadSnapshot, saveSnapshot } from "../../shared/offline/db";

export async function offlineFallbackQuery<T>(path: string, snapshotKey: string): Promise<T> {
  try {
    const data = await apiRequest<T>(path);
    await saveSnapshot(snapshotKey, data);
    return data;
  } catch (err) {
    const cached = await loadSnapshot<T>(snapshotKey);
    if (cached) return cached;
    throw err;
  }
}

import * as SecureStore from 'expo-secure-store';

// Lightweight persistent JSON cache so screens can hydrate instantly from the
// previous session's data, then refetch in the background. Keyed with a user
// prefix so different Clerk accounts don't share state on the same device.
//
// SecureStore is already bundled (used for auth + unit prefs) so this adds no
// new native deps. Values are SecureStore strings — tens of KB is fine on iOS.

const PREFIX = 'cache:v1:';

function k(userId: string | null | undefined, key: string): string {
  return `${PREFIX}${userId ?? 'anon'}:${key}`;
}

export async function readCache<T>(userId: string | null | undefined, key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(k(userId, key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeCache<T>(userId: string | null | undefined, key: string, value: T): Promise<void> {
  try {
    await SecureStore.setItemAsync(k(userId, key), JSON.stringify(value));
  } catch {
    // Oversize payloads or disk issues — silently skip. Stale data on next
    // launch is preferable to crashing.
  }
}

export async function clearCache(userId: string | null | undefined, key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(k(userId, key));
  } catch {}
}

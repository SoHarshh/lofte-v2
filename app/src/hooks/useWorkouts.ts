import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { API_BASE } from '../config';
import { Workout } from '../types/index';
import { useAuthFetch } from './useAuthFetch';
import { readCache, writeCache } from '../utils/cache';

// Module-level state so:
//  - Multiple screens (Dashboard + History) share the same list instantly
//  - A second screen that mounts right after the first doesn't re-fetch
//  - Concurrent reloads are deduped to a single in-flight request
let memoryCache: Workout[] | null = null;
let memoryCacheUserId: string | null = null;
let inFlight: Promise<void> | null = null;
let lastFetchAt = 0;

export type UseWorkoutsResult = {
  workouts: Workout[];
  /** True only during the very first fetch when we have no cache at all. */
  initializing: boolean;
  reload: () => Promise<void>;
};

const STALE_MS = 10_000; // don't re-fetch more often than this on focus

export function useWorkouts(): UseWorkoutsResult {
  const { userId } = useAuth();
  const authFetch = useAuthFetch();

  // Seed state from the module cache if present → zero-flash render.
  const initial = memoryCacheUserId === (userId ?? null) && memoryCache ? memoryCache : null;
  const [workouts, setWorkouts] = useState<Workout[]>(initial ?? []);
  const [initializing, setInitializing] = useState(initial == null && memoryCache == null);

  // Hydrate from SecureStore if the module cache is cold.
  useEffect(() => {
    if (memoryCache != null) return;
    let cancelled = false;
    readCache<Workout[]>(userId, 'workouts').then((cached) => {
      if (cancelled) return;
      if (cached && Array.isArray(cached)) {
        memoryCache = cached;
        memoryCacheUserId = userId ?? null;
        setWorkouts(cached);
      }
      setInitializing(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const reload = useCallback(async () => {
    // Dedupe: if something is already fetching, just await the same promise.
    if (inFlight) return inFlight;
    // Debounce: if we fetched successfully within the last STALE_MS, skip.
    if (Date.now() - lastFetchAt < STALE_MS && memoryCache != null) return;

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 8000);

    inFlight = (async () => {
      try {
        const r = await authFetch(`${API_BASE}/api/workouts`, { signal: controller.signal } as any);
        const data = await r.json();
        const list: Workout[] = Array.isArray(data) ? data : [];
        setWorkouts(list);
        memoryCache = list;
        memoryCacheUserId = userId ?? null;
        lastFetchAt = Date.now();
        writeCache(userId, 'workouts', list);
      } catch (e: any) {
        // Keep whatever cached data we have; UI stays usable.
        const reason = e?.name === 'AbortError' ? 'timeout after 8s' : e?.message || e;
        console.warn('[useWorkouts] reload failed:', reason);
      } finally {
        clearTimeout(abortTimer);
        setInitializing(false);
      }
    })();

    const p = inFlight;
    p.finally(() => { if (inFlight === p) inFlight = null; });
    return p;
  }, [authFetch, userId]);

  return { workouts, initializing, reload };
}

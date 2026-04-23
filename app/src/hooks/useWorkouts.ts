import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { API_BASE } from '../config';
import { Workout } from '../types/index';
import { useAuthFetch } from './useAuthFetch';
import { readCache, writeCache } from '../utils/cache';

// Module-level in-memory mirror so the second screen (History) that mounts
// after Dashboard doesn't even need to hit SecureStore — it reads from memory
// and renders with zero frames of empty state.
let memoryCache: Workout[] | null = null;
let memoryCacheUserId: string | null = null;

export function useWorkouts(): {
  workouts: Workout[];
  loading: boolean;
  reload: () => Promise<void>;
} {
  const { userId } = useAuth();
  const authFetch = useAuthFetch();

  // If the in-memory mirror matches this user, start fully hydrated — no
  // loading flash, not even a SecureStore round-trip.
  const initial = memoryCacheUserId === (userId ?? null) && memoryCache ? memoryCache : null;
  const [workouts, setWorkouts] = useState<Workout[]>(initial ?? []);
  const [loading, setLoading] = useState(initial == null);
  const hydrated = useRef(initial != null);

  // Step 1 — hydrate from SecureStore on mount if the in-memory mirror is
  // empty (first screen to mount this JS session).
  useEffect(() => {
    if (hydrated.current) return;
    let cancelled = false;
    readCache<Workout[]>(userId, 'workouts').then((cached) => {
      if (cancelled) return;
      if (cached && Array.isArray(cached)) {
        memoryCache = cached;
        memoryCacheUserId = userId ?? null;
        setWorkouts(cached);
        setLoading(false);
        hydrated.current = true;
      }
    });
    return () => { cancelled = true; };
  }, [userId]);

  // Step 2 — always refetch in the background. If cache hit already happened,
  // this quietly replaces state with fresh data. Otherwise it's the first
  // fetch and we flip loading off when done.
  //
  // Double-layered timeout:
  //  - AbortController(8s) aborts the in-flight fetch
  //  - Promise.race with a plain 9s timer flips loading off even if something
  //    earlier (e.g. Clerk `getToken()`) is the thing hanging, so we never
  //    leave the user on an endless spinner.
  const reload = useCallback(async () => {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 8000);

    const work = (async () => {
      try {
        const r = await authFetch(`${API_BASE}/api/workouts`, { signal: controller.signal } as any);
        const data = await r.json();
        const list: Workout[] = Array.isArray(data) ? data : [];
        setWorkouts(list);
        memoryCache = list;
        memoryCacheUserId = userId ?? null;
        writeCache(userId, 'workouts', list);
      } catch (e: any) {
        console.warn('[useWorkouts] reload failed:', e?.name === 'AbortError' ? 'timeout after 8s' : e?.message || e);
      }
    })();

    const deadline = new Promise<void>((resolve) => setTimeout(resolve, 9000));
    await Promise.race([work, deadline]);
    clearTimeout(abortTimer);
    setLoading(false);
  }, [authFetch, userId]);

  return { workouts, loading, reload };
}

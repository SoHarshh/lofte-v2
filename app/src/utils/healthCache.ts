import { readCache, writeCache, clearCache } from './cache';
import type { HealthMetrics } from './health';

// Per-day cache for the Health tab. Persisted to SecureStore under a single
// JSON blob (keyed by Clerk userId), mirrored in memory for zero-latency
// reads during a running session. Past days are effectively immutable in
// HealthKit (with a small backfill grace window) so serving cache-first
// without revalidation is safe — only today needs a live refresh on focus.
//
// We don't tree-split across multiple SecureStore keys because iOS's keychain
// has no cheap enumeration and we'd lose the ability to invalidate the whole
// blob on permission revoke. A ~300KB blob per user (1 year of days with
// sparklines) is fine for SecureStore on iOS.

export type HealthDayEntry = {
  syncedAt: number;                       // epoch ms
  summary: HealthMetrics;
  hourlyHrv: number[];
  hourlyHr: number[];
  hrSpark: number[];
  sleepSpark: number[];
  hrvDelta: number | null;
};

type DayMap = Record<string, HealthDayEntry>;

const KEY = 'health_days';

let mem: DayMap | null = null;
let memUserId: string | null | undefined = undefined;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

async function ensureLoaded(userId: string | null | undefined): Promise<void> {
  if (mem != null && memUserId === (userId ?? null)) return;
  const loaded = await readCache<DayMap>(userId, KEY);
  mem = loaded && typeof loaded === 'object' ? loaded : {};
  memUserId = userId ?? null;
}

function scheduleFlush(userId: string | null | undefined): void {
  if (writeTimer) return;
  writeTimer = setTimeout(async () => {
    writeTimer = null;
    if (mem) await writeCache(userId, KEY, mem);
  }, 400);
}

export async function getDayEntry(
  userId: string | null | undefined,
  dayKey: string,
): Promise<HealthDayEntry | null> {
  await ensureLoaded(userId);
  return mem?.[dayKey] ?? null;
}

export async function putDayEntry(
  userId: string | null | undefined,
  dayKey: string,
  entry: HealthDayEntry,
): Promise<void> {
  await ensureLoaded(userId);
  if (!mem) mem = {};
  mem[dayKey] = entry;
  scheduleFlush(userId);
}

// Synchronous accessor for the hot path — returns whatever's in memory right
// now. Returns null until the async ensureLoaded() call has resolved for the
// current user. Pair this with a kickoff getDayEntry() to populate the mirror.
export function peekDayEntry(
  userId: string | null | undefined,
  dayKey: string,
): HealthDayEntry | null {
  if (memUserId !== (userId ?? null)) return null;
  return mem?.[dayKey] ?? null;
}

export async function clearHealthCache(userId: string | null | undefined): Promise<void> {
  mem = {};
  memUserId = userId ?? null;
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  await clearCache(userId, KEY);
}

export function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Whether `date` is today in local time. Used to decide revalidation: today
// always revalidates on focus, historical days serve cached-forever.
export function isToday(date: Date): boolean {
  const n = new Date();
  return date.getFullYear() === n.getFullYear()
    && date.getMonth() === n.getMonth()
    && date.getDate() === n.getDate();
}

// Days within this many ms of now still revalidate opportunistically — the
// Apple Watch can backfill data for a few days after the fact.
export const HISTORICAL_BACKFILL_WINDOW_MS = 7 * 24 * 3600 * 1000;

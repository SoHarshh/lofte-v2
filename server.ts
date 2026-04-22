import express from "express";
import { createClient } from "@supabase/supabase-js";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { verifyToken, createClerkClient } from "@clerk/backend";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Storage layer ────────────────────────────────────────────────────────────
// Uses Supabase when credentials are present, otherwise falls back to SQLite.

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? '';
const USE_SUPABASE = supabaseUrl.startsWith('https://') && supabaseKey.length > 20;

let supabase: ReturnType<typeof createClient> | null = null;
let sqlite: Database.Database | null = null;

if (USE_SUPABASE) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Storage: Supabase');
} else {
  sqlite = new Database("workouts.db");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      muscle_group TEXT,
      sets INTEGER, reps INTEGER, weight REAL,
      distance REAL, duration REAL, calories REAL, pace TEXT,
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
    );
  `);
  try { sqlite.exec("ALTER TABLE exercises ADD COLUMN pace TEXT"); } catch {}
  try { sqlite.exec("ALTER TABLE exercises ADD COLUMN notes TEXT"); } catch {}
  try { sqlite.exec("ALTER TABLE workouts ADD COLUMN avg_hr REAL"); } catch {}
  try { sqlite.exec("ALTER TABLE workouts ADD COLUMN max_hr REAL"); } catch {}
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS nyx_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS health_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      steps INTEGER,
      active_energy_kcal REAL,
      resting_heart_rate REAL,
      hrv_ms REAL,
      sleep_hours REAL,
      body_weight_kg REAL,
      synced_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    );
    CREATE TABLE IF NOT EXISTS user_profile (
      user_id TEXT PRIMARY KEY,
      email TEXT,
      first_name TEXT,
      last_name TEXT,
      avatar_url TEXT,
      dob TEXT,
      sex TEXT,
      height_cm REAL,
      weight_kg REAL,
      health_connected_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('Storage: SQLite (set SUPABASE_URL + SUPABASE_SERVICE_KEY to switch to Supabase)');
}

function mapExercise(ex: any) {
  return { ...ex, muscleGroup: ex.muscle_group ?? ex.muscleGroup, notes: ex.notes ?? undefined };
}

// ─── Auth middleware ───────────────────────────────────────────────────────────

async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function dbGetWorkouts(userId: string) {
  if (USE_SUPABASE && supabase) {
    const { data: workouts, error: wErr } = await supabase.from("workouts").select("*").eq("user_id", userId).order("date", { ascending: false });
    if (wErr) throw wErr;
    const { data: exercises, error: eErr } = await supabase.from("exercises").select("*");
    if (eErr) throw eErr;
    return (workouts || []).map((w: any) => ({
      ...w,
      exercises: (exercises || []).filter((e: any) => e.workout_id === w.id).map(mapExercise),
    }));
  }
  const workouts = sqlite!.prepare("SELECT * FROM workouts WHERE user_id = ? ORDER BY date DESC").all(userId);
  const ids = (workouts as any[]).map(w => w.id);
  const exercises = ids.length > 0
    ? sqlite!.prepare(`SELECT * FROM exercises WHERE workout_id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : [];
  return workouts.map((w: any) => ({
    ...w,
    exercises: (exercises as any[]).filter(e => e.workout_id === w.id).map(mapExercise),
  }));
}

async function dbSaveWorkout(userId: string, date: string, notes: string, exercises: any[]) {
  if (USE_SUPABASE && supabase) {
    // Snapshot prior bests for this user only
    const priorBests: Record<string, number | null> = {};
    for (const ex of exercises.filter(e => e.weight)) {
      const key = ex.name.toLowerCase();
      if (key in priorBests) continue;
      const { data } = await supabase.from("exercises").select("weight, workouts!inner(user_id)")
        .ilike("name", key).eq("workouts.user_id", userId).order("weight", { ascending: false }).limit(1);
      priorBests[key] = data?.[0]?.weight ?? null;
    }
    const { data: workout, error: wErr } = await supabase.from("workouts").insert({ date, notes: notes || "", user_id: userId }).select().single();
    if (wErr) throw wErr;
    if (exercises.length > 0) {
      const { error: eErr } = await supabase.from("exercises").insert(
        exercises.map(ex => ({
          workout_id: workout.id, name: ex.name, muscle_group: ex.muscleGroup || null,
          sets: ex.sets ?? null, reps: ex.reps ?? null, weight: ex.weight ?? null,
          distance: ex.distance ?? null, duration: ex.duration ?? null,
          calories: ex.calories ?? null, pace: ex.pace ?? null, notes: ex.notes ?? null,
        }))
      );
      if (eErr) throw eErr;
    }
    return { workoutId: workout.id, priorBests };
  }

  // SQLite
  const getBest = sqlite!.prepare("SELECT MAX(e.weight) as maxWeight FROM exercises e JOIN workouts w ON e.workout_id = w.id WHERE LOWER(e.name) = LOWER(?) AND w.user_id = ?");
  const priorBests: Record<string, number | null> = {};
  for (const ex of exercises.filter(e => e.weight)) {
    const key = ex.name.toLowerCase();
    if (key in priorBests) continue;
    const row = getBest.get(ex.name, userId) as any;
    priorBests[key] = row?.maxWeight ?? null;
  }
  const insertWorkout = sqlite!.prepare("INSERT INTO workouts (date, notes, user_id) VALUES (?, ?, ?)");
  const insertEx = sqlite!.prepare(
    "INSERT INTO exercises (workout_id, name, muscle_group, sets, reps, weight, distance, duration, calories, pace, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  let workoutId: any;
  sqlite!.transaction(() => {
    const info = insertWorkout.run(date, notes || "", userId);
    workoutId = info.lastInsertRowid;
    for (const ex of exercises) {
      insertEx.run(workoutId, ex.name, ex.muscleGroup || null, ex.sets ?? null, ex.reps ?? null,
        ex.weight ?? null, ex.distance ?? null, ex.duration ?? null, ex.calories ?? null, ex.pace ?? null, ex.notes ?? null);
    }
  })();
  return { workoutId, priorBests };
}

async function dbUpdateWorkoutHR(id: string, userId: string, avgHr: number | null, maxHr: number | null) {
  if (USE_SUPABASE && supabase) {
    const { error } = await (supabase.from("workouts") as any)
      .update({ avg_hr: avgHr, max_hr: maxHr })
      .eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  sqlite!.prepare("UPDATE workouts SET avg_hr = ?, max_hr = ? WHERE id = ? AND user_id = ?")
    .run(avgHr, maxHr, id, userId);
}

async function dbDeleteWorkout(id: string, userId: string) {
  if (USE_SUPABASE && supabase) {
    const { error } = await supabase.from("workouts").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  sqlite!.prepare("DELETE FROM workouts WHERE id = ? AND user_id = ?").run(id, userId);
}

async function dbGetLastExercise(name: string, userId: string) {
  if (USE_SUPABASE && supabase) {
    const { data } = await supabase.from("exercises")
      .select("sets, reps, weight, distance, duration, calories, workouts!inner(date, user_id)")
      .ilike("name", name).eq("workouts.user_id", userId).order("workout_id", { ascending: false }).limit(1);
    if (!data?.[0]) return null;
    const r = data[0] as any;
    return { sets: r.sets, reps: r.reps, weight: r.weight, distance: r.distance, duration: r.duration, calories: r.calories, date: r.workouts?.date };
  }
  const row = sqlite!.prepare(`
    SELECT e.sets, e.reps, e.weight, e.distance, e.duration, e.calories, w.date
    FROM exercises e JOIN workouts w ON e.workout_id = w.id
    WHERE LOWER(e.name) = LOWER(?) AND w.user_id = ? ORDER BY w.date DESC LIMIT 1
  `).get(name, userId) as any;
  return row || null;
}

async function dbGetWorkoutById(id: string) {
  if (USE_SUPABASE && supabase) {
    const { data } = await supabase.from("workouts").select("*").eq("id", id).single();
    return data;
  }
  return sqlite!.prepare("SELECT * FROM workouts WHERE id = ?").get(id);
}

async function dbGetExercisesByWorkout(id: string) {
  if (USE_SUPABASE && supabase) {
    const { data } = await supabase.from("exercises").select("*").eq("workout_id", id);
    return data || [];
  }
  return sqlite!.prepare("SELECT * FROM exercises WHERE workout_id = ?").all(id);
}

// ─── Nyx chat history ────────────────────────────────────────────────────────

async function dbSaveNyxMessage(userId: string, role: string, content: string) {
  if (USE_SUPABASE && supabase) {
    const { error } = await supabase.from("nyx_messages").insert({ user_id: userId, role, content });
    if (error) throw error;
    return;
  }
  sqlite!.prepare("INSERT INTO nyx_messages (user_id, role, content) VALUES (?, ?, ?)").run(userId, role, content);
}

async function dbGetNyxHistory(userId: string, limit = 30): Promise<{ role: string; content: string }[]> {
  if (USE_SUPABASE && supabase) {
    const { data } = await supabase.from("nyx_messages")
      .select("role, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data || []).reverse();
  }
  return (sqlite!.prepare(
    "SELECT role, content FROM nyx_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(userId, limit) as any[]).reverse();
}

async function dbDeleteNyxHistory(userId: string) {
  if (USE_SUPABASE && supabase) {
    const { error } = await supabase.from("nyx_messages").delete().eq("user_id", userId);
    if (error) throw error;
    return;
  }
  sqlite!.prepare("DELETE FROM nyx_messages WHERE user_id = ?").run(userId);
}

async function dbDeleteAllUserData(userId: string) {
  // Delete Nyx chat history
  await dbDeleteNyxHistory(userId);

  if (USE_SUPABASE && supabase) {
    const { data: workouts } = await supabase.from("workouts").select("id").eq("user_id", userId);
    const workoutIds = (workouts || []).map((w: any) => w.id);
    if (workoutIds.length > 0) {
      const { error: eErr } = await supabase.from("exercises").delete().in("workout_id", workoutIds);
      if (eErr) throw eErr;
    }
    const { error: wErr } = await supabase.from("workouts").delete().eq("user_id", userId);
    if (wErr) throw wErr;
    await supabase.from("health_metrics").delete().eq("user_id", userId);
    await supabase.from("user_profile").delete().eq("user_id", userId);
    return;
  }
  // SQLite — exercises cascade from workouts FK, but delete explicitly to be safe
  const workoutIds = (sqlite!.prepare("SELECT id FROM workouts WHERE user_id = ?").all(userId) as any[]).map(r => r.id);
  if (workoutIds.length > 0) {
    sqlite!.prepare(`DELETE FROM exercises WHERE workout_id IN (${workoutIds.map(() => '?').join(',')})`).run(...workoutIds);
  }
  sqlite!.prepare("DELETE FROM workouts WHERE user_id = ?").run(userId);
  sqlite!.prepare("DELETE FROM health_metrics WHERE user_id = ?").run(userId);
  sqlite!.prepare("DELETE FROM user_profile WHERE user_id = ?").run(userId);
}

// ─── Health metrics ──────────────────────────────────────────────────────────

type HealthMetricInput = {
  date: string; // YYYY-MM-DD
  steps?: number | null;
  activeEnergyKcal?: number | null;
  restingHeartRate?: number | null;
  hrvMs?: number | null;
  sleepHours?: number | null;
  bodyWeightKg?: number | null;
};

async function dbUpsertHealthMetrics(userId: string, metrics: HealthMetricInput[]) {
  if (metrics.length === 0) return;
  if (USE_SUPABASE && supabase) {
    const rows = metrics.map(m => ({
      user_id: userId,
      date: m.date,
      steps: m.steps ?? null,
      active_energy_kcal: m.activeEnergyKcal ?? null,
      resting_heart_rate: m.restingHeartRate ?? null,
      hrv_ms: m.hrvMs ?? null,
      sleep_hours: m.sleepHours ?? null,
      body_weight_kg: m.bodyWeightKg ?? null,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await (supabase.from("health_metrics") as any).upsert(rows, { onConflict: "user_id,date" });
    if (error) throw error;
    return;
  }
  const stmt = sqlite!.prepare(`
    INSERT INTO health_metrics (user_id, date, steps, active_energy_kcal, resting_heart_rate, hrv_ms, sleep_hours, body_weight_kg, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, date) DO UPDATE SET
      steps = excluded.steps,
      active_energy_kcal = excluded.active_energy_kcal,
      resting_heart_rate = excluded.resting_heart_rate,
      hrv_ms = excluded.hrv_ms,
      sleep_hours = excluded.sleep_hours,
      body_weight_kg = excluded.body_weight_kg,
      synced_at = datetime('now')
  `);
  const tx = sqlite!.transaction((items: HealthMetricInput[]) => {
    for (const m of items) {
      stmt.run(
        userId, m.date,
        m.steps ?? null, m.activeEnergyKcal ?? null,
        m.restingHeartRate ?? null, m.hrvMs ?? null,
        m.sleepHours ?? null, m.bodyWeightKg ?? null,
      );
    }
  });
  tx(metrics);
}

async function dbGetHealthMetrics(userId: string, days: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  if (USE_SUPABASE && supabase) {
    const { data, error } = await supabase.from("health_metrics")
      .select("*").eq("user_id", userId).gte("date", cutoffStr).order("date", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  return sqlite!.prepare(
    "SELECT * FROM health_metrics WHERE user_id = ? AND date >= ? ORDER BY date ASC"
  ).all(userId, cutoffStr);
}

// ─── User profile ────────────────────────────────────────────────────────────

type UserProfileInput = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  dob?: string | null;          // YYYY-MM-DD
  sex?: string | null;          // 'male' | 'female' | 'other'
  heightCm?: number | null;
  weightKg?: number | null;
};

type UserProfileRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  dob: string | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  health_connected_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

async function dbGetUserProfile(userId: string): Promise<UserProfileRow | null> {
  if (USE_SUPABASE && supabase) {
    const { data, error } = await supabase.from("user_profile")
      .select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return (data as UserProfileRow) || null;
  }
  return (sqlite!.prepare("SELECT * FROM user_profile WHERE user_id = ?").get(userId) as UserProfileRow) || null;
}

async function dbUpsertUserProfile(userId: string, input: UserProfileInput): Promise<UserProfileRow> {
  const now = new Date().toISOString();
  // Only include fields the caller actually sent, so partial updates don't
  // wipe existing values.
  const patch: Record<string, any> = { user_id: userId, updated_at: now };
  if (input.email !== undefined) patch.email = input.email;
  if (input.firstName !== undefined) patch.first_name = input.firstName;
  if (input.lastName !== undefined) patch.last_name = input.lastName;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
  if (input.dob !== undefined) patch.dob = input.dob;
  if (input.sex !== undefined) patch.sex = input.sex;
  if (input.heightCm !== undefined) patch.height_cm = input.heightCm;
  if (input.weightKg !== undefined) patch.weight_kg = input.weightKg;

  if (USE_SUPABASE && supabase) {
    // Check if row exists; if yes patch, else insert with created_at.
    const { data: existing } = await supabase.from("user_profile")
      .select("user_id").eq("user_id", userId).maybeSingle();
    if (existing) {
      const { error } = await (supabase.from("user_profile") as any)
        .update(patch).eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await (supabase.from("user_profile") as any)
        .insert({ ...patch, created_at: now });
      if (error) throw error;
    }
    const { data: row } = await supabase.from("user_profile")
      .select("*").eq("user_id", userId).single();
    return row as UserProfileRow;
  }

  const existing = sqlite!.prepare("SELECT user_id FROM user_profile WHERE user_id = ?").get(userId);
  if (existing) {
    const cols = Object.keys(patch).filter(k => k !== "user_id");
    if (cols.length > 0) {
      const setClause = cols.map(c => `${c} = ?`).join(", ");
      sqlite!.prepare(`UPDATE user_profile SET ${setClause} WHERE user_id = ?`)
        .run(...cols.map(c => patch[c]), userId);
    }
  } else {
    const cols = Object.keys(patch);
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map(c => patch[c]);
    sqlite!.prepare(
      `INSERT INTO user_profile (${cols.join(", ")}, created_at) VALUES (${placeholders}, ?)`
    ).run(...values, now);
  }
  return sqlite!.prepare("SELECT * FROM user_profile WHERE user_id = ?").get(userId) as UserProfileRow;
}

async function dbMarkHealthConnected(userId: string, connected: boolean): Promise<void> {
  const stamp = connected ? new Date().toISOString() : null;
  if (USE_SUPABASE && supabase) {
    const { data: existing } = await supabase.from("user_profile")
      .select("user_id").eq("user_id", userId).maybeSingle();
    if (existing) {
      const { error } = await (supabase.from("user_profile") as any)
        .update({ health_connected_at: stamp, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await (supabase.from("user_profile") as any).insert({
        user_id: userId,
        health_connected_at: stamp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    }
    return;
  }
  const existing = sqlite!.prepare("SELECT user_id FROM user_profile WHERE user_id = ?").get(userId);
  if (existing) {
    sqlite!.prepare("UPDATE user_profile SET health_connected_at = ?, updated_at = datetime('now') WHERE user_id = ?")
      .run(stamp, userId);
  } else {
    sqlite!.prepare("INSERT INTO user_profile (user_id, health_connected_at) VALUES (?, ?)")
      .run(userId, stamp);
  }
}

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json({ limit: "20mb" }));

  // Known Whisper hallucinations on silent/near-silent audio
  const WHISPER_HALLUCINATIONS = new Set([
    "thank you so much for watching",
    "thank you for watching",
    "thanks for watching",
    "thank you",
    "please subscribe",
    "please subscribe to my channel",
    "like and subscribe",
    "subtitles by the amara.org community",
    "you",
    "bye",
    "...",
    "ご視聴ありがとうございました",
    "ありがとうございます",
    "字幕は自動生成されています",
    "おやすみなさい",
  ]);

  function isWhisperHallucination(text: string): boolean {
    const cleaned = text.toLowerCase().replace(/[!.,。、！]+$/g, '').trim();
    if (WHISPER_HALLUCINATIONS.has(cleaned)) return true;
    // Short garbage output (under 4 real words, no exercise-related content)
    const words = cleaned.split(/\s+/);
    if (words.length <= 2 && !/\d/.test(cleaned)) return true;
    return false;
  }

  // ── MET values for calorie estimation ────────────────────────────────────────
  const MET_BY_GROUP: Record<string, number> = {
    chest: 6.0, back: 6.0, shoulders: 5.5, legs: 6.0,
    quads: 6.0, hamstrings: 6.0, glutes: 6.0,
    arms: 3.5, biceps: 3.5, triceps: 3.5, calves: 3.5,
    core: 3.8, cardio: 7.0, other: 4.0,
  };
  const MET_BY_EXERCISE: Record<string, number> = {
    deadlift: 6.5, squat: 6.0, 'bench press': 5.5,
    'pull up': 8.0, 'chin up': 8.0, 'push up': 8.0,
    'barbell row': 6.0, 'overhead press': 5.5,
    running: 9.8, cycling: 7.5, rowing: 7.0, swimming: 8.0,
    'jump rope': 12.3, 'stair climber': 9.0, elliptical: 5.0,
    walking: 3.5, treadmill: 8.0,
  };

  function calculateCalories(exercises: any[], durationMinutes: number, bodyWeightKg: number): any[] {
    const cappedDuration = Math.min(durationMinutes, 180);
    const perExMinutes = exercises.length > 0 ? cappedDuration / exercises.length : 0;

    return exercises.map(ex => {
      // Skip if calories already set (e.g. from camera-parsed gym machine)
      if (ex.calories && ex.calories > 0) return ex;

      const name = (ex.name || '').toLowerCase();
      const group = (ex.muscleGroup || ex.muscle_group || 'other').toLowerCase();

      // Look up MET: exercise-specific first, then muscle group
      const met = MET_BY_EXERCISE[name] ?? MET_BY_GROUP[group] ?? 4.0;

      // Use exercise-specific duration for cardio, otherwise split evenly
      const exDurationMin = (ex.duration && ex.duration > 0) ? ex.duration / 60 : perExMinutes;
      const durationHours = exDurationMin / 60;

      const cal = Math.round(met * bodyWeightKg * durationHours);
      return { ...ex, calories: cal };
    });
  }

  // Health check
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // AI Routes
  app.post("/api/ai/parse-workout", async (req, res) => {
    const { text, audioBase64, mimeType } = req.body;
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      let transcript: string | undefined;

      if (audioBase64) {
        const audioBuffer = Buffer.from(audioBase64, "base64");
        const audioFile = new File([audioBuffer], "recording.m4a", { type: mimeType || "audio/m4a" });
        const whisperResult = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
        });
        transcript = (whisperResult.text || "").trim();
        if (!transcript || isWhisperHallucination(transcript)) {
          return res.json({ exercises: [], transcript: "" });
        }
      } else if (text) {
        transcript = text;
      } else {
        return res.status(400).json({ error: "Provide either text or audioBase64" });
      }

      const systemPrompt = `You are a workout logging assistant for a gym app. Your job is to extract exercise data from voice or text input and return structured JSON.

RULES:
- Be very generous in interpretation. Casual, incomplete, or noisy speech should still produce results.
- Never return empty exercises if there is any exercise-related word in the input.
- If sets/reps/weight are not mentioned, use sensible defaults (sets:1, reps:1, weight:0).
- Accept kg or lbs — if kg is mentioned or implied, convert to lbs (1 kg = 2.205 lbs).
- Understand gym slang: "plates" = 45 lbs each side, "bar" = 45 lbs, "bodyweight" or "BW" = weight 0.
- Accept French gym terms too: "développé couché" = Bench Press, "squat" = Squat, "tractions" = Pull-ups, etc.

For STRENGTH exercises:
- muscleGroup: one of Chest, Back, Shoulders, Arms, Legs, Core
- sets, reps as integers, weight in lbs

For CARDIO (running, treadmill, cycling, rowing, swimming, walking, elliptical):
- muscleGroup: "Cardio"
- distance in meters (1 mile = 1609m, 1 km = 1000m)
- duration in seconds
- pace as readable string like "6.5 mph" or "5:30 /km"
- sets: 0, reps: 0, weight: 0

EXAMPLES:
"3 sets bench 100" → Bench Press, sets:3, reps:1, weight:100, muscleGroup:Chest
"did some squats" → Squat, sets:1, reps:1, weight:0, muscleGroup:Legs
"5x5 deadlift 2 plates" → Deadlift, sets:5, reps:5, weight:135, muscleGroup:Back
"ran 5k in 25 minutes" → Running, distance:5000, duration:1500, muscleGroup:Cardio
"développé couché 3 fois 10 à 80 kilos" → Bench Press, sets:3, reps:10, weight:176, muscleGroup:Chest

Return JSON: { "exercises": [ { "name": string, "muscleGroup": string, "sets": number, "reps": number, "weight": number, "distance": number, "duration": number, "pace": string } ] }
Only return { "exercises": [] } if the input contains absolutely no reference to any physical exercise.`;

      const gptResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Input: "${transcript}"` },
        ],
      });

      const parsed = JSON.parse(gptResponse.choices[0].message.content ?? "{}");
      res.json({ exercises: parsed.exercises ?? [], transcript });
    } catch (error: any) {
      console.error("AI parse-workout error:", error);
      res.status(500).json({ error: error.message || "AI processing failed" });
    }
  });

  app.post("/api/ai/parse-image", async (req, res) => {
    const { imageBase64 } = req.body;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [
          { text: `Extract workout data from this gym machine summary image. Identify the machine type in 'notes'. For CARDIO: distance in meters, duration in seconds, calories. For STRENGTH: sets, reps, weight in lbs. If unclear, best guess or omit.` },
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        ]}],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              notes: { type: Type.STRING },
              exercises: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING }, muscleGroup: { type: Type.STRING },
                    sets: { type: Type.NUMBER }, reps: { type: Type.NUMBER }, weight: { type: Type.NUMBER },
                    distance: { type: Type.NUMBER }, duration: { type: Type.NUMBER }, calories: { type: Type.NUMBER },
                  },
                  required: ["name"],
                },
              },
            },
            required: ["exercises"],
          },
        },
      });
      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error("AI parse-image error:", error);
      res.status(500).json({ error: error.message || "AI processing failed" });
    }
  });

  // Workout routes
  app.get("/api/workouts", requireAuth, async (req: any, res) => {
    try {
      res.json(await dbGetWorkouts(req.userId));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch workouts" });
    }
  });

  app.post("/api/workouts", requireAuth, async (req: any, res) => {
    const { date, notes, exercises, bodyWeightKg } = req.body;
    try {
      // Calculate calories from MET values
      const sessionMs = Date.now() - new Date(date).getTime();
      const durationMin = Math.max(Math.floor(sessionMs / 60000), 10); // min 10 minutes
      const enriched = calculateCalories(exercises, durationMin, bodyWeightKg || 70);

      const { workoutId, priorBests } = await dbSaveWorkout(req.userId, date, notes, enriched);
      const prMap: Record<string, any> = {};
      for (const ex of enriched) {
        if (!ex.weight) continue;
        const key = ex.name.toLowerCase();
        const prior = priorBests[key];
        if (prior === null || prior === undefined || ex.weight > prior) {
          if (!prMap[key] || ex.weight > prMap[key].weight) {
            prMap[key] = { exerciseName: ex.name, weight: ex.weight, previous: prior ?? null };
          }
        }
      }
      res.json({ success: true, workoutId, prs: Object.values(prMap) });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to save workout" });
    }
  });

  app.delete("/api/workouts/:id", requireAuth, async (req: any, res) => {
    try {
      await dbDeleteWorkout(req.params.id, req.userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete workout" });
    }
  });

  app.patch("/api/workouts/:id/metrics", requireAuth, async (req: any, res) => {
    const { avg_hr, max_hr } = req.body as { avg_hr?: number | null; max_hr?: number | null };
    try {
      await dbUpdateWorkoutHR(req.params.id, req.userId,
        typeof avg_hr === 'number' ? avg_hr : null,
        typeof max_hr === 'number' ? max_hr : null);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Workout metrics update error:", error);
      res.status(500).json({ error: error.message || "Failed to update workout metrics" });
    }
  });

  app.get("/api/exercises/last", requireAuth, async (req: any, res) => {
    const { name } = req.query as { name: string };
    if (!name) return res.status(400).json({ error: "name is required" });
    try {
      res.json(await dbGetLastExercise(name, req.userId));
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch last performance" });
    }
  });

  app.get("/api/exercises/history", requireAuth, async (req: any, res) => {
    const { name } = req.query as { name: string };
    if (!name) return res.status(400).json({ error: "name is required" });
    try {
      if (USE_SUPABASE && supabase) {
        const { data } = await supabase.from("exercises")
          .select("sets, reps, weight, distance, duration, calories, workouts!inner(date, user_id)")
          .ilike("name", name).eq("workouts.user_id", req.userId).order("workout_id", { ascending: true });
        res.json((data || []).map((r: any) => ({ ...r, date: r.workouts?.date })));
      } else {
        const rows = sqlite!.prepare(`
          SELECT e.sets, e.reps, e.weight, e.distance, e.duration, e.calories, w.date
          FROM exercises e JOIN workouts w ON e.workout_id = w.id
          WHERE LOWER(e.name) = LOWER(?) AND w.user_id = ? ORDER BY w.date ASC
        `).all(name, req.userId);
        res.json(rows);
      }
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch exercise history" });
    }
  });

  app.post("/api/workouts/:id/summary", requireAuth, async (req: any, res) => {
    const { prs = [] } = req.body;
    try {
      const workout = await dbGetWorkoutById(req.params.id);
      if (!workout) return res.status(404).json({ error: "Workout not found" });
      const exercises = await dbGetExercisesByWorkout(req.params.id);
      const exerciseLines = (exercises as any[]).map(ex => {
        if (ex.weight) return `${ex.name}: ${ex.sets}×${ex.reps} @ ${ex.weight}lbs`;
        if (ex.distance) return `${ex.name}: ${(ex.distance / 1000).toFixed(2)}km in ${Math.floor((ex.duration || 0) / 60)}min`;
        return ex.name;
      }).join("; ");
      const prLine = prs.length > 0
        ? `New PRs hit: ${(prs as any[]).map((p: any) => `${p.exerciseName} at ${p.weight}lbs`).join(", ")}.`
        : "";
      const prompt = `You are a concise, motivating fitness coach. Write a 2-3 sentence post-workout recap.
Exercises: ${exerciseLines}
${prLine}
Rules: Be specific. Mention PRs if present. End with one actionable tip. No filler. Under 60 words.`;
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
      });
      res.json({ summary: response.text.trim() });
    } catch (error: any) {
      console.error("Summary error:", error);
      res.status(500).json({ error: error.message || "Failed to generate summary" });
    }
  });

  // ── Voice transcription (Whisper only — no parsing) ─────────────────────────
  app.post("/api/ai/transcribe", async (req, res) => {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64) return res.status(400).json({ error: "audioBase64 is required" });
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const buf = Buffer.from(audioBase64, "base64");
      const file = new File([buf], "recording.m4a", { type: mimeType || "audio/m4a" });
      const result = await openai.audio.transcriptions.create({ file, model: "whisper-1" });
      const text = (result.text || "").trim();

      // Filter Whisper hallucinations on silent audio
      if (!text || isWhisperHallucination(text)) {
        return res.json({ text: "" });
      }
      res.json({ text });
    } catch (error: any) {
      console.error("Transcribe error:", error);
      res.status(500).json({ error: error.message || "Transcription failed" });
    }
  });

  // ── Clear Nyx history ───────────────────────────────────────────────────────
  app.delete("/api/coach/history", requireAuth, async (req: any, res) => {
    try {
      await dbDeleteNyxHistory(req.userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to clear history" });
    }
  });

  // ── LOFTE Coach (Nyx) ──────────────────────────────────────────────────────
  app.post("/api/ai/coach", requireAuth, async (req: any, res) => {
    const { message, imageBase64 } = req.body;
    if (!message && !imageBase64) return res.status(400).json({ error: "message or image is required" });

    try {
      const allWorkouts = await dbGetWorkouts(req.userId);

      // ── Compute athlete context ──
      const now = new Date();
      const cutoff90 = new Date(); cutoff90.setDate(now.getDate() - 90);
      const cutoff30 = new Date(); cutoff30.setDate(now.getDate() - 30);
      const startOfWeek = new Date(now);
      const dow = now.getDay();
      startOfWeek.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
      startOfWeek.setHours(0, 0, 0, 0);

      const recent90 = allWorkouts.filter((w: any) => new Date(w.date) >= cutoff90);
      const recent30 = allWorkouts.filter((w: any) => new Date(w.date) >= cutoff30);
      const thisWeek = allWorkouts.filter((w: any) => new Date(w.date) >= startOfWeek);

      // All-time PRs
      const prBests: Record<string, number> = {};
      allWorkouts.forEach((w: any) => w.exercises.forEach((e: any) => {
        if (!e.weight) return;
        const key = e.name.toLowerCase();
        if (!prBests[key] || e.weight > prBests[key]) prBests[key] = e.weight;
      }));

      // Streak
      const trainedDays = new Set(allWorkouts.map((w: any) => w.date.slice(0, 10)));
      let streak = 0;
      const sd = new Date();
      while (trainedDays.has(sd.toISOString().slice(0, 10))) { streak++; sd.setDate(sd.getDate() - 1); }

      // Days since last workout
      const daysSinceLast = allWorkouts.length > 0
        ? Math.floor((now.getTime() - new Date(allWorkouts[0].date).getTime()) / 86_400_000)
        : null;

      // Muscle group frequency (last 30 days)
      const muscleFreq: Record<string, number> = {};
      recent30.forEach((w: any) => w.exercises.forEach((e: any) => {
        const mg = (e.muscle_group || e.muscleGroup || 'Other').toLowerCase();
        muscleFreq[mg] = (muscleFreq[mg] || 0) + 1;
      }));
      const muscleLines = Object.entries(muscleFreq)
        .sort((a, b) => b[1] - a[1])
        .map(([mg, count]) => `${mg}: ${count} exercises`)
        .join(', ') || 'No data';

      // Weekly volume (last 4 weeks)
      const weeklyVol: number[] = [];
      for (let w = 0; w < 4; w++) {
        const wStart = new Date(now); wStart.setDate(now.getDate() - (7 * (w + 1)) - (dow === 0 ? 6 : dow - 1));
        const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 7);
        const vol = allWorkouts
          .filter((wk: any) => { const d = new Date(wk.date); return d >= wStart && d < wEnd; })
          .reduce((a: number, wk: any) => a + wk.exercises.reduce((b: number, e: any) =>
            b + ((e.sets || 0) * (e.reps || 0) * (e.weight || 0)), 0), 0);
        weeklyVol.push(vol);
      }
      const volTrend = weeklyVol.reverse().map((v, i) => `W${i + 1}: ${v > 0 ? Math.round(v).toLocaleString() : '0'} lbs`).join(' → ');

      // Recent sessions (last 15, detailed)
      const recentLines = recent90.slice(0, 15).map((w: any) => {
        const exLines = w.exercises.map((e: any) => {
          if (e.weight) return `${e.name}: ${e.sets}x${e.reps} @ ${e.weight}lbs`;
          if (e.distance) return `${e.name}: ${(e.distance / 1000).toFixed(1)}km in ${Math.round((e.duration || 0) / 60)}min`;
          return e.name;
        }).join(', ');
        return `${w.date.slice(0, 10)}: ${exLines || 'no exercises'}`;
      }).join('\n');

      const prLines = Object.entries(prBests)
        .map(([name, weight]) => `${name}: ${weight}lbs`)
        .join(', ') || 'None yet';

      const isNewUser = allWorkouts.length === 0;

      // Load persistent history from DB (last 30 messages) — graceful fallback
      let history: { role: string; content: string }[] = [];
      try { history = await dbGetNyxHistory(req.userId, 30); } catch {}
      const hasHistory = history.length > 0;

      // ── Pull user profile so Nyx knows who they are ──
      let profileBlock = '';
      let preferredName: string | null = null;
      try {
        const profile = await dbGetUserProfile(req.userId);
        if (profile) {
          const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
          preferredName = profile.first_name || displayName || null;
          const ageYrs = profile.dob ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (365.25 * 86_400_000)) : null;
          const lines = [
            displayName && `Name: ${displayName}`,
            profile.email && `Email: ${profile.email}`,
            ageYrs != null && `Age: ${ageYrs}y`,
            profile.sex && `Sex: ${profile.sex}`,
            profile.height_cm != null && `Height: ${profile.height_cm}cm`,
            profile.weight_kg != null && `Weight: ${profile.weight_kg}kg`,
            profile.health_connected_at && `Apple Health connected since: ${profile.health_connected_at.slice(0, 10)}`,
          ].filter(Boolean);
          if (lines.length > 0) profileBlock = `\nATHLETE PROFILE:\n${lines.join('\n')}`;
        }
      } catch {}

      // ── Pull Apple Health metrics (last 14 days for richer trend context) ──
      let healthBlock = '';
      try {
        const metrics = await dbGetHealthMetrics(req.userId, 14) as any[];
        if (metrics.length > 0) {
          const today = now.toISOString().slice(0, 10);
          const todayRow = metrics.find((r: any) => String(r.date).slice(0, 10) === today);
          const last7 = metrics.slice(-7);
          const prior7 = metrics.slice(0, Math.max(0, metrics.length - 7));

          const avgOf = (rows: any[], key: string) => {
            const vals = rows.map((r: any) => r[key]).filter((v: any) => typeof v === 'number');
            return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
          };
          const sumOf = (rows: any[], key: string) => {
            const vals = rows.map((r: any) => r[key]).filter((v: any) => typeof v === 'number');
            return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) : null;
          };
          const fmt = (n: number | null, d = 0) => n == null ? '—' : n.toFixed(d);
          const trend = (cur: number | null, base: number | null) => {
            if (cur == null || base == null) return '';
            const diff = cur - base;
            if (Math.abs(diff) < base * 0.03) return ' (stable)';
            return diff > 0 ? ` (↑ from 7d avg ${base.toFixed(0)})` : ` (↓ from 7d avg ${base.toFixed(0)})`;
          };
          const weekOverWeek = (cur: number | null, prev: number | null, unit = '') => {
            if (cur == null || prev == null || prev === 0) return '';
            const delta = ((cur - prev) / prev) * 100;
            const sign = delta >= 0 ? '+' : '';
            return ` (${sign}${delta.toFixed(1)}% vs prior week${unit ? ' ' + unit : ''})`;
          };

          const hrv7 = avgOf(last7, 'hrv_ms');
          const rhr7 = avgOf(last7, 'resting_heart_rate');
          const sleep7 = avgOf(last7, 'sleep_hours');
          const steps7 = avgOf(last7, 'steps');
          const cal7 = avgOf(last7, 'active_energy_kcal');
          const weight_latest = [...metrics].reverse().find((r: any) => typeof r.body_weight_kg === 'number')?.body_weight_kg ?? null;

          const hrvPrev = avgOf(prior7, 'hrv_ms');
          const rhrPrev = avgOf(prior7, 'resting_heart_rate');
          const sleepPrev = avgOf(prior7, 'sleep_hours');

          healthBlock = `
RECOVERY & BODY (live Apple Health, last 14 days):
HRV today: ${fmt(todayRow?.hrv_ms, 0)}ms${trend(todayRow?.hrv_ms ?? null, hrv7)}
HRV 7d avg: ${fmt(hrv7, 0)}ms${weekOverWeek(hrv7, hrvPrev)}
Resting HR today: ${fmt(todayRow?.resting_heart_rate, 0)}bpm${trend(todayRow?.resting_heart_rate ?? null, rhr7)}
Resting HR 7d avg: ${fmt(rhr7, 0)}bpm${weekOverWeek(rhr7, rhrPrev)}
Sleep last night: ${fmt(todayRow?.sleep_hours, 1)}h (7d avg ${fmt(sleep7, 1)}h${weekOverWeek(sleep7, sleepPrev)})
Steps today: ${fmt(todayRow?.steps, 0)} (7d avg ${fmt(steps7, 0)}, 7d total ${fmt(sumOf(last7, 'steps'), 0)})
Active cal today: ${fmt(todayRow?.active_energy_kcal, 0)} (7d avg ${fmt(cal7, 0)})
Latest body weight: ${fmt(weight_latest, 1)}kg`;
        }
      } catch {}

      // ── Recent workout HR (last 14d) ──
      const cutoff14 = new Date(); cutoff14.setDate(now.getDate() - 14);
      const hrWorkouts = allWorkouts
        .filter((w: any) => new Date(w.date) >= cutoff14 && (w.avg_hr || w.max_hr))
        .slice(0, 5)
        .map((w: any) => `${w.date.slice(0, 10)}: avg ${w.avg_hr || '?'}bpm, peak ${w.max_hr || '?'}bpm`)
        .join('; ');
      const hrBlock = hrWorkouts ? `\nSession HR (14d): ${hrWorkouts}` : '';

      const systemInstruction = `You are Nyx, a personal training coach. Talk like a real coach texting their client — casual, direct, no fluff. You're not an assistant, you're their coach.

${isNewUser && !hasHistory ? `This is a brand new athlete with no data and no past conversations. Start by introducing yourself briefly: "Hey, I'm Nyx — your coach inside LOFTE." Then ask their name and what they're training for. Keep it short and warm. One question at a time — don't dump a list of questions. Build the relationship naturally across messages.` :
!isNewUser && !hasHistory ? `This athlete has training data but this is your first conversation. Pick up casually — acknowledge their training so far, and ask what they're working toward. Don't list everything you can do.` :
`Continue the conversation naturally. Don't re-introduce yourself. Reference past messages when relevant.

IMPORTANT — past context is not permanent truth. If the athlete previously mentioned an injury, limitation, or preference, don't silently assume it still applies. Briefly check in: "Last time you mentioned your lower back — how's that doing?" or "Still working around that shoulder?" Let them confirm before programming around it. People heal, situations change. A good coach verifies, not assumes.`}

${profileBlock}${!isNewUser ? `
THEIR DATA:
${allWorkouts.length} total sessions, ${recent90.length} in last 90 days, ${thisWeek.length} this week. Streak: ${streak}d. Last workout: ${daysSinceLast ?? '?'}d ago.
PRs: ${prLines}
Muscles (30d): ${muscleLines}
Volume (4wk): ${volTrend}
Recent: ${recentLines || 'None.'}${hrBlock}${healthBlock}` : healthBlock}

RULES:
- 2-3 sentences for quick answers. Keep conversations casual and short.
- Ask follow-ups before giving advice on vague requests. "Plan a workout" → "What are you trying to hit today?"
- Be honest about gaps in their training. Hype them when they're consistent.
- Remember what they tell you across messages — name, goals, injuries, preferences.
- Fitness, training, nutrition, recovery only. Anything else: "Not my lane — what's going on with training?"
- Images: analyze form, equipment screens, food. Give specific feedback.
- If HRV is trending down, resting HR is up, or sleep is short — factor that into training advice. Suggest lighter sessions, mobility, or a rest day instead of pushing intensity. Don't be silent about recovery signals.
- If steps and active cal outside the gym are high, acknowledge the cumulative load. Strength numbers will feel heavy on high-cardio days.
- Never invent health numbers. Only reference the Apple Health values shown above. If a value is "—", treat it as unavailable.
- Use the athlete's first name (from ATHLETE PROFILE) when natural — never sound generic. If age / height / weight / sex are available, factor them in (e.g. cardio targets, intake estimates, programming). Don't list those details back to them unless asked.
- Always prefer concrete numbers from the data over vague generalities. "Your HRV is down 14% vs last week" beats "your recovery might be off."

FORMATTING:
- For regular chat: plain text, no formatting. Write like you're texting.
- For workout plans or structured info: use this clean format:

**Exercise Name**
Sets x Reps @ Weight
Brief cue or note

One exercise per block, blank line between exercises. Use **bold** for exercise names only. Keep cues to one line max.
- For lists (nutrition tips, recovery steps, etc.): use **bold** for each item title, followed by a short explanation on the same line or next line.
- Never use numbered lists, bullet points, headers (#), or tables.`;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const contents: any[] = history.map((m: any) => ({
        role: m.role,
        parts: [{ text: m.content }],
      }));

      // Build user message parts (text + optional image)
      const userText = message || '(sent an image)';
      const userParts: any[] = [];
      if (message) userParts.push({ text: message });
      if (imageBase64) userParts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
      if (userParts.length === 0) userParts.push({ text: "What do you see in this image?" });
      contents.push({ role: 'user', parts: userParts });

      // Save user message — must complete before next request loads history
      await dbSaveNyxMessage(req.userId, 'user', userText).catch(() => {});

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: { systemInstruction },
      });

      const reply = (response.text || '').trim();
      if (!reply) {
        return res.json({ reply: "Give me a bit more detail and I'll help you out." });
      }

      // Save coach reply
      await dbSaveNyxMessage(req.userId, 'model', reply).catch(() => {});

      res.json({ reply });
    } catch (error: any) {
      console.error("Coach error:", error?.message || error);
      res.status(500).json({ error: "Coach temporarily unavailable. Try again." });
    }
  });

  // ── Health metrics sync ─────────────────────────────────────────────────────
  app.post("/api/health/metrics", requireAuth, async (req: any, res) => {
    const { metrics } = req.body as { metrics: HealthMetricInput[] };
    if (!Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({ error: "metrics array required" });
    }
    try {
      await dbUpsertHealthMetrics(req.userId, metrics);
      res.json({ success: true, count: metrics.length });
    } catch (error: any) {
      console.error("Health metrics upsert error:", error);
      res.status(500).json({ error: error.message || "Failed to sync health metrics" });
    }
  });

  app.get("/api/health/summary", requireAuth, async (req: any, res) => {
    const days = Math.min(Math.max(parseInt((req.query.days as string) || "7"), 1), 90);
    try {
      const rows = await dbGetHealthMetrics(req.userId, days) as any[];
      const today = new Date().toISOString().slice(0, 10);
      const todayRow = rows.find((r: any) => String(r.date).slice(0, 10) === today) || null;

      const avg = (key: string) => {
        const vals = rows.map((r: any) => r[key]).filter((v: any) => typeof v === 'number');
        return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
      };

      res.json({
        today: todayRow,
        range: rows,
        averages: {
          steps: avg('steps'),
          active_energy_kcal: avg('active_energy_kcal'),
          resting_heart_rate: avg('resting_heart_rate'),
          hrv_ms: avg('hrv_ms'),
          sleep_hours: avg('sleep_hours'),
        },
      });
    } catch (error: any) {
      console.error("Health summary error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch health summary" });
    }
  });

  // ── User profile ────────────────────────────────────────────────────────────
  app.get("/api/user/profile", requireAuth, async (req: any, res) => {
    try {
      const row = await dbGetUserProfile(req.userId);
      res.json(row);
    } catch (error: any) {
      console.error("User profile fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch profile" });
    }
  });

  app.post("/api/user/profile", requireAuth, async (req: any, res) => {
    try {
      const row = await dbUpsertUserProfile(req.userId, req.body || {});
      res.json(row);
    } catch (error: any) {
      console.error("User profile upsert error:", error);
      res.status(500).json({ error: error.message || "Failed to save profile" });
    }
  });

  app.post("/api/user/profile/health-connected", requireAuth, async (req: any, res) => {
    try {
      const connected = req.body?.connected !== false;
      await dbMarkHealthConnected(req.userId, connected);
      res.json({ success: true, connected });
    } catch (error: any) {
      console.error("Mark health connected error:", error);
      res.status(500).json({ error: error.message || "Failed to update health connection" });
    }
  });

  // ── Account deletion (App Store requirement 5.1.1(v)) ───────────────────────
  app.delete("/api/account", requireAuth, async (req: any, res) => {
    try {
      // 1. Delete all workout data
      await dbDeleteAllUserData(req.userId);

      // 2. Delete user from Clerk
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
      await clerk.users.deleteUser(req.userId);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Account deletion error:", error);
      res.status(500).json({ error: error.message || "Failed to delete account" });
    }
  });

  const listenPort = Number(process.env.PORT) || PORT;
  app.listen(listenPort, "0.0.0.0", () => console.log(`Server running on http://localhost:${listenPort}`));
}

startServer();

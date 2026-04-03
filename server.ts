import express from "express";
import { createClient } from "@supabase/supabase-js";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import { verifyToken } from "@clerk/backend";

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
  console.log('Storage: SQLite (set SUPABASE_URL + SUPABASE_SERVICE_KEY to switch to Supabase)');
}

function mapExercise(ex: any) {
  return { ...ex, muscleGroup: ex.muscle_group ?? ex.muscleGroup };
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
          calories: ex.calories ?? null, pace: ex.pace ?? null,
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
    "INSERT INTO exercises (workout_id, name, muscle_group, sets, reps, weight, distance, duration, calories, pace) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  let workoutId: any;
  sqlite!.transaction(() => {
    const info = insertWorkout.run(date, notes || "", userId);
    workoutId = info.lastInsertRowid;
    for (const ex of exercises) {
      insertEx.run(workoutId, ex.name, ex.muscleGroup || null, ex.sets ?? null, ex.reps ?? null,
        ex.weight ?? null, ex.distance ?? null, ex.duration ?? null, ex.calories ?? null, ex.pace ?? null);
    }
  })();
  return { workoutId, priorBests };
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

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json({ limit: "20mb" }));

  // Health check
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // AI Routes
  app.post("/api/ai/parse-workout", async (req, res) => {
    const { text, audioBase64, mimeType } = req.body;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const parts: any[] = [];
      const systemPrompt = `Extract workout exercises from the input and return structured data.

For cardio exercises (running, treadmill, cycling, rowing, swimming, walking, elliptical):
- Set muscleGroup to "Cardio"
- Set distance in meters (1 mile = 1609m, 1 km = 1000m)
- Set duration in seconds
- Set pace as a readable string like "12 min/mi" or "6.5 mph"
- Set sets and reps to 0, weight to 0

For strength exercises:
- Set muscleGroup to the muscle worked: Chest, Back, Shoulders, Arms, Legs, Core
- Set sets, reps, weight in lbs (bodyweight = 0)
- Leave distance, duration, pace empty

Always normalize exercise names to proper case. Return empty exercises array only if the input contains no exercise information.`;

      if (audioBase64) {
        parts.push({ text: systemPrompt });
        parts.push({ inlineData: { mimeType: mimeType || "audio/m4a", data: audioBase64 } });
      } else if (text) {
        parts.push({ text: `${systemPrompt}\n\nInput: "${text}"` });
      } else {
        return res.status(400).json({ error: "Provide either text or audioBase64" });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              notes: { type: Type.STRING },
              exercises: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING }, muscleGroup: { type: Type.STRING },
                    sets: { type: Type.NUMBER }, reps: { type: Type.NUMBER }, weight: { type: Type.NUMBER },
                    distance: { type: Type.NUMBER }, duration: { type: Type.NUMBER },
                    calories: { type: Type.NUMBER }, pace: { type: Type.STRING },
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
    const { date, notes, exercises } = req.body;
    try {
      const { workoutId, priorBests } = await dbSaveWorkout(req.userId, date, notes, exercises);
      const prMap: Record<string, any> = {};
      for (const ex of exercises) {
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

  const listenPort = Number(process.env.PORT) || PORT;
  app.listen(listenPort, "0.0.0.0", () => console.log(`Server running on http://localhost:${listenPort}`));
}

startServer();

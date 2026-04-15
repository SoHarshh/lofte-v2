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

async function dbDeleteAllUserData(userId: string) {
  if (USE_SUPABASE && supabase) {
    // Get all workout IDs for the user
    const { data: workouts } = await supabase.from("workouts").select("id").eq("user_id", userId);
    const workoutIds = (workouts || []).map((w: any) => w.id);
    // Delete exercises for those workouts
    if (workoutIds.length > 0) {
      const { error: eErr } = await supabase.from("exercises").delete().in("workout_id", workoutIds);
      if (eErr) throw eErr;
    }
    // Delete all workouts
    const { error: wErr } = await supabase.from("workouts").delete().eq("user_id", userId);
    if (wErr) throw wErr;
    return;
  }
  // SQLite — exercises cascade from workouts FK, but delete explicitly to be safe
  const workoutIds = (sqlite!.prepare("SELECT id FROM workouts WHERE user_id = ?").all(userId) as any[]).map(r => r.id);
  if (workoutIds.length > 0) {
    sqlite!.prepare(`DELETE FROM exercises WHERE workout_id IN (${workoutIds.map(() => '?').join(',')})`).run(...workoutIds);
  }
  sqlite!.prepare("DELETE FROM workouts WHERE user_id = ?").run(userId);
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
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      let transcript: string | undefined;

      if (audioBase64) {
        const audioBuffer = Buffer.from(audioBase64, "base64");
        const audioFile = new File([audioBuffer], "recording.m4a", { type: mimeType || "audio/m4a" });
        const whisperResult = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
        });
        transcript = whisperResult.text;
        if (!transcript?.trim()) {
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

  // ── LOFTE Coach ──────────────────────────────────────────────────────────────
  app.post("/api/ai/coach", requireAuth, async (req: any, res) => {
    const { message, chatHistory = [] } = req.body;
    if (!message) return res.status(400).json({ error: "message is required" });

    try {
      const allWorkouts = await dbGetWorkouts(req.userId);

      // Last 90 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const recentWorkouts = allWorkouts.filter((w: any) => new Date(w.date) >= cutoff);

      // All-time PRs per exercise
      const prBests: Record<string, number> = {};
      allWorkouts.forEach((w: any) => w.exercises.forEach((e: any) => {
        if (!e.weight) return;
        const key = e.name.toLowerCase();
        if (!prBests[key] || e.weight > prBests[key]) prBests[key] = e.weight;
      }));

      // Streak
      const trainedDays = new Set(allWorkouts.map((w: any) => w.date.slice(0, 10)));
      let streak = 0;
      const streakDate = new Date();
      while (true) {
        const key = streakDate.toISOString().slice(0, 10);
        if (trainedDays.has(key)) { streak++; streakDate.setDate(streakDate.getDate() - 1); }
        else break;
      }

      // Recent sessions (last 10)
      const recentLines = recentWorkouts.slice(0, 10).map((w: any) => {
        const exLines = w.exercises.map((e: any) => {
          if (e.weight) return `${e.name}: ${e.sets}x${e.reps} @ ${e.weight}lbs`;
          if (e.distance) return `${e.name}: ${(e.distance / 1000).toFixed(1)}km`;
          return e.name;
        }).join(', ');
        return `${w.date.slice(0, 10)}: ${exLines || 'no exercises recorded'}`;
      }).join('\n');

      const prLines = Object.entries(prBests)
        .map(([name, weight]) => `${name}: ${weight}lbs`)
        .join(', ') || 'None yet';

      const systemInstruction = `You are Nyx, an elite personal training AI built into the LOFTE app. You have full access to this athlete's training data.

ATHLETE DATA (last 90 days):
- Sessions: ${recentWorkouts.length}
- Current streak: ${streak} day${streak !== 1 ? 's' : ''}
- All-time PRs: ${prLines}

RECENT WORKOUTS:
${recentLines || 'No workouts logged yet.'}

RULES:
- Be direct and specific. Reference their actual numbers.
- Keep responses concise — 2-4 sentences unless they ask for a breakdown.
- Never be generic. If data is insufficient, say so honestly.
- Plain English only, no markdown or bullet points unless explicitly asked.
- You are encouraging but honest. Don't sugarcoat plateaus.
- Your name is Nyx. If asked, you are the athlete's personal training AI inside LOFTE.`;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const contents: any[] = (chatHistory as any[]).map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      }));
      contents.push({ role: 'user', parts: [{ text: message }] });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: { systemInstruction },
      });

      res.json({ reply: response.text.trim() });
    } catch (error: any) {
      console.error("Coach error:", error);
      res.status(500).json({ error: error.message || "Coach failed" });
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

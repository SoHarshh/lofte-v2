import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("workouts.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    notes TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    muscle_group TEXT,
    sets INTEGER,
    reps INTEGER,
    weight REAL,
    distance REAL,
    duration REAL,
    calories REAL,
    pace TEXT,
    FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE
  );
`);

// Migrate existing DB — add pace column if not present
try { db.exec("ALTER TABLE exercises ADD COLUMN pace TEXT"); } catch { /* already exists */ }

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));

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
- Set pace as a readable string like "12 min/mi" or "6.5 mph" or "12-14 min/mi"
- Set sets and reps to 0, weight to 0

For strength exercises (bench press, squats, curls, pushups, rows, etc):
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
                    name: { type: Type.STRING },
                    muscleGroup: { type: Type.STRING },
                    sets: { type: Type.NUMBER },
                    reps: { type: Type.NUMBER },
                    weight: { type: Type.NUMBER },
                    distance: { type: Type.NUMBER },
                    duration: { type: Type.NUMBER },
                    calories: { type: Type.NUMBER },
                    pace: { type: Type.STRING },
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
        contents: [{
          parts: [
            { text: `Extract workout data from this gym machine summary image.
              The image could be from a treadmill, elliptical, rower, or a strength machine.
              Rules:
              1. Identify the machine type and put it in 'notes'.
              2. For CARDIO (treadmill, etc.):
                 - 'distance': Extract in meters (convert km to 1000m, miles to 1609m).
                 - 'duration': Extract in seconds (convert mm:ss or hh:mm:ss).
                 - 'calories': Extract as number.
              3. For STRENGTH (weight machines):
                 - 'name': Name of the exercise.
                 - 'sets': Number of sets.
                 - 'reps': Number of reps per set.
                 - 'weight': Weight in lbs (convert kg to lbs if needed, 1kg = 2.2lbs).
              4. If multiple exercises are visible, include all of them.
              5. If data is unclear, make your best guess or omit the specific field.` },
            { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          ],
        }],
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
                    name: { type: Type.STRING },
                    muscleGroup: { type: Type.STRING },
                    sets: { type: Type.NUMBER },
                    reps: { type: Type.NUMBER },
                    weight: { type: Type.NUMBER },
                    distance: { type: Type.NUMBER },
                    duration: { type: Type.NUMBER },
                    calories: { type: Type.NUMBER },
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

  // API Routes
  app.get("/api/workouts", (req, res) => {
    try {
      const workouts = db.prepare("SELECT * FROM workouts ORDER BY date DESC").all();
      const exercises = db.prepare("SELECT * FROM exercises").all();

      const workoutsWithExercises = workouts.map((workout: any) => ({
        ...workout,
        exercises: exercises.filter((ex: any) => ex.workout_id === workout.id).map((ex: any) => ({
          ...ex,
          muscleGroup: ex.muscle_group
        })),
      }));

      res.json(workoutsWithExercises);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch workouts" });
    }
  });

  app.post("/api/workouts", (req, res) => {
    const { date, notes, exercises } = req.body;

    try {
      // Snapshot current bests BEFORE inserting so we can detect PRs
      const getBestWeight = db.prepare(
        "SELECT MAX(weight) as maxWeight FROM exercises WHERE LOWER(name) = LOWER(?)"
      );
      const priorBests: Record<string, number | null> = {};
      for (const ex of exercises) {
        if (ex.weight) {
          const key = ex.name.toLowerCase();
          if (!(key in priorBests)) {
            const row = getBestWeight.get(ex.name) as any;
            priorBests[key] = row?.maxWeight ?? null;
          }
        }
      }

      const insertWorkout = db.prepare("INSERT INTO workouts (date, notes) VALUES (?, ?)");
      const insertExercise = db.prepare(
        "INSERT INTO exercises (workout_id, name, muscle_group, sets, reps, weight, distance, duration, calories, pace) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      );

      const transaction = db.transaction(() => {
        const info = insertWorkout.run(date, notes || "");
        const workoutId = info.lastInsertRowid;
        for (const ex of exercises) {
          insertExercise.run(
            workoutId, ex.name, ex.muscleGroup || null,
            ex.sets ?? null, ex.reps ?? null, ex.weight ?? null,
            ex.distance ?? null, ex.duration ?? null, ex.calories ?? null,
            ex.pace ?? null
          );
        }
        return workoutId;
      });

      const workoutId = transaction();

      // Detect PRs — deduplicated by exercise name (keep highest weight per exercise)
      const prMap: Record<string, any> = {};
      for (const ex of exercises) {
        if (!ex.weight) continue;
        const key = ex.name.toLowerCase();
        const prior = priorBests[key];
        if (prior === null || ex.weight > prior) {
          if (!prMap[key] || ex.weight > prMap[key].weight) {
            prMap[key] = { exerciseName: ex.name, weight: ex.weight, previous: prior };
          }
        }
      }
      const prs = Object.values(prMap);

      res.json({ success: true, workoutId, prs });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save workout" });
    }
  });

  app.delete("/api/workouts/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM workouts WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete workout" });
    }
  });

  // Last performance for an exercise (for progressive overload context)
  app.get("/api/exercises/last", (req, res) => {
    const { name } = req.query as { name: string };
    if (!name) return res.status(400).json({ error: "name is required" });
    try {
      const row = db.prepare(`
        SELECT e.sets, e.reps, e.weight, e.distance, e.duration, e.calories, w.date
        FROM exercises e
        JOIN workouts w ON e.workout_id = w.id
        WHERE LOWER(e.name) = LOWER(?)
        ORDER BY w.date DESC
        LIMIT 1
      `).get(name) as any;
      res.json(row || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch last performance" });
    }
  });

  // Full history for an exercise (for drill-down chart)
  app.get("/api/exercises/history", (req, res) => {
    const { name } = req.query as { name: string };
    if (!name) return res.status(400).json({ error: "name is required" });
    try {
      const rows = db.prepare(`
        SELECT e.sets, e.reps, e.weight, e.distance, e.duration, e.calories, w.date
        FROM exercises e
        JOIN workouts w ON e.workout_id = w.id
        WHERE LOWER(e.name) = LOWER(?)
        ORDER BY w.date ASC
      `).all(name) as any[];
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch exercise history" });
    }
  });

  // Post-workout AI summary
  app.post("/api/workouts/:id/summary", async (req, res) => {
    const { prs = [] } = req.body;
    try {
      const workout = db.prepare("SELECT * FROM workouts WHERE id = ?").get(req.params.id) as any;
      if (!workout) return res.status(404).json({ error: "Workout not found" });

      const exercises = db.prepare("SELECT * FROM exercises WHERE workout_id = ?").all(req.params.id) as any[];

      const exerciseLines = exercises.map((ex: any) => {
        if (ex.weight) return `${ex.name}: ${ex.sets}×${ex.reps} @ ${ex.weight}lbs`;
        if (ex.distance) return `${ex.name}: ${(ex.distance / 1000).toFixed(2)}km in ${Math.floor((ex.duration || 0) / 60)}min`;
        return ex.name;
      }).join("; ");

      const prLine = prs.length > 0
        ? `New PRs hit: ${(prs as any[]).map((p: any) => `${p.exerciseName} at ${p.weight}lbs`).join(", ")}.`
        : "";

      const prompt = `You are a concise, motivating fitness coach. Write a 2-3 sentence post-workout recap for this session.

Exercises: ${exerciseLines}
${prLine}

Rules: Be specific (mention actual exercises/weights). Mention PRs if present. End with one actionable tip for next session. No filler phrases like "Great job!" Keep it under 60 words.`;

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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

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
    FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE
  );
`);

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

      if (audioBase64) {
        parts.push({ text: "Extract workout data from this audio. Return a JSON object with 'date' (ISO string), 'notes' (string), and 'exercises' (array of objects with 'name', 'muscleGroup', 'sets', 'reps', 'weight'). If no workout is found, return an empty exercises array." });
        parts.push({ inlineData: { mimeType: mimeType || "audio/webm", data: audioBase64 } });
      } else if (text) {
        parts.push({ text: `Extract workout data from this text: "${text}". Return a JSON object with 'date' (ISO string), 'notes' (string), and 'exercises' (array of objects with 'name', 'muscleGroup', 'sets', 'reps', 'weight'). If no workout is found, return an empty exercises array.` });
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
                  },
                  required: ["name", "sets", "reps", "weight"],
                },
              },
            },
            required: ["date", "exercises"],
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
      const insertWorkout = db.prepare("INSERT INTO workouts (date, notes) VALUES (?, ?)");
      const insertExercise = db.prepare(
        "INSERT INTO exercises (workout_id, name, muscle_group, sets, reps, weight, distance, duration, calories) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      );

      const transaction = db.transaction(() => {
        const info = insertWorkout.run(date, notes || "");
        const workoutId = info.lastInsertRowid;

        for (const ex of exercises) {
          insertExercise.run(
            workoutId, 
            ex.name, 
            ex.muscleGroup || null, 
            ex.sets ?? null, 
            ex.reps ?? null, 
            ex.weight ?? null,
            ex.distance ?? null,
            ex.duration ?? null,
            ex.calories ?? null
          );
        }
        return workoutId;
      });

      const workoutId = transaction();
      res.json({ success: true, workoutId });
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

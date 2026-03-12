import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

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

// Drop and recreate exercises to ensure correct schema for cardio
db.exec(`
  DROP TABLE IF EXISTS exercises;
  CREATE TABLE exercises (
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

  app.use(express.json());

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

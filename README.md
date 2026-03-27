# LOFTE — Frictionless Workout Tracker

Voice-first workout tracking for athletes who refuse to break their flow state. Speak your set, AI logs it instantly.

Available on **iOS via TestFlight**.

---

## Features

| Feature | Status |
|---------|--------|
| Voice input → AI transcribe + parse → save | ✅ |
| Text input → AI parse → save | ✅ |
| Camera / photo → AI Vision analyze → save | ✅ |
| PR detection (auto-flags personal bests on save) | ✅ |
| Progressive overload hints (shows last session's numbers) | ✅ |
| Post-workout AI debrief | ✅ |
| Workout history with delete | ✅ |
| Dashboard — volume trends + muscle group breakdown | ✅ |
| Cardio logging (distance, duration, pace) | ✅ |
| LOFTE Coach (AI coaching tab) | Coming soon |

---

## Tech Stack

**Mobile App**
- React Native + Expo SDK 55
- TypeScript
- expo-blur (frosted glass UI)
- expo-audio (voice recording)
- expo-image-picker (camera / library)
- React Navigation (bottom tabs)

**Backend**
- Express + TypeScript (tsx)
- Google Gemini 2.5 Flash (audio + vision + text parsing)
- Supabase (Postgres database)
- Deployed on Railway

---

## Architecture

```
lofte-v2/
├── app/                        — React Native / Expo app
│   ├── src/
│   │   ├── screens/
│   │   │   ├── SessionScreen.tsx   — Active workout session
│   │   │   ├── DashboardScreen.tsx — Analytics + charts
│   │   │   ├── HistoryScreen.tsx   — Past workouts
│   │   │   ├── ProfileScreen.tsx   — Stats + settings
│   │   │   └── CoachScreen.tsx     — AI Coach (coming soon)
│   │   ├── components/
│   │   │   ├── AppBackground.tsx   — Global background image
│   │   │   └── GlassCard.tsx       — Frosted glass card component
│   │   ├── types/index.ts          — TypeScript interfaces
│   │   └── config.ts               — API base URL
│   ├── assets/                 — Icons, splash, background
│   ├── app.json                — Expo config
│   └── eas.json                — EAS Build config
├── server.ts                   — Express API server
├── .env                        — API keys (not committed)
└── package.json
```

---

## Running Locally

**Prerequisites:** Node.js 18+, Expo CLI

### Backend

```bash
# Install dependencies
npm install

# Create .env
cp .env.example .env
# Fill in GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

# Start server
npm run dev
# Runs on http://localhost:3000
```

### Mobile App

```bash
cd app
npm install
npx expo start
```

Scan the QR code with Expo Go, or run on a simulator.

> For voice recording to work, a physical device is required.

---

## Environment Variables

```
GEMINI_API_KEY=        # Google AI Studio — aistudio.google.com/apikey
SUPABASE_URL=          # Your Supabase project URL
SUPABASE_SERVICE_KEY=  # Supabase service role key (secret)
```

The server falls back to SQLite if Supabase credentials are not set.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/ai/parse-workout` | Parse text or audio into exercises |
| POST | `/api/ai/parse-image` | Parse gym machine photo into exercises |
| GET | `/api/workouts` | Fetch all workouts |
| POST | `/api/workouts` | Save a workout, returns PR detections |
| DELETE | `/api/workouts/:id` | Delete a workout |
| GET | `/api/exercises/last` | Last logged performance for an exercise |
| GET | `/api/exercises/history` | Full history for an exercise |
| POST | `/api/workouts/:id/summary` | Generate AI post-workout debrief |

---

## Deployment

**Backend** — Railway
Auto-deploys from `main` branch. Uses `npm start` → `tsx server.ts`.

**Mobile** — TestFlight (iOS)
Built with EAS Build (`eas build --platform ios --profile production`), submitted via `eas submit`.

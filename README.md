# LOFTE — Frictionless Workout Tracker

Voice-first workout tracking for athletes who refuse to break their flow state. Speak your set, AI logs it instantly.

Available on **iOS via TestFlight**.

---

## Features

| Feature | Status |
|---------|--------|
| Voice input → Whisper transcription → Gemini parse → save | ✅ |
| Camera / photo → Gemini Vision analyze → save | ✅ |
| Manual entry — instant, no blocking network call | ✅ |
| Searchable exercise picker (70+ exercises by muscle group) | ✅ |
| PR detection (auto-flags personal bests on save) | ✅ |
| Progressive overload hints (shows last session's numbers) | ✅ |
| Post-workout AI debrief | ✅ |
| Nyx — AI coach with full workout history context | ✅ |
| Workout history with expandable cards | ✅ |
| Dashboard — volume trends + muscle group breakdown | ✅ |
| Cardio logging (distance, duration, pace) | ✅ |
| Clerk auth — Apple SSO, Google SSO, email/password | ✅ |
| Per-user data isolation (Clerk JWT on all endpoints) | ✅ |
| Forgot password flow | ✅ |

---

## Tech Stack

**Mobile App**
- React Native + Expo SDK 55
- TypeScript
- Clerk (`@clerk/expo`) — auth
- expo-blur (frosted glass / glassmorphism UI)
- expo-audio (voice recording)
- expo-image-picker (camera)
- expo-secure-store (local preferences)
- React Navigation (bottom tabs)

**Backend**
- Express + TypeScript (tsx)
- OpenAI Whisper (`whisper-1`) — voice transcription
- Google Gemini 2.5 Flash — exercise extraction, image parsing, debrief, Nyx coach
- Clerk (`@clerk/backend`) — JWT verification
- Supabase (Postgres database)
- Deployed on Railway

---

## Architecture

```
lofte-v2/
├── app/                        — React Native / Expo app
│   ├── src/
│   │   ├── screens/
│   │   │   ├── SessionScreen.tsx   — Active workout session (voice/camera/manual)
│   │   │   ├── DashboardScreen.tsx — Analytics + charts
│   │   │   ├── HistoryScreen.tsx   — Past workouts
│   │   │   ├── ProfileScreen.tsx   — Stats + settings
│   │   │   ├── CoachScreen.tsx     — Nyx AI coach chat
│   │   │   └── LoginScreen.tsx     — Auth (SSO + email/password + forgot password)
│   │   ├── components/
│   │   │   ├── AppBackground.tsx   — Global background
│   │   │   ├── GlassCard.tsx       — Frosted glass card component
│   │   │   └── ExercisePicker.tsx  — Searchable exercise bottom sheet
│   │   ├── data/exercises.ts       — 70+ exercises organised by muscle group
│   │   ├── hooks/useAuthFetch.ts   — Authenticated fetch with Clerk JWT
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
npm install

cp .env.example .env
# Fill in GEMINI_API_KEY, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, CLERK_SECRET_KEY

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

> Voice recording requires a physical device. Glassmorphism UI requires a real device or simulator with blur support.

---

## Environment Variables

```
GEMINI_API_KEY=        # Google AI Studio — aistudio.google.com/apikey
OPENAI_API_KEY=        # OpenAI — platform.openai.com (Whisper voice transcription)
SUPABASE_URL=          # Your Supabase project URL
SUPABASE_SERVICE_KEY=  # Supabase service role key (secret)
CLERK_SECRET_KEY=      # Clerk dashboard → API Keys
```

The server falls back to SQLite if Supabase credentials are not set.

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | — | Health check |
| POST | `/api/ai/parse-workout` | — | Whisper transcription → Gemini exercise extraction |
| POST | `/api/ai/parse-image` | — | Gemini Vision parse of gym machine photo |
| GET | `/api/workouts` | ✅ | Fetch user's workouts |
| POST | `/api/workouts` | ✅ | Save workout, returns PR detections |
| DELETE | `/api/workouts/:id` | ✅ | Delete a workout |
| GET | `/api/exercises/last` | ✅ | Last logged performance for an exercise |
| GET | `/api/exercises/history` | ✅ | Full history for an exercise |
| POST | `/api/workouts/:id/summary` | ✅ | Generate AI post-workout debrief |
| POST | `/api/ai/coach` | ✅ | Nyx — multi-turn AI coach with 90-day workout context |

---

## Deployment

**Backend** — Railway
Auto-deploys from `main` branch. Uses `npm start` → `tsx server.ts`.

**Mobile** — TestFlight (iOS)
Built with EAS Build (`eas build --platform ios --profile production`), submitted via `eas submit`.

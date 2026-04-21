# LOFTE

**Workout logging that gets out of your way.**

Most gym apps make you stop between sets to tap through logging screens. LOFTE doesn't. Speak a sentence after your set, take a photo of the machine, or type it in — AI structures everything instantly. By the time you leave the gym, your workout is already logged.

Available on **iOS via TestFlight**.

---

## How it works

**Three ways to log. All instant.**

- **Voice** — Hit the mic, say "bench press 3 sets of 8 at 185" and keep moving. Whisper transcribes, Gemini structures it.
- **Camera** — Point at the machine summary screen. AI reads the numbers.
- **Manual** — Pick from 70+ exercises, enter your sets. No network call, appears immediately.

Every entry shows up as a live card while the session is in progress. Finish the session and your workout is saved, PRs are flagged, and Nyx gives you a debrief.

---

## Nyx — Your AI Coach

Nyx is a personal training AI that actually knows your history. She has access to your last 90 days of workouts, your PRs per exercise, your training streak, **and your Apple Health data** — HRV, resting heart rate, sleep, steps, active calories, session HR.

Ask her anything — *"Why has my bench been stuck for 3 weeks?"*, *"What should I focus on next session?"*, *"How's my recovery?"* — and she'll give you a real answer based on your actual data.

---

## Health Tab

Dedicated tab with a live, interactive view of your Apple Health data:

- **HRV, Resting HR, Sleep, Steps, Active Calories** pulled directly from HealthKit
- Day-over-day trends with left/right date navigation
- Tap any metric → drill down into hourly (D) / weekly / monthly / yearly charts
- Smooth line charts for HRV + Resting HR (biosignals), bar charts for Sleep/Steps/Cal
- Scrubbing interaction: tap/drag the chart to see any point's exact value
- Swipe horizontally through past days on the Day view
- Live indicator on today's Resting HR — pulsing dot, breathing halo on the sparkline

All numbers are real — no fakes, no fallbacks. If a metric isn't available (no Apple Watch = no HRV), it renders `—`.

Every LOFTE session also writes back to Apple Health as a workout so it closes your activity rings.

---

## Stack

| Layer | What |
|-------|------|
| App | React Native + Expo (iOS) |
| Auth | Clerk — Apple SSO, Google SSO, email/password |
| Voice | OpenAI Whisper → Gemini 2.5 Flash |
| Camera | Gemini 2.5 Flash Vision |
| AI Coach | Gemini 2.5 Flash with workout history context |
| Backend | Express + TypeScript on Railway |
| Database | Supabase (Postgres) |

---

## Running Locally

### Backend

```bash
npm install
cp .env.example .env   # fill in keys (see below)
npm run dev            # http://localhost:3000
```

### App

```bash
cd app
npm install
npx expo start
```

> Voice recording requires a physical device.

### Environment Variables

```
GEMINI_API_KEY=       # Google AI Studio
OPENAI_API_KEY=       # OpenAI (Whisper)
SUPABASE_URL=         # Supabase project URL
SUPABASE_SERVICE_KEY= # Supabase service role key
CLERK_SECRET_KEY=     # Clerk dashboard → API Keys
```

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/ai/parse-workout` | Voice/text → structured exercises |
| POST | `/api/ai/parse-image` | Photo → structured exercises |
| POST | `/api/ai/transcribe` | Voice → text (Whisper only, no parsing) |
| GET | `/api/workouts` | Get user's workout history |
| POST | `/api/workouts` | Save workout + detect PRs + MET-based calories |
| PATCH | `/api/workouts/:id/metrics` | Attach avg/max HR to a workout |
| DELETE | `/api/workouts/:id` | Delete a workout |
| GET | `/api/exercises/last` | Last performance for an exercise |
| GET | `/api/exercises/history` | Full history for an exercise |
| POST | `/api/workouts/:id/summary` | Post-workout AI debrief |
| POST | `/api/ai/coach` | Nyx — AI coach chat (includes Apple Health context) |
| DELETE | `/api/coach/history` | Clear Nyx conversation memory |
| POST | `/api/health/metrics` | Upsert daily Apple Health metrics |
| GET | `/api/health/summary` | Aggregated Apple Health summary for Nyx |
| DELETE | `/api/account` | Delete user + all data (App Store compliance) |

All endpoints require a Clerk JWT (`Authorization: Bearer <token>`).

---

## Deployment

Backend auto-deploys to Railway on every push to `main`.
iOS builds via EAS Build, distributed through TestFlight.

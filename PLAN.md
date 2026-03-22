# LOFTE — Build Plan

---

## Platform Decision: React Native + Expo

**Why not Swift/Xcode:** Completely different language, zero code reuse, steeper learning curve, Xcode-only workflow. Swift is the right call only when you need Apple Watch complications or CarPlay (Phase 6+).

**Why React Native + Expo:**
- You already know React + TypeScript — 90% of concepts transfer directly
- The Express backend stays **completely unchanged** — the app just calls the same APIs
- Expo SDK covers camera, microphone, HealthKit, push notifications, Siri out of the box
- Live preview: `npx expo start --ios` → iOS Simulator hot-reloads every save
- App Store + TestFlight via EAS Build + EAS Submit (automated, no manual Xcode required)
- React Native renders actual native UIKit components — indistinguishable from Swift for this use case

**Repository structure:**
```
LOFTE/
  server/    ← existing Express backend (unchanged, serves both web + app)
  web/       ← existing Vite React app (keep for testing/dev)
  app/       ← new Expo React Native app (ships to App Store)
```

**One-time setup (do today):**
1. Apple Developer Account — $99/year at developer.apple.com (required for TestFlight + App Store, takes 24-48hrs to process)
2. Xcode — free from Mac App Store (~10GB, start the download now)
3. `npm install -g eas-cli` then `eas login` (create account at expo.dev)

---

## The Vision

**Intentional workout logging. Zero friction. For athletes who refuse to break their flow.**

The mental model: what Granola does for meetings, LOFTE does for workouts.

You don't stop between sets to tap through a logging screen. You start a session, train normally — speak after each set ("bench, 3x10 at 80"), tap a button, or take a photo of the machine. By the time you finish, the AI has structured your entire workout. PRs flagged. Overload tracked. LOFTE Coach gives you a real debrief that accounts for your sleep, recovery, and training history.

**On ambient recording — deliberately avoided:**
Continuous mic recording is rejected by App Store, captures other people in the gym, drains battery, and produces terrible accuracy. Intentional capture windows (wake word or PTT) solve all four problems and produce better UX after the user internalizes the pattern.

---

## Voice Capture Strategy

Three intentional capture modes — never ambient:

1. **Wake word** ("Hey LOFTE") via Porcupine SDK — runs 100% on-device, no data leaves phone, activates an 8-second recording window → auto-submits on silence
2. **PTT (Push-to-Talk)** — tap mic button on screen → record → auto-submits on silence. For phone-in-hand users.
3. **AirPods stem press** → PTT via native audio session. One press = log.

All three append to the same **session transcript**. Finish → Gemini parses the whole transcript at once.

---

## UX Flow by User Type

### Type A — Wearable user (Apple Watch / Whoop)
```
HealthKit detects HR spike → LOFTE can auto-start session
→ User speaks throughout ("bench 3x10 at 80" via wake word or PTT)
→ Workout ends (HR drops / manual stop) → AI parses full transcript
→ Review screen → confirm → saved
→ LOFTE Coach: recovery-aware debrief (sleep 5.8hrs, HRV down → flag volume)
```

### Type B — AirPods / voice user (no wearable)
```
Opens LOFTE → taps Start
→ "Hey LOFTE, bench 3 sets of 10 at 80kg" → 8s window, auto-closes
→ Session transcript builds throughout workout
→ Finish → AI processes transcript → review → save
→ LOFTE Coach debrief based on session data
```

### Type C — Manual / non-speaker
```
Opens LOFTE → taps Start
→ Quick Add panel: recent exercises as instant-add cards
→ Numpad: exercise → weight → sets×reps → logged in 3 taps
→ OR: camera photo of cardio machine display → auto-parsed
→ Finish → saves
```

### Type D — Siri Shortcuts (no app open needed)
```
"Hey Siri, log to LOFTE" → Shortcut fires
→ Calls POST /api/ai/parse-workout with spoken text
→ Added to active session
→ Works via AirPods, Apple Watch, CarPlay
```

---

## LOFTE Coach — The Killer Feature

A conversational AI that actually knows your training. Nobody has done this well.

The system prompt for every Coach conversation:
```
You are LOFTE Coach. You have full access to:
- User's complete workout history (last 90 days of sessions, exercises, weights, volume)
- Current session just completed
- Apple Health data: sleep duration, resting HR, HRV, active energy, workout HR
- Whoop data (if connected): recovery score, strain, HRV trend
- PR history and progressive overload trends per exercise

Answer in plain English. Explain data without jargon. Give specific, actionable advice.
```

Example interactions:
- "Why has my bench been stuck for 3 weeks?" → AI sees volume, sleep, HRV drop → real answer
- "Was today a good session?" → compares to baseline, notes recovery state
- "What should I focus on next week?" → looks at muscle group frequency gaps, recovery
- "I don't understand what HRV means" → explains in plain English with user's own numbers

**No fine-tuning needed for v1.** Gemini 2.5 Flash + rich context injection is more than sufficient. Fine-tuning is a v3 problem after you have 50k+ user workout logs.

---

## Architecture

### Backend (server.ts — largely unchanged)
```
Express + SQLite
  /api/workouts         GET, POST, DELETE
  /api/exercises/last   GET (progressive overload context)
  /api/ai/parse-workout POST (text or audio → structured exercises)
  /api/ai/parse-image   POST (camera photo → structured exercises)
  /api/ai/coach         POST (NEW: chat message + history context → coaching response)
  /api/ai/debrief       POST (NEW: full session → AI summary with health context)
```

### Session Model (App)
```
Start Session
  → Transcript: []  (append-only log of everything spoken/typed/photographed)
  → Each entry: { timestamp, method: 'voice'|'text'|'camera', raw: string }

During Workout
  → Wake word / PTT / text / camera → appends to transcript
  → Live transcript panel shows running log (deletable entries)
  → Progressive overload hints shown per-exercise

Finish Session
  → POST /api/ai/parse-workout with full transcript
  → Gemini: parse entire session, handle corrections ("make that 85 not 80"), infer context
  → Review screen (user can edit before saving)
  → Save → PR detection → LOFTE Coach debrief
```

---

## Phase 0 — Native App Scaffold 🔴 NEXT

> iOS Simulator running, calling existing backend. Target: 1-2 days.

- [ ] Xcode installed + iOS Simulator working
- [ ] Apple Developer Account active
- [ ] `npm install -g eas-cli && eas login`
- [ ] `npx create-expo-app@latest lofte-app --template blank-typescript`
- [ ] Monorepo structure: `server/`, `web/`, `app/`
- [ ] `npx expo start --ios` → hot reload confirmed
- [ ] Port `types.ts` from web → app
- [ ] Confirm `fetch('http://localhost:3000/api/workouts')` works from simulator

**Dev workflow from this point:**
```bash
# Terminal 1
npm run dev                        # backend on :3000

# Terminal 2
cd app && npx expo start --ios     # simulator with hot reload
```

---

## Phase A — Core Session Loop (TestFlight v0.1) 🔴

> Full workout session works end-to-end. This is the shippable MVP. Target: 3-5 days.
> Ship to TestFlight BEFORE building anything else. Get feedback first.

- [ ] Session state: Start → active → Finish (ported from web)
- [ ] **PTT voice logging** — tap mic → record via `expo-av` → POST to `/api/ai/parse-workout` → appends to transcript
- [ ] **Text input fallback** — keyboard input → same parse endpoint
- [ ] **Camera logging** — `expo-camera` → POST to `/api/ai/parse-image` → appends to transcript
- [ ] **Live transcript panel** — running log of what's been captured, each entry deletable
- [ ] **Finish flow** — full transcript → Gemini parses session → review/edit screen → save → PR flags + AI debrief
- [ ] **Progressive overload hints** — "Last: 3×10 @ 80kg" shown inline per exercise

**TestFlight path after Phase A:**
```bash
eas build --platform ios --profile preview   # cloud build, no local Xcode needed
eas submit --platform ios                    # submits IPA to TestFlight automatically
```

---

## Phase B — Wake Word 🟠

> Truly hands-free logging. Porcupine runs on-device — privacy-safe. Target: 2-3 days.

- [ ] Integrate Picovoice Porcupine iOS SDK (bare Expo workflow or native module)
- [ ] Create custom "Hey LOFTE" wake word via Picovoice console (free tier)
- [ ] Wake word → activates 8-second recording window → auto-submits on silence
- [ ] Visual: subtle pulsing indicator when LOFTE is listening vs idle
- [ ] Earcon feedback (subtle sound) when log is registered

---

## Phase C — LOFTE Coach 🟠

> Conversational AI that knows your training history. The retention feature. Target: 3-4 days.

- [ ] `POST /api/ai/coach` endpoint — accepts chat history + injects last 90 days workout context
- [ ] Post-workout debrief becomes a **chat thread** (not a static read-only summary)
- [ ] User can follow up: "What should I focus on next week?" "Was this session good?"
- [ ] Standalone **Coach tab** in bottom navigation
- [ ] Chat UI with message bubbles, typing indicator, markdown rendering for lists/bold
- [ ] Context injection: full history + session + PRs + volume trends per muscle group

---

## Phase D — Apple Health Integration 🟡

> Universal — every iPhone has HealthKit. Makes coaching dramatically better. Target: 2-3 days.

- [ ] `@kingstinct/react-native-healthkit` (TypeScript, well-maintained)
- [ ] Request permissions: read workouts, HR, resting HR, HRV, sleep, active energy
- [ ] Read HR timeline during sessions → overlay on workout detail screen
- [ ] Auto-detect gym workout start via HealthKit activity type (optional auto-start)
- [ ] Inject health context into Coach prompt: sleep, HRV, resting HR for last 7 days
- [ ] Dashboard card: "Recovery snapshot" — sleep last night, HRV vs 30-day avg

---

## Phase E — Whoop Integration 🟡

> For serious athletes who track everything. Target: 2-3 days (after Apple Health).

- [ ] Apply at developer.whoop.com (takes a few days to process)
- [ ] OAuth flow in app to connect Whoop account
- [ ] Sync after each workout: recovery %, strain score, sleep performance, HRV
- [ ] Store locally in SQLite alongside workout data
- [ ] Coach prompt injection: "Recovery 34% today — AI flags if volume is too aggressive"
- [ ] Dashboard: Whoop strain vs training volume chart

---

## Phase F — Fast-Tap Logging 🟡 (parallel with D/E)

> For users who won't use voice. 3 taps per set. Target: 2 days.

- [ ] Quick Add panel: last 5 exercises as instant-add cards (float to top automatically)
- [ ] Numpad-style flow: exercise → weight → sets×reps → done (no keyboard)
- [ ] Muscle group filter (Chest / Back / Legs / Shoulders / Arms / Cardio)
- [ ] One-tap repeat last set ("+1 set same weight")

---

## Phase 1 — Bugs Fixed ✅

- [x] Fix `DROP TABLE` bug — exercises no longer wiped on server restart
- [x] Fix Gemini model — `gemini-2.5-flash`
- [x] `.env` setup, API key working
- [x] Voice, text, and camera logging all functional end-to-end

---

## Phase 2 — Gemini Moved to Backend ✅

- [x] `POST /api/ai/parse-workout` — voice + text, server-side
- [x] `POST /api/ai/parse-image` — vision, server-side
- [x] API key removed from browser bundle

---

## Phase 3 — Core Differentiating Features ✅

- [x] **PR Detection** — flags new personal records on save, shown in result modal
- [x] **Progressive Overload Context** — "Last: 3×10 @ 80lbs" inline during active session
- [x] **Post-Workout AI Summary** — Gemini coaching recap after finishing
- [x] **Per-Exercise History** — line chart + session list, tap any exercise in history

---

## Phase 4 — Analytics Depth 🟢

### 4a. Streak Tracker & Calendar Heatmap
- [ ] Track consecutive workout days, current streak on dashboard
- [ ] GitHub-style contribution calendar on history tab

### 4b. 1RM Estimator
- [ ] Brzycki formula: `weight × (36 / (37 - reps))` per exercise
- [ ] Show estimated 1RM on exercise history page
- [ ] Track estimated 1RM trend over time

### 4c. Volume & Intensity Trends
- [ ] Weekly/monthly rollups (not just last 7 sessions)
- [ ] Per-muscle-group volume tracking over time
- [ ] Deload detection ("volume down 40% this week — intentional?")

### 4d. Workout Templates
- [ ] Save session as template
- [ ] Start new session from template (pre-populates exercises)
- [ ] AI-suggested template: "You usually do push on Tuesdays"

---

## Phase 5 — Native Platform Deep Integration 🔵

> Requires validated, regularly-used app first.

### 5a. Apple Watch Companion
- [ ] React Native app with `@kingstinct/react-native-healthkit`
- [ ] Apple Watch: quick log taps on wrist, active session display
- [ ] `HKWorkoutSession` — workout auto-start/stop via HR

### 5b. AirPods Native Controls
- [ ] AirPods Pro stem press → PTT via AVFoundation
- [ ] Double-tap to mark a set complete

### 5c. Lock Screen Widget + Dynamic Island
- [ ] iOS Live Activity for active session (sets logged, time elapsed, last exercise)
- [ ] Lock screen widget to start session without unlocking

### 5d. Siri Shortcuts Integration
- [ ] "Hey Siri, log to LOFTE" → calls `/api/ai/parse-workout`
- [ ] Works via AirPods, Apple Watch, CarPlay, HomePod

---

## Phase 6 — Social Layer 🔵

> Requires user auth first.

- [ ] Apple Sign-In + Google OAuth (lowest friction for gym demographic)
- [ ] User profiles + migrate SQLite → Postgres at this point
- [ ] Follow system + activity feed (friends' PRs, workouts)
- [ ] Shareable workout cards (auto-generated image with stats)
- [ ] Achievements + badges (100 workouts, 10 PRs, etc.)

---

## Phase 7 — Platform Polish 🔵

- [ ] Push notifications: rest timer, streak at risk, friend PR
- [ ] Google Fit sync (Android users)
- [ ] OTA updates via EAS Update (ship JS fixes without App Store review wait)

---

## UI Direction

**Dark mode first.** Gym lighting is dark. Every competitor (Strong, Hevy, Jefit) defaults light — this alone is a visual differentiator.

- **Color palette**: near-black (`#0A0A0A`) background, electric indigo/violet accent for active states, pure white text
- **Typography**: heavy weight for the hero numbers (weight, reps, sets) — these are what users look at
- **Active session screen**: full-screen immersive, minimal chrome — the transcript panel and mic button are everything
- **Haptics**: every log confirmation, every PR, every set added — physical feedback makes it feel alive and responsive
- **Motion**: Reanimated 3 spring animations — transcript entries slide in, PR trophy bounces, session button pulses
- **Inspiration**: if Linear and Strava had a child that lifts — clean, intentional, performance-obsessed

---

## Tech Stack

| Layer | Current (web) | Target (native app) |
|-------|---------|--------|
| Frontend | React 19 + Vite | React Native + Expo SDK 52+ |
| Navigation | Tab-based (custom) | Expo Router (file-based, like Next.js) |
| Backend | Express + SQLite | Express + SQLite → Postgres when social lands |
| AI | Gemini 2.5 Flash | Gemini 2.5 Flash (STT + vision + text + coaching in one model) |
| Voice capture | MediaRecorder (web) | `expo-av` (native) |
| Wake word | None | Porcupine SDK (on-device, custom wake word, privacy-safe) |
| Camera | MediaDevices (web) | `expo-camera` (native) |
| Health data | None | `@kingstinct/react-native-healthkit` |
| Wearables | None | Whoop Dev API + HealthKit |
| Haptics | None | `expo-haptics` |
| Animations | Framer Motion | React Native Reanimated 3 |
| App builds | N/A | EAS Build (cloud, no Xcode required) |
| TestFlight | N/A | EAS Submit (automated) |
| OTA updates | N/A | EAS Update (JS fixes without App Store review) |

---

## Why Gemini Stays the Right AI Choice

The full vision requires all of these in one pipeline:
1. **Audio → structured workout data** (Gemini handles STT + NLP + structured output in one call)
2. **Image → structured workout data** (Gemini Vision — cardio machine displays, weight plates)
3. **Full session transcript → complete structured workout** (long context window handles 2hr sessions)
4. **Coaching conversations** (Gemini text generation with tool use for data queries)

OpenAI alternative = Whisper (STT) + GPT (parsing) = 2 API calls, 2x latency, 2x cost, 2 failure points. Gemini does all four in one model, one call.

---

## Current File Map

```
src/
  App.tsx                      — Main shell, session state, tab routing
  components/
    VoiceRecorder.tsx          — Voice + text → /api/ai/parse-workout
    VisionLogger.tsx           — Camera/image → /api/ai/parse-image
    Dashboard.tsx              — Analytics charts (volume, muscle groups)
    WorkoutList.tsx            — History list, clickable exercises
    WorkoutResultModal.tsx     — PR trophies + AI summary after finishing
    ExerciseHistoryModal.tsx   — Per-exercise line chart + session history
    Modal.tsx                  — Reusable confirm/error dialogs
  types.ts                     — TypeScript interfaces
server.ts                      — Express API + SQLite + Gemini AI routes
PLAN.md                        — This file
```

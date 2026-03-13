# AuraFit — Build Plan

> Voice-first, frictionless workout tracker. Log by speaking, track progressive overload, stand out with AI-powered insights + social layer.
> UX/design is deferred (Figma/Framer later). This plan focuses on functionality only.

---

## Current State Diagnosis

The app is a UI shell. Three critical bugs prevent it from working at all:

| # | Bug | Location | Impact |
|---|-----|----------|--------|
| 1 | `DROP TABLE IF EXISTS exercises` on every server restart | `server.ts:26` | **All exercise data wiped every restart** |
| 2 | Wrong Gemini model name `"gemini-3-flash-preview"` | `VoiceRecorder.tsx`, `VisionLogger.tsx` | **All AI calls throw API errors** |
| 3 | No `.env` file set up | root | **API key is undefined → Gemini calls fail** |

These must be fixed before anything else.

---

## Phase 1 — Fix Critical Bugs (Blockers) 🔴

- [x] Fix `DROP TABLE` bug in `server.ts` → use `CREATE TABLE IF NOT EXISTS` with safe migration
- [x] Fix Gemini model name → use `gemini-2.0-flash`
- [x] Create `.env` file (add your real `GEMINI_API_KEY`)
- [ ] Test voice → Gemini → parse → save → reload end-to-end ← **you do this**
- [ ] Test image capture → Gemini → parse → save end-to-end ← **you do this**

---

## Phase 2 — Move AI Processing to Backend 🟠

Right now Gemini API calls are in frontend components (API key baked into browser bundle via Vite `define`). Works for AI Studio, but for any real deployment this exposes the key.

Move AI logic to backend so:
- API key stays server-side
- Easier to add retry logic, caching, rate limiting later
- Frontend stays thin

**New backend routes:**

- [x] `POST /api/ai/parse-workout` — accepts `{ text }` or `{ audioBase64, mimeType }`, returns parsed exercises
- [x] `POST /api/ai/parse-image` — accepts `{ imageBase64 }`, returns parsed exercises
- [x] Frontend: `VoiceRecorder.tsx` calls `/api/ai/parse-workout` via fetch
- [x] Frontend: `VisionLogger.tsx` calls `/api/ai/parse-image` via fetch
- [x] Removed `GEMINI_API_KEY` from Vite bundle — key is server-side only

---

## Phase 3 — Core Differentiating Features 🟡

These are what make AuraFit more than just a logger. Build in this order:

### 3a. PR Detection
When saving a workout, auto-detect if any set is a personal best (highest weight for that exercise name ever).

- [ ] `GET /api/exercises/:name/prs` — returns best weight, best volume, best reps for an exercise
- [ ] On `POST /api/workouts`, compare each exercise against historical bests → flag PRs in response
- [ ] Frontend: show PR badge/animation on session complete when new PR is detected

### 3b. Progressive Overload Context (inline during logging)
While a user is in an active session, show what they did last time for each exercise already in the session.

- [ ] `GET /api/exercises/:name/last` — returns the most recent sets/reps/weight for that exercise
- [ ] Frontend: show "last time: 3x10 @ 80kg" inline in the exercise list during active session

### 3c. Post-Workout AI Summary
After finishing a workout, Gemini generates a 2-3 sentence summary (what you did, any PRs, suggestions).

- [ ] `POST /api/workouts/:id/summary` — calls Gemini with full workout data, returns summary text
- [ ] Frontend: show summary card after saving workout (dismissable)

### 3d. Per-Exercise History Drill-Down
Tap any exercise in workout history to see its full volume/weight progression over time.

- [ ] `GET /api/exercises/:name/history` — returns all logged sets for that exercise across workouts, sorted by date
- [ ] Frontend: exercise detail modal or page with a simple line chart (weight over time, volume over time)

---

## Phase 4 — Growth Features 🟢 (After Core is Solid)

These are the social/retention layer. Auth is required for most of these.

### 4a. Streak Tracker & Calendar Heatmap
- [ ] Track consecutive workout days, show current streak on dashboard
- [ ] Calendar heatmap view on history tab

### 4b. 1RM Estimator
- [ ] Auto-calculate estimated 1-rep max using Brzycki formula: `weight × (36 / (37 - reps))`
- [ ] Show on per-exercise history page

### 4c. Exercise Autocomplete / Library
- [ ] Integrate [wger REST API](https://wger.de/api/v2/) or hardcode a curated list of 200 exercises
- [ ] Autocomplete in text mode + voice transcript correction

### 4d. Workout Templates
- [ ] Save a session as a template
- [ ] Start a new session from a template (pre-populates exercises)

### 4e. Rest Timer (voice-triggered)
- [ ] Countdown timer between sets
- [ ] Say "start timer" or tap to start
- [ ] Audio/vibration alert when rest is done

### 4f. User Auth (prerequisite for social)
- [ ] Decision needed: OAuth (Google/Apple) vs email/password
- [ ] User profiles stored in DB

### 4g. Social Layer
- [ ] Follow/friends system
- [ ] Activity feed (friends' workouts, PRs)
- [ ] Shareable workout cards (auto-generated image)
- [ ] Achievements & badges

---

## Phase 5 — Platform & Polish 🔵 (After UX Redesign in Figma)

- [ ] PWA manifest + service worker for offline queuing
- [ ] Push notifications (rest timer done, friend PR, streak reminder)
- [ ] Apple HealthKit / Google Fit sync
- [ ] Dark mode

---

## Tech Decisions Log

| Decision | Choice | Reason |
|----------|--------|--------|
| Database | SQLite (better-sqlite3) | Simple MVP, easy migration to Postgres later |
| AI | Google Gemini 2.5 Flash | Already integrated, fast, multimodal (audio + vision) |
| Auth (future) | TBD — Google OAuth recommended | Lowest friction for gym demographic |
| Social DB | Extend existing SQLite or migrate to Postgres | Decide when social work starts |

---

## Current File Map

```
src/
  App.tsx               — Main shell, session state, tab routing
  components/
    VoiceRecorder.tsx   — Voice + text input → Gemini AI (needs backend move)
    VisionLogger.tsx    — Camera/image → Gemini Vision (needs backend move)
    Dashboard.tsx       — Analytics charts (volume, muscle groups)
    WorkoutList.tsx     — History list with delete
    Modal.tsx           — Reusable confirm/error modals
  types.ts              — TypeScript interfaces
server.ts               — Express API + SQLite + Vite middleware
```

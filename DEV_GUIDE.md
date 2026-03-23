# LOFTE — Dev Guide

Quick reference for every session. Keep this open.

---

## Project Structure

```
LOFTE/
  server.ts          ← Express backend (AI + SQLite API)
  src/               ← Web app (React, for reference only)
  app/               ← Native iOS app (Expo — this is what ships)
  PLAN.md            ← Full build plan with phases
  DEV_GUIDE.md       ← This file
```

---

## Starting the Dev Environment

Every session needs two terminals open simultaneously.

**Terminal 1 — Backend**
```bash
cd /Users/harsh/SportsTech/Frictionless-Workout-Tracker-SportsTech-MVP
npm run dev
```
Backend runs at `http://localhost:3000`

**Terminal 2 — iOS App**
```bash
cd /Users/harsh/SportsTech/Frictionless-Workout-Tracker-SportsTech-MVP/app
npx expo start --ios
```
iOS Simulator opens with hot reload. Every file save updates the app instantly.

> If simulator is already open, just press `i` in the Expo terminal to relaunch it.

**IMPORTANT — when to use which command:**
- `npx expo start --ios` → use this 95% of the time (fast, seconds)
- `npx expo run:ios` → only when you install a NEW native package (slow, ~8 min compile)
- `rm -rf ios && npx expo run:ios` → only if the build is broken and needs a full reset

---

## Git — Push to Your Repo

Do this manually whenever you want to checkpoint your work.

```bash
cd /Users/harsh/SportsTech/Frictionless-Workout-Tracker-SportsTech-MVP
git add -p                          # review what you're staging (recommended)
# or
git add .                           # stage everything
git commit -m "your message here"
git push origin main
```

Remote: `https://github.com/SoHarshh/lofte-v2`
Team repo (read-only reference): `team-origin`

---

## Build & Deploy to TestFlight

Run from inside the `app/` directory.

```bash
cd app

# Build IPA in the cloud (no local Xcode compile needed)
eas build --platform ios --profile preview

# Submit to TestFlight once build is done
eas submit --platform ios
```

First build takes ~10-15 min (cloud). Subsequent builds are faster.
Requires: Apple Developer Account active at developer.apple.com ($99/year)

---

## Environment Variables

Backend needs a `.env` file at the project root:
```
GEMINI_API_KEY=your_key_here
```
Already gitignored — never gets pushed.

---

## API Endpoints (Backend)

| Method | Endpoint | What it does |
|--------|----------|-------------|
| GET | `/api/workouts` | All workouts with exercises |
| POST | `/api/workouts` | Save workout, returns PRs detected |
| DELETE | `/api/workouts/:id` | Delete a workout |
| GET | `/api/exercises/last?name=X` | Last performance for progressive overload |
| POST | `/api/ai/parse-workout` | Text or audio → structured exercises |
| POST | `/api/ai/parse-image` | Photo → structured exercises |

---

## Phase Checklist

### ✅ Phase 1 — Bugs Fixed
- DB stable, Gemini model correct, env working, all log modes functional

### ✅ Phase 2 — Gemini on Backend
- API key secured server-side, parse-workout + parse-image endpoints live

### ✅ Phase 3 — Core Differentiators (Web)
- PR detection, progressive overload hints, AI debrief, exercise history charts

### ✅ Phase 0 — Native App Scaffold
- Expo app created in `app/`, iOS Simulator running with hot reload
- EAS CLI installed and logged in

### ✅ Phase A — Core Session Loop
- [x] Tab navigation: Dashboard / History / Active Session
- [x] Port types.ts
- [x] Text input → `/api/ai/parse-workout`
- [x] Camera logging → `/api/ai/parse-image` (real device) / photo library (simulator)
- [x] Live transcript panel (running log, deletable entries)
- [x] Finish flow → review screen → save
- [x] Progressive overload hints inline
- [x] PR flags + AI debrief on finish
- [x] Voice PTT via expo-audio (hold mic button)
- [x] UI overhaul: Dashboard with bar chart + muscle group bars, History with tags, Session immersive dark mode

### 🟠 Phase B — Wake Word
- [ ] Porcupine SDK integrated
- [ ] "Hey LOFTE" custom wake word
- [ ] 8-second recording window with visual indicator

### 🟠 Phase C — LOFTE Coach
- [ ] `/api/ai/coach` endpoint
- [ ] Chat UI with full history context
- [ ] Post-workout debrief becomes a conversation

### 🟡 Phase D — Apple Health
- [ ] react-native-healthkit integrated
- [ ] HR, sleep, HRV read and displayed
- [ ] Context injected into coaching prompts

### 🟡 Phase E — Whoop
- [ ] OAuth flow + API sync
- [ ] Recovery/strain data in coaching

### 🟡 Phase F — Fast-Tap Logging
- [ ] Quick Add panel with recent exercises
- [ ] Numpad-style 3-tap flow

---

## Useful Commands

```bash
# Check what's changed locally vs last commit
git status
git diff

# See full commit history
git log --oneline

# Install a new package in the Expo app
cd app && npx expo install <package-name>

# Check backend is running
curl http://localhost:3000/api/workouts

# EAS account info
eas whoami
```

---

## Notes
- Always use `npx expo install` (not `npm install`) for Expo packages — it pins the correct compatible version
- The simulator's network calls to `localhost:3000` work because it shares the Mac's network
- On a real device, replace `localhost` with your Mac's local IP (e.g. `192.168.x.x`)

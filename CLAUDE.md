# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**LOFTE** — an AI-first workout logging iOS app. The core premise: eliminate friction by letting users log via voice, camera, or quick manual tap. An AI coach ("Nyx") provides personalized coaching with persistent memory.

Two separate packages: an Express backend (root) and a React Native/Expo app (`/app`).

## Commands

### Backend (root)
```bash
npm run dev        # Start Express server on :3000 (tsx watch mode)
npm run lint       # TypeScript type check (tsc --noEmit)
```

### App (`/app`)
```bash
npm start          # expo start (dev server)
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
```

No test suite exists yet.

## Architecture

### Backend (`server.ts`)
Single-file Express server with all API routes. Auth via Clerk JWT (`verifyToken()` on every route). Storage is dual-mode: Supabase (primary) or local SQLite (`workouts.db`) as fallback — checked at startup via env vars.

AI pipeline:
- **Voice**: client sends audio → OpenAI Whisper (transcription) → GPT-4o-mini (exercise parsing). Whisper hallucination filter catches silent audio.
- **Camera**: client sends base64 image → Gemini Vision (exercise parsing)
- **Coach (Nyx)**: Gemini 2.5 Flash with full workout history + persistent chat memory from `nyx_messages` table. System prompt adapts based on new user vs returning user with history.
- **Transcribe**: Whisper-only endpoint (`/api/ai/transcribe`) for coach voice input — no exercise parsing, cheaper.

**Calorie calculation**: On workout save, `calculateCalories()` uses MET values per exercise/muscle group × bodyweight × session duration. Stored on each exercise row. Bodyweight read from client (`bodyWeightKg` param, default 70kg).

All DB queries filter by `user_id` extracted from the verified JWT — multi-tenant safe.

Key endpoints:
- `POST /api/ai/parse-workout` — audio/text → structured exercises JSON
- `POST /api/ai/parse-image` — image → structured exercises JSON
- `POST /api/ai/transcribe` — audio → text only (Whisper, no parsing)
- `GET/POST /api/workouts` — history fetch / save + auto PR detection + calorie calculation
- `DELETE /api/workouts/:id` — delete a workout
- `GET /api/exercises/last` — last performance for an exercise (progressive overload)
- `GET /api/exercises/history` — full history for an exercise
- `POST /api/workouts/:id/summary` — post-workout Nyx debrief
- `POST /api/ai/coach` — Nyx coach chat (loads history from DB, saves messages, multimodal image support)
- `DELETE /api/coach/history` — clear Nyx chat memory
- `GET /api/user/profile` — returns the athlete's `user_profile` row
- `POST /api/user/profile` — partial upsert of profile fields (email, name, avatar, dob, sex, height_cm, weight_kg). Called once on every signed-in app mount via `useUserProfile`.
- `POST /api/user/profile/health-connected` — stamps `health_connected_at` with NOW() when `{connected: true}`, or clears it when `{connected: false}`. Fired automatically via `subscribeHealthConnection` whenever the user connects or disconnects Apple Health anywhere in the app.
- `POST /api/health/metrics` — upsert last 14d of HealthKit metrics (fed by `useHealthSync`)
- `GET /api/health/summary` — range + averages for Nyx
- `DELETE /api/account` — full account deletion (App Store 5.1.1(v) compliance). Cascades into `user_profile` too.

### Database (Supabase)
Tables:
- `workouts` — id, date, notes, user_id (RLS enabled, service_role policy)
- `exercises` — id, workout_id, name, muscle_group, sets, reps, weight, distance, duration, calories, pace, notes
- `nyx_messages` — id, user_id, role ('user'|'model'), content, created_at (RLS enabled, service_role policy)
- `health_metrics` — user_id, date, steps, active_energy_kcal, resting_heart_rate, hrv_ms, sleep_hours, body_weight_kg, synced_at. Unique on (user_id, date). Written by the app's `useHealthSync` hook on focus/foreground.
- `user_profile` — user_id (PK), email, first_name, last_name, avatar_url, dob, sex, height_cm, weight_kg, health_connected_at, created_at, updated_at. RLS + service_role policy. Populated automatically from Clerk on every signed-in mount (email/name/avatar) via `useUserProfile`. The `health_connected_at` timestamp tracks who has actually granted HealthKit access.
- `workouts.avg_hr`, `workouts.max_hr` — populated after session save by querying HealthKit HR samples for the workout window.

### App (`/app`)
React Native + Expo SDK 55, iOS-primary. Navigation is React Navigation v6 bottom tabs. No global state management — all state is local `useState`, with session state lifted to `App.tsx`.

Critical architectural pattern: **session state is mirrored in a ref** (`sessionRef.current`) because audio recording callbacks are async closures that can't see updated React state. The ref is the source of truth inside callbacks; state drives the UI.

Screen layout:
- `App.tsx` — root; owns session state + nav; floating tab bar + Coach FAB; FadeScreen wrapper (180ms); loads Inter + Fraunces font families at startup via `useFonts` gate
- `src/screens/DashboardScreen.tsx` — stats circles (Sessions, Volume, Streak, Calories), Start Workout CTA (only screen still using Fraunces serif for the circle text), Last Workout card, Coach insight, weekly chart, Apple Health "Today" tile (Steps/Active Cal/Resting HR/Sleep when connected).
- `src/screens/SessionScreen.tsx` — workout logging (voice PTT, camera, manual entry). Set merging, progressive overload hints, per-exercise notes. On Finish: instant review sheet → background save → push to Apple Health as HKWorkout → query HR samples → PATCH workout with avg/max HR.
- `src/screens/HistoryScreen.tsx` — workout history with filters. Centered "HISTORY" title matching Health tab header pattern.
- `src/screens/ProfileScreen.tsx` — avatar (tap to change: Take Photo / Library / Remove, persists via Clerk `user.setProfileImage`), stats grid, units toggle, Apple Health toggle (Switch wired to `useHealthConnection` — shared with Biology screen's overlay), Whoop "Soon", account section.
- `src/screens/CoachScreen.tsx` — Nyx AI coach chat. Voice + text + image input. Nyx has access to workout history AND Apple Health metrics (HRV/RHR/sleep/steps/cal/session HR) via backend context.
- `src/screens/CalorieDetailScreen.tsx` — reached from Dashboard Calories circle. Compact one-screen layout (no scroll): side-by-side ring + trend pill + session count, W/M/Y bar chart (compact mode), collapsed Daily Goal + Body Weight edit rows. **Fed only by workout logs** (not HealthKit) — updates via `useFocusEffect(load)` whenever the screen is focused.
- `src/screens/CalendarScreen.tsx` — monthly grid, dots on workout days, tap for day summary.
- `src/screens/BiologyScreen.tsx` — **Health tab** (route name "Health", tab icon `pulse`/`pulse-outline`). Two views: Home (hero HRV with 24-hour sparkline, day-over-day delta, Activity rings, Resting HR + Sleep tiles with live indicators) and MetricDetail (full drill-down with D/W/M/Y period selector, tap-to-scrub line/bar charts, About/Range/High/Low info cards). Left/right arrows on the header step through days. Intro animations play once per JS session via module-scoped `HOME_INTRO_PLAYED` flag. When the user hasn't granted HealthKit access, a `ConnectHealthOverlay` covers both layers with a "Connect Apple Health" CTA; on grant, hooks auto-refetch and overlay dismisses.
- `src/screens/LoginScreen.tsx` — OAuth (Apple/Google via Clerk SSO), email sign-in/up, forgot password. LOFTE wordmark kept in Georgia. Email auth still has Clerk SDK v3 issues.

Component library (`src/components/`):
- `HealthCard`, `SmoothSparkline` (with `alive` prop for live-feel pulse), `RingProgress` (accepts `delay` for staggered intros), `MetricBarChart` (scaleY native-driver animation, accepts `delay`), `MetricLineChart` (tap/drag scrubbing + inline value badge), `DailyPagedChart` (horizontal paging through 14 lazy-fetched days, picks line for hrv/hr and bars for sleep/steps/cal)
- `ConnectHealthOverlay` — full-tab overlay on the Health screen when HealthKit isn't granted. Renders our `bg.png` + BlurView frost, Apple Health icon, perk pills (Heart rate / Activity / Sleep), white "Connect" CTA
- `GlassCard`, `AnimatedRing`, `ExercisePicker`, `AppBackground`

Hooks (`src/hooks/`):
- `useAuthFetch` — wraps fetch with Clerk Bearer token
- `useHealthSync` — on focus/foreground, reads today's metrics from HealthKit and backfills the last 14 days to `/api/health/metrics` so Nyx has fresh history. Also listens via `subscribeHealthConnection` so it re-syncs the instant the user connects. Used by Dashboard for its "Today" tile.
- `useHealthConnection` — live SecureStore-backed connection state with module-level pub/sub. Consumed by Biology overlay + Profile toggle so both stay in sync without polling. Returns `{ connected, ready, connect(), disconnect() }`.
- `useHealthDay(date)` — single-day bundle for the Health home (summary numbers, hourly HRV/HR curves, HR and Sleep tile sparklines, day-over-day HRV delta). Re-fetches whenever `connected` flips.
- `useMetricSeries(metric, period, anchor)` — W/M/Y aggregates from HealthKit (summed for steps/cal/sleep, averaged for hrv/hr). Also re-fetches on connection flip.
- `useUserProfile` — mounted at app root. Upserts the Clerk user (email, name, avatar) into the backend `user_profile` table on every signed-in mount, and subscribes to connection changes so `health_connected_at` auto-stamps when Apple Health is granted/revoked anywhere.

Utilities (`src/utils/`):
- `units.ts` — `useUnits()`, `displayWeight()`, `toLbs()`, `unitLabel()`. DB always stores lbs; frontend converts on display.
- `fonts.ts` — `FONT_LIGHT/REGULAR/MEDIUM/SEMIBOLD/BOLD` (Inter) and `HEADING_*` (Fraunces). Inter is used everywhere except the Dashboard "Start Workout" CTA (Fraunces Light) and the Login LOFTE wordmark (Georgia inline).
- `health.ts` — HealthKit wrappers: `requestHealthPermissions`, `getTodayMetrics`, `fetchDayMetrics`, `fetchHourlyHRV/HR/Steps/ActiveEnergy`, `fetchDailyRange`, `getHeartRateForWindow`, `saveWorkoutToHealth`, `mapMuscleGroupToActivity`, permission/connection helpers (SecureStore-backed flag). Also exports `subscribeHealthConnection` pub/sub + `useHealthConnection` hook so connection state stays live across screens.

Data (`src/data/`):
- `exercises.ts` — 70+ exercise templates
- `healthMetrics.ts` — config only (title, unit, about/range/high/low copy for each metric). No mock generators — all runtime numbers come from HealthKit.

UI style: dark glassmorphism with `expo-blur` BlurView + rgba backgrounds. Typography is Inter for everything (uppercase Medium 500 with 1.4 letter-spacing for screen titles). Fraunces only on "Start Workout" CTA. Georgia only on the LOFTE Login wordmark. Hidden tab screens (Session, Coach, CalorieDetail, Calendar) hide the floating tab bar.

## Environment Variables

### Root `.env`
```
GEMINI_API_KEY=          # Google AI Studio (Gemini 2.5 Flash)
OPENAI_API_KEY=          # OpenAI Whisper transcription
SUPABASE_URL=            # Supabase project URL
SUPABASE_SERVICE_KEY=    # Supabase service role key (backend only)
APP_URL=                 # Backend URL
```

### `/app/.env`
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=   # Clerk public key
```
Backend also needs `CLERK_SECRET_KEY` (set in Railway env, not in `.env`).

## Deployment

- **Backend**: Railway, auto-deploys on push to `main`
- **App**: EAS Build → TestFlight. Bundle ID: `com.nilsharsh.lofte`

To trigger a TestFlight build:
```bash
cd app && eas build --platform ios --profile preview
```

## Key Patterns

**Optimistic UI**: Transcript items and manual exercise entries appear instantly in the session. AI parsing results backfill asynchronously — the UI updates when the promise resolves, not when the user acts.

**Set merging**: When logging multiple sets of the same exercise manually, they group into one transcript entry as a tree (Exercise Name → Set 1, Set 2, Set 3...) instead of separate cards.

**Progressive overload hints**: After each exercise is selected, the app fetches the user's last performance in the background. Shows "Last: X reps @ Y lbs/kg" below the exercise name.

**Calorie calculation**: Backend computes calories on save using MET values (compound lifts ~6.0, isolation ~3.5, cardio varies). Formula: `MET × bodyWeightKg × durationHours`. Pre-existing calories from camera-parsed gym machines are preserved.

**Unit system**: DB always stores weights in lbs. Frontend reads `units_kg` from SecureStore and converts for display using `displayWeight()`. Input converts back via `toLbs()` before saving. Toggle in Profile → Preferences.

**Nyx memory**: Chat history stored in `nyx_messages` Supabase table per user. Backend loads last 30 messages as Gemini context on each request. Frontend UI appears fresh each session (empty state with starters) but Nyx remembers everything. System prompt adapts: new user gets onboarding, returning user gets continuity. Nyx verifies past injuries/preferences instead of assuming they still apply.

**Whisper hallucination filter**: Silent audio through Whisper produces phantom text ("Thank you for watching", Japanese phrases, etc.). A blocklist + short-output heuristic catches these and returns empty text.

**Dual-storage fallback**: If `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are absent, the server switches to SQLite. Useful for local dev without Supabase credentials.

**patch-package**: The app uses `patch-package` (runs on `postinstall`) to patch Expo packages. Patches live in `app/patches/`.

**Apple Health integration**: Native module `react-native-health` via Expo config plugin. On iOS, `isHealthAvailable()` returns true, toggle in Profile calls `requestHealthPermissions()` which asks for all 5 metric categories + workouts. Every LOFTE workout pushes to HealthKit. Health screen reads directly from HealthKit per-render — nothing is cached in the app. Backend `health_metrics` is just for Nyx context (not a display source).

**Font loading**: `@expo-google-fonts/inter` + `@expo-google-fonts/fraunces` register 10 weight families via `useFonts` in `App.tsx`. App shows a loading spinner until both families resolve (~100ms). Adding/removing weights = change the imports in `App.tsx` + keep postscript names in `fonts.ts` in sync.

**Health tab "animate once" rule**: module-scoped `HOME_INTRO_PLAYED` flag + `AnimateContext` make the Home's staggered fade-ups, number count-ups, ring sweeps, and sparkline draw-ins play exactly once per JS session. MetricDetail screens always re-animate on open (that's UI feedback for the user's tap).

**Data-source split (architectural decision, locked in)**:
- **Health tab (BiologyScreen)** → strictly Apple Health. Never mix in workout logs. If HealthKit has no data for a metric, render `—`. If permissions aren't granted, render the dashboard behind a `ConnectHealthOverlay`.
- **Calorie detail screen + Dashboard calorie circle** → strictly workout logs from `/api/workouts`. Never reads Apple Health. Ensures immediate feedback after a session save (via `useFocusEffect(load)`). All date comparisons use UTC-midnight anchors + `setUTCDate` arithmetic so keys line up with stored workout `date` (`slice(0, 10)` in UTC).
- **Nyx (coach endpoint)** → the only place all three sources merge. Backend `/api/ai/coach` injects three blocks: `ATHLETE PROFILE` (from `user_profile` — name, email, age, sex, height, weight), `RECOVERY & BODY` (14 days from `health_metrics` with week-over-week deltas), and `Session HR (14d)` (from `workouts.avg_hr`/`max_hr`).

When adding new surfaces, decide the data source up front. Don't blend.

**Apple Health connection state (single source of truth)**:
- Stored in SecureStore key `health_connected`. Mutations funnel through `setHealthConnected()` which fires all module-level listeners.
- `useHealthConnection` hook subscribes and exposes `{connected, ready, connect(), disconnect()}`. Used by both Biology (to toggle the overlay) and Profile (for the Apple Health switch). Flipping one updates the other instantly.
- `useHealthDay`, `useMetricSeries`, `useHealthSync`, and `useUserProfile` all react to connection changes — metrics auto-refetch, backend syncs, and `health_connected_at` auto-stamps on `user_profile`.

## Known Issues

- **Email auth (Clerk)**: Manual email sign-in/sign-up has issues with `@clerk/expo` v3 signal-based API. OAuth (Apple/Google) works perfectly. Needs a full rewrite using `clerk.client.signIn`/`clerk.client.signUp` patterns. Deprioritized.
- **Backfill calories**: Workouts saved before calorie calculation was added have `calories: null`. They display as 0 — no backfill migration exists yet.
- **Simulator Apple Health**: The toggle flow works in the iOS simulator but almost no real data exists there (no HRV, no RHR, no sleep). For real testing, use a physical iPhone ideally paired with an Apple Watch.
- **Native rebuild triggers**: Any change to `package.json` that adds/removes a native module (react-native-health, @react-native-masked-view/masked-view, expo-font with Google Fonts, expo-apple-authentication) requires `npx expo run:ios --device` or a fresh EAS build. JS-only changes hot reload.

## Working With This Codebase

- Never commit or push — always give Harsh the command to run himself.
- Commit messages: short, direct, no AI co-author lines.
- Backend changes require push + Railway redeploy to take effect (sim hits production Railway URL).
- Frontend-only changes hot-reload in the simulator immediately.
- Supabase schema changes: give SQL to paste in the Supabase SQL editor. Always include RLS policy for new tables.

# AuraFit — Frictionless Workout Tracker

Voice-first workout tracking for athletes who refuse to break their flow state. Speak your set, AI logs it instantly.

## What's Working

| Feature | Status |
|---------|--------|
| Text input → AI parse → save | ✅ |
| Voice recording → AI transcribe + parse → save | ✅ |
| Camera capture → AI Vision analyze → save | ✅ |
| Workout history (persists across restarts) | ✅ |
| Dashboard — volume trend + muscle group charts | ✅ |
| Delete workouts | ✅ |

## Tech Stack

- **Frontend:** React 19 + TypeScript + Tailwind CSS + Vite
- **Backend:** Express + TypeScript (TSX)
- **Database:** SQLite (better-sqlite3)
- **AI:** Google Gemini 2.5 Flash (audio + vision in one call)

## Running Locally

**Prerequisites:** Node.js 18+

**1. Clone and install**
```bash
git clone https://github.com/aeroanish1/Frictionless-Workout-Tracker-SportsTech-MVP.git
cd Frictionless-Workout-Tracker-SportsTech-MVP
npm install
```

**2. Add your Gemini API key**

Create a `.env` file in the root:
```
GEMINI_API_KEY=your_key_here
```

Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

> Note: The free tier gives 1500 requests/day. If you get a 429 error, generate a fresh key — new keys come with a full quota.

**3. Start the dev server**
```bash
npm run dev
```

App runs at **http://localhost:3000**

## How to Use

**Logging a workout:**
1. Go to the **Log** tab
2. Hit **Start Session**
3. Choose your input method:
   - **Voice** — tap the mic, speak naturally: *"bench press 3 sets of 10 at 80kg"*
   - **Text** — type it out in the same natural format
   - **Vision** — open camera, point at a gym machine summary screen, capture
4. Review the parsed exercises added to your session
5. Hit **Finish** to save

**Viewing history:**
- **History** tab shows all past workouts with exercise details
- Hover over a workout to reveal the delete button

**Analytics:**
- **Dashboard** tab shows volume trend (last 7 workouts) and muscle group distribution

## Project Structure

```
src/
  App.tsx                  — Main shell, session state, tab routing
  components/
    VoiceRecorder.tsx      — Voice + text input → Gemini AI
    VisionLogger.tsx       — Camera/image → Gemini Vision
    Dashboard.tsx          — Analytics charts
    WorkoutList.tsx        — History list
    Modal.tsx              — Confirm/error dialogs
  types.ts                 — TypeScript interfaces
server.ts                  — Express API + SQLite
PLAN.md                    — Full build roadmap
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workouts` | Fetch all workouts with exercises |
| POST | `/api/workouts` | Save a new workout |
| DELETE | `/api/workouts/:id` | Delete a workout |

## Roadmap

See [PLAN.md](./PLAN.md) for the full phased build plan.

**Up next:**
- PR detection (auto-flag personal bests on save)
- Progressive overload context (show last session's numbers while logging)
- Post-workout AI summary
- Per-exercise history drill-down

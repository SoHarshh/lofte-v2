# Remotion Promo Animation — Design Spec

## Context
A 25-second promotional animation for LOFTE built with Remotion, intended for pitch deck presentations (16:9 format).

## Visual Direction
- **Background:** `#050B14` (dark navy)
- **Accent:** `#22C55E` (green — replaces app's red for the promo)
- **Text:** white with varying opacities
- **Font:** Georgia serif for display text, system sans-serif for UI labels
- **Mood:** premium, minimal, athletic

## Format
- **Duration:** 25 seconds (750 frames at 30fps)
- **Aspect ratio:** 16:9 (1920×1080)
- **Framework:** Remotion standalone project in `/remotion/` at repo root

## Storyboard

### Scene 1 — Intro (0s–3s, frames 0–90)
- Black screen fades in
- "LOFTE" appears letter by letter with a slow fade, wide letter-spacing
- Thin horizontal rule slides in below
- Tagline fades in: "TRAIN SMARTER"

### Scene 2 — Dashboard (3s–8s, frames 90–240)
- Phone mockup slides up from bottom
- Dashboard screen renders inside: streak counter counts up, weekly bar chart bars grow one by one
- Label annotation fades in: "Your training at a glance"

### Scene 3 — Voice Log / Hero (8s–16s, frames 240–480)
- Screen transitions to Session screen
- Mic button pulses green with sonar rings
- Waveform animates
- Transcript text types out: `"3 sets bench press 100 lbs"`
- Parsed exercise card slides in below
- Label annotation: "Log workouts in seconds — just speak"

### Scene 4 — Nyx AI Coach (16s–22s, frames 480–660)
- Screen transitions to Coach screen
- Message bubbles appear with typing indicator
- AI response types out (short, 1 line)
- Label annotation: "Your personal AI coach"

### Scene 5 — End Card (22s–25s, frames 660–750)
- Phone fades out
- "LOFTE" fades back in centered, larger
- Green rule
- Tagline: "TRAIN SMARTER"
- Slow fade to black

## Project Structure
```
remotion/
  package.json
  tsconfig.json
  src/
    index.ts          # registerRoot
    Root.tsx          # Composition definition
    scenes/
      Intro.tsx
      Dashboard.tsx
      VoiceLog.tsx
      Coach.tsx
      EndCard.tsx
    components/
      PhoneMockup.tsx  # reusable phone frame
      Label.tsx        # annotation label
    tokens.ts         # colors, fonts, timing constants
```

## Timing Constants
All timings defined in `tokens.ts` as frame numbers (30fps):
- `SCENE_INTRO`: 0–90
- `SCENE_DASHBOARD`: 90–240
- `SCENE_VOICE`: 240–480
- `SCENE_COACH`: 480–660
- `SCENE_END`: 660–750

## Dependencies
- `remotion`, `@remotion/player`, `@remotion/cli`
- `react`, `react-dom`
- TypeScript

# Remotion Promo Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 25-second 16:9 Remotion promo animation for LOFTE pitch deck, showing Dashboard → Voice Log → AI Coach scenes.

**Architecture:** Standalone Remotion project in `/remotion/` at repo root. Each scene is an isolated React component receiving a `from` frame offset. A shared `tokens.ts` defines all timing, colors, and fonts. The `Root.tsx` wires scenes together using Remotion `<Sequence>`.

**Tech Stack:** Remotion 4.x, React 18, TypeScript

---

## File Map

| File | Responsibility |
|---|---|
| `remotion/package.json` | Remotion deps, scripts |
| `remotion/tsconfig.json` | TS config for Remotion |
| `remotion/src/tokens.ts` | Colors, timing constants, font definitions |
| `remotion/src/Root.tsx` | Composition registration, `<Sequence>` wiring |
| `remotion/src/index.ts` | `registerRoot` entry point |
| `remotion/src/components/PhoneMockup.tsx` | Reusable phone frame (border-radius, shadow, screen slot) |
| `remotion/src/components/Label.tsx` | Animated annotation label that fades in |
| `remotion/src/scenes/Intro.tsx` | Logo letter-by-letter, tagline fade |
| `remotion/src/scenes/Dashboard.tsx` | Phone slides up, streak counter, bar chart |
| `remotion/src/scenes/VoiceLog.tsx` | Mic pulse, waveform, transcript type-out, exercise card |
| `remotion/src/scenes/Coach.tsx` | Chat bubbles appear, AI response types |
| `remotion/src/scenes/EndCard.tsx` | Logo + tagline fade, fade to black |

---

## Task 1: Scaffold Remotion project

**Files:**
- Create: `remotion/package.json`
- Create: `remotion/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "lofte-promo",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "remotion studio",
    "build": "remotion render src/index.ts LoFTE --output out/lofte-promo.mp4"
  },
  "dependencies": {
    "@remotion/cli": "4.0.288",
    "@remotion/player": "4.0.288",
    "remotion": "4.0.288",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/react": "18.3.1",
    "@types/react-dom": "18.3.1",
    "typescript": "5.4.5"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd remotion && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 4: Commit**

```bash
git add remotion/package.json remotion/tsconfig.json remotion/package-lock.json
git commit -m "chore: scaffold remotion project"
```

---

## Task 2: Tokens

**Files:**
- Create: `remotion/src/tokens.ts`

- [ ] **Step 1: Create tokens.ts**

```ts
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 750; // 25s × 30fps

// Colors
export const BG = '#050B14';
export const ACCENT = '#22C55E';
export const WHITE = '#FFFFFF';
export const WHITE_DIM = 'rgba(255,255,255,0.45)';
export const WHITE_FAINT = 'rgba(255,255,255,0.18)';

// Fonts
export const SERIF = 'Georgia, serif';
export const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// Scene boundaries (frame numbers)
export const SCENES = {
  intro:     { start: 0,   end: 90  }, // 0s–3s
  dashboard: { start: 90,  end: 240 }, // 3s–8s
  voice:     { start: 240, end: 480 }, // 8s–16s
  coach:     { start: 480, end: 660 }, // 16s–22s
  end:       { start: 660, end: 750 }, // 22s–25s
};
```

- [ ] **Step 2: Commit**

```bash
git add remotion/src/tokens.ts
git commit -m "feat(remotion): add design tokens"
```

---

## Task 3: PhoneMockup component

**Files:**
- Create: `remotion/src/components/PhoneMockup.tsx`

- [ ] **Step 1: Create PhoneMockup.tsx**

```tsx
import React from 'react';
import { WHITE_FAINT } from '../tokens';

interface Props {
  children: React.ReactNode;
  width?: number;
}

export const PhoneMockup: React.FC<Props> = ({ children, width = 320 }) => {
  const height = width * 2.16; // ~iPhone aspect ratio
  return (
    <div
      style={{
        width,
        height,
        borderRadius: width * 0.12,
        border: `1px solid ${WHITE_FAINT}`,
        background: '#0a1628',
        boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Notch */}
      <div style={{
        position: 'absolute', top: 0, left: '50%',
        transform: 'translateX(-50%)',
        width: width * 0.3, height: width * 0.06,
        background: '#050B14',
        borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
        zIndex: 10,
      }} />
      {children}
    </div>
  );
};
```

- [ ] **Step 2: Create Label component** — `remotion/src/components/Label.tsx`

```tsx
import React from 'react';
import { interpolate } from 'remotion';
import { ACCENT, SANS } from '../tokens';

interface Props {
  frame: number;
  appearAt: number; // frame when label fades in
  children: string;
}

export const Label: React.FC<Props> = ({ frame, appearAt, children }) => {
  const opacity = interpolate(frame, [appearAt, appearAt + 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [appearAt, appearAt + 20], [8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div style={{
      opacity,
      transform: `translateY(${y}px)`,
      fontFamily: SANS,
      fontSize: 18,
      color: 'rgba(255,255,255,0.55)',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginTop: 32,
      borderLeft: `2px solid ${ACCENT}`,
      paddingLeft: 12,
    }}>
      {children}
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add remotion/src/components/
git commit -m "feat(remotion): add PhoneMockup and Label components"
```

---

## Task 4: Intro scene

**Files:**
- Create: `remotion/src/scenes/Intro.tsx`

- [ ] **Step 1: Create Intro.tsx**

```tsx
import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { BG, SERIF, SANS, ACCENT } from '../tokens';

interface Props { frame: number }

export const Intro: React.FC<Props> = ({ frame }) => {
  // "LOFTE" — each letter fades in sequentially
  const letters = 'LOFTE'.split('');
  const fullOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const ruleWidth = interpolate(frame, [25, 50], [0, 80], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const taglineOpacity = interpolate(frame, [45, 70], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: BG, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      {/* Logo */}
      <div style={{ display: 'flex', gap: 10 }}>
        {letters.map((letter, i) => {
          const letterOpacity = interpolate(frame, [i * 8, i * 8 + 16], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          return (
            <span key={i} style={{
              fontFamily: SERIF,
              fontSize: 72,
              fontWeight: 300,
              color: '#fff',
              letterSpacing: 16,
              opacity: letterOpacity,
            }}>
              {letter}
            </span>
          );
        })}
      </div>

      {/* Rule */}
      <div style={{
        width: ruleWidth,
        height: 1,
        background: `rgba(255,255,255,0.25)`,
        marginTop: 16,
        marginBottom: 16,
      }} />

      {/* Tagline */}
      <div style={{
        opacity: taglineOpacity,
        fontFamily: SANS,
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 5,
      }}>
        TRAIN SMARTER
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add remotion/src/scenes/Intro.tsx
git commit -m "feat(remotion): add Intro scene"
```

---

## Task 5: Dashboard scene

**Files:**
- Create: `remotion/src/scenes/Dashboard.tsx`

- [ ] **Step 1: Create Dashboard.tsx**

```tsx
import React from 'react';
import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { BG, ACCENT, SERIF, SANS, WHITE_FAINT } from '../tokens';
import { PhoneMockup } from '../components/PhoneMockup';
import { Label } from '../components/Label';

interface Props { frame: number }

const BARS = [0.45, 0.6, 0.5, 1.0, 0.7, 0.55, 0.8];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const Dashboard: React.FC<Props> = ({ frame }) => {
  const { fps } = useVideoConfig();

  const phoneY = interpolate(
    spring({ frame, fps, config: { damping: 18, stiffness: 80 } }),
    [0, 1], [300, 0]
  );

  const streak = Math.min(47, Math.round(interpolate(frame, [20, 60], [0, 47], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })));

  return (
    <AbsoluteFill style={{ background: BG, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <div style={{ transform: `translateY(${phoneY}px)` }}>
        <PhoneMockup width={300}>
          <div style={{ padding: 24, paddingTop: 48, height: '100%', boxSizing: 'border-box' }}>
            {/* App name */}
            <div style={{ fontFamily: SANS, fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 4, marginBottom: 20 }}>
              LOFTE
            </div>

            {/* Streak */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: SERIF, fontSize: 48, color: '#fff', fontWeight: 300, lineHeight: 1 }}>
                {streak}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginTop: 4 }}>
                DAY STREAK
              </div>
            </div>

            {/* Bar chart */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 80, marginBottom: 8 }}>
              {BARS.map((h, i) => {
                const barHeight = interpolate(frame, [30 + i * 8, 50 + i * 8], [0, h * 80], {
                  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                });
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: '100%',
                      height: barHeight,
                      background: i === 3 ? ACCENT : WHITE_FAINT,
                      borderRadius: 3,
                    }} />
                    <div style={{ fontFamily: SANS, fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>
                      {DAYS[i]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </PhoneMockup>
      </div>
      <Label frame={frame} appearAt={70}>Your training at a glance</Label>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add remotion/src/scenes/Dashboard.tsx
git commit -m "feat(remotion): add Dashboard scene"
```

---

## Task 6: VoiceLog scene

**Files:**
- Create: `remotion/src/scenes/VoiceLog.tsx`

- [ ] **Step 1: Create VoiceLog.tsx**

```tsx
import React from 'react';
import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { BG, ACCENT, SERIF, SANS, WHITE_FAINT } from '../tokens';
import { PhoneMockup } from '../components/PhoneMockup';
import { Label } from '../components/Label';

interface Props { frame: number }

const TRANSCRIPT = '3 sets bench press 100 lbs';

export const VoiceLog: React.FC<Props> = ({ frame }) => {
  const { fps } = useVideoConfig();

  // Mic pulse
  const pulse = spring({ frame: frame % 20, fps, config: { damping: 8, stiffness: 120 } });
  const micScale = interpolate(pulse, [0, 1], [1, 1.12]);

  // Waveform bars — random heights that animate
  const waveHeights = [12, 20, 8, 28, 16, 24, 10, 22, 14, 18];

  // Transcript type-out — starts at frame 40
  const charsVisible = Math.floor(interpolate(frame, [40, 100], [0, TRANSCRIPT.length], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  }));
  const visibleText = TRANSCRIPT.slice(0, charsVisible);

  // Exercise card slides in at frame 110
  const cardOpacity = interpolate(frame, [110, 130], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const cardY = interpolate(frame, [110, 130], [20, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: BG, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <PhoneMockup width={300}>
        <div style={{ padding: 24, paddingTop: 48, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontFamily: SANS, fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 40 }}>
            LISTENING...
          </div>

          {/* Waveform */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 40, marginBottom: 32 }}>
            {waveHeights.map((h, i) => {
              const animH = interpolate(
                Math.sin((frame * 0.15 + i * 0.8)),
                [-1, 1], [h * 0.4, h]
              );
              return (
                <div key={i} style={{
                  width: 3, height: animH,
                  background: ACCENT,
                  borderRadius: 2,
                  opacity: 0.8,
                }} />
              );
            })}
          </div>

          {/* Mic button */}
          <div style={{
            width: 64, height: 64,
            borderRadius: 32,
            background: ACCENT,
            transform: `scale(${micScale})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 ${24 * micScale}px rgba(34,197,94,0.5)`,
            marginBottom: 32,
          }}>
            <div style={{ width: 16, height: 20, borderRadius: 8, background: '#fff' }} />
          </div>

          {/* Transcript */}
          <div style={{
            fontFamily: SANS, fontSize: 13,
            color: 'rgba(255,255,255,0.5)',
            fontStyle: 'italic',
            textAlign: 'center',
            minHeight: 18,
            marginBottom: 16,
          }}>
            {visibleText ? `"${visibleText}"` : ''}
          </div>

          {/* Parsed exercise card */}
          <div style={{
            opacity: cardOpacity,
            transform: `translateY(${cardY}px)`,
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid rgba(34,197,94,0.3)`,
            borderRadius: 10,
            padding: '10px 14px',
            width: '100%',
            boxSizing: 'border-box',
          }}>
            <div style={{ fontFamily: SANS, fontSize: 13, color: '#fff', fontWeight: 500 }}>Bench Press</div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              3 sets · 100 lbs
            </div>
          </div>
        </div>
      </PhoneMockup>
      <Label frame={frame} appearAt={120}>Log workouts in seconds — just speak</Label>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add remotion/src/scenes/VoiceLog.tsx
git commit -m "feat(remotion): add VoiceLog hero scene"
```

---

## Task 7: Coach scene

**Files:**
- Create: `remotion/src/scenes/Coach.tsx`

- [ ] **Step 1: Create Coach.tsx**

```tsx
import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { BG, ACCENT, SANS } from '../tokens';
import { PhoneMockup } from '../components/PhoneMockup';
import { Label } from '../components/Label';

interface Props { frame: number }

const AI_REPLY = "You're hitting a plateau on bench. Drop to 80% and add 2 pause reps.";

export const Coach: React.FC<Props> = ({ frame }) => {
  const bubble1Opacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const typingOpacity = interpolate(frame, [30, 40], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const charsVisible = Math.floor(interpolate(frame, [50, 120], [0, AI_REPLY.length], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  }));

  const dotPhase = (frame % 20) / 20;
  const dotOpacity = (i: number) => Math.abs(Math.sin((dotPhase + i * 0.3) * Math.PI));

  return (
    <AbsoluteFill style={{ background: BG, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <PhoneMockup width={300}>
        <div style={{ padding: 20, paddingTop: 48, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ fontFamily: SANS, fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 24, textAlign: 'center' }}>
            NYX AI COACH
          </div>

          {/* User message */}
          <div style={{ opacity: bubble1Opacity, alignSelf: 'flex-end', marginBottom: 12 }}>
            <div style={{
              background: ACCENT,
              borderRadius: '12px 12px 2px 12px',
              padding: '8px 12px',
              fontFamily: SANS, fontSize: 12, color: '#fff', maxWidth: 180,
            }}>
              Am I making progress on bench?
            </div>
          </div>

          {/* Typing indicator then reply */}
          {charsVisible === 0 ? (
            <div style={{ opacity: typingOpacity, display: 'flex', gap: 4, padding: '10px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px 12px 12px 12px', alignSelf: 'flex-start' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.5)', opacity: dotOpacity(i) }} />
              ))}
            </div>
          ) : (
            <div style={{
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '2px 12px 12px 12px',
              padding: '10px 14px',
              fontFamily: SANS, fontSize: 12, color: 'rgba(255,255,255,0.85)',
              alignSelf: 'flex-start', maxWidth: 220, lineHeight: 1.5,
            }}>
              {AI_REPLY.slice(0, charsVisible)}
            </div>
          )}
        </div>
      </PhoneMockup>
      <Label frame={frame} appearAt={100}>Your personal AI coach</Label>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add remotion/src/scenes/Coach.tsx
git commit -m "feat(remotion): add Coach scene"
```

---

## Task 8: EndCard scene

**Files:**
- Create: `remotion/src/scenes/EndCard.tsx`

- [ ] **Step 1: Create EndCard.tsx**

```tsx
import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { BG, SERIF, SANS } from '../tokens';

interface Props { frame: number }

export const EndCard: React.FC<Props> = ({ frame }) => {
  const DURATION = 90; // this scene is 90 frames

  const contentOpacity = interpolate(frame, [0, 25], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(frame, [DURATION - 25, DURATION], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const ruleWidth = interpolate(frame, [20, 50], [0, 100], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{
      background: BG,
      alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
      opacity: contentOpacity * fadeOut,
    }}>
      <div style={{ fontFamily: SERIF, fontSize: 72, fontWeight: 300, color: '#fff', letterSpacing: 16 }}>
        LOFTE
      </div>
      <div style={{ width: ruleWidth, height: 1, background: 'rgba(255,255,255,0.2)', marginTop: 16, marginBottom: 16 }} />
      <div style={{ fontFamily: SANS, fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: 5 }}>
        TRAIN SMARTER
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add remotion/src/scenes/EndCard.tsx
git commit -m "feat(remotion): add EndCard scene"
```

---

## Task 9: Wire everything in Root + index

**Files:**
- Create: `remotion/src/Root.tsx`
- Create: `remotion/src/index.ts`

- [ ] **Step 1: Create Root.tsx**

```tsx
import React from 'react';
import { AbsoluteFill, Composition, Sequence } from 'remotion';
import { FPS, WIDTH, HEIGHT, DURATION, SCENES, BG } from './tokens';
import { Intro } from './scenes/Intro';
import { Dashboard } from './scenes/Dashboard';
import { VoiceLog } from './scenes/VoiceLog';
import { Coach } from './scenes/Coach';
import { EndCard } from './scenes/EndCard';

const LoFTEPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence from={SCENES.intro.start} durationInFrames={SCENES.intro.end - SCENES.intro.start}>
        <Intro frame={0} />
      </Sequence>
      <Sequence from={SCENES.dashboard.start} durationInFrames={SCENES.dashboard.end - SCENES.dashboard.start}>
        {({ localFrame }: { localFrame: number }) => <Dashboard frame={localFrame} />}
      </Sequence>
      <Sequence from={SCENES.voice.start} durationInFrames={SCENES.voice.end - SCENES.voice.start}>
        {({ localFrame }: { localFrame: number }) => <VoiceLog frame={localFrame} />}
      </Sequence>
      <Sequence from={SCENES.coach.start} durationInFrames={SCENES.coach.end - SCENES.coach.start}>
        {({ localFrame }: { localFrame: number }) => <Coach frame={localFrame} />}
      </Sequence>
      <Sequence from={SCENES.end.start} durationInFrames={SCENES.end.end - SCENES.end.start}>
        {({ localFrame }: { localFrame: number }) => <EndCard frame={localFrame} />}
      </Sequence>
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="LoFTE"
    component={LoFTEPromo}
    durationInFrames={DURATION}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
```

- [ ] **Step 2: Create index.ts**

```ts
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';
registerRoot(RemotionRoot);
```

- [ ] **Step 3: Fix Sequence render prop usage**

Remotion `<Sequence>` does NOT use render props. Pass `localFrame` via `useCurrentFrame()` inside each scene instead. Update `Root.tsx`:

```tsx
import React from 'react';
import { AbsoluteFill, Composition, Sequence, useCurrentFrame } from 'remotion';
import { FPS, WIDTH, HEIGHT, DURATION, SCENES, BG } from './tokens';
import { Intro } from './scenes/Intro';
import { Dashboard } from './scenes/Dashboard';
import { VoiceLog } from './scenes/VoiceLog';
import { Coach } from './scenes/Coach';
import { EndCard } from './scenes/EndCard';

// Wrappers that inject localFrame via useCurrentFrame
const IntroWrapper = () => <Intro frame={useCurrentFrame()} />;
const DashboardWrapper = () => <Dashboard frame={useCurrentFrame()} />;
const VoiceWrapper = () => <VoiceLog frame={useCurrentFrame()} />;
const CoachWrapper = () => <Coach frame={useCurrentFrame()} />;
const EndWrapper = () => <EndCard frame={useCurrentFrame()} />;

const LoFTEPromo: React.FC = () => (
  <AbsoluteFill style={{ background: BG }}>
    <Sequence from={SCENES.intro.start} durationInFrames={SCENES.intro.end - SCENES.intro.start}>
      <IntroWrapper />
    </Sequence>
    <Sequence from={SCENES.dashboard.start} durationInFrames={SCENES.dashboard.end - SCENES.dashboard.start}>
      <DashboardWrapper />
    </Sequence>
    <Sequence from={SCENES.voice.start} durationInFrames={SCENES.voice.end - SCENES.voice.start}>
      <VoiceWrapper />
    </Sequence>
    <Sequence from={SCENES.coach.start} durationInFrames={SCENES.coach.end - SCENES.coach.start}>
      <CoachWrapper />
    </Sequence>
    <Sequence from={SCENES.end.start} durationInFrames={SCENES.end.end - SCENES.end.start}>
      <EndWrapper />
    </Sequence>
  </AbsoluteFill>
);

export const RemotionRoot: React.FC = () => (
  <Composition
    id="LoFTE"
    component={LoFTEPromo}
    durationInFrames={DURATION}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
```

- [ ] **Step 4: Launch Remotion Studio to verify**

```bash
cd remotion && npm start
```

Expected: browser opens at `http://localhost:3000`, LoFTE composition visible, timeline shows 750 frames (25s), scrubbing through shows all 5 scenes.

- [ ] **Step 5: Commit**

```bash
git add remotion/src/
git commit -m "feat(remotion): wire all scenes in Root composition"
```

---

## Task 10: Render to MP4

- [ ] **Step 1: Render**

```bash
cd remotion && npm run build
```

Expected: `remotion/out/lofte-promo.mp4` created, ~25s, 1920×1080.

- [ ] **Step 2: Verify output**

Open `remotion/out/lofte-promo.mp4` in QuickTime or VLC. Check:
- All 5 scenes play in sequence
- No black frames between scenes
- Green accent color visible on mic button and chart bar
- Transcript types out correctly in VoiceLog scene

- [ ] **Step 3: Add output to .gitignore and commit**

Add to root `.gitignore`:
```
remotion/out/
remotion/node_modules/
```

```bash
git add .gitignore remotion/
git commit -m "feat(remotion): complete promo animation, add render script"
```

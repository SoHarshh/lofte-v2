---
name: Voice Capture Strategy
description: Decided architecture for voice logging — no ambient recording, intentional capture windows only
type: project
---

**Decision: NO ambient/continuous recording. Ever.**

Three intentional capture modes instead:
1. Wake word "Hey LOFTE" via Porcupine SDK (runs 100% on-device, ~1% CPU, privacy-safe, activates 8s window)
2. PTT (Push-to-Talk) — tap mic button → record → auto-submits on silence
3. AirPods stem press → PTT via native audio session

**Why:** App Store rejects ambient recording. Gym captures others' conversations. Battery drain kills UX. Intentional windows have better accuracy and after 2-3 sessions users auto-condition to speak after sets.

**How to apply:** Never suggest continuous/ambient mic recording as a feature. Always frame voice as "intentional capture windows". Wake word is the hands-free solution, PTT is the phone-in-hand solution.

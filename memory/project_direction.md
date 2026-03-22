---
name: LOFTE Project Direction
description: Core product decisions, native app strategy, and feature prioritization agreed in planning session
type: project
---

LOFTE is a frictionless workout tracker. Core thesis: logging is too tedious and fragmented. Fix that.

**Platform: React Native + Expo (decided 2026-03-22)**
Not Swift. React Native gets to TestFlight in 1-2 weeks vs 6-10 weeks for Swift. Backend (Express + SQLite) stays completely unchanged — app calls same APIs.

**Ship order (critical path):**
1. Phase 0: Expo scaffold + iOS Simulator running
2. Phase A: Core session loop (PTT voice + text + camera → transcript → AI parse → save) → TestFlight this
3. Phase B: Wake word (Porcupine on-device)
4. Phase C: LOFTE Coach (AI chatbot with training history context)
5. Phase D: Apple Health integration
6. Phase E: Whoop integration
7. Phase F: Fast-tap logging (parallel with D/E)

**Key differentiator: LOFTE Coach**
Conversational AI that knows your full training history + health data (sleep, HRV, recovery). Nobody in the market does this well. Gemini 2.5 Flash with rich context injection — no fine-tuning needed for v1.

**Why:** User wants to ship fast and validate before building deep. TestFlight → real feedback → iterate via EAS Update (OTA).

**How to apply:** Prioritize shipping Phase A over all other features. Don't let perfect be the enemy of testable.

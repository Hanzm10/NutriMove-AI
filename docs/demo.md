# Demo account and demo script (Day 7)

A 10-minute walkthrough of the MVP for the CS 403 panel. It covers the three agent loops: **perceive → decide → act**
for food, workouts (camera coach) and the weekly adaptation.

## 1. Set up the demo account (once, ~5 min)

1. Open the deployed app and **sign up** as `demo@nutrimove.app`, or any address you control. Finish consent,
   screening and onboarding. Suggested profile:
   - 22 y/o, 165 cm, 68 kg
   - goal: lose weight, moderately active
   - 3 workout days, home equipment
   - allergy: shellfish (this shows the allergen filter)
2. Supabase → **SQL editor** → paste [`supabase/seed/demo.sql`](../supabase/seed/demo.sql). If you used a different
   address, change `demo_email` at the top, then **Run**. This adds 13 days of history:
   - ~48 meals logged from the FNRI recipes
   - a weight trend going down by about 0.5 kg/week
   - water logs
   - 14 camera sessions (squats and reverse lunges, 3 × 12, a few depth faults, laptop coach at ~12.5 fps)

   It also moves onboarding back 14 days, so **the weekly check-in is due today**. The script can be run again; it only
   replaces the demo account's past days and leaves today alone.
3. Before the demo:
   - Log today's breakfast yourself, so the rings aren't empty.
   - Start the laptop pose server (`pose-server/start.cmd`) and pair the phone (camera coach → **Use a laptop as the coach**, then **Connect**). Check the
     phone shows ~12 fps with **Show speed**.
   - Keep `?synthetic=squat` ready as a fallback if the camera, Wi-Fi or tunnel fails on the day.

## 2. Script (≈10 min)

| # | Screen | What to show | What to say (agent concept) |
|---|---|---|---|
| 1 | **Overview** | Calorie ring, macros, today's workout, AI coach insight, check-in banner | The agent's *state*: targets come from Mifflin-St Jeor + guardrails (TGT-*); the insight is a rule-based nudge (AGENT-05). |
| 2 | **Nutrition → search** | Type `adobo`, then `kanin`. Log 1 serving. Open the meal plan and press **Swap** on one meal | Food data from DOST-FNRI (1,542 foods, 65 recipes). The meal plan is content-based: hard filters (allergy, diet), then cosine similarity, then serving sizes to fit ±10% kcal (MEAL-01…05). Point out that no shellfish dish shows up. |
| 3 | **AI Workout** | Weekly plan, eligibility reasons | Recommender: eligibility filters + cosine ranking per slot (WORK-01). |
| 4 | **Camera coach** (phone → laptop) | 1 set of squats: do 3 good reps, then 2 shallow ones, then 1 with knees caving in. Point at the rep counter, the cue banner, the voice cue and the 3D skeleton | Perceive: InstantHMR 3D joints. Decide: a rep state machine plus form rules (POSE-09…). Act: spoken cues. Squat replay results: 100% rep accuracy, macro-F1 0.91. No frames are stored (POSE-08). |
| 5 | **Session summary** | Reps, good-form %, faults, rating, Save | Only aggregates are saved. The difficulty rating feeds back into the next check-in. |
| 6 | **Progress** | 4w view: weight trend, adherence, good-form % | The 13 seeded days. The weight trend is a 14-day least-squares slope. |
| 7 | **Check-in** | Enter today's weight, adherence "mostly", hunger "often", workout "too hard". Submit | Adaptation (AGENT-02/03/06): the trend vs. goal changes kcal by ±150/−100 with the floor; hunger adds protein and fiber; "too hard" means fewer sets. Read the **What changed and why** card aloud. |
| 8 | **Profile** | Targets with "why", accessibility toggles, export JSON | Explainability, privacy (export/delete), WCAG checks. |
| 9 | (optional) **Survey** | `/survey` | SUS + ISO 25010 pilot evaluation, results in `docs/evaluation.md`. |

**Guardrail moment (30 s, optional):**
1. Sign up a throwaway account with a birthdate under 18 and show the screening stop. Or, with pregnancy/breastfeeding = yes, show that the targets switch to maintenance only.
2. Point out that no deficit is ever set below the calorie floor.
3. Mention `guardrail-scenarios.test.ts`.

## 3. If something breaks

| Problem | Fallback |
|---|---|
| Tunnel / Wi-Fi down | Coach on the laptop webcam directly (`/workout/live?exercise=squat`, GPU in-browser), or `?synthetic=squat` |
| Supabase slow | Show Progress/Overview from screenshots in the slides; explain the RLS design |
| Phone tab reloads | The load guard steps down a setup automatically; otherwise use the laptop |
| USDA search empty | FNRI results still come first; use Filipino food names |

## 4. Reset after a rehearsal

Run `demo.sql` again. It rebuilds the past 13 days and makes the check-in due again. To clear **today's** test logs,
delete them in the app (Nutrition → log row → delete).

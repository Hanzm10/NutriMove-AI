# Demo script: finals presentation

A 10-minute walkthrough of NutriMove AI for the CS 403 panel, built around the three agent loops
(**perceive → decide → act**): food, workouts with the camera coach, and the weekly adaptation.

Live site: **https://nutri-move-ai.vercel.app**

## 1. Demo account (once, ~5 min)

1. **Sign up** on the live site as `demo@nutrimove.app` (or any address you control) and finish consent, screening and
   onboarding. Suggested profile:
   - 22 y/o, 165 cm, 68 kg
   - goal: lose weight, moderately active
   - 3 workout days, home equipment
   - allergy: shellfish (shows the allergen filter)
2. Supabase → **SQL editor** → paste [`supabase/seed/demo.sql`](../supabase/seed/demo.sql). If you used another address,
   change `demo_email` at the top, then **Run**. This adds 13 days of history:
   - ~48 meals logged from the FNRI recipes
   - a weight trend going down about 0.5 kg/week
   - water logs and 14 camera sessions

   It also makes the **weekly check-in due today**. You can run it again; it only replaces past days.

## 2. Before you present (~30 min, on the demo phone)

New features have not been tried on a real phone yet. Do this dry run on the **live site**, not a preview.

- [ ] Phone **media volume at maximum**, silent mode **off** (it can mute the beeps). A small Bluetooth speaker helps.
- [ ] **Profile → Voice & sound → Test voice.** Pick the clearest voice, volume 100%.
- [ ] Log today's breakfast so the Overview rings aren't empty.
- [ ] **Camera coach, squat:** one set facing the camera, whole body in view, 2–3 m back. Then **Stop → Start** and do a
      second set (this checks the Stop/Start fix). Turn on **Show speed**: it should say MediaPipe and well over 15 fps.
- [ ] **Set timer** on a non-camera exercise (e.g. plank): hear "10 seconds left", the 5-4-3-2-1 beeps and "Time!".
- [ ] Open the Workout screen and check the exercise photos and illustrations load.
- [ ] Take screenshots of Overview, Nutrition, Workout, Progress and the coach as a backup.

Demo the camera coach with **squats facing the camera**: that path is the best tested. Push-ups and lunges are not yet
tuned for MediaPipe, so don't demo them live.

## 3. Script (≈10 min)

| # | Screen | What to show | What to say |
|---|---|---|---|
| 1 | **Overview** | Calorie ring, macros, today's workout, coach insight, check-in banner | The agent's state: targets from Mifflin-St Jeor with safety guardrails; the insight is a rule-based nudge. |
| 2 | **Nutrition** | Search `adobo`, then `kanin`; log 1 serving. Open the meal plan, press **Swap** | Food data from DOST-FNRI (1,542 foods, 65 recipes). Meal plans: hard filters (allergy, diet), then similarity ranking, then portions to fit ±10% of the calorie target. No shellfish dish appears. |
| 3 | **Workout** | Weekly plan; tap an exercise to show the **photos or illustrations**, steps and form cue; press **Start set timer** for a few seconds | The plan is a recommender (eligibility filters + ranking). The set timer speaks the seconds left; it's a guide, not a limit. |
| 4 | **Camera coach** (squat, phone facing you) | 3 good reps, 2 shallow ones, 1 with knees caving in. Point at the rep counter, guide clock, cue banner, voice cue and 3D skeleton | **Perceive:** MediaPipe finds 3D joints on the phone; no video leaves the device. **Decide:** a rep state machine plus form rules read from a settings file. **Act:** spoken and on-screen cues. |
| 5 | **Session summary** | Reps, good-form %, faults, rating, Save | Only totals are saved. The difficulty rating feeds the next check-in. |
| 6 | **Progress** | 4-week view: weight trend, adherence, good-form % | The trend is a 14-day least-squares slope. |
| 7 | **Check-in** | Today's weight, adherence "mostly", hunger "often", workout "too hard". Submit | Adaptation: the weight trend vs. goal changes calories (never below the safe floor); hunger adds protein and fiber; "too hard" means fewer sets. Read the **What changed and why** card aloud. |
| 8 | **Profile** | Targets with "why", accessibility toggles, **Voice & sound**, export | Explainability, privacy (export/delete), accessibility. |
| 9 | **Credits** (`/credits`) | Photo, model and data credits | Every image is public domain or our own drawing; licenses are checked by a test. |

**Optional extras (30 s each):**
- **Push-ups only count on the floor:** on the push-up coach, do the arm movement standing up. Nothing counts and it says
  "Get down on the floor for push-ups".
- **Safety guardrail:** a throwaway account under 18 is stopped at screening; pregnancy/breastfeeding switches targets to
  maintenance only.

## 4. Numbers to quote

| Claim | Number | Source |
|---|---|---|
| Speed on iPhone | MediaPipe ~50 fps vs InstantHMR 1.4 fps | `docs/pose-optimization-plan.md` (Phase 0) |
| Squat, team clips (InstantHMR) | 100% rep accuracy, form F1 0.91 | `docs/evaluation.md` |
| Squat, MediaPipe, facing camera | knee cave-in caught 10/10, no false warnings | `mediapipe-clips.test.ts` |
| Squat, MediaPipe, side view | 96% reps, depth F1 0.92 | `docs/pose-optimization-plan.md` |
| Held-out public data (EC3D, 4 people) | 98.6% squat reps, 99.2% lunge reps | `ec3d.test.ts` |
| Food data | 1,542 FNRI foods, 65 recipes (48 Filipino) | `docs/datasets.md` |
| Automated tests | 295, run on every change | CI |

## 5. Likely questions

| Question | Short answer |
|---|---|
| Why only 3 camera exercises? | Each one needs labelled clips and has to pass the accuracy targets. Exercises are now settings in a file, so adding more is mostly a data task (future work). |
| Where's your dataset? Did you train a model? | We use pretrained pose models and calibrated our rules on our own labelled clips, then tested on a public dataset (EC3D) they were never tuned on. That's calibration, not fine-tuning. |
| The proposal said InstantHMR. | We benchmarked both: MediaPipe runs ~50 fps on iPhone vs 1.4, so it's now the default and InstantHMR is the fallback (PRD decision D19). |
| Do you send video to a server? | No. Pose tracking runs on the phone; only rep counts and form summaries are saved. |
| Is it safe to give calorie targets? | Targets never go below a safe floor, minors are stopped at screening, and pregnancy means maintenance only. It's not medical advice. |
| Did you use AI tools? | Yes, disclosed in `docs/contributions.md`. The team wrote the requirements, directed and reviewed every change, and collected all evaluation data. |
| Where are the images from? | Public-domain photos (Free Exercise DB) or our own illustrations, all listed on `/credits`. |

## 6. If something breaks

| Problem | Fallback |
|---|---|
| Camera coach misbehaves on MediaPipe | Add `&pose=instanthmr` to the end of the coach link (e.g. `/workout/live?exercise=squat&pose=instanthmr`) |
| Camera, permission or Wi-Fi fails | Add `&synthetic=squat` to the end of the coach link (a simulated person) |
| Coach won't start on the phone | Laptop browser: `/workout/live?exercise=squat` |
| Voice too quiet | Bluetooth speaker; point at the on-screen cue banner |
| Supabase slow or down | Use the screenshots; explain the design |
| USDA search empty | FNRI results still come first; use Filipino food names |

## 7. Reset after a rehearsal

Run `demo.sql` again. It rebuilds the past 13 days and makes the check-in due again. To clear **today's** test logs,
delete them in the app (Nutrition → log row → delete).

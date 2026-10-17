# Camera coach optimization plan

Goal: make the camera coach run fast on phones, without the laptop server, while keeping (or improving) rep and
form-check accuracy. Prompted by Aaron's MediaPipe experiment (Oct 16–17) and his Gemini conversation.

## 1. What Aaron's experiment showed

| Idea | What he did | Decision |
|---|---|---|
| Lighter model | Replaced InstantHMR (3D mesh model, ~2 fps on CPU) with Google **MediaPipe Pose** | **Adopt**, but use the maintained **Pose Landmarker** (`@mediapipe/tasks-vision`). His `@mediapipe/pose` package is the old version. |
| 2D instead of 3D | Angles from 2D screen points | Partly. Pose Landmarker also returns **3D world points in metres** at no extra cost, so our 3D form checks (knee cave-in at 45°) still work. |
| Visibility gating | Ignore low-visibility joints; require the core body joints before counting | **Adopt.** InstantHMR has no per-joint confidence; MediaPipe does. |
| Hip-drop check | A squat counts only if the hips really drop (~15 %) | **Adopt** as an engine rule. |
| "Both knees" rule | Raising one knee is not a squat | **Adopt.** Our squat averages both knees, so one knee raised high (180° + 90° → 135°) can register as a shallow squat. |
| Median smoothing | 5-frame moving median | Not needed: we already use a One-Euro filter (less lag). |
| KNN false-positive gate | Tiny k-nearest-neighbours on normalised joint positions (STANDING / BOTTOM / FALSE_POSITIVE) | **Optional, Phase 5**, trained on our labelled clips and kept only if it improves held-out F1. |
| Sample collection (dev mode) | Raise-an-arm gesture to save labelled samples | Use our existing `/dev/replay` labelling. The gesture trigger is optional. |
| Exercise engine | Strategy, chain-of-rules and state-machine classes | **Adopt the goal, simplify the form:** exercises as JSON definitions read by one small interpreter, so a new exercise needs no code. |
| No WebSocket | Everything in the browser | Agree. If MediaPipe is fast on phones, the laptop server becomes an optional fallback. |

Not copied:
- the deprecated package and its main-thread `Camera` helper
- rounding angles to whole degrees
- a classifier trained on one person in one room
- unmeasured speed claims ("30–60 fps on CPU")

## 2. Why switch models

| | InstantHMR (now) | MediaPipe Pose Landmarker |
|---|---|---|
| Model file | 81 MB (52 MB int8 "lite") | 5.8 MB lite · 9.4 MB full · 31 MB heavy |
| Memory | +0.5–0.75 GB; crashes iPhones | to be measured (Phase 0) |
| Speed | crashes on iPhone; 12–13 fps only via the laptop | to be measured (Phase 0) |
| Joints | 18 used, 3D | 33: 2D + 3D world + visibility, incl. heels and toes |
| Licence | Meta SAM licence (research only) | Apache 2.0 |

Our pipeline already isolates the model: every backend is converted into the same 18-joint skeleton. A new model needs
one adapter; the rep counter, form checks, HUD and session saving are unchanged.

## 3. Phases

| Phase | Work | Size | Exit criteria |
|---|---|---|---|
| **0. Benchmark** | `/dev/pose-bench` (speed, memory, person found); `/dev/replay` "Pose model" option to score the original videos with MediaPipe | ½ day | Results table below filled for iPhone, Android, laptop |
| 1. Default on-device model | `MediaPipePoseEstimator` in the coach (worker if supported, else main thread + GPU delegate); InstantHMR via `?pose=instanthmr`; laptop server kept as fallback | 1 day | Gate passed (below) |
| 2. Re-tune | Re-tune `exercise-rules.json` on the team's videos through the replay → score loop; re-check EC3D | ½ day | Rep accuracy ≥ 90 %, form F1 ≥ 0.75 |
| 3. Edge-case rules | Both legs must bend; hips must drop vs. standing; visibility gate per exercise; one knee raised is never a rep. Each rule has a synthetic test | ½ day | New tests pass, no regression in real-clip tests |
| 4. Data-driven exercise engine | Exercises as JSON (driver angle, gates, phase thresholds, checks) read by one tested interpreter; migrate squat/lunge/push-up | 1 day | Real-clip tests give **identical** results before and after |
| 5. Optional KNN gate | Label frames in `/dev/replay`, train a small KNN, use it as an extra gate | 1 day | Kept only if held-out F1 improves |

**Phase 1 gate:** MediaPipe (lite or full) reaches **≥ 15 fps on an iPhone** without a crash, with **rep accuracy ≥ 90 %**
and **form-error macro-F1 ≥ 0.75** on the team's labelled videos (PRD §12). If it misses, keep the current setup.

**Timing:** Phase 0 now. Phases 1–3 only if the gate clearly passes and there is time to rehearse before the demo.
Phases 4–5 after the demo (report them as next steps).

## 4. Phase 0: how to run it

Setup: `pnpm install` copies the MediaPipe runtime to `public/mediapipe`. The lite and full models are in `public/models`.
For the heavy model, run `node scripts/fetch-pose-models.mjs heavy`.

**Speed and memory (each device):**
1. Open `/dev/pose-bench` on the deployed site.
2. Stand 2–3 m back, whole body in view.
3. Run each model for 20 s while doing a few squats.
4. Tap **Copy results for the team** and paste the lines below.

Memory is only reported in Chrome/Edge; Safari has no memory API.

**Accuracy (laptop):**
1. Open `/dev/replay`, set **Pose model** to MediaPipe lite.
2. Load the **original videos** (`squat_good_12`, `squat_mixed_13`, `lunge_good_15`, the push-ups) and paste `eval/clips/*.labels.csv`.
3. Note the rep accuracy and macro-F1.
4. Repeat with MediaPipe full and with InstantHMR for the baseline.

**Check the "3D ok" column:** it must be close to 100 % while standing. It confirms that MediaPipe's 3D points use the
same up/down direction as our form checks.

### Results: speed and memory (`/dev/pose-bench`)

| Device | Model | Load | FPS | p50 / p95 ms | Person found | 3D ok | Memory |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

### Results: accuracy (`/dev/replay`, team videos, current thresholds)

| Model | Squat rep acc. | Squat macro-F1 | Lunge reps | Push-up | Notes |
|---|---|---|---|---|---|
| InstantHMR (baseline, Day 6) | 100 % | 0.91 | 15/15 | not usable (portrait clips) | thresholds were tuned on this model |
| MediaPipe lite | | | | | |
| MediaPipe full | | | | | |

The MediaPipe accuracy runs use thresholds tuned for InstantHMR. A lower first score is expected; Phase 2 re-tunes them.

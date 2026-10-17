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

### Results: speed and memory (`/dev/pose-bench`, Oct 17)

| Device | Model | Load | FPS | p50 / p95 ms | Person found | 3D ok | Memory (JS) |
|---|---|---|---|---|---|---|---|
| Windows laptop | MediaPipe lite · GPU | 4.4 s | 66.6 | 10.8 / 16.1 | 100 % | 100 % | 52 MB |
| Windows laptop | MediaPipe full · GPU | 2.9 s | 56.6 | 15.9 / 24.7 | 100 % | 100 % | 71 MB |
| Windows laptop | MediaPipe lite · CPU | 0.3 s | 27.5 | 34.3 / 49.0 | 100 % | 100 % | 17 MB |
| Windows laptop | InstantHMR lite · WASM | 14.7 s | 5.2 | 183 / 229 | 100 % | – | 10 MB (worker not counted) |
| Windows laptop | InstantHMR full · WebGPU | 13.9 s | 8.6 | 80 / 97 | 100 % | – | 10 MB (worker not counted) |
| iPhone | MediaPipe lite · GPU | 2.3 s | 32.1 | 17.6 / 21.6 | 100 % | 100 % | – |
| iPhone | MediaPipe full · GPU | 1.8 s | 52.1 | 18.1 / 20.4 | 100 % | 100 % | – |
| iPhone | MediaPipe lite · CPU | 0.8 s | 56.3 | 17.3 / 18.7 | 100 % | 100 % | – |
| iPhone | InstantHMR lite · WASM | 10.2 s | 1.4 | 650 / 1055 | 100 % | – | – |
| iPhone | InstantHMR full | – | – | – | – | – | crashed |

FPS is capped by the camera/display refresh, so 52–66 fps means "faster than the camera". MediaPipe is **20–40× faster on
iPhone** and loads 5–10× faster. The "3D ok" column is 100 % everywhere: MediaPipe's 3D points use our up/down convention.
"vis" (lowest visibility over all 17 joints) was 0–0.03 in every run, because heels/toes or wrists were out of view.
Phase 1 should check only the joints each exercise needs. Android was skipped (not needed for the decision).

### Results: accuracy (`squat_good_12`, team video, InstantHMR-tuned thresholds unchanged)

| Model | Reps found | Counted as good | False form flags | Bottom knee angle (12 reps) | Knee angle vs InstantHMR |
|---|---|---|---|---|---|
| InstantHMR (baseline) | 12/12 | 12 | none | 61–79° | – |
| MediaPipe lite | 12/12 | 12 | torso lean on 7 reps | 79–92° | r = 0.70, mean diff 11°, noisy (one 15° glitch) |
| MediaPipe full | 12/12 (7 full + 5 "shallow") | 7 | shallow ×5, torso lean ×9, knee cave-in ×1 | 78–102° | r = 0.95, mean diff 11°, reads ~8° straighter |

What this means:
- **Rep counting transfers as-is:** both MediaPipe models found every one of the 12 squats.
- **Form thresholds don't transfer, which was expected.** MediaPipe reads the knee about 8–15° straighter at the bottom,
  so 5 deep squats fall short of our 95° depth line. It also puts the torso about 10–15° further forward (lean p90 57° vs
  44°), with occasional glitch frames, so the 55° lean limit fires on good reps. These are Phase 2 re-tuning items
  (per-model thresholds), plus Phase 3 robustness (require a fault on several frames in a row).
- **MediaPipe full tracks InstantHMR much more closely than lite** (r = 0.95 vs 0.70) at the same iPhone speed.

### Results: accuracy on `squat_mixed_13` (13 reps with labelled mistakes, MediaPipe full)

| Setup | Rep accuracy | Too shallow F1 | Knee cave-in F1 | Forward lean F1 | Macro-F1 |
|---|---|---|---|---|---|
| InstantHMR (Day 6, both clips) | 100 % | – | – | – | **0.91** |
| MediaPipe full, InstantHMR thresholds (eval report) | 77 % (10/13) | 0.87 | 0.00 | 0.00 | 0.29 |
| MediaPipe full, best re-tuned thresholds (both clips) | 96 % | 0.92 | 0.22 | 0.00 | 0.38 |

Best re-tune: top 155°, bottom 100°, shallow 145°, lean 62–75°.

Per-rep signals explain why:
- **Depth is fine after re-tuning.** MediaPipe reads the knee about 15–20° straighter, so the shallow line moves from 135° to 145°.
- **Knee cave-in cannot be seen by MediaPipe from this camera angle.** On the five knees-in reps, its 3D knee spacing stays
  at 1.03–1.08 of standing (InstantHMR: 0.72–0.88). Its 2D spacing is noise, because the knees overlap in a side/45° view
  (the same holds for InstantHMR's 2D). Re-tuning cannot fix a signal that isn't there.
- **Forward lean:** the one labelled lean rep reaches 81° vs 52–61° on good reps, so a ~70° limit would separate them.
  With a single example it can't be scored reliably (it also lands on a misaligned rep).

### Results: front-view clips (`squat_good_10`, `squat_knees-in_10`, MediaPipe full)

From the front, knee cave-in is very clear (knee spacing ÷ ankle spacing at the bottom of each rep):

| | Good reps (10) | Knees-in reps (10) |
|---|---|---|
| 3D | 1.02 – 1.16 | 0.59 – 0.73 |
| 2D | 1.18 – 1.32 | 0.58 – 0.81 |

The app still caught only 1/10, because of **a bug in the current knee check, which affects both models.** The "standing
spacing" baseline keeps updating between reps. If the knees stay slightly in near the top, it drifts down (0.89 → 0.70)
and the bottom then looks normal.

Fixes tried on all six labelled clips:

| Knee check | InstantHMR side | MediaPipe side | MediaPipe front |
|---|---|---|---|
| Current (drifting baseline) | F1 0.73 | 0.22 | 0.18 |
| A: baseline frozen at the first rep | 0.47 | 0.29 | 0.33 |
| B: absolute floor (knees < 0.85 × ankle width) | 0.28 (20 false alarms) | 0.34 (19 false alarms) | **1.00** (10/10, 0 false alarms) |

The right check depends on the camera angle. The app can tell the angle itself: **shoulder width ÷ torso height while
standing** is 0.62–0.72 facing the camera and 0.10–0.41 (median) side-on or at 45°. A ~0.55 cutoff separates them.

**Proposed knee rule (Phase 2):**
- **Facing the camera:** absolute floor 0.85 (both models).
- **Side/45° with InstantHMR:** current relative rule.
- **Side/45° with MediaPipe:** no knee check, with the tip "face the camera to check your knees".

### Decision

- **Speed gate: passed** (20–40× faster on iPhone).
- **Accuracy gate: failed for squat form checks** (macro-F1 0.38 vs 0.75), because knee cave-in isn't detectable from the
  recommended camera angle.
- **For the demo:** keep InstantHMR (laptop coach) as is.
- **Front-view update (above):** with a view-aware knee rule, MediaPipe catches knee cave-in perfectly from the front.
  So the hybrid is viable. Next: Phase 1 (`?pose=mediapipe`) + Phase 2 (per-model thresholds, view-aware knee rule, fixed
  baseline), validated on all six clips before MediaPipe becomes the default.
- **Original plan (before the front-view clips):** a hybrid, if wanted:
  - MediaPipe full on phones for rep counting, depth and lean, with re-tuned per-model thresholds.
  - Knee cave-in checked only when the user films from the **front** (2D knee-inside-ankle test). This needs new
    front-view clips to validate.
  - Otherwise, the knee check stays on InstantHMR.

## 5. Phases 1–2: status

**Phase 1: done (opt-in).** Open the coach with `?pose=mediapipe` to run MediaPipe Pose Landmarker full (GPU, with CPU
fallback) on the main thread, one frame per animation frame. The default is still InstantHMR. Sessions save with
`backend: "mediapipe"`, so the latency export can compare the two.

**Phase 2: done.**
- Per-model thresholds: `exercise-rules.json` → `backends.mediapipe` (squat top 155°, bottom 110°, shallow floor 145°,
  lean limit 70°). The coach uses `rulesFor("mediapipe")` with `?pose=mediapipe`.
- View-aware knee check (`analyzers/view.ts`). The camera angle is the median shoulder-width ÷ torso-height ratio over
  about 10 s of standing frames: facing the camera is ≥ 0.55 (measured 0.66–0.67), side/45° is 0.10–0.41.
  - Facing the camera: knees caved in when knee spacing < 0.85 × ankle spacing. This is an absolute rule, so there is no
    drifting baseline.
  - Side/45°: InstantHMR keeps its baseline rule; MediaPipe skips the knee check.
- Gate (`src/lib/pose/eval/mediapipe-clips.test.ts`, on the team clips):

| Clips (MediaPipe full) | Reps | Knee cave-in | Depth F1 | False flags on good reps |
| --- | --- | --- | --- | --- |
| Front: `squat_good_10`, `squat_knees-in_10` | ≥ 90 % | 10/10, precision 1.0 | – | 0 |
| Side/45°: `squat_good_12`, `squat_mixed_13` | 96 % | not checked (by design) | 0.92 | 0 |

InstantHMR's existing clip tests (`real-clips.test.ts`) still pass unchanged.

**Still open:** the forward-lean threshold has only one labelled example; a front-view lean clip would validate it.
Make MediaPipe the default on phones once it has been tried live on an iPhone.

# Pose evaluation: clips, labels and scoring (PRD §12, POSE-17)

Targets: **rep accuracy ≥ 90 %** and **form-error F1 ≥ 0.75**. Everything below runs on the team's own computers;
videos are never uploaded or committed.

## 1. Record

- Side view or 45°, 2–3 m away, whole body in frame, good light, phone propped still. 10–20 reps per clip.
- iPhone: Settings → Camera → Formats → **Most Compatible** (H.264), so laptop browsers can play the file.
- At least one clean clip per exercise, and every mistake below at least 5–10 times across all clips.

## 2. Name and label

`<exercise>_<mistake>_<true reps>.mp4`, e.g. `squat_good_12.mp4`, `pushup_hips-sag_8.mp4`. One mistake on every rep →
the name is enough. Several mistakes in one clip → name it `squat_mixed_12.mp4` and add rows to `labels.csv`:

```
file,rep,errors
squat_mixed_12.mp4,1,good
squat_mixed_12.mp4,2,knees-in
squat_mixed_12.mp4,3,knees-in+shallow
```

Count every attempt, including shallow ones. A second person labels while watching the video back.

| Exercise | Label | App check | Cue the app says |
|---|---|---|---|
| squat | `shallow` | `SQ_DEPTH` | Go a little deeper |
| squat | `knees-in` | `SQ_KNEE_VALGUS` | Push your knees out |
| squat | `lean-forward` | `SQ_TORSO_LEAN` | Keep your chest up |
| push-up | `half-rep` (or `shallow`) | `PU_DEPTH` | Lower your chest more |
| push-up | `hips-sag` | `PU_HIP_SAG` | Tighten your core, hips are sagging |
| push-up | `hips-pike` | `PU_HIP_PIKE` | Lower your hips |
| lunge | `shallow` | `LU_DEPTH` | Drop your back knee lower |
| lunge | `lean-forward` | `LU_TORSO` | Stay upright |

Other labels (e.g. `heels-up`, `knee-over-toe`) are allowed but the app has no check for them; the report lists them
as "not checked by the app" and leaves them out of F1.

## 3. Replay and score

Open `/dev/replay` on a laptop (Chrome or Edge). Pick the clips: each runs through the same model, tracker, smoothing,
1-second ready gate and form checks as the live coach, at 15 frames per second. Then load `labels.csv` and press
**Score**. **Save all joints** exports `clips.joints.json`: 18 body joints per frame (no pictures) **plus the labels
currently in the labels box**, so fill in the labels before saving. Share
that file (not the videos) for threshold tuning; it can be loaded back into the page instead of the videos.

How it's scored (`src/lib/pose/eval/score.ts`): an *attempt* is a counted rep or a shallow rep the app flagged (people
count both). Rep accuracy per clip = 1 − |attempts − true reps| / true reps, averaged over clips. Form errors are
matched rep by rep in order; extra or missing attempts count as false positives / negatives. F1 per check, then the
mean over checks that appear in the labels (macro F1).

## Results log

### Day 6, squat (2 clips, side / 45° view, iPhone portrait 576×1024)

| | Before tuning | After tuning |
|---|---|---|
| `squat_good_12` | 10 of 12 counted, 6 false "lean" flags | **12 of 12 counted, 0 flags** |
| `squat_mixed_13` | 8 attempts seen (5 shallow reps missed) | **13 of 13 attempts seen** |

What changed (`src/lib/pose/analyzers/exercise-rules.json`), with the reason from the joints data:

- `top` 160 → 150°: standing between reps only reached 155–162°, so two good reps never "finished".
- `shallowFloor` 120 → 135°: half squats bottomed out at 115–126° and were ignored entirely instead of being
  flagged "go deeper".
- `torsoLeanMax` 45 → 55°: good squats with hips back lean 40–49° at the bottom; the clearly leaning rep reached 63°.
- Knee cave-in (`valgusDrop` 0.85) is now measured against the person's own knee/ankle spacing while standing,
  instead of a fixed ratio, so a side or 45° camera doesn't trigger it. It fires on 3 reps of the mixed clip.

Second pass with every mixed rep labelled (`eval/clips/squat-day6.labels.csv`): `bottom` 100 → 95° (reps that
stopped at 97–107° were labelled shallow; good reps reach 58–80°) and `valgusDrop` 0.85 → 0.9.

| Squat, both clips (25 reps) | Result | PRD target |
|---|---|---|
| Rep accuracy | **100 %** (12/12 and 13/13 attempts) | ≥ 90 % |
| Shallow (`SQ_DEPTH`) | P 1.00 · R 1.00 · F1 **1.00** | |
| Knees in (`SQ_KNEE_VALGUS`) | P 0.67 · R 0.80 · F1 **0.73** (2 false, 1 missed) | |
| Lean forward (`SQ_TORSO_LEAN`) | P 1.00 · R 1.00 · F1 **1.00** (1 rep) | |
| Macro F1 | **0.91** | ≥ 0.75 |

**Caveat for the paper:** these thresholds were tuned on the same two clips they are scored on (one person, one room,
side / 45° view), so this is a training-set score. Report it as such, and score fresh clips from other people
before quoting a generalisation number. Knee cave-in is the weakest check because a side camera sees little of the
knees' sideways movement; a front-facing camera would help. `heels-up` (4 reps) has no check in the app.
The clips' joints and labels are in `eval/clips/`; `src/lib/pose/eval/real-clips.test.ts` fails if a change drops
below the targets.

### Day 6, lunge (`lunge_good_15`, side / 45°, portrait)

| | Before tuning | After tuning |
|---|---|---|
| `lunge_good_15` | 7 of 15 counted, 4 false "stay upright" | **15 of 15 counted, 0 flags** |

- `top` 155 → 145°: the lunge signal is the more-bent knee, and between reps it only straightened to 145–157°.
- `shallowFloor` 115 → 120°, `torsoLeanMax` 30 → 50°: good reps leaned 20–43° forward at the bottom.

### Day 6, push-up: not usable yet

`pushup_good_5` and `pushup_hip-sag_10` were filmed in portrait. With the person lying across a narrow frame, the
tracker repeatedly lost the body (shoulders placed off-screen, body angle jumping between 170° and 90° within a
fraction of a second), so the counts (2 of 5, 0 of 10) measure the recording, not the checks. In the hip-sag clip the
elbows also stayed near 150° throughout. Push-up thresholds stay at the starting values; the camera tip now says to
turn the phone sideways. Re-record push-ups in **landscape, camera at floor height, 2–3 m to the side**.

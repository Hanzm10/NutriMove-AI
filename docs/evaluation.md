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
**Score**. **Save all joints in one file** exports `clips.joints.json`: 18 body joints per frame, no pictures. Share
that file (not the videos) for threshold tuning; it can be loaded back into the page instead of the videos.

How it's scored (`src/lib/pose/eval/score.ts`): an *attempt* is a counted rep or a shallow rep the app flagged (people
count both). Rep accuracy per clip = 1 − |attempts − true reps| / true reps, averaged over clips. Form errors are
matched rep by rep in order; extra or missing attempts count as false positives / negatives. F1 per check, then the
mean over checks that appear in the labels (macro F1).

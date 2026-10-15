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

### Held-out: public EC3D dataset (4 people the thresholds were never tuned on)

The Day 6 numbers come from the clips the thresholds were tuned on. To test on other people, the same rules were run,
unchanged, on **EC3D** (Zhao et al., *3D Pose Based Feedback for Physical Exercises*, ACCV 2022): 4 people,
3D skeletons triangulated from 4 cameras, one repetition per sequence, each labelled correct or with a named mistake.

How to reproduce:
1. Download `data_3D.pickle` (21 MB) from the Google Drive folder linked in the EC3D repository
   (github.com/Jacoo-Zhao/3D-Pose-Based-Feedback-For-Physical-Exercises).
2. `python3 scripts/ec3d-to-clips.py path/to/data_3D.pickle`. This maps OpenPose BODY_25 to our 18 joints, turns Z-up into
   our Y-down axes, scales each person to adult size, and joins each person's reps into one set with short standing
   pauses. It writes `eval/ec3d/` (not committed: the dataset states no licence).
3. `pnpm exec vitest run src/lib/pose/eval/ec3d.test.ts --silent=false` prints the tables below.

| Exercise | Reps (correct + mistakes) | Rep-count accuracy | Form check | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| Squat | 132 (41 + 91) | **98.6 %** | Knees caving in (`SQ_KNEE_VALGUS`) | 0.94 | 0.70 | **0.80** |
| | | | Not low enough (`SQ_DEPTH`) | 0.82 | 0.43 | 0.56 |
| Lunge | 127 (46 + 81) | **99.2 %** | Not low enough (`LU_DEPTH`) | 1.00 | 0.35 | 0.52 |

Squat macro-F1 0.68, lunge 0.52. Across all 259 reps the app wrongly flagged a mistake only 3 times (precision ≥ 0.82).

What the numbers mean:
- **Rep counting holds up on new people** (≥ 98.6 %, PRD target ≥ 90 %).
- **Knee cave-in transfers well** (F1 0.80, target 0.75), using each person's own standing knee spacing as the baseline.
- **Depth recall is low because the two sides define "low enough" differently.** EC3D's "not low enough" squats still
  reach a knee angle of about 86° on average (range 56–112°). Their "correct" squats go to about 57°. Our rule follows
  PRD Appendix C: thighs about parallel, knee ≤ 95°. So most EC3D "not low enough" reps are full-depth reps by our
  standard. The same holds for lunges (EC3D "not low enough" ≈ 93°, our bottom is 100°). This is a difference in
  definition, not missed detections. We did **not** retune on EC3D, so this stays a fair held-out test.
- **Not testable on EC3D:**
  - *Front bent* (forward lean): EC3D rotates every pose so the spine is vertical (paper §4), so lean can't be measured.
  - *Feet too wide* and *knee passes toe*: the app doesn't check these.
  - Planks: not one of our exercises.
  - Squat instruction 10 (9 sequences): not described in the paper.
- For reference, the EC3D authors' own trained network reaches 90.9 % mistake-recognition accuracy on their test
  person after training on the other three. Our rules use no training data at all.

## SUS and ISO/IEC 25010 questionnaires (PRD §12.5, §12.6)

Participants sign the consent form above, do the task list (onboard, log 3 foods, one squat set, view the summary),
then open **Profile → Answer the survey** (`/survey`). They pick *user* or *IT expert*; IT experts get the extra
compatibility, security and maintainability items. Questions and scoring live in `src/lib/eval/survey.ts`
(SUS: Brooke's 10 items, score 0–100, target ≥ 68; ISO: weighted mean per characteristic, 1–5, with the verbal
interpretation 4.21–5.00 strongly agree · 3.41–4.20 agree · 2.61–3.40 neutral · 1.81–2.60 disagree · 1.00–1.80
strongly disagree).

Results for the paper (Supabase → SQL editor; answers are only ever reported as averages):

```sql
-- SUS: mean score and count per respondent group
select respondent_role, count(*) as n,
       round(avg((select sum(case when i % 2 = 1 then (a::int - 1) else (5 - a::int) end) * 2.5
                  from jsonb_array_elements_text(answers) with ordinality as t(a, i))), 1) as mean_sus
from survey_responses where kind = 'sus' group by 1;

-- ISO/IEC 25010: weighted mean per characteristic (item ids start with fs/pe/co/us/re/se/ma)
select respondent_role,
       case left(key, 2) when 'fs' then 'Functional suitability' when 'pe' then 'Performance efficiency'
         when 'co' then 'Compatibility' when 'us' then 'Interaction capability (usability)' when 're' then 'Reliability'
         when 'se' then 'Security' when 'ma' then 'Maintainability' end as characteristic,
       count(*) as answers, round(avg(value::int), 2) as weighted_mean
from survey_responses, jsonb_each_text(answers)
where kind = 'iso25010' group by 1, 2 order by 1, 2;
```

## Dietary calculation accuracy (PRD §12.4)

Checked by `src/lib/food/accuracy.test.ts`, which recomputes everything **independently of the app's build script**:
meal nutrition straight from `foods_fnri.csv` (Σ grams / 100 × the FNRI per-100 g value), and BMR / TDEE by hand
from Mifflin-St Jeor (1990). The live database recipes were spot-checked against the seed and match.

**20 sample meals** (every third recipe), app value vs hand calculation:

| Meal | App kcal | Hand kcal | Error |
|---|---|---|---|
| Tapsilog (lean beef tapa, garlic rice, egg) | 484 | 484.0 | 0.00 % |
| Lugaw with egg | 302 | 302.4 | 0.14 % |
| Pandesal with peanut butter and banana | 458 | 458.2 | 0.04 % |
| Ginisang itlog na may kamatis with rice | 387 | 386.6 | 0.11 % |
| Oatmeal with banana and milk | 458 | 458.4 | 0.09 % |
| Banana-oat pancakes | 453 | 453.2 | 0.04 % |
| Tinolang manok with rice | 489 | 489.4 | 0.08 % |
| Pinakbet with rice | 496 | 496.5 | 0.09 % |
| Nilagang baka with rice | 517 | 517.0 | 0.01 % |
| Ginataang kalabasa at sitaw with hipon | 514 | 513.7 | 0.06 % |
| Pancit canton with chicken, shrimp and vegetables | 546 | 546.3 | 0.05 % |
| Adobong kangkong with tokwa and rice | 451 | 451.1 | 0.03 % |
| Bistek tagalog with rice | 451 | 451.5 | 0.10 % |
| Pritong galunggong with kamatis and rice | 443 | 443.4 | 0.08 % |
| Ginisang sayote with chicken and rice | 401 | 401.1 | 0.03 % |
| Tinolang tahong with rice | 452 | 451.8 | 0.04 % |
| Tuna-tomato spaghetti | 469 | 469.0 | 0.00 % |
| Baked tilapia with potatoes and carrots | 374 | 374.3 | 0.07 % |
| Chicken, avocado and tomato rice bowl | 413 | 413.0 | 0.00 % |
| Nilagang kamote | 162 | 162.0 | 0.00 % |
| MAPE over the 20 meals | kcal | protein | carbs | fat | Target |
|---|---|---|---|---|---|
| | **0.05 %** | 0.18 % | 0.03 % | 0.35 % | ≤ 5 % |

The only differences come from rounding (whole kcal, 0.1 g); the arithmetic is exact. Logging a food by weight
uses the same per-100 g scaling (5 FNRI foods checked).

**10 profiles, Mifflin-St Jeor:** BMR = 10 × kg + 6.25 × cm − 5 × age + 5 (men) / − 161 (women); TDEE = BMR × activity
factor (1.2 / 1.375 / 1.55 / 1.725 / 1.9), rounded half-up.

| Profile | BMR by hand | App BMR | TDEE by hand | App TDEE |
|---|---|---|---|---|
| F, 22 y, 155 cm, 52 kg, light | 1217.75 → 1218 | 1218 | 1674 | 1674 |
| M, 25 y, 170 cm, 68 kg, moderate | 1622.5 → 1623 | 1623 | 2515 | 2515 |
| F, 30 y, 160 cm, 70 kg, sedentary | 1389 | 1389 | 1667 | 1667 |
| M, 35 y, 175 cm, 90 kg, light | 1823.75 → 1824 | 1824 | 2508 | 2508 |
| F, 40 y, 150 cm, 58 kg, moderate | 1156.5 → 1157 | 1157 | 1793 | 1793 |
| M, 45 y, 168 cm, 75 kg, sedentary | 1580 | 1580 | 1896 | 1896 |
| F, 50 y, 162 cm, 80 kg, active | 1401.5 → 1402 | 1402 | 2418 | 2418 |
| M, 19 y, 180 cm, 60 kg, very active | 1635 | 1635 | 3107 | 3107 |
| F, 60 y, 155 cm, 65 kg, sedentary | 1157.75 → 1158 | 1158 | 1389 | 1389 |
| M, 55 y, 172 cm, 82 kg, moderate | 1625 | 1625 | 2519 | 2519 |

**Result: 10 of 10 exact matches** (target: exact).

## Latency log (PRD §12.3)

Every saved camera session now stores mean fps, **p50 / p95 latency** (frame captured → joints back: the model alone
on-device, the full round trip in laptop-coach mode), the mode (`instanthmr` = on device, `remote` = laptop coach) and
a coarse device class (`iphone`, `android`, `windows`, …; nothing identifying).

- One account: `/dev/latency` shows the table by device and mode and downloads every session as CSV.
- Whole team (Supabase → SQL editor):

```sql
select device_class, pose_backend, count(*) as sessions,
       round(avg(avg_fps), 1) as mean_fps,
       percentile_cont(0.5) within group (order by p50_latency_ms) as median_p50_ms,
       max(p95_latency_ms) as worst_p95_ms
from workout_sessions where avg_fps is not null
group by 1, 2 order by 1, 2;
```

Day 6 reading (iPhone → RTX 3060 laptop through the Cloudflare tunnel, from the Show-speed overlay): **12–13 fps,
57–66 ms round trip, model 31–42 ms**. Targets: phones ≥ 8 fps and ≤ 200 ms round trip; laptop ≥ 15 fps and ≤ 100 ms.

## Informed consent (PRD §12.7) — template

> **NutriMove AI pilot test — consent**
> I am 18 or older. I agree to try the NutriMove AI app for about 20 minutes and answer two short questionnaires
> (SUS and ISO 25010). If I do the camera exercises, the video is processed live and **not recorded by the app**. If the
> team asks to record a clip for accuracy testing, it stays on the team's devices, only body-joint positions are kept,
> and the video is deleted after analysis. I can stop at any time without giving a reason. My answers are reported
> only as group averages, without my name. The app gives general fitness and nutrition guidance and is not medical
> advice.
>
> Name: ____________________  Signature: ____________________  Date: ____________

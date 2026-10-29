# Datasets used by NutriMove AI

NutriMove does **not train any model**. It uses one pretrained pose model and published food-composition data, and
it was evaluated on clips the team recorded. This page lists each source, what it is used for, and how to cite it.

## 1. Pose / skeleton coach

### 1a. The model's training data (pretrained; we did not train it)

| | |
|---|---|
| Model | **InstantHMR** (`instanthmr.onnx`, released on Hugging Face `momolesang/InstantHMR`; code: github.com/mohamdev/InstantHMR) |
| What it predicts | 70 body keypoints in 2D and 3D (Meta's MHR skeleton) from a 224 × 224 crop of one person |
| Trained on | The released ground-truth annotations of **`facebook/sam-3d-body-dataset`** (Hugging Face) — the human MHR body fits Meta used to build *SAM 3D Body*. Per the InstantHMR README, the training corpus is built from these sub-datasets: **SA-1B, AI Challenger (AIC), Harmony4D, COCO and MPII** |
| License | Model weights under Meta's SAM license (research / non-commercial use). Our use is a non-commercial school project. |
| Cite | InstantHMR (repository above) and Meta's *SAM 3D Body* (github.com/facebookresearch/sam-3d-body) |

How we use it: the 70 keypoints are mapped to 18 named joints (`src/lib/pose/instanthmr/adapter.ts`), smoothed
(One-Euro filter), and turned into knee / elbow / hip / torso angles. Rep counting and form checks are **rules on those
angles** (`src/lib/pose/analyzers/exercise-rules.json`), not a trained classifier, so no exercise dataset was needed
for training.

### 1b. Our evaluation dataset (team-recorded)

| | |
|---|---|
| What | Team member performing squats, lunges (and push-ups, being re-recorded) with good form and scripted mistakes, 2–3 m from a phone camera, side / 45° view |
| Stored | **Joints only** (18 joints × ~15 frames per second, no images) in `eval/clips/*.joints.json`, with per-rep labels in `eval/clips/*.labels.csv`. Videos stay on team devices (PRD §8.3, §12.7) |
| Labels | Rep count and per-rep mistakes (`shallow`, `knees-in`, `lean-forward`, `heels-up`, `hip-sag`, …), written by a person watching the video |
| Results | `docs/evaluation.md` (rep accuracy, per-check precision / recall / F1) |

### 1c. Public datasets for comparison (not used to build the app)

**EC3D was used as a held-out test**, with results and steps to reproduce in `docs/evaluation.md`: 98.6 % squat and 99.2 % lunge rep
counting, knee cave-in F1 0.80 on 4 people the rules were never tuned on. The others are options for further testing;
check the download terms on each site.

| Dataset | Contents | Fit for NutriMove |
|---|---|---|
| **EC3D** — Zhao et al., *3D Pose Based Feedback for Physical Exercises*, ACCV 2022 | 132 squat, 127 lunge and 103 plank sequences from 4 subjects, correct form plus labelled mistakes (squat: knees inward, not low enough, …; lunge: not low enough, knee past toe) | Closest match: same exercises and the same kind of mistake labels. Good held-out test for our form checks |
| **Fit3D / AIFit** — Fieraru et al., CVPR 2021 (fit3d.imar.ro) | 3M+ images with 3D motion capture, 37+ repeated exercises by trainers and trainees | 3D pose quality on fitness movements; repetition segmentation |
| **RepCount** — Hu et al., *TransRAC*, CVPR 2022 | 1,041 workout videos (squats, push-ups, …) with start / end of every repetition | Rep-counting accuracy on people other than the team |

### 1d. Exercise how-to photos (display only)

The start and end photos on the workout screen (18 of the 30 exercises, `public/exercises/<slug>/`) come from
[Free Exercise DB](https://github.com/yuhonas/free-exercise-db), released into the public domain (Unlicense). It
restructures the earlier [wrkout/exercises.json](https://github.com/wrkout/exercises.json) dataset; the photos' original
source isn't documented there. They are shown only as visual guides (resized to 640 px) and are not used to build or tune
the coach. Exercises without a photo that matches our version of the move show steps only
(`src/lib/workout/exercise-photos.ts`). Every photo's source, author and license is listed on the public `/credits` page; new photos must use a
license that allows reuse on a public site (public domain, CC0, CC BY, CC BY-SA), which a unit test checks.

## 2. Food and nutrition

| Source | Used for | Where |
|---|---|---|
| **DOST-FNRI Philippine Food Composition Tables (PhilFCT)** | 1,542 Filipino foods per 100 g edible portion; every row cites its FNRI Food ID | `supabase/seed/foods_fnri.csv` |
| **NutriMove recipe set** (team-written) | 65 recipes (48 Filipino), each a list of FNRI ingredient IDs + grams; nutrition is summed from FNRI, not typed by hand | `supabase/seed/recipes.source.json` → `scripts/build-recipe-seed.mjs` |
| **USDA FoodData Central** (Foundation, SR Legacy, Survey/FNDDS) | Foods not in FNRI, via the `food-search` Edge Function (key stays on the server) | fdc.nal.usda.gov, cached in the `foods` table |
| **Open Food Facts** | Packaged foods by barcode, via the `food-barcode` Edge Function | world.openfoodfacts.org (ODbL) |
| **Mifflin-St Jeor equation** (Mifflin et al., 1990) | Resting energy for calorie targets | `src/lib/agent/targets.ts` |

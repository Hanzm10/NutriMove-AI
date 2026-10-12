# NutriMove AI — Product Requirements Document (PRD)

| | |
|---|---|
| **Project** | NutriMove AI — an intelligent-agent fitness and nutrition coach |
| **Course** | CS 403 – Intelligent Agents, Technological Institute of the Philippines (QC), 1st Sem S.Y. 2026–2027 |
| **Faculty-in-charge** | Mr. Jess N. Garcia |
| **Proponents** | Dela Cruz, Peter · Mapua, Hanz Laurence · Ragudos, Aaron Angelo · Remo, Jerick Anthony · Valenzuela, Margaret Ashley |
| **Doc owner** | Hanz Laurence Mapua (System Analyst) |
| **Status** | Draft v1.1, for group sign-off (open questions resolved) |
| **Date** | 2026-10-12 (Mon) |
| **MVP deadline** | 2026-10-18 (Sun), a working, deployed MVP |
| **Source docs** | *CS 403 Concept Proposal (Sep 2026)*; group decision log; reference repo [mohamdev/InstantHMR](https://github.com/mohamdev/InstantHMR) |

> **How to read this doc.** Sections 1–5 explain *why* and *what*. Sections 6–11 explain *how*, and coding agents should build from them. Section 13 is the 7-day plan. Every requirement has an ID (e.g. `POSE-04`) and a priority:
> - **P0**: must work for the MVP demo.
> - **P1**: should ship this week if time allows.
> - **P2**: stretch goal or future work.

---

## 0. Decision log

| # | Decision | Status | Source |
|---|---|---|---|
| D1 | Title: **NutriMove AI**. Group project, 5 proponents. | ✅ Final | Concept proposal |
| D2 | Main feature: camera pose tracking with **InstantHMR** (3D pose). | ✅ Final | Group |
| D3 | Onboarding collects the user profile → generates a **meal plan** and a **workout plan**. | ✅ Final | Group |
| D4 | **Calorie tracking** is included. | ✅ Final | Group |
| D5 | Pose inference runs **in the browser** (onnxruntime-web) by default. **No video leaves the device** (or, in fallback mode, the local network; see D15). | ✅ Final | This session |
| D6 | Platform: **responsive web app + PWA** (installable on Android, iOS and desktop). This is how we meet "cross-platform". | ✅ Final | This session |
| D7 | Agent: **rule-based targets (Mifflin-St Jeor) + content-based filtering (cosine similarity) + weekly feedback rules**. **No LLM** makes decisions. | ✅ Final | This session |
| D8 | Exercises: **squat, push-up, lunge**. Squat is built first. | ✅ Final | This session |
| D9 | Ambitious proposal promises are mapped to realistic implementations (see §8.1). | ✅ Final | This session |
| D10 | Stack: **Next.js (App Router) + TypeScript, Supabase, three.js, onnxruntime-web**, deployed on Vercel. | ✅ Final (Next.js chosen over Vite) | Group + this session |
| D11 | Meal plans **filter and rank a curated recipe set** with Filipino dishes. No free-form generation. | ✅ Final | Group |
| D12 | Food data: **USDA FoodData Central**, **Open Food Facts** (barcode), and a **custom Filipino food table** (FNRI PhilFCT). API keys stay server-side. | ✅ Final | Group |
| D13 | Photo-based food logging → **future work**. | ✅ Final | Group |
| D14 | Build order: onboarding & targets → calorie logging → workout plans → pose tracking → meal plans. Pose work starts **in parallel on Day 1** because it carries the most risk. | ✅ Final | Group + this session |
| D15 | **Pose fallback = a laptop Python pose server on the local network.** If InstantHMR can't run in the browser, a laptop runs the reference InstantHMR + MHR pipeline in Python, and the phone opens a local link to it (§7.7.3). MediaPipe becomes the last-resort fallback. | ✅ Final | Group |
| D16 | The panel demo runs on **both a laptop and a phone**. | ✅ Final | Group |
| D17 | Objectives O2 and O4 are **merged** into one feedback objective. The proposal now has **4 objectives** (§3.1). | ✅ Final | Group |
| D18 | No PE instructor/physical therapist validation of thresholds, and no department ethics form needed. Thresholds are tuned on the team's labeled clips; participant consent is still collected (§12.7). | ✅ Final | Group |

### 0.1 Changes from the concept proposal (to note in the revised proposal or chapter 3)

| Proposal said | PRD does | Why |
|---|---|---|
| "WebSockets for camera feed streaming" | Pose runs **on the device** by default. In fallback mode (§7.7.3), frames stream over **WebSockets on the local Wi-Fi only**, from the phone to the team laptop. They're never sent to the cloud or stored. Only rep counts and form-error summaries reach the backend. | Privacy (RA 10173), no cloud GPU costs, lower latency. The WebSocket promise is still met in fallback mode. |
| "Cross-platform application" | Responsive web app + installable PWA | One codebase that can be built in one week. Native apps → future work. |
| "Voice controls" | **Spoken feedback** (Web Speech TTS) is P0. **Voice commands** ("start", "stop", "next") are P2. | Speech recognition support across browsers is inconsistent. |
| "AES-256 encryption at rest, OAuth 2.0/JWT" | Supabase Postgres (encrypted at rest by the platform) + Supabase Auth (JWT, Google OAuth) + Row-Level Security | Delivers the promise using managed services. |
| "Sub-100 ms processing latency" | Model inference **≤ 100 ms per frame** measured on the reference laptop; form-cue latency ≤ 300 ms after the error appears | Measurable, honest targets (see §8). |

---

## 1. Summary

NutriMove AI is a web app that acts as an **intelligent fitness and nutrition coach**.

- **Onboarding** collects the user's body data, goal, activity level, preferences and health screening. The agent then computes **daily calorie and macro targets** and generates a **7-day meal plan** (with Filipino dishes) and a **weekly workout plan**.
- During workouts, the phone or laptop camera runs **InstantHMR 3D pose estimation in the browser**. The app counts reps for squats, push-ups and lunges, shows a live **3D skeleton**, and gives **real-time spoken and visual form cues**.
- Users **log food** by searching USDA and Filipino foods or scanning barcodes (Open Food Facts).
- A **weekly check-in** feeds weight, adherence and workout performance back to the agent, which **adjusts targets, meals and workout difficulty**. This closes the perceive → decide → act loop.

---

## 2. Problem & background

From the concept proposal:

- **Physical inactivity is widespread.** About 81% of adults do not meet daily movement guidelines, largely because of screen-centric lifestyles and poor eating habits (Cordero, 2025).
- **People drop out.** Up to 65% of exercisers abandon routines within 6 months unless a coach supports their sense of competence and autonomy (Braga-Pereira et al., 2024). Human coaches are not accessible to everyone.
- **Without a coach, form suffers.** Incorrect posture reduces effectiveness and raises injury risk. Most fitness apps only show demo videos and give no personalized feedback.
- **Diet and exercise are tracked separately.** Existing apps rarely adapt exercise to food intake (or the reverse), and motivation is linked to both (Kanoski et al., 2022).

**Opportunity:** combine (a) deep-learning pose estimation for live form feedback and (b) nutrient analysis into **one agent** that adapts the user's plan every week.

---

## 3. Goals, objectives & success metrics

### 3.1 Objectives (from the proposal) → how this PRD meets them

| # | Proposal objective | Met by | Measured by |
|---|---|---|---|
| O1 | Real-time pose estimation using deep learning and skeletal keypoints | POSE-01…08 (InstantHMR in the browser, 3D skeleton) | FPS and latency (§12.3) |
| O2 | **Automated, personalized corrective feedback.** Evaluate live movement against standardized exercise postures and give immediate spoken and on-screen corrections that fix improper form and reduce injury risk *(merges the proposal's original O2 and O4)* | POSE-09…14 (rule-based form checks per exercise, cues ≤ 300 ms, per-rep labels, session summary) | Form-error precision and recall vs labeled clips (§12.2), cue latency (§12.3), user survey |
| O3 | Nutrient analysis of dietary intake + recommendations for the next day, week or month | FOOD-*, MEAL-*, AGENT-* | Calorie calculation accuracy (§12.4) |
| O4 | Evaluate performance, accuracy, usability | §12: rep accuracy, ISO/IEC 25010, SUS | Evaluation report |

**Revised objectives wording (for the proposal):**
1. To develop a real-time pose estimation module using deep learning and skeletal keypoint tracking to analyze exercise form and overcome the limitations of static, video-only fitness applications.
2. To implement an automated, personalized feedback system that evaluates live movement against standardized exercise postures and delivers immediate corrective guidance to fix improper form and reduce the risk of exercise-related injury.
3. To incorporate a nutrient analysis module that assesses user dietary intake to track nutritional balance alongside physical activity, and recommends dietary and workout actions for the following day, week, or month.
4. To evaluate the performance, accuracy, and usability of the developed system in terms of keypoint tracking precision, feedback latency, dietary analysis accuracy, and overall user experience.

### 3.2 MVP success criteria (by 2026-10-18)

1. A new user can sign up → give consent → complete screening and onboarding → see targets, a meal plan and a workout plan in **≤ 5 minutes**.
2. A user can log at least 3 foods (search, Filipino table, barcode) and see daily calories and macros update.
3. A user can start a **squat** set in front of a laptop webcam and get reps counted with **≥ 90% accuracy** on our internal test clips, plus at least 2 working form cues. Push-up and lunge work at P0 level (rep counting) by end of week.
4. The weekly check-in changes targets according to the documented rules.
5. The app is deployed at a public HTTPS URL and installable as a PWA.

### 3.3 Non-goals

- Medical diagnosis, treatment, or clinical nutrition therapy.
- Multi-person tracking, full-body mesh rendering, photo food recognition, social features, wearables integration, payments.

---

## 4. Users

### 4.1 Target beneficiaries (from the proposal)
1. **Health-conscious individuals and general users** (primary). Adults 18+ who want guided home workouts and simple calorie tracking.
2. **Fitness and wellness professionals** (secondary). They can review a client's logs and session summaries. Export is P2.
3. **Proponents and future researchers.** A reference architecture for intelligent-agent health apps.
4. **Persons with disabilities.** Accessibility requirements apply to every screen (§8.4).

### 4.2 Personas

| Persona | Profile | Needs |
|---|---|---|
| **Migs, 21, student** | Sedentary, wants to lose 5 kg, eats in carinderias, owns no equipment | Bodyweight workouts, Filipino food logging, a cheap meal plan |
| **Ana, 34, office worker** | Beginner, worried about knee pain from doing squats wrong | Form feedback, a gentle progression, spoken cues so she doesn't have to watch the screen |
| **Leo, 27, low-vision user** | Uses a screen reader and 200% zoom | Rep counts and cues spoken aloud, high contrast, keyboard-friendly flows |

### 4.3 Key user stories

- As a new user, I answer a few questions and get daily calorie and macro targets explained in plain language.
- As a user, I get a 7-day meal plan made of dishes I actually eat (adobo, sinigang, tinola…) that fits my targets and allergies.
- As a user, I log my lunch by searching "sinigang na baboy" or scanning a snack's barcode.
- As a user, I start a squat set. The app counts my reps and tells me "go deeper" or "keep your knees out" in real time.
- As a user, I see a 3D skeleton of my movement so I understand the correction.
- As a user, I do a weekly check-in and the app adjusts my calories and workout difficulty, telling me why.
- As a screen-reader user, I hear my rep count and cues without looking at the screen.

---

## 5. Scope

| Module | P0 (MVP this week) | P1 (this week if time) | P2 / future work |
|---|---|---|---|
| Auth & consent | Email + password, Google OAuth, consent screen, delete account | Data export (JSON) | — |
| Screening & onboarding | PAR-Q+-style screening, profile, goal, activity, diet preferences, allergies, equipment | Edit profile → regenerate plans | — |
| Targets | Mifflin-St Jeor BMR, TDEE, goal adjustment, macros, floors and caps | Explanation tooltips | — |
| Calorie logging | USDA search, Filipino table, barcode via Open Food Facts, servings, daily totals | Quick-add custom food, favorites/recent | Photo logging |
| Meal plans | 7-day plan from curated recipes, cosine ranking, swap a meal | Like/dislike feedback → re-ranking | Grocery list |
| Workout plans | Weekly plan of bodyweight exercises, sets and reps by level | Progressive overload from session data | Video demos per exercise |
| Pose tracking | In-browser InstantHMR, squat rep count + cues, 3D skeleton, push-up & lunge rep count | Push-up & lunge form cues, calibration screen | Voice commands, more exercises, mesh |
| Agent loop | Weekly check-in → rule-based target and plan adjustment | Daily nudge ("you're 400 kcal under") | Monthly report |
| Dashboard | Today: calories in/target, macros, today's workout | Weekly charts (weight, calories, reps) | Coach export |
| Accessibility | WCAG 2.1 AA basics, aria-live, TTS cues, high-contrast mode | 200% text audit, reduced motion | Voice commands |

---

## 6. Intelligent agent design (the part the CS 403 panel will grade)

### 6.1 Agent type
NutriMove AI is a **goal-based, utility-driven agent with a learning-style feedback loop**:
- **Goal-based.** It works toward the user's goal (lose, maintain or gain weight; improve fitness).
- **Utility-driven.** It ranks candidate meals and exercises by a utility score (cosine similarity + constraint penalties).
- **Adaptive.** A weekly feedback rule set updates its internal model (targets, difficulty level, preference vector) from what it observes.

It also contains a **reflex sub-agent**: the real-time form coach maps the current pose to an immediate cue (condition → action rules).

### 6.2 PEAS

| | Description |
|---|---|
| **Performance measure** | Adherence to calorie targets (±10%), weekly weight trend toward goal within safe limits, completed workouts, rep form quality (% reps without form errors), user satisfaction (SUS) |
| **Environment** | The user, their camera feed (on the device), food database, recipe and exercise catalogs, logged history. Partially observable, stochastic, sequential, dynamic (during sessions), single-agent |
| **Actuators** | On-screen plans and targets, spoken and visual form cues, rep counter, 3D skeleton, notifications/nudges, plan adjustments |
| **Sensors** | Onboarding answers, food logs, barcode scans, camera frames → 3D keypoints, check-in inputs (weight, perceived difficulty, adherence) |

### 6.3 Architecture

```
          ┌─────────────────────────── Agent ─────────────────────────────┐
Percepts  │  Knowledge base         Decision modules          Actions      │
────────► │  • profile & screening  • TargetEngine (rules)  ─► targets      │
 onboarding│ • food DB, recipes     • MealRecommender (CBF)  ─► meal plan    │
 food logs │ • exercise catalog     • WorkoutRecommender(CBF)─► workout plan │
 check-ins │ • history (logs,       • AdaptationRules        ─► adjustments  │
 keypoints │   sessions, ratings)   • FormCoach (reflex)     ─► live cues    │
          └────────────────────────────────────────────────────────────────┘
                     ▲                                         │
                     └──────── weekly feedback loop ◄──────────┘
```

**All decision modules are deterministic TypeScript functions in `packages/agent` (or `src/lib/agent`) with unit tests.** This makes the agent explainable: every output includes a `reasons: string[]` field that the UI shows ("Calories lowered by 150 kcal because your weight stayed flat for 2 weeks").

### 6.4 Explainability requirement
- `AGENT-01` (P0): Every target, plan and adjustment stores the inputs and the rule(s) that produced it (`explanation` JSON column). The UI shows them in plain language.

---

## 7. Functional requirements

### 7.1 Auth, consent & account (AUTH)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| AUTH-01 | P0 | Sign up and log in with email + password and Google OAuth via Supabase Auth | A user can register, verify, log in and log out; the session persists across reloads |
| AUTH-02 | P0 | **Informed consent** screen before any data is collected: purpose, data collected, on-device video processing, retention, rights under RA 10173, contact | Consent stored with timestamp and version in `consents`; nobody can continue without consenting |
| AUTH-03 | P0 | Separate **camera consent** prompt before the first pose session, stating that "video is processed on your device and never uploaded" | Stored as a consent type `camera` |
| AUTH-04 | P0 | Delete account → cascade-delete all user rows | All rows for that `user_id` are gone (verified by SQL) |
| AUTH-05 | P1 | Export my data (JSON download) | The file contains profile, logs, sessions, check-ins |
| AUTH-06 | P0 | Medical disclaimer shown in onboarding and footer: "NutriMove AI is not a medical device and does not give medical advice." | Visible on every page footer |

### 7.2 Screening & onboarding (ONB)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| ONB-01 | P0 | **Eligibility screening**: age, pregnancy or breastfeeding, and a short **PAR-Q+-style** checklist (heart condition, chest pain, dizziness, bone/joint problems, BP/heart meds, other reason) | See the rules below |
| ONB-02 | P0 | **Under 18 → blocked**, with a friendly message ("NutriMove AI is for adults 18+") | Can't proceed |
| ONB-03 | P0 | **Pregnant or breastfeeding → no calorie deficit**, maintenance targets only, and a banner to consult a professional. Workouts are limited to the low-intensity plan | Target engine forces `goal = maintain` |
| ONB-04 | P0 | **Any PAR-Q "yes" → "clearance advised" flag.** The user must acknowledge they consulted, or will consult, a physician. The plan starts at beginner level | The `screening.flagged` value is true; the workout level is capped at beginner |
| ONB-05 | P0 | Profile: sex (for the BMR formula), birthdate, height (cm), weight (kg), target weight (optional), activity level (5 options), goal (lose / maintain / gain), experience level (beginner / intermediate), equipment (none / mat / dumbbells), workout days per week (2–6), minutes per session | Validated with zod; metric units with ft/in and lb converters |
| ONB-06 | P0 | Diet preferences: dietary pattern (omnivore / pescatarian / vegetarian), allergies (multi-select: peanut, shellfish, fish, egg, milk, soy, wheat/gluten), dislikes (free tags), budget level (low / mid), Filipino-cuisine preference (yes / mixed) | Stored in `profiles.diet_prefs` JSON |
| ONB-07 | P0 | On submit: compute targets → generate meal plan → generate workout plan → show a "Your plan" summary with explanations | Completes in < 3 s |
| ONB-08 | P0 | Onboarding is resumable (progress saved per step) | Reloading mid-flow resumes at the same step |

### 7.3 Target engine (TGT)

All values are rounded and stored in `targets`, with versioning (one row per change, `effective_from`).

| ID | Pri | Rule |
|---|---|---|
| TGT-01 | P0 | **BMR (Mifflin-St Jeor):** male `10·kg + 6.25·cm − 5·age + 5`; female `10·kg + 6.25·cm − 5·age − 161` |
| TGT-02 | P0 | **TDEE = BMR × activity factor:** sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very active 1.9 |
| TGT-03 | P0 | **Goal adjustment:** lose → TDEE − 500 kcal (beginners), but the deficit never exceeds 25% of TDEE; maintain → TDEE; gain → TDEE + 300 kcal |
| TGT-04 | P0 | **Calorie floor:** never below **1,200 kcal (female) / 1,500 kcal (male)**, and never below BMR when the user is flagged in screening. When the floor kicks in, the explanation says so |
| TGT-05 | P0 | **Safe weight-loss cap:** expected loss is capped at **1% of body weight per week** (max ~1 kg/week). The planned deficit is reduced if it would exceed this |
| TGT-06 | P0 | **Macros:** protein **1.6 g/kg** (lose/gain) or 1.2 g/kg (maintain), capped at 2.2 g/kg; fat **25% of kcal** (min 0.6 g/kg); carbs = the remaining calories. Fiber target 25 g |
| TGT-07 | P0 | **Expected timeline** shown only as a range ("about 10–14 weeks"), never as a promise |
| TGT-08 | P0 | Unit tests cover male/female, each goal, floor triggered, cap triggered, pregnancy override |

### 7.4 Calorie & food logging (FOOD)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FOOD-01 | P0 | **Unified food search** over (1) the local `foods` table (Filipino dishes + cached items) and (2) USDA FDC `/foods/search` (Foundation, SR Legacy, Survey/FNDDS data types), through a **Supabase Edge Function `food-search`** that holds `USDA_API_KEY` | Results within 1.5 s; Filipino matches ranked first; the key never reaches the client |
| FOOD-02 | P0 | **Barcode scanning**: camera barcode reading (native `BarcodeDetector` when available, otherwise `@zxing/browser`) → Edge Function `food-barcode` → Open Food Facts `GET /api/v2/product/{barcode}.json` with an identifying User-Agent | A known barcode returns name + kcal/100 g + macros; "not found" leads to a manual-entry form |
| FOOD-03 | P0 | **Filipino food table**: at least **60 common dishes and ingredients** seeded with kcal, protein, carbs, fat and fiber per 100 g and per typical serving, taken from **DOST-FNRI Philippine Food Composition Tables (PhilFCT)** with the source cited per row | `foods.source = 'fnri'` and a `source_ref` on every row |
| FOOD-04 | P0 | Log an entry: food, meal slot (breakfast / lunch / dinner / snack), quantity (servings or grams), date | Entry saved; nutrient values **snapshotted** onto the log row (so later DB edits don't change history) |
| FOOD-05 | P0 | Daily summary: kcal and macros eaten vs target, remaining, progress rings | Updates right after a log |
| FOOD-06 | P0 | Edit or delete log entries | — |
| FOOD-07 | P1 | Recent and favorite foods; quick-add (kcal + macros only) | — |
| FOOD-08 | P0 | Cache external results in `foods` (with `source = 'usda' or 'off'` and `external_id`) to cut API calls | Second search for the same item hits the DB |
| FOOD-09 | P0 | Log a **planned meal** with one tap from the meal plan | Creates log entries from the recipe's nutrition |

### 7.5 Meal plan recommender (MEAL)

**Data:** `recipes`, with at least **50 recipes, 60%+ Filipino** (e.g. chicken adobo, sinigang na hipon, tinola, pinakbet, ginisang monggo, tortang talong, bangus sisig, lugaw, champorado-lite, fruit + oats). Each recipe has per-serving nutrition, meal slots, tags, allergens, diet pattern, cost level and prep time. Nutrition is computed from FNRI/USDA ingredient values.

**Algorithm (content-based filtering):**
1. **Hard filters**: allergens ∩ user allergies = ∅; diet pattern compatible; dislikes excluded; slot matches.
2. **Feature vector per recipe** (normalized 0–1):
   `[protein_kcal%, carb_kcal%, fat_kcal%, kcal_per_serving_norm, fiber_norm, is_filipino, budget_low, prep_quick, tag one-hots (soup, rice_dish, vegetable, seafood, chicken, pork, beef, egg, noodle)]`
3. **User vector**: target macro ratios, desired kcal per slot (breakfast 25%, lunch 35%, dinner 30%, snack 10% of the daily target), preference flags. Later the average vector of **liked** recipes is blended in, and disliked ones are pushed away (`u = 0.7·u_profile + 0.3·mean(liked) − 0.2·mean(disliked)`, then normalized).
4. **Score** = cosine(u, r) − 0.15·repeat_penalty (same recipe within 3 days) − 0.1·same_protein_as_previous_meal.
5. **Assembly**: for each day and slot, pick the top-scoring recipe. Then scale servings (0.5–2.0 in 0.25 steps) so the day lands within **±10% of the kcal target** and **protein ≥ 90%** of target. If it can't, swap in the next candidate (greedy, max 20 iterations).

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| MEAL-01 | P0 | Generate a 7-day plan on onboarding and on request | ≥ 6 of 7 days within ±10% kcal; no allergen violations (unit test) |
| MEAL-02 | P0 | Show each meal with kcal and macros, servings, and a "why this" explanation (top matching features) | — |
| MEAL-03 | P0 | Swap a meal → next best candidate for that slot | — |
| MEAL-04 | P1 | 👍/👎 on recipes updates the preference vector | Next generation reflects it |
| MEAL-05 | P0 | Recommender is a pure function with unit tests | — |

### 7.6 Workout plan recommender (WORK)

**Data:** `exercises` catalog (≥ 25 bodyweight/mat/dumbbell moves). Each one has muscle groups, equipment, difficulty (1–3), impact (low/high), a `pose_supported` flag (squat, push-up, lunge = true), contraindication tags (knee, wrist, lower_back, shoulder), and **regressions and progressions** (e.g. wall push-up → knee push-up → push-up → decline push-up; box squat → squat → jump squat; split squat → reverse lunge → walking lunge).

**Algorithm:**
1. Hard filters: equipment available; difficulty ≤ user level; exclude contraindications flagged in screening; pregnancy → low-impact only.
2. A weekly **split template** based on days/week: 2–3 days → full body; 4 days → upper/lower; 5–6 days → full body + conditioning.
3. Fill each session's muscle-group slots by cosine similarity between the user vector (goal emphasis, level, preferred muscle groups) and the exercise vector. **Pose-supported exercises are guaranteed to appear in at least 2 sessions per week.**
4. **Volume by level:** beginner 2×8–10, intermediate 3×10–12. Lose-weight goal adds a 10-min low-impact conditioning block. Rest 60–90 s.
5. **Progression (P1):** if the user completed all prescribed reps with < 20% of reps showing form errors in 2 consecutive sessions → +2 reps, or move to the progression variant. If > 40% of reps show form errors or the user rates the session "too hard" → move to the regression variant.

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| WORK-01 | P0 | Generate a weekly plan from the profile | Respects equipment, level and contraindications (unit test) |
| WORK-02 | P0 | Today's workout view; pose-supported exercises show a **"Start with camera coach"** button | — |
| WORK-03 | P0 | Manual logging for exercises that aren't pose-supported (sets × reps done) | — |
| WORK-04 | P1 | Automatic progression and regression per rule 5 | — |
| WORK-05 | P0 | Post-session rating: too easy / just right / too hard | Stored on `workout_sessions` |

### 7.7 Pose tracking & form coach (POSE)

#### 7.7.1 Pipeline (all on the device)

```
getUserMedia (640×480 or 1280×720, user-facing)
  └─► Person box:
        • frame 0 / lost tracking → person detector (MediaPipe Tasks-Vision ObjectDetector,
          EfficientDet-Lite0, class "person", Apache-2.0)
        • otherwise → box from previous frame's 2D keypoints, expanded 1.2×
          (InstantHMR's own "detector stride" trick; run the detector every 15 frames to re-sync)
  └─► Preprocess (match InstantHMR exactly):
        square crop = 1.2 × max(box w, h) around the box center, resize to 224×224,
        RGB, /255, ImageNet normalize (mean [0.485,0.456,0.406], std [0.229,0.224,0.225]), NCHW
        cliff_cond (3,) = focal-aware: [atan((cx−W/2)/f), atan((cy−H/2)/f), max(bw,bh)/f]
                          with f = 1.05·√(W²+H²) if uncalibrated,
                          OR pixel form [2cx/W−1, 2cy/H−1, max(bw,bh)/max(W,H)]
                          — read `cliff_focal` from the ONNX metadata to choose
  └─► onnxruntime-web InferenceSession (WebGPU EP → fallback WASM SIMD+threads), in a Web Worker
        outputs: joints_2d (70,2) normalized crop coords, joints_3d (70,3) metres, Y-down, body-centred
  └─► Canonical skeleton adapter → 17 named body joints (see Appendix B)
  └─► One-Euro filter per joint coordinate (min_cutoff 1.0, beta 0.01; tune)
  └─► Exercise analyzer (angles → state machine → reps + form flags)
  └─► UI: video + 2D overlay, three.js 3D skeleton, rep counter, cue banner, TTS, aria-live
```

> ⚠️ **Day-1 gate (must be checked first).** InstantHMR has several ONNX exports. Some **have no `joints_3d` output**. Those derive the 70 keypoints from Meta's MHR forward pass (`pymomentum`, Python only), which **cannot run in the browser**. On Day 1, load the released `instanthmr.onnx` from HuggingFace (`momolesang/InstantHMR`) and print its input/output names, sizes and metadata. Then decide:
> - **A (expected):** it outputs `joints_3d` → proceed as designed.
> - **B:** only `joints_2d` → use InstantHMR 2D keypoints for angles (form checks use a side view), and show a 2.5D skeleton. Or →
> - **C (team decision, D15):** run the **reference InstantHMR pipeline in Python on a team laptop** (RF-DETR + InstantHMR + MHR/`pymomentum` for `joints_3d`) as a **local pose server**. The phone or browser opens a local link and streams frames to it (§7.7.3). This keeps the full 3D InstantHMR model, as close to the reference repo as possible.
> - **D (last resort):** **MediaPipe Pose Landmarker** in the browser (33 joints, 3D world landmarks), only if the laptop server also fails or no laptop is available.
>
> Also gate on speed: if in-browser InstantHMR runs at **< 10 FPS** on the reference laptop with WebGPU/WASM → use C for the live demo.

**Design rule:** exercise logic **never** reads raw model indices. It reads `CanonicalPose` (named joints). Every backend has an adapter, so switching is a one-line config change: `NEXT_PUBLIC_POSE_BACKEND=instanthmr|remote|mediapipe`. Analyzers, cues, the 3D skeleton and session saving run in the browser **in all modes**. Only the source of keypoints changes.

#### 7.7.3 Fallback mode: laptop pose server on the local network

```
Phone (or laptop) browser                         Team laptop (same Wi-Fi / hotspot)
─────────────────────────                         ─────────────────────────────────
getUserMedia → downscale to 640 px wide
→ JPEG (quality 0.7) ~15 fps
→ WebSocket  wss://<laptop-ip>:8443/ws/pose  ───►  FastAPI + uvicorn (Python 3.12)
                                                   PosePipeline from mohamdev/InstantHMR:
                                                   RF-DETR nano (detector stride 3)
                                                   → InstantHMR ONNX (CUDA / CoreML / CPU)
                                                   → MHR forward pass (pymomentum) if no joints_3d head
◄─── JSON {frame_id, t_server_ms, joints_2d (frame px),  joints_3d (m, Y-down), bbox, score}
→ RemotePoseEstimator → CanonicalPose → One-Euro → analyzers → UI / TTS / three.js
```

- **Server code** lives in `pose-server/` (Python). It wraps InstantHMR's `PosePipeline` as close to the reference repo as possible: `server.py` (FastAPI WebSocket endpoint + `/health`), `requirements.txt`, and a `README` that covers setup with the repo's `install.py` + `requirements-mhr.txt`. It handles one client at a time and **keeps only the latest frame** (drops stale frames so latency doesn't build up).
- **Protocol:** client → binary message `[uint32 frame_id][JPEG bytes]`; server → JSON text message. The client keeps **at most 2 frames in flight**.
- **"Local link":** the laptop also serves the Next.js app (`next start` or `next dev --experimental-https`), so the phone simply opens `https://<laptop-ip>:3000`. **HTTPS is required.** Phone browsers only allow camera access on secure origins. Use `mkcert` to create a local certificate (install its root CA on the demo phone), or tunnel with `cloudflared`/`ngrok` if installing the CA is a problem. The app shows a QR code for the link on the laptop's screen.
- **Two demo layouts:**
  1. **Phone as camera + display:** the phone streams its camera to the laptop and shows the coach UI. This is the main phone demo.
  2. **Laptop as camera + display:** the laptop webcam feeds the local server directly (`ws://localhost`). This is the most reliable panel demo.
- **Privacy:** frames are processed in memory, **never written to disk or logged**, and travel only on the local network. The camera consent text (AUTH-03) gets a variant: "video is processed on your device or on the team's local laptop, and is never uploaded or stored".
- **Performance target:** ≥ 15 FPS and ≤ 150 ms round trip on 5 GHz Wi-Fi or a phone hotspot. Log the round trip, server inference time and FPS in the debug overlay.

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| POSE-18 | P0 *(if the Day-1 gate fails)* | Python pose server (`pose-server/`) exposing `/ws/pose` + `/health`, using InstantHMR's `PosePipeline` | Returns `joints_3d` for a test image; 60 s test session at ≥ 15 FPS on the team laptop |
| POSE-19 | P0 *(if gate fails)* | `RemotePoseEstimator` in the web app, with reconnect logic, frame dropping, and "Pose server not reachable: check Wi-Fi" error state | Switching `NEXT_PUBLIC_POSE_BACKEND=remote` needs no analyzer/UI change |
| POSE-20 | P0 *(if gate fails)* | Local HTTPS setup documented (mkcert) + QR code to the local link | A team phone opens the app and gets camera access in < 2 min from a clean setup |
| POSE-21 | P1 | Server-side frame timing exported with the latency log (§12.3) | — |

#### 7.7.2 Requirements

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| POSE-01 | P0 | Load the ONNX model lazily on the workout screen, cache it with Cache Storage / service worker, show a progress bar | Second load < 2 s |
| POSE-02 | P0 | Inference runs in a **Web Worker**; the UI thread stays responsive | UI interactions not blocked during tracking |
| POSE-03 | P0 | WebGPU when available, otherwise WASM; show the active backend and FPS in a debug overlay (`?debug=1`) | — |
| POSE-04 | P0 | Single-person tracking; if confidence is lost or no person is seen for > 1 s → "Step into frame" prompt | — |
| POSE-05 | P0 | **Setup/calibration screen** per exercise: shows the recommended camera angle (squat: front or 45°; push-up: side; lunge: side), distance ("full body visible, head to feet"), and a green check when all required joints are in frame | Session starts only after 1 s of a valid full-body view |
| POSE-06 | P0 | One-Euro smoothing on all joints; angles are computed from smoothed 3D joints | The rep counter doesn't double-count from jitter on test clips |
| POSE-07 | P0 | **3D skeleton viewer** (three.js): body edges only (hands omitted), orbit controls, mirrored toggle, rendered next to or overlaid on the video | ≥ 30 FPS render |
| POSE-08 | P0 | **No frames are uploaded or stored.** Only aggregates (reps, form flags, durations) are saved | Network tab shows no image payloads (manual test) |
| POSE-09 | P0 | **Rep counting state machine** per exercise with hysteresis: `TOP → DESCENDING → BOTTOM → ASCENDING → TOP` = 1 rep. The bottom must be held ≥ 2 frames; a rep needs a minimum duration of 0.6 s | ≥ 90% count accuracy on internal test clips (squat by Day 3) |
| POSE-10 | P0 | **Squat** analyzer (thresholds in Appendix C) | Counts + ≥ 2 cues (depth, knees caving / torso lean) |
| POSE-11 | P0 | **Push-up** and **lunge** analyzers: rep counting P0, cues P1 | — |
| POSE-12 | P0 | **Real-time cues**: an on-screen banner + **TTS (Web Speech API)**, at most one cue every 2 s, prioritized by severity; also announced via an `aria-live="assertive"` region | Cue shown ≤ 300 ms after the error condition is first met |
| POSE-13 | P0 | Each rep is labeled **good** or **needs work** with its error codes; the live counter shows ✓ or ⚠ | — |
| POSE-14 | P0 | **Session summary**: reps per set, % good reps, top error with a tip, duration. Saved to `workout_sessions` and `session_sets` | Row written; feeds the WORK-04 progression rule |
| POSE-15 | P1 | Voice-count option ("one, two…") and set timer / rest timer | — |
| POSE-16 | P2 | Voice commands: "start", "pause", "next" (Web Speech Recognition, Chrome only) | — |
| POSE-17 | P0 | Thresholds are stored in a JSON config (`exercise-rules.json`) so they can be tuned without code changes | — |

### 7.8 Agent feedback loop: weekly check-in (AGENT)

| ID | Pri | Requirement |
|---|---|---|
| AGENT-01 | P0 | Every recommendation stores an `explanation` (inputs + rule IDs + human-readable reasons) |
| AGENT-02 | P0 | **Weekly check-in** (prompted 7 days after the last one): current weight, adherence self-rating (1–5), energy/hunger (1–5), workout difficulty (easy / right / hard), any new injury or pain (y/n) |
| AGENT-03 | P0 | **Adaptation rules** (computed from the 2-week weight trend, a linear regression over logged weights): <br>• **Lose goal**, losing < 0.25%/wk for 2 check-ins **and** average logged intake within ±10% of target → **−150 kcal** (respecting the floor) <br>• **Lose goal**, losing > 1%/wk → **+150 kcal** <br>• **Gain goal**, gaining < 0.1%/wk → +150 kcal; > 0.5%/wk → −100 kcal <br>• Logged intake differs from target by > 20% → **do not change targets**; instead show a tip about adherence (the problem is adherence, not the target) <br>• Hunger ≥ 4 → shift +5% of kcal from carbs to protein, and favor high-fiber recipes in the next plan <br>• Workout rated "hard" twice in a row or new pain → regress exercises / −1 set; "easy" twice + good form → progress <br>• New pain/injury = yes → banner to rest and consult; pose sessions for the affected area paused |
| AGENT-04 | P0 | After a check-in: recompute targets → regenerate next week's meal and workout plans → show a "What changed and why" card |
| AGENT-05 | P1 | Daily nudge on the dashboard (e.g. "You're 450 kcal under target. Add a snack like a boiled egg + banana") |
| AGENT-06 | P0 | The rules engine is pure and unit-tested with at least 10 scenario tests |

### 7.9 Dashboard & progress (DASH)

| ID | Pri | Requirement |
|---|---|---|
| DASH-01 | P0 | Today: calories eaten vs target (ring), macros (bars), today's meals (from plan, with log buttons), today's workout card |
| DASH-02 | P1 | Progress page: weight trend (line), daily kcal vs target (bars, 14 days), reps and % good reps per exercise (line) |
| DASH-03 | P0 | Bottom nav on mobile: Today · Food · Workout · Plan · Profile |

---

## 8. Non-functional requirements

### 8.1 Proposal promises → implementation

| Proposal promise | Implementation | Verification |
|---|---|---|
| Sub-100 ms processing (ISO 25010 performance efficiency) | Model inference ≤ 100 ms/frame (p50) on the reference laptop; end-to-end ≥ 15 FPS; cue latency ≤ 300 ms | Debug overlay timings + latency log export (§12.3) |
| WCAG 2.1 AA / WAI-ARIA / ISO 9241-210 | See §8.4 | axe DevTools + Lighthouse a11y ≥ 90 + manual screen-reader test |
| Voice controls | TTS cues (P0), voice commands (P2) | Manual |
| OWASP security | OWASP ASVS L1 checklist, RLS on all tables, secrets server-side, input validation (zod), CSP headers | Checklist in `docs/security.md` |
| AES-256 at rest | Supabase-managed Postgres storage encryption | Cite the Supabase security docs in the paper |
| OAuth 2.0 / JWT | Supabase Auth (Google OAuth, JWT sessions) | — |
| WebSockets camera streaming | On-device by default; **LAN-only WebSocket streaming** to the laptop pose server in fallback mode (§7.7.3) | Round-trip latency log |

### 8.2 Performance
- First load (dashboard) LCP < 2.5 s on 4G. The pose model is lazy-loaded only on workout screens.
- Pose: ≥ 15 FPS end-to-end on the reference laptop (and the target phone, measured on Day 6); a target phone hitting ≥ 8 FPS is acceptable on mobile with a "best on laptop" note.
- API: food search p95 < 1.5 s.

### 8.3 Privacy, security & ethics
- **RA 10173 (Data Privacy Act):** consent (AUTH-02/03), purpose limitation, data minimization (no video, no photos), access/export (AUTH-05), erasure (AUTH-04), a privacy notice page, a named data protection contact (proponent).
- **Health data is sensitive personal information.** Store only what's needed. RLS `user_id = auth.uid()` on every user table. The service-role key is only used in Edge Functions.
- **No medical claims.** Copy review checklist: never use "cure", "treat", "diagnose", or "guaranteed results".
- **Guardrails** (enforced in code, unit-tested): 18+ only, calorie floor, 1%/week loss cap, pregnancy → maintenance, PAR-Q flag → beginner cap + clearance acknowledgment, pain reported → pause.
- **Model licensing:** InstantHMR code is Apache-2.0. Its **weights are under the SAM license** (trained on SAM 3D Body labels). The RF-DETR detector is not used in the browser. RF-DETR is used only in the laptop pose server. Note academic/non-commercial use in the paper's limitations. MediaPipe is Apache-2.0.

### 8.4 Accessibility (WCAG 2.1 AA)
- Semantic HTML, labeled form controls, focus-visible styles, full keyboard navigation, skip link.
- Color contrast ≥ 4.5:1 (text). **High-contrast theme** toggle. Never communicate state with color alone (✓/⚠ icons + text).
- Text scales to 200% without loss of content (rem units, no fixed heights).
- `aria-live` regions for rep count (polite) and form cues (assertive). TTS on by default in sessions, with a toggle.
- `prefers-reduced-motion` respected (no animated rings).
- Touch targets ≥ 44×44 px.

### 8.5 Compatibility
- Chrome/Edge (desktop and Android) are primary; Safari iOS 17+ is secondary (WASM backend, as WebGPU support varies); Firefox works on a best-effort basis.
- Requires camera permission and HTTPS.

### 8.6 Reliability
- Food logging and today's plan work offline once loaded (PWA cache, P1); writes are queued and retried.
- Every pose session saves partial results if the tab closes (beforeunload → save).

---

## 9. Technical architecture

### 9.1 Stack

| Layer | Choice |
|---|---|
| Frontend | **Next.js 15 (App Router) + TypeScript**, Tailwind CSS, shadcn/ui, react-hook-form + zod, TanStack Query, Recharts |
| Pose | **onnxruntime-web** (WebGPU + WASM), Web Worker, `@mediapipe/tasks-vision` (person detector; Pose Landmarker last-resort fallback), **three.js** via `@react-three/fiber` + `@react-three/drei` |
| Pose server (fallback, §7.7.3) | Python 3.12, FastAPI + uvicorn (WebSockets), InstantHMR `PosePipeline` (RF-DETR + ONNX Runtime + `pymomentum`), mkcert for local HTTPS |
| Barcode | `BarcodeDetector` → `@zxing/browser` fallback |
| Backend | **Supabase**: Postgres + RLS, Auth (email, Google), Edge Functions (Deno) for `food-search`, `food-barcode` |
| Hosting | Vercel (frontend), Supabase Cloud (free tier) |
| PWA | `@serwist/next` (service worker, manifest, model caching) |
| Testing | Vitest (agent, rules, analyzers), Playwright (onboarding E2E smoke), recorded-clip harness for pose |
| Tooling | pnpm, ESLint, Prettier, GitHub Actions (lint + typecheck + test) |

> **onnxruntime-web + Next.js note:** serve the `ort-wasm*.wasm` / `.mjs` files from `/public/ort/` and set `ort.env.wasm.wasmPaths = '/ort/'`. Load ORT only in client components and the worker (`dynamic(..., { ssr: false })`). Multi-threaded WASM needs cross-origin isolation (`COOP: same-origin`, `COEP: require-corp`) on the workout route. If that breaks third-party assets, use single-thread WASM.

### 9.2 Repository layout

```
/ (Next.js app)
├─ app/
│  ├─ (auth)/login, signup, consent
│  ├─ onboarding/[step]
│  ├─ today/            # dashboard
│  ├─ food/             # search, barcode, log
│  ├─ plan/meals, plan/workouts
│  ├─ workout/[sessionId]/   # camera coach
│  ├─ check-in/
│  └─ profile/, privacy/
├─ src/lib/agent/       # PURE, unit-tested
│  ├─ targets.ts        # TGT-*
│  ├─ meal-recommender.ts
│  ├─ workout-recommender.ts
│  ├─ adaptation.ts     # AGENT-03
│  ├─ vectors.ts        # cosine, normalization
│  └─ guardrails.ts
├─ src/lib/pose/
│  ├─ estimator.ts      # PoseEstimator interface
│  ├─ instanthmr/       # preprocess.ts, worker.ts, adapter.ts (MHR70 → canonical)
│  ├─ remote/           # RemotePoseEstimator (WebSocket client to pose-server)
│  ├─ mediapipe/        # last-resort fallback adapter
│  ├─ one-euro.ts
│  ├─ geometry.ts       # angles, vectors
│  ├─ analyzers/        # squat.ts, pushup.ts, lunge.ts, rep-state-machine.ts
│  ├─ exercise-rules.json
│  └─ skeleton-view.tsx # three.js
├─ src/lib/food/        # clients for edge functions, nutrient math
├─ supabase/
│  ├─ migrations/       # schema + RLS
│  ├─ seed/             # foods_fnri.csv, recipes.json, exercises.json
│  └─ functions/food-search, food-barcode
├─ public/models/       # (git-ignored) instanthmr.onnx fetched at build or first run
├─ pose-server/        # Python FastAPI + InstantHMR fallback server (§7.7.3)
├─ tests/pose-clips/    # short labeled test videos (consented team members only)
└─ docs/PRD.md, docs/security.md, docs/evaluation.md
```

### 9.3 Data model (Postgres)

All user tables have `user_id uuid references auth.users on delete cascade` and the RLS policy `user_id = auth.uid()`. Catalog tables (`foods` where `user_id is null`, `recipes`, `exercises`) are readable by all authenticated users and writable only by the service role.

```sql
profiles(user_id pk, display_name, sex, birthdate, height_cm, weight_kg, target_weight_kg,
         activity_level, goal, experience_level, equipment text[], days_per_week, minutes_per_session,
         diet_prefs jsonb, onboarding_step int, created_at, updated_at)
consents(id, user_id, type text check (type in ('data','camera','health')), version, accepted_at)
screenings(id, user_id, age_ok bool, pregnant_or_bf bool, parq jsonb, flagged bool,
           clearance_ack bool, created_at)
targets(id, user_id, kcal, protein_g, carbs_g, fat_g, fiber_g, bmr, tdee,
        effective_from date, explanation jsonb, created_at)
foods(id, user_id null, source text check (source in ('fnri','usda','off','custom')),
      external_id, name, name_local, brand, serving_label, serving_g,
      kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, source_ref, created_at)
food_logs(id, user_id, food_id, log_date, meal_slot, quantity_g,
          kcal, protein_g, carbs_g, fat_g, fiber_g,   -- snapshot
          from_plan_item_id null, created_at)
recipes(id, name, is_filipino, meal_slots text[], tags text[], allergens text[], diet_pattern,
        cost_level, prep_minutes, serving_g, kcal, protein_g, carbs_g, fat_g, fiber_g,
        ingredients jsonb, instructions text, source_ref)
recipe_ratings(user_id, recipe_id, rating smallint check (rating in (-1,1)), primary key(user_id, recipe_id))
meal_plans(id, user_id, week_start date, explanation jsonb, created_at)
meal_plan_items(id, meal_plan_id, day date, meal_slot, recipe_id, servings numeric, score numeric)
exercises(id, slug, name, muscle_groups text[], equipment text[], difficulty smallint, impact,
          pose_supported bool, contraindications text[], regression_slug, progression_slug, cues text[])
workout_plans(id, user_id, week_start date, split, explanation jsonb, created_at)
workout_plan_items(id, workout_plan_id, day date, order_idx, exercise_id, sets, reps, rest_s)
workout_sessions(id, user_id, plan_item_id null, exercise_id, started_at, ended_at,
                 pose_backend, avg_fps, rating text, created_at)
session_sets(id, session_id, set_idx, reps_counted, reps_good, error_counts jsonb, duration_s)
check_ins(id, user_id, check_date, weight_kg, adherence smallint, hunger smallint, energy smallint,
          workout_difficulty, new_pain bool, notes, created_at)
weight_logs(id, user_id, log_date, weight_kg)
agent_events(id, user_id, kind, input jsonb, output jsonb, rule_ids text[], created_at)  -- audit trail
```

### 9.4 Edge Functions

| Function | Input | Behavior |
|---|---|---|
| `food-search` | `q`, `page` | Search the local `foods` (trigram index on `name`, `name_local`) + USDA FDC `/v1/foods/search` (`dataType=Foundation,SR Legacy,Survey (FNDDS)`, `pageSize=15`) with `USDA_API_KEY`. Normalize to the `foods` shape, upsert into the cache, return merged results with FNRI first |
| `food-barcode` | `code` | Look up `foods` by `external_id`; otherwise call Open Food Facts v2 with `User-Agent: NutriMoveAI/1.0 (school project; contact email)`. Map `nutriments.energy-kcal_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g`, `fiber_100g`; upsert; return. 404 → client shows manual entry |

Both require a valid user JWT and are rate-limited per user (simple counter table, 60 req/min).

### 9.5 Environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_POSE_BACKEND`, `NEXT_PUBLIC_MODEL_URL`, `NEXT_PUBLIC_POSE_SERVER_URL` (remote mode), plus Supabase function secrets `USDA_API_KEY` and `OFF_CONTACT`. Never commit `.env*`.

---

## 10. UX flows & screens

1. **Landing** → Sign up / Log in.
2. **Consent** (data + health) → **Screening** (age, pregnancy, PAR-Q) → blocked / flagged / ok.
3. **Onboarding steps:** Body → Goal & activity → Experience & equipment & schedule → Diet prefs & allergies → **Your plan** (targets card with "why", meal plan preview, workout week).
4. **Today** (home): calorie ring, macros, meals with ✓ log buttons, workout card.
5. **Food:** search bar (+ barcode button) → result → quantity sheet → log. Tabs: Today's log · Recent · Favorites.
6. **Plan:** Meals (7-day carousel, swap, 👍/👎) · Workouts (week view).
7. **Workout session:** exercise intro (how-to text + cues) → **camera consent (first time)** → **setup/calibration** → live coach (video + skeleton + counter + cue banner) → rest timer → next set → **summary** → difficulty rating.
8. **Check-in** (weekly modal) → "What changed and why".
9. **Profile:** edit profile, accessibility settings (high contrast, TTS, text size), privacy (export, delete), about/disclaimer.

Design tone: friendly, encouraging, Filipino-friendly copy (English UI with optional Tagalog dish names). Mobile-first.

---

## 11. Content & data preparation

| Dataset | Size (MVP) | Owner | Source |
|---|---|---|---|
| Filipino foods (`foods_fnri.csv`) | ≥ 60 rows | Peter | DOST-FNRI PhilFCT (cite each row) |
| Recipes (`recipes.json`) | ≥ 50 (≥ 30 Filipino) | Peter + Jerick | Common home recipes; nutrition computed from ingredients |
| Exercises (`exercises.json`) | ≥ 25 | Margaret + Hanz | Standard bodyweight library; cues written by the team from standard coaching references; thresholds tuned on labeled clips |
| Pose test clips | ≥ 3 clips × 3 exercises, 10 reps each, with deliberate form errors | All (consented team members) | Recorded on a laptop webcam and a phone; ground truth = manual counts + error labels in `clips.json` |

---

## 12. Evaluation plan

### 12.1 Rep counting accuracy
- **Protocol:** N ≥ 10 participants (if possible) × 3 exercises × 2 sets of 10 reps, recorded once and replayed through the harness (deterministic). Ground truth = manual count by two raters.
- **Metrics:** count accuracy = 1 − |pred − true| / true, per set; MAE (reps); target **≥ 90% mean accuracy**.

### 12.2 Form-error detection
- Participants perform scripted correct and incorrect reps. Raters label each rep.
- **Metrics:** precision, recall and F1 per error code; target F1 ≥ 0.75 for squat depth and knee valgus.

### 12.3 Performance efficiency
- Log per-frame timings (detector, preprocess, inference, analyzer, render) for 60 s on 3 device classes (reference laptop, mid-range Android, iPhone if available).
- **Report:** FPS, p50/p95 inference ms, cue latency. Target: inference p50 ≤ 100 ms, ≥ 15 FPS on the laptop.

### 12.4 Dietary calculation accuracy
- 20 sample meals: compare app kcal and macros against values computed by hand from FNRI/USDA references. Target MAPE ≤ 5% (the arithmetic must be exact; any difference comes from serving conversions).
- Target engine: compare against a reference Mifflin-St Jeor calculator for 10 profiles, aiming for an exact match.

### 12.5 Software quality: ISO/IEC 25010
- Likert questionnaire (1–5) for **users** and **IT experts** covering functional suitability, performance efficiency, compatibility, usability (interaction capability), reliability, security and maintainability. Report the weighted mean per characteristic with a verbal interpretation.

### 12.6 Usability: System Usability Scale
- 10-item SUS after a scripted task list (onboard, log 3 foods, do one squat set, view summary). Target **SUS ≥ 68** (above average). Include PWD participants where possible (screen-reader task subset).

### 12.7 Ethics for evaluation
No department ethics review form is required (confirmed by the group). Good practice is still followed: participants are 18+, sign a simple informed consent form (template in `docs/evaluation.md`), and recorded clips are stored only on team devices and deleted after analysis. There are no medical outcome claims. Form-cue thresholds are validated against the team's own labeled clips; no external PE/PT review is planned.

---

## 13. Delivery plan: 7-day MVP sprint (Mon Oct 12 → Sun Oct 18, 2026)

Built with AI coding agents. Each person owns a module, writes the tests, and reviews agent output. Owners are suggested from proponent roles; swap them as needed.

| Owner | Role in proposal | Module ownership |
|---|---|---|
| **Aaron** | Lead Programmer, DevOps, Compliance | Repo, CI, Next.js scaffold, Supabase schema + RLS + Auth, Edge Functions, deploy, PWA, security checklist, privacy pages |
| **Hanz** | System Analyst, Agent Specialist | PRD, `src/lib/agent/*` (targets, recommenders, adaptation, guardrails) + tests, check-in flow |
| **Margaret** | Agent Specialist, UI/UX | Pose pipeline (ONNX in worker, adapters, smoothing, analyzers), 3D skeleton |
| **Peter** | Data Engineer, SME, QA | FNRI food table, recipes, exercise catalog, USDA/OFF mapping, pose test clips + ground truth, QA |
| **Jerick** | UI/UX, Data Analyst | Design system, all screens & flows, accessibility, dashboard charts, evaluation instruments (SUS, ISO 25010 forms) |

| Day | Goals (exit criteria in **bold**) |
|---|---|
| **Mon 12** | Aaron: scaffold Next.js + Tailwind + shadcn, Supabase project, migrations for all tables + RLS, Auth (email + Google), Vercel deploy. **Logged-in empty app deployed.** <br>Margaret + Aaron: **pose spike**. Load `instanthmr.onnx` in onnxruntime-web, print the I/O names, run on a still image, measure FPS (WebGPU/WASM). **Go/no-go on the §7.7 gate by end of day.** If it fails, Margaret continues the browser side and Aaron starts `pose-server/` (§7.7.3) on Tuesday. <br>Hanz: `targets.ts` + guardrails + tests. Peter: start FNRI table + exercise catalog. Jerick: wireframes + design tokens, onboarding screens. |
| **Tue 13** | Consent, screening and onboarding flow wired to the DB → targets computed and shown (**ONB + TGT done**). <br>Edge Functions `food-search`, `food-barcode` (**search returns USDA + FNRI results**). <br>Pose: camera + person box + crop + worker inference loop + 2D overlay (**live keypoints on screen**). |
| **Wed 14** | Food logging UI + daily summary (**FOOD P0 done**). <br>Workout recommender + plan screen (**WORK-01/02**). <br>Pose: One-Euro, canonical adapter, **squat rep counter + depth cue working on a test clip**, three.js skeleton. |
| **Thu 15** | Meal recommender + recipes seeded + plan screen with swap (**MEAL P0 done**). <br>Pose: push-up + lunge counters, TTS + aria-live cues, session summary saved (**POSE P0 done**). |
| **Fri 16** | Check-in + adaptation rules + "What changed" card (**AGENT P0 done**). Today dashboard. PWA manifest + model caching. Accessibility pass (axe, keyboard, contrast). |
| **Sat 17** | **Integration + bug bash.** Test on 2+ phones and 2+ laptops, **including both demo layouts** (laptop-only and phone → laptop over local Wi-Fi if remote mode is used). Run the pose clip harness and tune thresholds. Guardrail scenario tests. Security checklist. P1 items if green. |
| **Sun 18** | Pilot evaluation (rep accuracy on clips, latency logs, internal SUS). Demo script + seed demo account. README + setup docs. **Tag `v0.1.0-mvp`.** |

**Daily ritual:** 15-min standup (what's done / next / blocked), merge to `main` via PR with CI green, deploy preview per PR.

### 13.1 Agent build conventions (for AI coding agents)
- Read this PRD first. Implement against the requirement IDs and reference them in commit messages and PR titles (e.g. `feat(pose): POSE-09 squat state machine`).
- `src/lib/agent/*` and `src/lib/pose/analyzers/*` must be **pure, deterministic and unit-tested**. No Supabase calls inside them.
- Never put secrets in client code. All third-party API keys go in Edge Functions.
- Every user table gets an RLS policy in the same migration that creates it.
- Never upload, store or log camera frames.
- Accessibility: every new interactive component must be keyboard-operable and labeled.

---

## 14. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Released InstantHMR ONNX lacks `joints_3d`, or is too slow in the browser | Med | High | Day-1 gate; `PoseEstimator` interface; **laptop Python pose server on the local network** (§7.7.3); MediaPipe as the last resort |
| Venue Wi-Fi blocks device-to-device traffic or is slow (remote mode) | Med | High | Bring a phone hotspot or travel router; laptop-only layout as the backup demo |
| Phone refuses camera access on the local link (not HTTPS) | High | Med | mkcert certificate with its root CA installed on demo phones ahead of time, or a cloudflared/ngrok tunnel |
| WebGPU unavailable (iOS, older devices) | High | Med | WASM backend; detector stride; reduce input resolution; "best on laptop" note |
| Large model download on mobile data | Med | Med | Lazy-load on the workout screen only; cache; show the size before downloading |
| Camera angle and lighting break the form checks | High | Med | Calibration screen with angle guidance; only check cues that are reliable from the current view; tunable thresholds |
| FNRI data entry takes longer than planned | Med | Med | Start Day 1; prioritize the 60 most common dishes; USDA fills the gaps |
| USDA rate limits / OFF missing products | Low | Low | Cache in `foods`; manual entry fallback |
| Scope creep with a 1-week deadline | High | High | Strict P0 list; P1 only after Saturday's bug bash is green |
| Privacy/ethics questions from the panel | Med | Med | On-device processing, consent flows, guardrails, RA 10173 mapping (§8.3) |
| Weight licensing (SAM license) | Low | Med | Academic use; disclose in limitations; MediaPipe (Apache-2.0) as an alternative |

---

## 15. Open questions

All open questions from v1.0 are resolved (see D15–D18):

| Question | Resolution |
|---|---|
| PE instructor/PT validation of thresholds? | Not needed. Thresholds are tuned on labeled team clips. |
| Department ethics form for recording clips? | Not required. Simple participant consent is still used. |
| Demo on laptop or phone? | Both. If in-browser inference fails, the laptop runs the Python pose server and the phone opens a local link (§7.7.3). |
| Merge O2 and O4? | Yes, merged (§3.1). |

New items to confirm during the sprint:
1. Which team laptop will host the pose server (GPU model / Apple Silicon), so we can benchmark it on Day 1–2.
2. Number of evaluation participants (aim 10–30) and PWD participant recruitment.

---

## Appendix A: Formulas & constants

- **BMR (Mifflin-St Jeor, 1990):** M: `10W + 6.25H − 5A + 5`; F: `10W + 6.25H − 5A − 161` (W kg, H cm, A years)
- **Activity factors:** 1.2 / 1.375 / 1.55 / 1.725 / 1.9
- **Energy per macro:** protein 4, carbs 4, fat 9 kcal/g
- **Cosine similarity:** `cos(u, r) = (u·r) / (‖u‖‖r‖)`
- **Weight trend:** least-squares slope of weight vs day over the last 14 days; %/week = `slope·7 / mean_weight × 100`
- **One-Euro filter:** Casiez et al., CHI 2012. Parameters per §7.7.1

## Appendix B: Canonical joints ← InstantHMR MHR70 indices

From `instanthmr/skeleton.py` (MHR70 ordering). `joints_3d` is in metres, body-centred, **Y points down**.

| Canonical | MHR70 idx | Canonical | MHR70 idx |
|---|---|---|---|
| nose | 0 | neck | 69 |
| l_shoulder | 5 | r_shoulder | 6 |
| l_elbow | 7 | r_elbow | 8 |
| l_wrist | 62 | r_wrist | 41 |
| l_hip | 9 | r_hip | 10 |
| l_knee | 11 | r_knee | 12 |
| l_ankle | 13 | r_ankle | 14 |
| l_heel | 17 | r_heel | 20 |
| l_big_toe | 15 | r_big_toe | 18 |

Derived points: `mid_hip = (l_hip + r_hip)/2`, `mid_shoulder = (l_shoulder + r_shoulder)/2`.
**Skeleton edges to render (body only):** (0,69), (69,5), (69,6), (5,9), (6,10), (9,10), (5,7), (7,62), (6,8), (8,41), (9,11), (11,13), (13,17), (10,12), (12,14), (14,20). Add (13,15) and (14,18) for the feet.
Hand joints (21–61) are ignored in the MVP.

**Model I/O:** inputs `image (N,3,224,224)` float32 ImageNet-normalized, `cliff_cond (N,3)`; outputs `mhr_params (204)`, `shape_params (45)`, `cam_trans (3)`, `joints_2d (70,2)` (normalized crop coords → map back to frame coords: `px = crop_px · (sq_size/224) + sq_origin`), `joints_3d (70,3)` *(if present; see the Day-1 gate)*.

## Appendix C: Exercise rules (starting thresholds; tune on the test clips)

Angles in degrees, computed in 3D from smoothed joints. `knee angle = ∠(hip, knee, ankle)`, `elbow = ∠(shoulder, elbow, wrist)`, `hip = ∠(shoulder, hip, knee)`, `body line = ∠(shoulder, hip, ankle)`.

**Squat** (camera: front or 45°)
- Primary signal: mean knee angle. `TOP` > 160°, `BOTTOM` < 100°; hysteresis 10°.
- `SQ_DEPTH` "Go a little deeper": the rep's minimum knee angle stays between 100° and 120° (counted as a shallow rep, not a full rep, configurable).
- `SQ_KNEE_VALGUS` "Push your knees out": knee-to-knee distance < 0.8 × ankle-to-ankle distance at the bottom (front view).
- `SQ_TORSO_LEAN` "Keep your chest up": angle between the torso (mid_hip → mid_shoulder) and vertical > 45° at the bottom.
- `SQ_HEEL_LIFT` (P1) "Keep heels down": heel rises > 3 cm relative to the standing baseline.

**Push-up** (camera: side)
- Primary signal: elbow angle. `TOP` > 155°, `BOTTOM` < 90°.
- `PU_DEPTH` "Lower your chest more": min elbow angle between 90° and 110°.
- `PU_HIP_SAG` "Tighten your core, hips are sagging": body line < 160° with the hips below the shoulder–ankle line.
- `PU_HIP_PIKE` "Lower your hips": body line < 160° with the hips above the line.

**Lunge** (camera: side; front leg = the one with the smaller knee angle)
- Primary signal: front knee angle. `TOP` > 155°, `BOTTOM` < 100°.
- `LU_DEPTH` "Drop your back knee lower": min front knee angle between 100° and 115°.
- `LU_TORSO` "Stay upright": torso vs vertical > 30°.
- `LU_KNEE_TOE` (P1) "Front knee too far forward": front knee passes the front toe by > 8 cm horizontally.

**Common rules:** a rep counts only if the full cycle completes in 0.6–8 s; reps are paused when required joints are out of frame; cue cooldown 2 s per code; one cue at a time (priority: safety cues (valgus, sag) > depth > torso).

## Appendix D: References

- Braga-Pereira, R., et al. (2024). Impact of fitness coach behavior on exercise motivation, commitment, and enjoyment. *PLOS ONE, 19*(12), e0310931.
- Cordero Jr., D. A. (2025). Exploring the lack of physical activity among adolescents worldwide. *Diabetes & Metabolism Journal, 49*(3), 513–515.
- Ji, H., Karungaru, S., & Terada, K. (2023). AI fitness coach at home using image recognition. *11*(4), 850–857. https://doi.org/10.13189/saj.2023.110419
- Kanoski, S. E., Grill, H. J., & Baird, J. P. (2022). Obesity — a matter of motivation? *Nature Reviews Neuroscience, 23*(5), 291–305.
- Mifflin, M. D., St Jeor, S. T., et al. (1990). A new predictive equation for resting energy expenditure in healthy individuals. *AJCN, 51*(2), 241–247.
- Casiez, G., Roussel, N., & Vogel, D. (2012). 1€ Filter: A simple speed-based low-pass filter for noisy input in interactive systems. *CHI '12.*
- Brooke, J. (1996). SUS: A "quick and dirty" usability scale.
- ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation (SQuaRE) — product quality model.
- W3C WCAG 2.1; WAI-ARIA 1.2.
- Republic Act No. 10173 — Data Privacy Act of 2012 (Philippines).
- DOST-FNRI Philippine Food Composition Tables (PhilFCT).
- USDA FoodData Central API; Open Food Facts API v2.
- mohamdev/InstantHMR (Apache-2.0 code; SAM-licensed weights); Meta MHR (Momentum Human Rig); MediaPipe Tasks-Vision (Apache-2.0).
- PAR-Q+ (Physical Activity Readiness Questionnaire for Everyone), 2023 edition.

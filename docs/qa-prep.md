# Q&A prep (per member)

Short answers to likely panel questions, by owner (see [contributions.md](contributions.md)). Read your section, then
open the files it names so you can point at real code. Numbers come from `docs/evaluation.md`.

## Everyone: the big picture

**Q: Why is this an intelligent agent?**
It runs a **perceive → decide → act** loop that **adapts over time**.
- *Perceive:* camera joints, food logs, weigh-ins, check-in answers.
- *Decide:* rules plus content-based recommenders (targets, plans, form checks).
- *Act:* calorie targets, meal and workout plans, spoken cues, the weekly changes.
- *Learn:* every week it compares outcomes (weight trend, adherence) with the goal and adjusts. 👍/👎 ratings
  change future meal picks.

**Q: Which parts are AI / machine learning?**
- Perception uses a **pretrained deep model** (InstantHMR, 3D pose).
- Decisions use **explainable rules and content-based recommendation** (cosine similarity).
- This is deliberate. In health advice every change must be explainable and safe, so each one shows *why* (rule
  IDs + reasons).

**Q: Did you use AI tools to build it?**
Yes, an AI coding assistant, under the team's direction. We wrote the requirements and design, reviewed and tested
every change, and collected and labelled all evaluation data. See the disclosure in `contributions.md`.

## Aaron: platform, security, deployment

**Q: How is one user's data kept away from another user?**
- Row-level security in Postgres on every table: `user_id = auth.uid()`.
- Even if someone calls the API directly with their own login, the database only returns their rows.
- Each new table gets its policy in the same migration (rule in `AGENTS.md`).

**Q: Where are the API keys?**
- Never in the browser. The USDA key lives in Supabase Edge Function secrets.
- The browser only has the public "publishable" key, which RLS limits.
- Edge Functions check the user's login (JWT) and are rate-limited per user.

**Q: Are camera videos stored?**
- No. Frames are processed in memory and dropped right away (`frame.close()`).
- Only aggregates are saved: reps, good-form %, error counts, fps.
- In laptop mode, only a cropped 224 px image goes to the laptop, and it isn't saved there either.

**Q: How do you deploy and test?**
- Every pull request runs lint, typecheck, about 200 unit tests and a production build in CI.
- Vercel builds a preview for each PR and deploys `main` to production.

**Q: Why did you remove Google sign-in?**
- It needed a Google Cloud OAuth setup we didn't finish, so the button only produced an error.
- Email + password with email confirmation covers AUTH-01.

## Hanz: requirements and agent decisions

**Q: How are calorie targets calculated?**
1. Mifflin-St Jeor BMR × activity factor (1.2–1.9) = TDEE.
2. Weight loss: a deficit of up to 500 kcal, capped at 25% of TDEE and at 1% of body weight per week.
3. Floors: never below 1,200 (women) / 1,500 (men), or below BMR if screening flagged a concern.
4. Pregnancy or breastfeeding: maintenance only.
5. Protein 1.6 g/kg when losing or gaining (1.2 to maintain), fat ≥ 25% of calories, carbs fill the rest.

**Q: How does the meal recommender work?**
1. Hard filters: allergens, diet pattern, dislikes, meal slot.
2. Rank recipes by **weighted cosine similarity** between the user's target vector and each recipe's vector (macro
   shares, calories, fiber, Filipino, budget, prep time). Protein is weighted most.
3. Penalise repeats and back-to-back same protein.
4. Adjust servings in 0.25 steps so each day is within ±10% of target calories and ≥ 90% of protein.
5. 👍/👎 ratings blend into the user's vector, so liked dishes rank higher next time.

**Q: How does it adapt each week?**
- **Weight trend:** least-squares slope over 14 days.
  - Losing faster than 1% of body weight a week: +150 kcal.
  - Slower than 0.25%/week for 2 check-ins while eating on target: −150 kcal.
  - Goal is gain: under 0.1%/week gets +150 kcal; over 0.5%/week gets −100 kcal.
- **Adherence:** if logged intake is more than 20% off target, we give tips instead of changing the target. The plan
  isn't the problem if it isn't followed.
- **Hunger ≥ 4/5:** move carbs to protein and pick higher-fiber meals.
- **Workouts too hard or easy:** ±sets. **New pain:** lighter plan and the camera coach is paused.
- **Always:** the calorie floor applies, and every change is listed with its reason.

**Q: How does the workout plan work?**
- Slots: squat, push, hinge, single leg, back, core…
- Filter exercises by equipment, difficulty and contraindications, then rank by cosine similarity to the user's profile.

**Q: Why a laptop pose server?**
- iPhones crashed loading the 81 MB model in the browser (memory limit).
- Your RTX 3060 runs the same model. The phone sends a small crop over a Cloudflare tunnel and gets 12–13 fps back,
  with a 57–66 ms round trip.

## Margaret: camera coach

**Q: What is InstantHMR and why use it?**
- A pretrained model that predicts a **3D** human skeleton (70 keypoints) from one 224 × 224 person crop.
- We need 3D because angles like knee bend and knee cave-in are wrong in 2D when the person isn't exactly side-on.
- It runs in the browser through onnxruntime-web (WebGPU, or WASM as a fallback) in a Web Worker, so the UI stays smooth.

**Q: How do you count reps?**
- A state machine on a joint angle (knee for squat/lunge, elbow for push-up): TOP → DESCENDING → BOTTOM → ASCENDING
  → TOP.
- Squat: below 95° counts as full depth. Back above 150° completes the rep.
- Hysteresis, a minimum rep time and a minimum number of frames at the bottom stop jitter from counting extra reps.
- Going below 135° without reaching full depth = a "shallow" rep.

**Q: How do you detect form mistakes?**
- Knee cave-in: knee spacing drops below 90% of *this person's own* standing knee spacing. That makes it work from
  the front or at 45°.
- Forward lean: torso more than 55° from vertical (squat) or 50° (lunge).
- Push-up hip sag / pike: the hip is off the shoulder-ankle line.

**Q: Why smoothing?**
- Raw joints jitter frame to frame.
- The One-Euro filter smooths heavily when you're still and lightly when you move fast, so there's little lag.

**Q: How accurate is it?**
- Team clips: squat 100% rep count, macro-F1 0.91; lunge 15/15.
- **Held-out on EC3D (4 new people):** 98.6% squat and 99.2% lunge rep counting, knee cave-in F1 0.80.
- Depth recall there is low because EC3D's "not low enough" still reaches about 86°, which our PRD rule treats as
  full depth.

**Q: What if the phone can't run it?**
- The app steps down automatically (full model → lite int8 model → single thread).
- Or the phone pairs with the laptop server.

## Peter: data and quality

**Q: Where does the food data come from?**
- **DOST-FNRI Philippine Food Composition Tables:** 1,542 foods per 100 g edible portion, each row citing its FNRI ID.
- USDA FoodData Central and Open Food Facts (barcode) fill the gaps.

**Q: How did you compute recipe nutrition?**
- Each recipe is a list of FNRI ingredient IDs and grams.
- A script sums grams / 100 × the FNRI values, so nothing is typed by hand.
- It also derives allergens and diet type from the ingredients.

**Q: How accurate are the calorie numbers?**
- 20 meals checked against hand calculation straight from the FNRI table: **0.05% mean error** (target ≤ 5%), which
  is rounding only.
- BMR/TDEE for 10 profiles: **10/10 exact** against hand-worked Mifflin-St Jeor.

**Q: What is your pose dataset?**
- We don't train the pose model.
- For *evaluation* we recorded our own clips, labelled every rep by hand, and stored joints only (no video).
- We also tested on the public EC3D dataset.

**Q: How did you QA the app?**
- Unit tests on every pure module, a CI gate on every PR, and manual passes on phone and laptop.
- Guardrail scenarios: under-18, calorie floor, pregnancy, pain, allergies.

## Jerick: design, screens, evaluation

**Q: How did you design the UI?**
- PRD §10 design tokens (green "nm" palette, Lato type scale, rounded cards) from the Figma reference, built as
  Tailwind tokens so every screen is consistent.
- Mobile-first, with a bottom nav on phones and a sidebar on desktop.

**Q: Is it accessible?**
- axe (WCAG 2.1 A/AA) passes on every page.
- Everything works with the keyboard and has labels.
- Colour is never the only signal.
- Larger text, high-contrast and reduce-motion toggles, and spoken cues for the camera coach.

**Q: How will you evaluate usability and quality?**
- **SUS:** 10 items, scored 0–100. Above 68 is above average.
- **ISO/IEC 25010:** Likert items for functional suitability, performance, compatibility, usability, reliability,
  security and maintainability.
- Run with 5–10 pilot users after signed consent, in-app at `/survey`. Results are group averages only.

**Q: What does the Progress page show?**
- Weight trend, consistency, active minutes, days on calorie target, good-form %, adherence and activity charts.
- Each chart has a text summary for screen readers.

**Q: How do you measure performance?**
- Every saved session stores fps and p50/p95 latency with the device class.
- `/dev/latency` exports a CSV.
- Targets: phones ≥ 8 fps and ≤ 200 ms round trip.

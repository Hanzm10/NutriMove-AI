# Team contributions

NutriMove AI, CS 403 (Intelligent Agents), built Oct 12–18, 2026. Roles follow PRD §13. Each member owns one area:
they can explain it, demo it and answer questions on it. Q&A prep per person is in [qa-prep.md](qa-prep.md).

| Member | Role | Owns |
|---|---|---|
| **Aaron Angelo Ragudos** | Lead Programmer, DevOps, Compliance | Platform, database, security, deployment |
| **Hanz Laurence Mapua** | System Analyst, Agent Specialist | Requirements (PRD), agent decision logic, laptop pose server, demo |
| **Margaret Ashley Valenzuela** | Agent Specialist, UI/UX | Camera coach (pose estimation → form checks → feedback) |
| **Peter Dela Cruz** | Data Engineer, Subject-Matter Expert, QA | Food, recipe and exercise data; test clips; accuracy checks; QA |
| **Jerick Anthony Remo** | UI/UX, Data Analyst | Design system, all screens, accessibility, surveys and evaluation analysis |

## What each member delivered

### Aaron Ragudos: platform, data security, deployment
- Next.js 16 project setup, CI (lint, typecheck, tests, build on every PR), Vercel deployment.
- Supabase database: every table with row-level security (`user_id = auth.uid()`), so users only ever see their own rows
  (`supabase/migrations/`).
- Email + password sign-up and sign-in, the email-confirmation callback, and the session proxy (`src/proxy.ts`).
- Edge Functions `food-search` (FNRI + USDA FoodData Central) and `food-barcode` (Open Food Facts). API keys stay on
  the server, and calls are rate-limited per user (`supabase/functions/`).
- PWA: manifest, icons, service worker with an offline page (`public/sw.js`).
- Privacy: privacy page, consent history, JSON data export, delete account.
- Security checklist and headers (`docs/security.md`). Fixes: Google sign-in removed (#22), Windows install fix (#24).

### Hanz Mapua: requirements and the agent's decisions
- PRD with requirement IDs, design decisions and the 7-day plan (`docs/PRD.md`).
- Agent logic, all pure functions with unit tests (`src/lib/agent/`):
  - `targets.ts`, `guardrails.ts`: Mifflin-St Jeor calories, activity factors, deficit caps, calorie floors, screening
    rules (age, PAR-Q, pregnancy).
  - `workout-recommender.ts`: weekly plan from eligibility filters + cosine-similarity ranking.
  - `meal-recommender.ts`: 7-day meal plan (hard filters → weighted cosine → serving sizes → swaps), learning from 👍/👎.
  - `adaptation.ts`: weekly check-in rules (14-day weight trend, ±150 / −100 kcal, adherence, hunger, difficulty, pain).
  - `nudges.ts`: Overview coach insight.
- Weekly check-in flow with the "What changed and why" card (`src/lib/checkin/`, `/check-in`).
- Guardrail scenario tests (`guardrail-scenarios.test.ts`).
- Laptop pose server on the team's RTX 3060 (`pose-server/`). Demo account seed and demo script (`supabase/seed/demo.sql`,
  `docs/demo.md`).

### Margaret Valenzuela: camera coach
- InstantHMR (pretrained 3D pose model) running in the browser in a Web Worker with onnxruntime-web
  (`src/lib/pose/instanthmr/`). 70 model keypoints are mapped to 18 named joints.
- One-Euro smoothing, person box tracking, a 1-second "ready" check.
- Rep counter (a state machine on joint angles) and form checks for squat, push-up and lunge
  (`src/lib/pose/analyzers/`, thresholds in `exercise-rules.json`).
- Live coach screen: rep counter, cue banner, spoken cues, 3D skeleton (three.js), rest timer, summary
  (`src/components/pose/`).
- iPhone crash-safe loading (automatic lighter setups) and the diagnostics panel. Laptop-coach client
  (`src/lib/pose/remote/`).
- Threshold tuning on the team's labelled clips; held-out test on EC3D (`src/lib/pose/eval/`).

### Peter Dela Cruz: data and quality
- 1,542 Filipino foods from the DOST-FNRI Philippine Food Composition Tables, every row citing its FNRI Food ID
  (`supabase/seed/foods_fnri.csv`).
- 65 recipes (48 Filipino) written as FNRI ingredients + grams; nutrition is computed, not typed
  (`supabase/seed/recipes.source.json`, `scripts/build-recipe-seed.mjs`).
- 30-exercise catalogue with equipment, muscles and contraindications (`supabase/seed/exercises.json`).
- USDA / Open Food Facts field mapping (`supabase/functions/_shared/food-mappers.ts`).
- Recorded and labelled pose test clips, joints only (`eval/clips/`). Calorie accuracy check: 20 meals, 10 profiles
  (`src/lib/food/accuracy.test.ts`).
- Datasets documentation (`docs/datasets.md`) and QA passes.

### Jerick Remo: design, screens and evaluation
- Design system: `nm-*` colour, type and radius tokens following PRD §10 (`src/app/globals.css`).
- App shell (sidebar + mobile bottom nav) and every screen: onboarding wizard, Overview, Nutrition and meal plan,
  AI Workout, Progress charts, Profile (`src/app/(app)/`, `src/components/`).
- Accessibility: keyboard use, labels, larger text, high contrast and reduce-motion toggles. axe (WCAG 2.1 AA) passes
  on every page.
- SUS and ISO/IEC 25010 survey forms with scoring (`/survey`, `src/lib/eval/survey.ts`). Evaluation write-up and
  latency analysis (`docs/evaluation.md`, `/dev/latency`).

## Remaining tasks before the demo

| Member | Task |
|---|---|
| Aaron | Create the demo account and run `demo.sql`. Re-run the `docs/security.md` checks on the live site. Confirm Supabase URL settings and the Vercel deploy. |
| Hanz | Lead the rehearsal and the demo. Run the pose server on demo day. Write the slides on the agent design. |
| Margaret | Re-record push-ups in landscape (good, hip sag, half rep), label them and tune. Present the camera coach and the EC3D results. |
| Peter | Collect squat clips from 1–2 teammates (second held-out test). Do a full QA pass on the live site. Present the data sources. |
| Jerick | Run the pilot (5–10 people, consent forms, `/survey`). Export latency CSV. Make the SUS, ISO 25010 and latency charts. |

## Use of AI tools (disclosure)

Implementation was assisted by an AI coding assistant (Claude Code, by Anthropic). The team wrote the requirements and
design (PRD), chose the methods, directed each change, and reviewed and tested every pull request (CI runs lint,
typecheck, unit tests and a production build). The team also recorded, labelled and validated all evaluation data and
ran the pilot study. The pose model (InstantHMR) is pretrained by its authors and cited in `docs/datasets.md`. Every
member is responsible for understanding and explaining their area.

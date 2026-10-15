# NutriMove AI

An intelligent-agent fitness and nutrition coach (CS 403 – Intelligent Agents, TIP QC).
In-browser 3D pose tracking with [InstantHMR](https://github.com/mohamdev/InstantHMR), calorie tracking with
Filipino foods, and meal and workout plans that adapt every week.

- **Product requirements:** [docs/PRD.md](docs/PRD.md). Build against the requirement IDs (e.g. `POSE-09`).
- **Design reference:** [docs/design-reference/](docs/design-reference/) and PRD §10.
- **Agent/contributor rules:** [AGENTS.md](AGENTS.md).

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS 4 + shadcn/ui · Supabase (Postgres + RLS, Auth) ·
onnxruntime-web (WebGPU/WASM) · three.js · Vitest.

## Getting started

```bash
pnpm install          # also copies the onnxruntime-web runtime into public/ort
cp .env.example .env.local   # then fill in the Supabase URL + publishable key (see below)
pnpm dev              # http://localhost:3000
```

The UI runs before Supabase is configured (sign-in is disabled until the keys are set).

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Checks CI runs on every PR |
| `pnpm build` | Production build |
| `pnpm db:types` | Regenerate `src/lib/supabase/database.types.ts` from the linked project |

## Supabase

Hosted project: **`nutrimove-ai`** (ref `satiqygzrdhzwkwqunoj`, Singapore `ap-southeast-1`, free plan).
All migrations in [`supabase/migrations`](supabase/migrations) are already applied, and RLS is on for every table.

`.env.local` (also add both to Vercel → Settings → Environment Variables):

```
NEXT_PUBLIC_SUPABASE_URL=https://satiqygzrdhzwkwqunoj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Project Settings → API Keys → publishable key>
```

Still to do in the Supabase dashboard (owner):
1. **Auth → URL Configuration:** Site URL = your Vercel URL; add redirect URLs
   `http://localhost:3000/auth/callback` and `https://<your-app>.vercel.app/auth/callback`.
2. **Auth → Providers → Google** (optional): add a Google Cloud OAuth client ID/secret.
3. Invite teammates: Organization → Team.

New migrations: add a file under `supabase/migrations/` and apply it with `pnpm exec supabase db push`
(after `supabase login` + `supabase link --project-ref satiqygzrdhzwkwqunoj`), then run `pnpm db:types`.

## Food data & Edge Functions

- **Filipino foods:** 1,542 items from the DOST-FNRI Philippine Food Composition Tables (PhilFCT), per 100 g edible
  portion, in [`supabase/seed/foods_fnri.csv`](supabase/seed/foods_fnri.csv) (each row cites its FNRI Food ID).
  Already loaded into the hosted project. To reload: `node scripts/build-food-seed.mjs` and run
  `supabase/seed/foods_fnri.sql` in the SQL editor (idempotent upsert).
- **Recipes:** 65 recipes (48 Filipino, 74%) in [`supabase/seed/recipes.source.json`](supabase/seed/recipes.source.json),
  one serving each, written as FNRI ingredient IDs + grams. `node scripts/build-recipe-seed.mjs` sums the FNRI values
  into per-serving nutrition, derives allergens and diet pattern from the ingredients, and writes `recipes.json` and an
  idempotent `recipes.sql`. Already loaded into the hosted project; to reload, run `recipes.sql` in the SQL editor.
- **Edge Functions** (in `supabase/functions/`, deployed):
  - `food-search` — `POST { q }` → FNRI + cached + USDA FoodData Central results, Filipino first. Understands common
    Tagalog words (kanin, itlog, manok…). Caches USDA hits in `foods`.
  - `food-barcode` — `POST { code }` → Open Food Facts lookup (cached).
  - Both require a signed-in user's JWT and are rate-limited per user.
  - Call them from the app with `supabase.functions.invoke("food-search", { body: { q } })`.
- **Secrets (Supabase → Edge Functions → Secrets):**
  - `USDA_API_KEY` — get a free key at https://fdc.nal.usda.gov/api-key-signup. Without it the function falls back to
    the shared `DEMO_KEY`, which is rate-limited and often unavailable.
  - `OFF_CONTACT` (optional) — an email for the Open Food Facts User-Agent.
- Deno code under `supabase/functions` is excluded from the Next.js typecheck; check it with
  `npx deno check supabase/functions/*/index.ts`. Pure helpers in `_shared/food-mappers.ts` are unit-tested by Vitest.

## Camera coach

`/workout/live?exercise=squat|pushup|reverse-lunge` asks for camera consent once (AUTH-03), then:
InstantHMR in a Web Worker → One-Euro smoothing → exercise analyzer (rep state machine + form checks,
thresholds in `src/lib/pose/analyzers/exercise-rules.json`) → rep counter, cue banner, spoken cues (Web Speech),
3D skeleton (three.js), rest timer, summary and save (`workout_sessions` + `session_sets`, aggregates only).

Query flags:
- `?debug=1` — **Diagnostics panel** from the first tap: device, setup, step-by-step log, FPS / inference ms once running,
  and the log of the previous attempt if the page was killed. Has Copy and Reset buttons (screenshot it from a phone).
- `?rung=auto|full-wasm|lite-wasm|lite-1t` — force a setup. `?model=lite|full|/path.onnx`, `?ep=wasm` (skip WebGPU) and
  `?threads=N` override single parts.
- `?synthetic=squat|pushup|lunge` — **test mode**: no camera or model; generated stick-figure reps (every 3rd rep has
  a form fault). Use it to demo or test the HUD, cues and summary on any machine.
- `sets`, `reps` — override the target (the workout plan passes these).

**Phones and memory.** An out-of-memory kill on a phone can't be caught in JavaScript (the tab just reloads). Every load
attempt leaves a breadcrumb in `localStorage` (`src/lib/pose/instanthmr/load-guard.ts`); if the next load finds it, the page
was killed, so it starts one setup lighter: `auto` (full model, WebGPU→CPU) → `full-wasm` → `lite-wasm` (int8 model,
`public/models/instanthmr-int8.onnx`, 52 MB, ~1.5 px mean joint difference on the 224 px crop) → `lite-1t` (lite, one
thread). iPhones start at `lite-1t`. Measured in headless Chromium (CPU, 4 vCPU): page ≈ 160 MB, lite model ≈ +0.5 GB,
full model ≈ +0.75 GB single-thread (+0.9 GB multi-thread); ORT graph-optimisation / arena / prepacking options did not change it.

**Datasets.** Which data and pretrained models the app uses, and public benchmarks for comparison: `docs/datasets.md`.

**Evaluating the coach.** `/dev/replay` runs recorded clips through the same model and form checks on a laptop and
scores them against hand labels (rep accuracy, form-error F1). Recording, naming and labelling: `docs/evaluation.md`.

**Laptop coach (phones that can't run the model).** `pose-server/` is a small FastAPI server that runs the same ONNX model
on a laptop (CUDA on the RTX 3060, CPU otherwise). The phone keeps its own box tracker, crops the person to 224 px, and
sends only that JPEG over a secure WebSocket (`src/lib/pose/remote/`); joints come back in the same format, so the
analyzers, HUD and cues are unchanged. Frames stay in memory on the laptop. Setup, in `pose-server/README.md`: install
`requirements.txt`, run `./start.sh` (or `start.ps1`), open the printed link on the phone, tap **Connect**. Add
`?pose=device` to the coach URL to ignore a pairing.

Static chunks and `/ort` are served with COEP/CORP headers because workers started from cross-origin-isolated pages
must opt in too (see `next.config.ts`).

## Agent modules (`src/lib/agent`, pure + unit-tested)

| Module | PRD | What it does |
|---|---|---|
| `targets.ts`, `guardrails.ts` | TGT-*, ONB-02…04 | Calorie/macro targets, floors, caps, screening rules |
| `workout-recommender.ts` | WORK-01 | Weekly plan: eligibility filters + cosine-similarity ranking per slot |
| `adaptation.ts` | AGENT-02/03/06 | Weekly check-in rules: 14-day least-squares weight trend, ±150/−100 kcal adjustments with the calorie floor, adherence check (logged intake > 20% off → tips, no change), hunger → protein + fiber, workout difficulty/pain → set changes and camera-coach pause. 14 scenario tests |
| `meal-recommender.ts` | MEAL-01…05 | 7-day meal plan: hard filters (allergens, diet, dislikes, slot) → weighted cosine on macro/kcal/fiber/Filipino/budget/prep/tag features → repeat and same-protein penalties → servings in 0.25 steps to land within ±10% kcal and ≥ 90% protein → greedy swaps. 👍/👎 ratings blend into the user vector; `recommendSwap` gives the next-best recipe for a slot |
| `nudges.ts` | AGENT-05 | Rule-based "AI coach insight" on Overview |
| `vectors.ts` | — | Cosine similarity |

Exercise catalogue: `supabase/seed/exercises.{json,sql}` (30 moves; squat, push-up and reverse lunge are camera-coached).

## Pose spike (Day-1 gate, PRD §7.7)

Open **`/dev/pose-spike`** on each laptop/phone you plan to demo with. It downloads `instanthmr.onnx` (~81 MB,
cached afterwards), runs it on the webcam or an uploaded photo, and shows preprocess/inference time and FPS.
Use **Copy results for the team** and paste the line in the group chat.

- Gate: **≥ 10 FPS with `joints_3d = yes`** → in-browser mode. Otherwise → laptop pose server (PRD §7.7.3).
- Offline/faster dev: put the model at `public/models/instanthmr.onnx` (gitignored) and open
  `/dev/pose-spike?model=/models/instanthmr.onnx`.

Verified on Day 1: the released ONNX has inputs `image (N,3,224,224)`, `cliff_cond (N,3)` and outputs
`mhr_params, shape_params, cam_trans, joints_2d, joints_3d`, so **3D joints are available in the browser**.

## Weekly check-in, Progress, Profile, PWA (Day 5)

- **Check-in** (`/check-in`, banner on Overview when due): weight, adherence, hunger, energy, workout difficulty, new pain →
  `src/lib/checkin/run.ts` runs the adaptation rules, writes new `targets` (with explanation), stores `profiles.adapt_state`
  and the result on `check_ins.result`, regenerates both plans, and shows a **What changed and why** card.
- **Progress** (`/progress`): 7d/4w/3m, consistency, active minutes, calorie-target days, good-form %, weight trend (+ log
  weight), adherence and activity charts with text summaries, rule-based milestones.
- **Profile** (`/profile`): name/schedule (re-plans workouts), read-only targets with "why", accessibility toggles
  (larger text, high contrast, reduce motion — applied on `<html>`), voice cues, water goal, JSON export (`/profile/export`),
  consent history, delete account.
- **Delete account** needs `supabase/migrations/20261013061000_delete_my_account.sql` applied (SQL editor); until then
  the button shows a friendly error.
- **PWA**: `src/app/manifest.ts`, icons in `public/icons` (`node scripts/build-icons.mjs`), `public/sw.js` (cache-first
  static/ORT/models, network-first pages with an `/offline` fallback; sign-out clears cached pages). Registered in
  production builds only.
- **Accessibility**: axe (WCAG 2.1 A/AA + best practices) is clean on all app, auth and public pages.

## Security

Audit results, the ASVS-style checklist, security headers and the commands to re-run before the demo are in
[`docs/security.md`](docs/security.md). Guardrail scenarios (age gate, calorie floor, 1%/week cap, pregnancy, health
flag, pain pause, allergy sweeps) run as `src/lib/agent/guardrail-scenarios.test.ts`.

## Project layout

```
src/app/(app)/        Overview · AI Workout · Nutrition · Progress · Profile (app shell)
src/app/(auth)/       sign-in, sign-up, consent
src/app/dev/          developer pages (pose spike)
src/lib/agent/        pure, unit-tested agent logic (targets, guardrails, …)
src/lib/pose/         pose pipeline (InstantHMR preprocessing, session, skeleton)
src/lib/supabase/     browser/server clients + session proxy
supabase/migrations/  database schema + RLS
docs/                 PRD and design reference
```

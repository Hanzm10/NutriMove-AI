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

## Pose spike (Day-1 gate, PRD §7.7)

Open **`/dev/pose-spike`** on each laptop/phone you plan to demo with. It downloads `instanthmr.onnx` (~81 MB,
cached afterwards), runs it on the webcam or an uploaded photo, and shows preprocess/inference time and FPS.
Use **Copy results for the team** and paste the line in the group chat.

- Gate: **≥ 10 FPS with `joints_3d = yes`** → in-browser mode. Otherwise → laptop pose server (PRD §7.7.3).
- Offline/faster dev: put the model at `public/models/instanthmr.onnx` (gitignored) and open
  `/dev/pose-spike?model=/models/instanthmr.onnx`.

Verified on Day 1: the released ONNX has inputs `image (N,3,224,224)`, `cliff_cond (N,3)` and outputs
`mhr_params, shape_params, cam_trans, joints_2d, joints_3d`, so **3D joints are available in the browser**.

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

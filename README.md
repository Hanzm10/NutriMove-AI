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
cp .env.example .env.local   # then fill in your Supabase URL + publishable key
pnpm dev              # http://localhost:3000
```

The UI runs before Supabase is configured (sign-in is disabled until the keys are set).

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Checks CI runs on every PR |
| `pnpm build` | Production build |
| `pnpm db:types` | Regenerate `src/lib/supabase/database.types.ts` from the linked project |

## Supabase setup (once)

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. `pnpm exec supabase login` → `pnpm exec supabase link --project-ref <ref>` → `pnpm exec supabase db push`
   applies [`supabase/migrations`](supabase/migrations) (all tables + row-level security).
3. Copy the project URL and **publishable key** into `.env.local` (and into Vercel → Environment Variables).
4. Auth → URL configuration: set the Site URL to your Vercel URL and add
   `http://localhost:3000/auth/callback` and `https://<your-app>.vercel.app/auth/callback` as redirect URLs.
5. Google sign-in (optional): Auth → Providers → Google, with a Google Cloud OAuth client.

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

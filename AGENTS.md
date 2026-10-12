<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# NutriMove AI — rules for coding agents

- Read `docs/PRD.md` first. Implement against requirement IDs and reference them in commits/PR titles,
  e.g. `feat(pose): POSE-09 squat state machine`.
- Design: follow PRD §10 and `docs/design-reference/`. Use the `nm-*` Tailwind tokens from
  `src/app/globals.css` (e.g. `bg-nm-soft`, `text-nm-primary-ink`, `rounded-card`). Small green text uses
  `text-nm-primary-ink`, never `nm-primary`/`nm-primary-dark`. Minimum text size 12px.
- `cacheComponents` is intentionally **off** in `next.config.ts`; routes render dynamically. Don't turn it on.
- Middleware is called **Proxy** in Next 16 (`src/proxy.ts`).
- `src/lib/agent/**` and `src/lib/pose/analyzers/**` must be pure, deterministic and unit-tested
  (Vitest, `*.test.ts` next to the file). No Supabase or DOM calls inside them.
- Never put secrets in client code; third-party API keys live in Supabase Edge Functions.
- Every new table gets RLS (`user_id = auth.uid()`) in the same migration.
- Never upload, store or log camera frames.
- Import `onnxruntime-web` only lazily in the browser (see `src/lib/pose/instanthmr/session.ts`).
- Accessibility: interactive elements are keyboard-operable and labelled; colour is never the only signal.
- Before pushing: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

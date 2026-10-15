# Security checklist (PRD §8.1 / §8.3: OWASP ASVS Level 1, RA 10173)

Audited on Day 6 (Tue 13 Oct 2026) against the hosted Supabase project and the `main` branch. "Verified" means checked
by a query, a test or a request against the running app, not just read in the code. Re-run the commands in the last
section before the demo.

## Summary

| Area | Status |
|---|---|
| Row-level security on every user table | Verified: 21 of 21 public tables have RLS; every user-owned table has `auth.uid() = user_id` for read and write |
| Secrets stay server-side | Verified: no keys in tracked files or git history; the service-role key and the USDA key only exist as Edge Function secrets |
| Authentication on every mutation | Verified: all server actions call `requireUser()` (or the equivalent in `consent`); the data export route checks the session |
| Input validation | Verified: every server action validates with zod |
| Open redirects | Verified: `?next=` is accepted only when it starts with a single `/` (callback, login form and proxy) |
| Security headers | Added Day 6 (see below); full `script-src` CSP deferred |
| Edge Functions | Verified: JWT required, per-user rate limit (`api_usage`) |
| Privacy (RA 10173) | Consent, export, delete, no video stored |
| Dependencies | One high advisory in a build-time tool (accepted, see below) |

## Access control (ASVS V4)

- All 21 tables in `public` have RLS enabled (`select relrowsecurity from pg_class …`).
- Policies, from `pg_policies`:
  - User-owned tables (`agent_events`, `check_ins`, `food_logs`, `meal_plan_items`, `meal_plans`, `profiles`,
    `recipe_ratings`, `screenings`, `session_sets`, `targets`, `user_settings`, `water_logs`, `weight_logs`,
    `workout_plan_items`, `workout_plans`, `workout_sessions`): one `ALL` policy for `authenticated`,
    `using` and `with check` both `(select auth.uid()) = user_id`.
  - `consents`: insert and select only, so consent history cannot be edited or deleted by the user (it is removed with the account).
  - `exercises`, `recipes`: read-only catalogues for signed-in users.
  - `foods`: catalogue rows (`user_id is null`) are readable; users can only write their own rows and only with `source = 'custom'`.
  - `api_usage`: RLS on, no policy on purpose; only the service role (Edge Functions) can touch it. The Supabase linter reports this as INFO.
- `anon` has no policies, so nothing is readable without signing in.
- Known small gap: a user could insert a `workout_plan_items` / `meal_plan_items` row whose parent plan id belongs to
  someone else (they can only ever see their own rows, so this reveals nothing); not worth a trigger for the MVP.
- `public.delete_my_account()` is `SECURITY DEFINER` and callable by `authenticated` on purpose (the Supabase
  linter warns about this). It only deletes `auth.uid()`'s own account, has `search_path = ''`, and is revoked from
  `public` and `anon`.

## Secrets and configuration (ASVS V14)

- Client code only uses `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the optional `NEXT_PUBLIC_MODEL_URL`.
- `git grep` for `service_role`, `sb_secret`, JWT-shaped strings and `USDA_API_KEY` finds nothing outside docs and Edge Functions;
  `git log -S` over history finds nothing either. Only `.env.example` (blank placeholders) is tracked.
- Third-party API keys (`USDA_API_KEY`, `OFF_CONTACT`) are Supabase Edge Function secrets.
- `SUPABASE_SERVICE_ROLE_KEY` is only read inside `supabase/functions/_shared/http.ts`.

## Input validation and output encoding (ASVS V5)

- zod schemas on every server action: `nutrition/actions.ts`, `nutrition/meal-actions.ts`, `workout/actions.ts`,
  `check-in/actions.ts`, `profile/actions.ts`, `progress/actions.ts`, and the onboarding step schemas.
- Nutrition values for logging are recomputed on the server from the database row, never trusted from the client.
- React escapes output. The only `dangerouslySetInnerHTML` is the constant accessibility boot script in `layout.tsx`.
- Edge Functions sanitise the search query and validate barcodes (`_shared/food-mappers.ts`, unit-tested).

## Sessions and authentication (ASVS V2/V3)

- Supabase Auth (email + Google OAuth), cookie sessions via `@supabase/ssr`, refreshed in `src/proxy.ts`.
- Protected routes redirect to `/login?next=…`; `next` is validated with `safeNext` (`/` prefix, not `//`).
- Sign-out clears cached pages in the service worker.
- Password policy (Supabase → Authentication → Sign In / Providers → Email, set Day 6): at least 8 characters with a
  lowercase letter, an uppercase letter and a digit. The sign-up form shows and checks the same rule.
- **Accepted limitation:** *Prevent use of leaked passwords* (HaveIBeenPwned check) needs the Supabase Pro plan; the
  project is on the free plan, so it stays off. The linter warning for it is expected. Google sign-in avoids passwords entirely.

## Security headers (added Day 6, `next.config.ts`)

Sent on every route: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Frame-Options: DENY`, `Strict-Transport-Security`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()…`,
and a CSP limited to `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`.

**Deferred:** a CSP with `script-src`. Next.js's inline bootstrap scripts, the accessibility boot script and
onnxruntime-web (workers, `wasm-unsafe-eval`) need a nonce-based policy and testing on real devices. Residual risk
is limited by React's output escaping and the absence of user-generated HTML.

## Edge Functions (ASVS V13)

- `food-search`, `food-barcode`: deployed with JWT verification; the caller's user id comes from the verified token.
- Per-user rate limit through `api_usage` (60/min search, 30/min barcode, checked with the service role).
- CORS headers come from one shared helper; outbound calls go only to USDA FoodData Central and Open Food Facts.

## Privacy and ethics (RA 10173, PRD §8.3)

- Consent for data and health data (AUTH-02) and a separate camera consent (AUTH-03), versioned and stored.
- Access: JSON export of all 17 user tables at `/profile/export` (AUTH-05). Erasure: delete account, which cascades through
  every table (AUTH-04). Privacy notice page at `/privacy`.
- **Camera video is never stored or uploaded.** Frames are processed in a Web Worker and closed after inference; only rep
  counts, form-error counts and durations are saved.
- Health screening guardrails are enforced in code and covered by `src/lib/agent/guardrail-scenarios.test.ts`: 18+ only,
  calorie floor, 1%/week loss cap, pregnancy → maintenance (including in the weekly check-in), PAR-Q flag → beginner cap
  plus clearance acknowledgement, new pain → camera coach paused and workouts lightened.
- No medical claims in the copy; the screening and plan screens say the app is not a medical device.

## Dependencies

- `pnpm audit --prod`: 1 high advisory, `braces` (ReDoS, GHSA-vfj7-8cjw-p6xm) via `shadcn > fast-glob > micromatch`.
  That chain is the shadcn CLI's glob handling, used at development time on our own paths; it never runs in the
  deployed app or on user input. **Accepted** until shadcn updates; re-check with `pnpm audit --prod`.
- The pose model weights are under the SAM license (research / non-commercial); noted in the paper's limitations (PRD §8.3).

## Known limitations

- No rate limit on server actions beyond Supabase Auth's built-in limits.
- Four or more allergies at once can leave a meal slot with no recipes; the app says so instead of failing silently.
- If the laptop pose server is used (PRD §7.7.3), a cropped 224 px image of the person is sent to the user's own laptop
  over TLS, only after an explicit opt-in; the server keeps nothing on disk.

## Re-run before the demo

```bash
pnpm audit --prod
git grep -nEi "service_role|sb_secret|eyJ[A-Za-z0-9_-]{20,}\." -- . ':!pnpm-lock.yaml' ':!docs' ':!supabase/config.toml'
curl -sI https://nutri-move-ai.vercel.app/login | grep -iE "x-frame|content-security|nosniff|referrer|permissions|strict-transport"
```

```sql
-- every public table has RLS and at least one policy (api_usage is the one intentional exception)
select c.relname, c.relrowsecurity, (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1;
```
Supabase → Advisors → Security should show only: `api_usage` (INFO, intentional), `delete_my_account` (WARN, intentional),
and leaked-password protection (Pro plan only, accepted).

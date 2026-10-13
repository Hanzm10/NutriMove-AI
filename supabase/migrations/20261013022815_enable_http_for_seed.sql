-- Temporary: lets the seed load supabase/seed/foods_fnri.json from GitHub (http_get + sha256 check).
-- Not exposed via the API (PostgREST only serves `public`). Disable afterwards in
-- Dashboard → Database → Extensions → http (dropping it through the MCP tool times out).
create extension if not exists http with schema extensions;

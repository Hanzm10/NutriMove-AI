-- PRD §12.3: keep each camera session's speed so the latency report can be built from real use.
-- workout_sessions already has RLS (user_id = auth.uid()); new columns inherit it.
alter table public.workout_sessions
  add column if not exists p50_latency_ms numeric(7,1),
  add column if not exists p95_latency_ms numeric(7,1),
  add column if not exists device_class text check (device_class in ('iphone', 'ipad', 'android', 'windows', 'mac', 'linux', 'other'));

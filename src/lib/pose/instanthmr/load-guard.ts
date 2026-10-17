// Crash-safe model loading (PRD §7.7 fallback ladder). An out-of-memory kill on a phone can't be caught in JS:
// the tab just reloads ("A problem repeatedly occurred"). So every attempt leaves a breadcrumb in localStorage;
// if the next page load finds it, the previous attempt died and we start one rung lighter instead of looping.
// Pure and storage-injected so it is unit-testable.

export type RungId = "auto" | "full-wasm" | "lite-wasm" | "lite-1t";
export type Rung = {
  id: RungId;
  model: "full" | "lite";
  prefer: "webgpu" | "wasm";
  threads?: number;
  label: string;
};

/** Heaviest → lightest. */
export const RUNGS: Rung[] = [
  { id: "auto", model: "full", prefer: "webgpu", label: "full model, GPU when available" },
  { id: "full-wasm", model: "full", prefer: "wasm", label: "full model, CPU" },
  { id: "lite-wasm", model: "lite", prefer: "wasm", label: "lite model, CPU" },
  { id: "lite-1t", model: "lite", prefer: "wasm", threads: 1, label: "lite model, CPU, single thread" },
];

export const rungById = (id: string | null | undefined) => RUNGS.find((r) => r.id === id) ?? null;
export const nextRung = (id: RungId): Rung | null => RUNGS[RUNGS.findIndex((r) => r.id === id) + 1] ?? null;
/** iPhones start at the lightest in-browser setup; everything else at the best one. */
export const defaultRung = (ios: boolean): Rung => (ios ? RUNGS[RUNGS.length - 1]! : RUNGS[0]!);

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const ATTEMPT = "nm-pose-attempt-v1";
const START = "nm-pose-start-v1";
const LOG = "nm-pose-log-v1";
/** An attempt record older than this is a stale leftover, not a crash we should react to. */
const STALE_MS = 30 * 60_000;
const LOG_MAX = 40;

export type Attempt = { rung: RungId; startedAt: number; stage: string };
export type BeginResult = {
  /** Null when every in-browser rung has failed: use the laptop coach. */
  rung: Rung | null;
  /** The previous attempt that never finished (the page was killed), if any. */
  crashed: Attempt | null;
  /** Log lines left by the previous page life (newest last). */
  previousLog: string[];
};

export function createLoadGuard(store: Store, now: () => number = Date.now) {
  const read = <T>(key: string): T | null => {
    try {
      const v = store.getItem(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      store.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked: the ladder just starts from the default each time */
    }
  };
  const remove = (key: string) => {
    try {
      store.removeItem(key);
    } catch {
      /* ignore */
    }
  };
  const getStart = () => read<string>(START);
  let current: RungId | null = null;
  let log: string[] = [];

  const guard = {
    /** Decide which rung to try now and leave a breadcrumb. `forced` (e.g. ?rung=) skips the ladder. */
    begin(def: Rung, forced?: Rung | null): BeginResult {
      const previousLog = read<string[]>(LOG) ?? [];
      const prev = read<Attempt>(ATTEMPT);
      const crashed = prev && now() - prev.startedAt < STALE_MS ? prev : null;
      let rung: Rung | null;
      if (forced) {
        rung = forced;
      } else if (crashed) {
        rung = nextRung(crashed.rung);
        write(START, rung?.id ?? "none");
      } else {
        const saved = getStart();
        rung = saved === "none" ? null : (rungById(saved) ?? def);
      }
      log = [];
      if (rung) {
        current = rung.id;
        write(ATTEMPT, { rung: rung.id, startedAt: now(), stage: "start" } satisfies Attempt);
        guard.note(`attempt: ${rung.label}`);
      } else {
        remove(ATTEMPT);
      }
      return { rung, crashed, previousLog };
    },
    /** Progress breadcrumb. The last one before a crash tells us where it died. */
    stage(stage: string) {
      const prev = read<Attempt>(ATTEMPT);
      if (prev) write(ATTEMPT, { ...prev, stage });
      guard.note(stage);
    },
    note(line: string) {
      log = [...log, `${new Date(now()).toISOString().slice(11, 19)} ${line}`].slice(-LOG_MAX);
      write(LOG, log);
    },
    /** The attempt worked (a few frames were processed): remember this rung as the one to start from. */
    success() {
      if (current) write(START, current);
      remove(ATTEMPT);
      guard.note("ok: coach running");
    },
    /** The attempt failed with a catchable error: start one rung lighter next time. */
    fail(reason: string): Rung | null {
      guard.note(`failed: ${reason.slice(0, 160)}`);
      const next = current ? nextRung(current) : null;
      write(START, next?.id ?? "none");
      remove(ATTEMPT);
      return next;
    },
    /** The user left the page normally (pagehide): not a crash. */
    cleanExit() {
      remove(ATTEMPT);
    },
    /** Breadcrumbs of the current page life, oldest first. */
    lines: () => log,
    /** Forget everything and start from the default again. */
    reset() {
      remove(ATTEMPT);
      remove(START);
      remove(LOG);
      log = [];
    },
  };
  return guard;
}
export type LoadGuard = ReturnType<typeof createLoadGuard>;

/** Reads ?rung= (force a rung), ?model=lite|full|/path, ?ep=wasm, ?threads=N, ?debug. Pure. */
export function parseLoadParams(search: string) {
  const q = new URLSearchParams(search);
  const model = q.get("model");
  const threads = Number(q.get("threads"));
  return {
    rung: rungById(q.get("rung")),
    model: model === "lite" || model === "full" ? model : model?.startsWith("/") && !model.startsWith("//") ? model : null,
    ep: q.get("ep") === "wasm" ? ("wasm" as const) : null,
    threads: Number.isInteger(threads) && threads >= 1 && threads <= 8 ? threads : null,
    debug: q.has("debug"),
    // "device": ignore a laptop pairing; "mediapipe": use MediaPipe Pose Landmarker on this device (Phase 1 trial).
    pose: q.get("pose") === "device" ? ("device" as const) : q.get("pose") === "mediapipe" ? ("mediapipe" as const) : null,
  };
}

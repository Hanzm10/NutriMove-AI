// Data-driven exercise engine (docs/pose-optimization-plan.md, Phases 3–4). An exercise is JSON (exercise-rules.json):
// a driver angle for rep counting, thresholds, form checks and gates that name rules from this file, and the body
// parts that must be in view. Pure, no DOM.
import { angleAt, angleFromVertical, horizontalDist, mid, sub, verticalOffsetFromLine } from "../geometry";
import type { CanonicalPose, JointName, Vec3 } from "../types";
import { BaseAnalyzer } from "./base";
import type { Cue, ExerciseAnalyzer, ExerciseKind } from "./types";
import { MedianWindow, shoulderTorsoRatio } from "./view";

export type ParamValue = number | boolean;
type Ref = string | number | boolean;

/** One form check: `rule` from RULES, the cue `code` it raises, and its settings (param names or literals). */
export type CheckDef = { rule: string; code: string; below?: string; [setting: string]: Ref | undefined };

/**
 * One gate: `rule` from GATES, judged at the deepest frame of each attempt. A failing gate voids the attempt
 * (`on: "any"`, the default) or only a full rep (`on: "rep"`, so shallow attempts still get the depth cue).
 * With a `code`, a voided attempt also raises that cue (e.g. "Get down on the floor for push-ups").
 */
export type GateDef = { rule: string; on?: string; code?: string; [setting: string]: Ref | undefined };

export type ExerciseDef = {
  /** Angle at the middle joint (e.g. hip-knee-ankle), measured on both sides and combined. */
  driver: { joints: string[]; combine: string };
  /** Code for a shallow attempt (went down, never reached `bottom`). */
  depthCode: string;
  /** Needs `top`, `bottom` and `shallowFloor` (degrees) for the rep counter; the rest is read by checks. */
  params: Record<string, ParamValue>;
  checks: CheckDef[];
  gates?: GateDef[];
  /** Frames where any of these body parts is out of view (best side's visibility < `min`) are skipped. */
  visible?: { parts: string[]; min: Ref };
};

export type CommonRules = { minRepMs: number; maxRepMs: number; minBottomFrames: number; hysteresis: number; cueCooldownMs: number };

export type ExerciseRules = { common: CommonRules; backends: object } & Record<ExerciseKind, ExerciseDef>;

type Joints = Record<JointName, Vec3>;
/** What a check sees on each frame. */
export type FrameCtx = { pose: CanonicalPose; j: Joints; angle: number };
type Check = {
  codes: string[];
  /** Runs on every frame (for checks that learn a baseline). */
  observe?: (f: FrameCtx) => void;
  /** Returns the violated code, if any. Runs only while the check applies (see `below`). */
  test: (f: FrameCtx) => string | null;
};
type Setting = { num(name: string): number; bool(name: string): boolean; str(name: string): string };
type RuleFactory = (s: Setting, p: Record<string, ParamValue>) => Check;

const torso = (j: Joints) => sub(mid(j.l_shoulder, j.r_shoulder), mid(j.l_hip, j.r_hip));

/** The form rules an exercise can use. Add a rule here, then reference it from JSON. */
export const RULES: Record<string, RuleFactory> = {
  /** Torso tilted forward more than `max` degrees from vertical. */
  torsoLean: (s) => {
    const max = s.num("max"), code = s.str("code");
    return { codes: [code], test: ({ j }) => (angleFromVertical(torso(j)) > max ? code : null) };
  },

  /**
   * Knees caving in, judged by camera angle (Phase 2): facing the camera (median shoulder/torso ratio of standing
   * frames ≥ `frontViewMin`), knee spacing under `frontMax` × ankle spacing; side-on, if `side`, under `sideDrop` ×
   * this person's standing knee spacing.
   */
  kneeCave: (s, p) => {
    const code = s.str("code"), frontViewMin = s.num("frontViewMin"), frontMax = s.num("frontMax");
    const sideDrop = s.num("sideDrop"), side = s.bool("side"), top = p.top as number;
    let standingSpread: number | null = null;
    // ~10 s of standing frames: long enough that briefly turning toward the camera doesn't flip the knee rule.
    const view = new MedianWindow(150);
    const spreadOf = (j: Joints) => {
      const ankles = horizontalDist(j.l_ankle, j.r_ankle);
      return ankles > 1e-3 ? horizontalDist(j.l_knee, j.r_knee) / ankles : null;
    };
    return {
      codes: [code],
      observe: ({ pose, j, angle }) => {
        if (angle <= top) return;
        const spread = spreadOf(j);
        if (spread != null) standingSpread = standingSpread == null ? spread : standingSpread * 0.9 + spread * 0.1;
        const v = shoulderTorsoRatio(pose);
        if (v != null) view.push(v);
      },
      test: ({ j }) => {
        const spread = spreadOf(j);
        if (spread == null) return null;
        const facing = (view.median ?? 0) >= frontViewMin;
        const caved = facing ? spread < frontMax : side && standingSpread != null && spread < sideDrop * standingSpread;
        return caved ? code : null;
      },
    };
  },

  /** Push-up body line bent under `lineMin` degrees with the hips more than `offset` m off it: sagging or piking. */
  hipLine: (s) => {
    const sag = s.str("code"), pike = s.str("pikeCode"), lineMin = s.num("lineMin"), offset = s.num("offset");
    return {
      codes: [sag, pike],
      test: ({ j }) => {
        const shoulder = mid(j.l_shoulder, j.r_shoulder), hip = mid(j.l_hip, j.r_hip), ankle = mid(j.l_ankle, j.r_ankle);
        const off = verticalOffsetFromLine(hip, shoulder, ankle);
        if (angleAt(shoulder, hip, ankle) >= lineMin || Math.abs(off) <= offset) return null;
        return off > 0 ? sag : pike;
      },
    };
  },
};

type Gate = {
  observe?: (f: FrameCtx) => void;
  /** True when this frame looks like the exercise. */
  pass: (f: FrameCtx) => boolean;
};
type GateFactory = (s: Setting, p: Record<string, ParamValue>) => Gate;

const kneeAngles = (j: Joints) => [angleAt(j.l_hip, j.l_knee, j.l_ankle), angleAt(j.r_hip, j.r_knee, j.r_ankle)] as const;

/** Edge-case rules (Phase 3): movements that bend the driver joint without being the exercise. */
export const GATES: Record<string, GateFactory> = {
  /**
   * Body lying down: the shoulder-to-ankle line at least `min` degrees from vertical, in 3D so it holds whichever way
   * the camera faces (in 2D a push-up filmed head-on looks upright). Standing measures under 30° on every team clip,
   * push-ups about 80°: bending the arms while standing is never a push-up.
   */
  bodyHorizontal: (s) => {
    const min = s.num("min");
    return {
      pass: ({ j }) => {
        const sh = mid(j.l_shoulder, j.r_shoulder), an = mid(j.l_ankle, j.r_ankle);
        const d = sub(an, sh);
        return (Math.atan2(Math.hypot(d[0], d[2]), Math.abs(d[1])) * 180) / Math.PI >= min;
      },
    };
  },

  /** Both knees bent below `max` degrees: one knee raised (or a march) is never a squat or lunge. */
  bothLegsBend: (s) => {
    const max = s.num("max");
    return { pass: ({ j }) => Math.max(...kneeAngles(j)) < max };
  },

  /**
   * Hips dropped: the hip-to-planted-ankle height in the image is at most `maxRatio` × this person's standing height.
   * 2D on purpose: both models' 3D is hip-centred, so the hips never "move" in 3D. Passes until standing is seen.
   */
  hipsDrop: (s, p) => {
    const maxRatio = s.num("maxRatio"), top = p.top as number;
    const standing = new MedianWindow(150);
    const height = (pose: CanonicalPose) => {
      const k = pose.joints2d;
      return Math.max(k.l_ankle[1], k.r_ankle[1]) - (k.l_hip[1] + k.r_hip[1]) / 2; // image Y is down
    };
    return {
      observe: (f) => {
        if (f.angle > top) standing.push(height(f.pose));
      },
      pass: (f) => {
        const base = standing.median;
        return base == null || base <= 0 || height(f.pose) / base <= maxRatio;
      },
    };
  },
};

const COMBINE: Record<string, (l: number, r: number) => number> = {
  mean: (l, r) => (l + r) / 2,
  min: Math.min,
};

/** Reads a check's settings: a string names a param of the exercise, anything else is a literal. */
function settings(kind: string, check: CheckDef | GateDef, params: Record<string, ParamValue>): Setting {
  const where = `${kind} check "${check.rule}"`;
  const get = (name: string): Ref => {
    const v = check[name];
    if (v === undefined) throw new Error(`${where}: missing setting "${name}"`);
    if (typeof v !== "string" || name === "code" || name.endsWith("Code")) return v;
    if (!(v in params)) throw new Error(`${where}: unknown param "${v}"`);
    return params[v]!;
  };
  const typed = <T>(name: string, type: string) => {
    const v = get(name);
    if (typeof v !== type) throw new Error(`${where}: "${name}" should be a ${type}`);
    return v as T;
  };
  return { num: (n) => typed<number>(n, "number"), bool: (n) => typed<boolean>(n, "boolean"), str: (n) => typed<string>(n, "string") };
}

const JOINT = /^[lr]_(shoulder|elbow|wrist|hip|knee|ankle|heel|big_toe)$/;

function sideJoint(side: "l" | "r", part: string): JointName {
  return `${side}_${part}` as JointName;
}

/**
 * Builds a live analyzer from an exercise definition. Throws on a definition error (unknown rule, param, joint or cue),
 * so a bad JSON edit fails the unit tests instead of the workout.
 */
export function buildAnalyzer(
  kind: ExerciseKind,
  def: ExerciseDef,
  common: CommonRules,
  cueCatalog: Record<string, Cue>,
): ExerciseAnalyzer {
  const p = def.params;
  for (const k of ["top", "bottom", "shallowFloor"]) {
    if (typeof p[k] !== "number") throw new Error(`${kind}: params.${k} must be a number`);
  }
  const combine = COMBINE[def.driver.combine];
  if (!combine) throw new Error(`${kind}: unknown driver combine "${def.driver.combine}"`);
  if (def.driver.joints.length !== 3) throw new Error(`${kind}: driver needs 3 joints`);
  const sides = (["l", "r"] as const).map((s) => def.driver.joints.map((part) => sideJoint(s, part)));
  const known = new Set<string>(Object.keys(cueCatalog));
  for (const n of sides.flat()) if (!JOINT.test(n)) throw new Error(`${kind}: unknown joint "${n}"`);

  const checks = def.checks.map((cd) => {
    const make = RULES[cd.rule];
    if (!make) throw new Error(`${kind}: unknown rule "${cd.rule}"`);
    if (cd.below !== undefined && typeof p[cd.below] !== "number") throw new Error(`${kind} check "${cd.rule}": unknown param "${cd.below}"`);
    const check = make(settings(kind, cd, p), p);
    return { ...check, below: cd.below === undefined ? Infinity : (p[cd.below] as number) };
  });
  const gates = (def.gates ?? []).map((gd) => {
    const make = GATES[gd.rule];
    if (!make) throw new Error(`${kind}: unknown gate "${gd.rule}"`);
    const on = gd.on ?? "any";
    if (on !== "any" && on !== "rep") throw new Error(`${kind} gate "${gd.rule}": "on" must be "any" or "rep"`);
    return { ...make(settings(kind, gd, p), p), name: gd.rule, on, code: gd.code };
  });
  const visible = def.visible && {
    parts: def.visible.parts.map((part) => {
      const pair = (["l", "r"] as const).map((sd) => sideJoint(sd, part));
      for (const n of pair) if (!JOINT.test(n)) throw new Error(`${kind}: unknown body part "${part}"`);
      return pair;
    }),
    min: settings(kind, { rule: "visible", min: def.visible.min }, p).num("min"),
  };
  const inView = (pose: CanonicalPose) =>
    !visible || !pose.visibility || visible.parts.every((pair) => Math.max(...pair.map((n) => pose.visibility![n] ?? 1)) >= visible.min);
  const gateCues = Object.fromEntries(gates.filter((g) => g.code).map((g) => [g.name, g.code!]));
  const codes = [def.depthCode, ...checks.flatMap((ch) => ch.codes), ...Object.values(gateCues)];
  for (const code of codes) if (!known.has(code)) throw new Error(`${kind}: no cue for "${code}"`);

  const angleOf = (j: Joints, s: JointName[]) => angleAt(j[s[0]!], j[s[1]!], j[s[2]!]);
  return new BaseAnalyzer(
    {
      kind,
      counter: { top: p.top as number, bottom: p.bottom as number, shallowFloor: p.shallowFloor as number },
      depthCode: def.depthCode,
      gateCues,
      cues: Object.fromEntries(codes.map((code) => [code, cueCatalog[code]!])),
      metrics: (pose) => {
        const j = pose.joints3d;
        if (!j || !inView(pose)) return null;
        const f: FrameCtx = { pose, j, angle: combine(angleOf(j, sides[0]!), angleOf(j, sides[1]!)) };
        const violations: string[] = [];
        for (const ch of checks) {
          ch.observe?.(f);
          if (f.angle < ch.below) {
            const v = ch.test(f);
            if (v) violations.push(v);
          }
        }
        if (!gates.length) return { angle: f.angle, violations };
        const gate = { any: null as string | null, rep: null as string | null };
        for (const g of gates) {
          g.observe?.(f);
          if (!g.pass(f)) gate[g.on as "any" | "rep"] ??= g.name;
        }
        return { angle: f.angle, violations, gate };
      },
    },
    common,
  );
}

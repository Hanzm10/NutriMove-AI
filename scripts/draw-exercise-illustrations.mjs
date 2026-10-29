#!/usr/bin/env node
// Draws the how-to illustrations for exercises that have no openly licensed photo (src/lib/workout/exercise-photos.ts).
// Original artwork for NutriMove AI: a jointed figure in the app's colours. Hands and feet are placed by hand; elbows
// and knees are solved (two-bone IK), so proportions stay the same across every drawing.
//
//   node scripts/draw-exercise-illustrations.mjs   → public/exercises/<slug>/<n>.svg
import { mkdirSync, writeFileSync } from "node:fs";

const C = {
  near: "#5c8f18", // nm-primary-dark: near-side limbs, torso, head
  far: "#9bd141", // nm-primary: far-side limbs
  shoe: "#1d2718", // nm-ink
  floor: "#c9d6bf",
  prop: "#dde5d7", // nm-line
  propEdge: "#b9c7ad",
  mat: "#c8eb8d", // nm-secondary
};
const W = 480, H = 320, FLOOR = 280;
const L = { torso: 75, neck: 12, head: 16, upper: 46, fore: 44, thigh: 58, shin: 56, foot: 22 };

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const rad = (d) => (d * Math.PI) / 180;
/** Unit vector at `deg` from straight up, positive towards +x (the figure's front in side views). */
const up = (deg) => [Math.sin(rad(deg)), -Math.cos(rad(deg))];

/** Two-bone IK: the joint between `a` and target `t`; `bend` +1/-1 picks the side it bends to. */
function joint(a, t, l1, l2, bend) {
  const v = sub(t, a);
  const d = Math.min(len(v), l1 + l2 - 0.01);
  const base = Math.atan2(v[1], v[0]);
  const ang = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const th = base + bend * ang;
  const j = add(a, [Math.cos(th) * l1, Math.sin(th) * l1]);
  const end = add(j, mul(sub(t, j), l2 / Math.max(1e-6, len(sub(t, j)))));
  return { j, end };
}

const f = (n) => Math.round(n * 10) / 10;
const seg = (pts, color, w) =>
  `<polyline points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const dot = (p, r, color) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${r}" fill="${color}"/>`;

/** One limb: root → joint (`mid` if pinned, else solved) → end, plus a hand dot or a shoe from `toe`. */
function limb(root, target, l1, l2, bend, color, { toe, hand, mid } = {}) {
  const { j, end } = mid ? { j: mid, end: target } : joint(root, target, l1, l2, bend);
  let s = seg([root, j, end], color, 14);
  if (hand) s += dot(end, 7, color);
  if (toe) s += seg([end, toe], C.shoe, 11);
  return s;
}

/**
 * Side view, facing right. `hip`, `lean` (torso degrees from upright, + forward), `head` tilt, hand targets and
 * ankle/toe positions for the near and far side. `armBend`/`legBend` choose which way elbows and knees bend.
 */
function side(p) {
  const shoulder = add(p.hip, mul(up(p.lean), L.torso));
  const neckDir = up(p.lean + (p.head ?? 0));
  const head = add(shoulder, mul(neckDir, L.neck + L.head));
  const sFar = add(shoulder, [-4, 2]), hFar = add(p.hip, [-3, 1]);
  const arm = (s, h, b, c) => limb(s, h.hand, L.upper, L.fore, h.bend ?? b, c, { hand: true, mid: h.elbow });
  const leg = (s, l, b, c) => limb(s, l.ankle, L.thigh, L.shin, l.bend ?? b, c, { toe: l.toe, mid: l.knee });
  return [
    arm(sFar, p.far.arm, p.armBend ?? 1, C.far),
    leg(hFar, p.far.leg, p.legBend ?? -1, C.far),
    seg([p.hip, shoulder], C.near, 26),
    dot(head, L.head, C.near),
    leg(p.hip, p.near.leg, p.legBend ?? -1, C.near),
    arm(shoulder, p.near.arm, p.armBend ?? 1, C.near),
  ].join("");
}

/** Front view: centre x, hip height; hands and ankles for the figure's left (screen right) and right side. */
function front(p) {
  const { x, hipY } = p;
  const shY = hipY - L.torso;
  const sh = { r: [x - 22, shY], l: [x + 22, shY] }, hp = { r: [x - 12, hipY], l: [x + 12, hipY] };
  const torso = `<path d="M${x - 21},${shY} L${x + 21},${shY} L${x + 12},${hipY} L${x - 12},${hipY} Z" fill="${C.near}" stroke="${C.near}" stroke-width="14" stroke-linejoin="round"/>`;
  const head = dot([x, shY - L.neck - L.head], L.head, C.near);
  const leg = (s, l, out) => limb(hp[s], l.ankle, L.thigh, L.shin, l.bend ?? out, C.near, { toe: l.toe ?? add(l.ankle, [out * 14, 6]), mid: l.knee });
  const arm = (s, a, out, c) => limb(sh[s], a.hand, L.upper, L.fore, a.bend ?? out, c ?? C.near, { hand: true, mid: a.elbow });
  return [
    leg("r", p.right.leg, -1), leg("l", p.left.leg, 1), torso, head,
    arm("r", p.right.arm, 1, p.right.arm.color), arm("l", p.left.arm, -1, p.left.arm.color),
  ].join("");
}

const floor = `<line x1="24" y1="${FLOOR}" x2="${W - 24}" y2="${FLOOR}" stroke="${C.floor}" stroke-width="4" stroke-linecap="round"/>`;
const mat = (x1, x2) => `<rect x="${x1}" y="${FLOOR - 7}" width="${x2 - x1}" height="9" rx="4.5" fill="${C.mat}"/>`;
const wall = (x) => `<rect x="${x}" y="40" width="22" height="${FLOOR - 40}" rx="4" fill="${C.prop}" stroke="${C.propEdge}" stroke-width="2"/>`;
const chair = (x) =>
  `<g fill="none" stroke="${C.propEdge}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="M${x},${FLOOR} L${x},200 L${x + 70},200 L${x + 70},${FLOOR}"/><path d="M${x},200 L${x - 4},120"/></g>`;

const svg = (title, body, viewBox = `0 0 ${W} ${H}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

/** Floor exercises sit low, so their frame is a closer 3:2 crop around the figure. */
const CLOSE_UP = new Set(["knee-pushup", "shoulder-tap", "bird-dog"]);

const standLeg = (x, y = FLOOR - 8) => ({ ankle: [x, y], toe: [x + 20, FLOOR - 4] });
/** Straight arm hanging from the shoulder of a figure whose hip is `hip` (lean in degrees). */
const hangArm = (hip, lean = 0, dx = -4) => {
  const s = add(hip, mul(up(lean), L.torso));
  return { hand: [s[0] + dx, s[1] + 88], elbow: [s[0] + dx / 2, s[1] + 46] };
};
// Front view: straight legs, ankles 114 below the hips.
const fLeg = (x, hipY, dx = 0) => ({ ankle: [x + dx, hipY + 112], knee: [x + dx / 2, hipY + 57] });
const armsDown = (x, shY) => ({ r: { hand: [x - 36, shY + 86], elbow: [x - 30, shY + 44] }, l: { hand: [x + 36, shY + 86], elbow: [x + 30, shY + 44] } });
// Arms up in a wide V, so the hands stay inside the frame.
const armsUp = (x, shY, spread = 52) => ({ r: { hand: [x - 22 - spread, shY - 64], elbow: [x - 22 - spread / 2, shY - 36] }, l: { hand: [x + 22 + spread, shY - 64], elbow: [x + 22 + spread / 2, shY - 36] } });

const hipF = 158, shF = hipF - L.torso;
const kneelLeg = (hip, knee, foot) => ({ knee, ankle: foot, toe: add(foot, [-18, 0]) });

// [slug, [title, body][]]; poses are tuned by eye on the rendered sheet.
const DRAWINGS = {
  "wall-pushup": [
    ["Wall push-up: arms straight", wall(400) + floor + side({ hip: [290, 163], lean: 20, near: { arm: { hand: [398, 96] }, leg: standLeg(250) }, far: { arm: { hand: [396, 104] }, leg: standLeg(244) } })],
    ["Wall push-up: chest to the wall", wall(400) + floor + side({ hip: [308, 172], lean: 30, head: -18, near: { arm: { hand: [398, 104], elbow: [356, 150] }, leg: standLeg(250) }, far: { arm: { hand: [396, 112], elbow: [352, 154] }, leg: standLeg(244) } })],
  ],
  "knee-pushup": [
    ["Knee push-up: top", mat(90, 400) + floor + side({ hip: [236, 236], lean: 52, head: 12, near: { arm: { hand: [298, 274] }, leg: kneelLeg(null, [190, 270], [148, 236]) }, far: { arm: { hand: [294, 276] }, leg: kneelLeg(null, [186, 271], [144, 238]) } })],
    ["Knee push-up: bottom", mat(90, 400) + floor + side({ hip: [246, 258], lean: 78, head: 4, near: { arm: { hand: [304, 274], elbow: [286, 232] }, leg: kneelLeg(null, [190, 270], [148, 236]) }, far: { arm: { hand: [300, 276], elbow: [282, 234] }, leg: kneelLeg(null, [186, 271], [144, 238]) } })],
  ],
  "box-squat": [
    ["Box squat: stand in front of the chair", chair(150) + floor + side({ hip: [252, 158], lean: 4, armBend: -1, near: { arm: { hand: [345, 92] }, leg: standLeg(252) }, far: { arm: { hand: [341, 96] }, leg: standLeg(246) } })],
    ["Box squat: sit back to the chair", chair(150) + floor + side({ hip: [208, 198], lean: 34, armBend: -1, near: { arm: { hand: [330, 128] }, leg: standLeg(252) }, far: { arm: { hand: [326, 132] }, leg: standLeg(246) } })],
  ],
  "calf-raise": [
    ["Calf raise: feet flat", wall(330) + floor + side({ hip: [236, 158], lean: 2, near: { arm: { hand: [328, 140] }, leg: standLeg(238) }, far: { arm: hangArm([236, 158], 2), leg: standLeg(232) } })],
    ["Calf raise: up on your toes", wall(330) + floor + side({ hip: [236, 142], lean: 2, near: { arm: { hand: [328, 126] }, leg: { ankle: [242, 256], toe: [256, FLOOR - 3] } }, far: { arm: hangArm([236, 142], 2), leg: { ankle: [236, 256], toe: [250, FLOOR - 3] } } })],
  ],
  "shoulder-tap": [
    ["Plank shoulder tap: high plank", mat(80, 400) + floor + side({ hip: [214, 216], lean: 67, head: 14, near: { arm: { hand: [286, 274] }, leg: { ankle: [108, 256], toe: [118, 276] } }, far: { arm: { hand: [282, 276] }, leg: { ankle: [104, 258], toe: [114, 277] } } })],
    ["Plank shoulder tap: one hand taps the other shoulder", mat(80, 400) + floor + side({ hip: [214, 216], lean: 67, head: 14, near: { arm: { hand: [278, 196], elbow: [304, 232] }, leg: { ankle: [108, 256], toe: [118, 276] } }, far: { arm: { hand: [282, 276] }, leg: { ankle: [104, 258], toe: [114, 277] } } })],
  ],
  "bird-dog": [
    ["Bird dog: hands and knees", mat(100, 390) + floor + side({ hip: [200, 212], lean: 74, head: 16, near: { arm: { hand: [274, 274] }, leg: kneelLeg(null, [204, 270], [152, 272]) }, far: { arm: { hand: [270, 276] }, leg: kneelLeg(null, [200, 271], [148, 273]) } })],
    ["Bird dog: reach one arm forward and the opposite leg back", mat(100, 390) + floor + side({ hip: [200, 212], lean: 74, head: 16, near: { arm: { hand: [362, 178], elbow: [318, 186] }, leg: kneelLeg(null, [204, 270], [152, 272]) }, far: { arm: { hand: [270, 276] }, leg: { knee: [144, 208], ankle: [90, 204], toe: [72, 212] } } })],
  ],
  "step-jack": [
    ["Step jack: arms down, feet together", floor + front({ x: 240, hipY: hipF, right: { arm: armsDown(240, shF).r, leg: fLeg(228, hipF) }, left: { arm: armsDown(240, shF).l, leg: fLeg(252, hipF) } })],
    ["Step jack: step one foot out, arms up", floor + front({ x: 240, hipY: hipF, right: { arm: armsUp(240, shF).r, leg: fLeg(228, hipF) }, left: { arm: armsUp(240, shF).l, leg: fLeg(252, hipF, 56) } })],
  ],
  "jumping-jack": [
    ["Jumping jack: feet together, arms down", floor + front({ x: 240, hipY: hipF, right: { arm: armsDown(240, shF).r, leg: fLeg(228, hipF) }, left: { arm: armsDown(240, shF).l, leg: fLeg(252, hipF) } })],
    ["Jumping jack: feet wide, arms overhead", floor + front({ x: 240, hipY: hipF, right: { arm: armsUp(240, shF).r, leg: fLeg(228, hipF, -48) }, left: { arm: armsUp(240, shF).l, leg: fLeg(252, hipF, 48) } })],
  ],
  "march-in-place": [
    ["March in place: one knee up", floor + side({ hip: [240, 158], lean: 0, near: { arm: { hand: [216, 214], bend: 1 }, leg: { knee: [292, 168], ankle: [290, 224], toe: [308, 230] } }, far: { arm: { hand: [282, 150], elbow: [254, 128] }, leg: standLeg(236) } })],
    ["March in place: switch legs", floor + side({ hip: [240, 158], lean: 0, near: { arm: { hand: [284, 150], elbow: [256, 128] }, leg: standLeg(240) }, far: { arm: { hand: [212, 212], bend: 1 }, leg: { knee: [288, 170], ankle: [286, 226], toe: [304, 232] } } })],
  ],
  "high-knees": [
    ["High knees: drive one knee up", floor + side({ hip: [240, 150], lean: 6, near: { arm: { hand: [214, 176], elbow: [222, 132], bend: 1 }, leg: { knee: [296, 140], ankle: [296, 196], toe: [312, 206] } }, far: { arm: { hand: [292, 108], elbow: [266, 128] }, leg: { ankle: [236, 262], toe: [252, FLOOR - 3] } } })],
    ["High knees: switch legs quickly", floor + side({ hip: [240, 150], lean: 6, near: { arm: { hand: [294, 108], elbow: [268, 128] }, leg: { ankle: [238, 262], toe: [254, FLOOR - 3] } }, far: { arm: { hand: [212, 176], elbow: [220, 132] }, leg: { knee: [292, 142], ankle: [292, 198], toe: [308, 208] } } })],
  ],
  "stretch-lower": [
    ["Hamstring stretch: one leg straight, reach for the foot", mat(80, 420) + floor + side({ hip: [160, 262], lean: 44, head: 14, near: { arm: { hand: [262, 246], elbow: [226, 228] }, leg: { knee: [218, 266], ankle: [276, 268], toe: [282, 246] } }, far: { arm: { hand: [256, 250], elbow: [222, 232] }, leg: { knee: [186, 230], ankle: [204, 270], toe: [222, 272] } } })],
    ["Hip-flexor stretch: back knee down, hips forward", mat(80, 420) + floor + side({ hip: [212, 200], lean: -2, near: { arm: { hand: [262, 196], elbow: [244, 164] }, leg: { knee: [268, 206], ankle: [272, 262], toe: [292, FLOOR - 3] } }, far: { arm: { hand: [258, 200], elbow: [240, 168] }, leg: { knee: [160, 268], ankle: [106, 270], toe: [88, 270] } } })],
  ],
  "stretch-upper": [
    ["Cross-body shoulder stretch: one arm across the chest", floor + front({ x: 240, hipY: hipF, right: { arm: { hand: [300, 94], elbow: [250, 92], color: C.far }, leg: fLeg(228, hipF) }, left: { arm: { hand: [258, 104], elbow: [282, 140] }, leg: fLeg(252, hipF) } })],
    ["Triceps stretch: one hand behind the head", floor + front({ x: 240, hipY: hipF, right: { arm: { hand: [242, 50], elbow: [214, 30], color: C.far }, leg: fLeg(228, hipF) }, left: { arm: { hand: [220, 32], elbow: [262, 50] }, leg: fLeg(252, hipF) } })],
  ],
};


for (const [slug, frames] of Object.entries(DRAWINGS)) {
  mkdirSync(`public/exercises/${slug}`, { recursive: true });
  const vb = CLOSE_UP.has(slug) ? "60 90 360 240" : undefined;
  frames.forEach(([title, body], i) => writeFileSync(`public/exercises/${slug}/${i}.svg`, svg(title, body, vb)));
}
console.log(`drew ${Object.values(DRAWINGS).flat().length} illustrations for ${Object.keys(DRAWINGS).length} exercises`);

import { describe, expect, it } from "vitest";
import { squatPose } from "./analyzers/synthetic";
import { mid } from "./geometry";
import { SKELETON_SCALE, writeSkeleton } from "./skeleton-buffers";
import { CANONICAL_EDGES, CANONICAL_JOINTS, type Vec3 } from "./types";

const identities = (n: number) => {
  const m = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) [0, 5, 10, 15].forEach((k) => (m[i * 16 + k] = 1));
  return m;
};

function draw() {
  const j = squatPose(100, 0, { lean: 25, valgus: true }).joints3d!;
  const lines = new Float32Array(CANONICAL_EDGES.length * 6);
  const matrices = identities(CANONICAL_JOINTS.length);
  const group: number[] = [];
  writeSkeleton(j, lines, matrices, { set: (x, y, z) => group.splice(0, 3, x, y, z) });
  /** Where three.js puts a local point: group position + group scale × point. */
  const world = (x: number, y: number, z: number) => [x, y, z].map((v, k) => group[k]! + SKELETON_SCALE[k]! * v);
  return { j, lines, matrices, world };
}

/** The previous Skeleton3D transform: hip-centred, X mirrored, Y flipped. */
function previous(j: ReturnType<typeof draw>["j"], v: Vec3) {
  const root = mid(j.l_hip, j.r_hip);
  return [-(v[0] - root[0]), -(v[1] - root[1]), v[2] - root[2]];
}

describe("3D skeleton buffers (PR #27 port)", () => {
  it("puts every joint sphere exactly where the previous per-joint meshes were", () => {
    const { j, matrices, world } = draw();
    CANONICAL_JOINTS.forEach((name, i) => {
      const at = world(matrices[i * 16 + 12]!, matrices[i * 16 + 13]!, matrices[i * 16 + 14]!);
      previous(j, j[name]).forEach((v, k) => expect(at[k]).toBeCloseTo(v, 5));
    });
  });

  it("draws every bone between the same two points as before", () => {
    const { j, lines, world } = draw();
    CANONICAL_EDGES.forEach(([a, b], i) => {
      const o = i * 6;
      previous(j, j[a]).forEach((v, k) => expect(world(lines[o]!, lines[o + 1]!, lines[o + 2]!)[k]).toBeCloseTo(v, 5));
      previous(j, j[b]).forEach((v, k) => expect(world(lines[o + 3]!, lines[o + 4]!, lines[o + 5]!)[k]).toBeCloseTo(v, 5));
    });
  });

  it("only touches the translation of each instance matrix (no rotation or scale)", () => {
    const { matrices } = draw();
    for (let i = 0; i < CANONICAL_JOINTS.length; i++) {
      expect([0, 5, 10, 15].map((k) => matrices[i * 16 + k])).toEqual([1, 1, 1, 1]);
      expect([1, 2, 3, 4, 6, 7, 8, 9, 11].map((k) => matrices[i * 16 + k])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }
  });
});

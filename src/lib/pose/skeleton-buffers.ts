// Per-frame writes for the live 3D skeleton (POSE-07), ported from Aaron's PR #27. No allocations and no three.js
// import: joints go into the GPU buffers as-is, and the parent group's position and scale do the transform.
import { CANONICAL_EDGES, CANONICAL_JOINTS, type JointName, type Vec3 } from "./types";

/**
 * Scale of the skeleton's group: X mirrored to match the selfie video, Y negated (pose models are Y-down, three.js is
 * Y-up). With the group at `(root.x, root.y, -root.z)`, a joint `v` lands at `(root.x - v.x, root.y - v.y, v.z - root.z)`:
 * hip-centred, as before.
 */
export const SKELETON_SCALE = [-1, -1, 1] as const;

/**
 * Writes the bone line segments (6 floats per edge), the joint sphere positions (translation slots of 4×4 instance
 * matrices) and the group position. `matrices` must start as identity matrices (three.js InstancedMesh does that).
 */
export function writeSkeleton(
  j: Record<JointName, Vec3>,
  lines: Float32Array,
  matrices: Float32Array,
  group: { set(x: number, y: number, z: number): unknown },
): void {
  const lh = j.l_hip, rh = j.r_hip;
  group.set((lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2, -(lh[2] + rh[2]) / 2);
  for (let i = 0; i < CANONICAL_EDGES.length; i++) {
    const [a, b] = CANONICAL_EDGES[i]!;
    const pa = j[a], pb = j[b], o = i * 6;
    lines[o] = pa[0]; lines[o + 1] = pa[1]; lines[o + 2] = pa[2];
    lines[o + 3] = pb[0]; lines[o + 4] = pb[1]; lines[o + 5] = pb[2];
  }
  for (let i = 0; i < CANONICAL_JOINTS.length; i++) {
    const p = j[CANONICAL_JOINTS[i]!], o = i * 16 + 12; // column-major: translation is elements 12–14
    matrices[o] = p[0]; matrices[o + 1] = p[1]; matrices[o + 2] = p[2];
  }
}

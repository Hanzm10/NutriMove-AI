// src/components/pose/transform.ts
import * as THREE from "three";
import { mid } from "@/lib/pose/geometry";
import { CANONICAL_EDGES, CANONICAL_JOINTS } from "@/lib/pose/types";

export interface UpdateSkeletonPoseParams {
  joints3d: Record<string, readonly [number, number, number]>;
  lineArray: Float32Array;
  groupPosition: THREE.Vector3;
  instancedMesh?: THREE.InstancedMesh | null;
}

export function updateSkeletonPose({
  joints3d,
  lineArray,
  groupPosition,
  instancedMesh,
}: UpdateSkeletonPoseParams): void {
  const lHip = joints3d.l_hip;
  const rHip = joints3d.r_hip;
  if (!lHip || !rHip) return;

  // 1. Root position
  const root = mid(lHip, rHip);
  groupPosition.set(root[0]!, root[1]!, -root[2]!);

  // 2. Fast line buffer updates
  for (let i = 0; i < CANONICAL_EDGES.length; i++) {
    const [a, b] = CANONICAL_EDGES[i]!;
    const pa = joints3d[a];
    const pb = joints3d[b];
    if (!pa || !pb) continue;

    const idx = i * 6;
    lineArray[idx]     = pa[0]!;
    lineArray[idx + 1] = pa[1]!;
    lineArray[idx + 2] = pa[2]!;

    lineArray[idx + 3] = pb[0]!;
    lineArray[idx + 4] = pb[1]!;
    lineArray[idx + 5] = pb[2]!;
  }

  // 3. Direct matrix array writes (Bypasses Three.js Object3D overhead)
  if (instancedMesh) {
    const matrixArray = instancedMesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < CANONICAL_JOINTS.length; i++) {
      const jointName = CANONICAL_JOINTS[i]!;
      const pt = joints3d[jointName];
      if (!pt) continue;

      const offset = i * 16;
      matrixArray[offset + 12] = pt[0]!;
      matrixArray[offset + 13] = pt[1]!;
      matrixArray[offset + 14] = pt[2]!;
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
  }
}
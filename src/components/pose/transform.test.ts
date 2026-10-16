// src/components/pose/transform.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { updateSkeletonPose } from "./transform";
import { CANONICAL_EDGES, CANONICAL_JOINTS } from "@/lib/pose/types";

describe("updateSkeletonPose calculations", () => {
  let mockJoints: Record<string, [number, number, number]>;
  let lineArray: Float32Array;
  let groupPosition: THREE.Vector3;
  let instancedMesh: THREE.InstancedMesh;

  beforeEach(() => {
    // Populate all canonical joints to prevent skipped edges
    mockJoints = {};
    CANONICAL_JOINTS.forEach((joint, idx) => {
      mockJoints[joint] = [idx * 0.1, idx * 0.2, 2.0 + idx * 0.05];
    });

    // Override hips explicitly for predictable root math
    mockJoints.l_hip = [-0.2, 0.8, 2.0];
    mockJoints.r_hip = [0.2, 0.8, 2.0];

    lineArray = new Float32Array(CANONICAL_EDGES.length * 6);
    groupPosition = new THREE.Vector3();

    const geo = new THREE.SphereGeometry(0.025);
    const mat = new THREE.MeshBasicMaterial();
    instancedMesh = new THREE.InstancedMesh(geo, mat, CANONICAL_JOINTS.length);
  });

  it("calculates and sets the group root position correctly", () => {
    updateSkeletonPose({
      joints3d: mockJoints,
      lineArray,
      groupPosition,
      instancedMesh,
    });

    expect(groupPosition.x).toBeCloseTo(0);
    expect(groupPosition.y).toBeCloseTo(0.8);
    expect(groupPosition.z).toBeCloseTo(-2.0);
  });

  it("populates edge coordinates into the buffer without array mutations", () => {
    updateSkeletonPose({
      joints3d: mockJoints,
      lineArray,
      groupPosition,
      instancedMesh,
    });

    // Dynamically test the l_hip -> r_hip edge regardless of CANONICAL_EDGES order
    const edgeIdx = CANONICAL_EDGES.findIndex(
      ([a, b]) => (a === "l_hip" && b === "r_hip") || (a === "r_hip" && b === "l_hip")
    );

    expect(edgeIdx).toBeGreaterThanOrEqual(0);

    const bufferOffset = edgeIdx * 6;
    const [a] = CANONICAL_EDGES[edgeIdx]!;
    const expectedFirstPoint = mockJoints[a]!;

    // Option A: Standard Vitest precision matcher (5 decimal places accounts for 32-bit float conversion)
    expect(lineArray[bufferOffset]).toBeCloseTo(expectedFirstPoint[0], 5);
    expect(lineArray[bufferOffset + 1]).toBeCloseTo(expectedFirstPoint[1], 5);
    expect(lineArray[bufferOffset + 2]).toBeCloseTo(expectedFirstPoint[2], 5);
  });

    it("executes frame calculations well within 60 FPS budget (< 0.05ms per frame)", () => {
    // Warm up V8 JIT
    for (let i = 0; i < 500; i++) {
        updateSkeletonPose({
        joints3d: mockJoints,
        lineArray,
        groupPosition,
        instancedMesh,
        });
    }

    const iterations = 1_000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
        updateSkeletonPose({
        joints3d: mockJoints,
        lineArray,
        groupPosition,
        instancedMesh,
        });
    }

    const totalDuration = performance.now() - start;
    const avgFrameTimeMs = totalDuration / iterations;

    // 0.05ms is ~330x faster than the 16.6ms target for 60 FPS
    expect(avgFrameTimeMs).toBeLessThan(0.05);
    });
});
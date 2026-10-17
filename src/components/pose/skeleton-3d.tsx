"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { SKELETON_SCALE, writeSkeleton } from "@/lib/pose/skeleton-buffers";
import { CANONICAL_EDGES, CANONICAL_JOINTS, type CanonicalPose } from "@/lib/pose/types";

/**
 * POSE-07: live 3D skeleton (body only). Reads the latest pose from a ref inside useFrame, so the
 * React tree does not re-render per camera frame. InstantHMR is Y-down; three.js is Y-up, so Y is negated.
 * X is mirrored to match the selfie video. Runs on the main thread next to MediaPipe, so each frame is kept cheap:
 * 2 draw calls, no allocations, 1× pixel ratio (PR #27).
 */
export default function Skeleton3D({ poseRef }: { poseRef: RefObject<CanonicalPose | null> }) {
  return (
    <Canvas camera={{ position: [0, 0.1, 2.6], fov: 45 }} dpr={1} aria-hidden>
      <ambientLight intensity={0.8} />
      <gridHelper args={[3, 12, "#5c8f18", "#c8eb8d"]} position={[0, -0.95, 0]} />
      <Body poseRef={poseRef} />
      <OrbitControls enablePan={false} minDistance={1.2} maxDistance={5} />
    </Canvas>
  );
}

function Body({ poseRef }: { poseRef: RefObject<CanonicalPose | null> }) {
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(CANONICAL_EDGES.length * 6), 3));
    return g;
  }, []);
  // One instanced mesh = one draw call for all joints (was one per joint); basic material needs no lighting.
  const jointGeo = useMemo(() => new THREE.SphereGeometry(0.025, 8, 8), []);
  const jointMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#9bd141" }), []);
  const group = useRef<THREE.Group>(null);
  const joints = useRef<THREE.InstancedMesh>(null);

  useFrame(() => {
    const p = poseRef.current?.joints3d;
    if (!p || !group.current || !joints.current) return;
    const pos = lineGeo.getAttribute("position") as THREE.BufferAttribute;
    writeSkeleton(p, pos.array as Float32Array, joints.current.instanceMatrix.array as Float32Array, group.current.position);
    pos.needsUpdate = true;
    joints.current.instanceMatrix.needsUpdate = true;
  });

  // Culling is off: the skeleton is always in view, and it saves recomputing bounds every frame.
  return (
    <group ref={group} scale={SKELETON_SCALE}>
      <lineSegments geometry={lineGeo} frustumCulled={false}>
        <lineBasicMaterial color="#5c8f18" linewidth={2} />
      </lineSegments>
      <instancedMesh ref={joints} args={[jointGeo, jointMat, CANONICAL_JOINTS.length]} frustumCulled={false} />
    </group>
  );
}

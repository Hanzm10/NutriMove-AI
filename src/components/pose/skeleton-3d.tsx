"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { mid } from "@/lib/pose/geometry";
import { CANONICAL_EDGES, CANONICAL_JOINTS, type CanonicalPose } from "@/lib/pose/types";

/**
 * POSE-07: live 3D skeleton (body only). Reads the latest pose from a ref inside useFrame, so the
 * React tree does not re-render per camera frame. InstantHMR is Y-down; three.js is Y-up, so Y is negated.
 * X is mirrored to match the selfie video.
 */
export default function Skeleton3D({ poseRef }: { poseRef: RefObject<CanonicalPose | null> }) {
  return (
    <Canvas camera={{ position: [0, 0.1, 2.6], fov: 45 }} dpr={[1, 2]} aria-hidden>
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
  const joints = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const p = poseRef.current?.joints3d;
    if (!p) return;
    const root = mid(p.l_hip, p.r_hip);
    const tx = (v: readonly number[]) => [-(v[0]! - root[0]), -(v[1]! - root[1]), v[2]! - root[2]] as const;
    const pos = lineGeo.getAttribute("position") as THREE.BufferAttribute;
    CANONICAL_EDGES.forEach(([a, b], i) => {
      const A = tx(p[a]), B = tx(p[b]);
      pos.setXYZ(i * 2, A[0], A[1], A[2]);
      pos.setXYZ(i * 2 + 1, B[0], B[1], B[2]);
    });
    pos.needsUpdate = true;
    lineGeo.computeBoundingSphere();
    CANONICAL_JOINTS.forEach((name, i) => {
      const m = joints.current[i];
      if (m) m.position.set(...tx(p[name]));
    });
  });

  return (
    <group>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color="#5c8f18" linewidth={2} />
      </lineSegments>
      {CANONICAL_JOINTS.map((name, i) => (
        <mesh key={name} ref={(m) => { joints.current[i] = m; }}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshStandardMaterial color="#9bd141" />
        </mesh>
      ))}
    </group>
  );
}

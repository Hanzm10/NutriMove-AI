"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { CANONICAL_EDGES, CANONICAL_JOINTS, type CanonicalPose } from "@/lib/pose/types";
import { updateSkeletonPose } from "@/lib/pose/transform";

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
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null!);
  const groupRef = useRef<THREE.Group>(null!);

  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(CANONICAL_EDGES.length * 6), 3));
    return g;
  }, []);

  const jointGeo = useMemo(() => new THREE.SphereGeometry(0.025, 8, 8), []);
  const jointMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#9bd141" }), []);

  useFrame(() => {
    const joints3d = poseRef.current?.joints3d;
    if (!joints3d) return;

    const lineAttr = lineGeo.getAttribute("position") as THREE.BufferAttribute;

    // Extracted calculation call
    updateSkeletonPose({
      joints3d,
      lineArray: lineAttr.array as Float32Array,
      groupPosition: groupRef.current.position,
      instancedMesh: instancedMeshRef.current,
    });

    lineAttr.needsUpdate = true;
  });

  return (
    <group ref={groupRef} scale={[-1, -1, 1]}>
      <lineSegments geometry={lineGeo} frustumCulled={false}>
        <lineBasicMaterial color="#5c8f18" linewidth={2} />
      </lineSegments>
      <instancedMesh
        ref={instancedMeshRef}
        args={[jointGeo, jointMat, CANONICAL_JOINTS.length]}
        frustumCulled={false}
      />
    </group>
  );
}
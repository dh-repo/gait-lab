"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Camera, Eye, Compass, Move3d } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Landmark } from "@/lib/gait/types";

export interface DigitalTwinCanvasProps {
  landmarks?: Landmark[];
  allFrames?: Landmark[][];
  currentFrameIndex?: number;
  width?: number;
  height?: number;
  className?: string;
  showFloorGrid?: boolean;
  showCoMTrail?: boolean;
  isPlaying?: boolean;
}

type CameraViewMode = "orbit" | "sagittal" | "frontal" | "transverse";

// Keypoint mapping for MediaPipe Pose 33 landmarks
const CONNECTIONS: [number, number][] = [
  // Torso
  [11, 12], // L shoulder - R shoulder
  [11, 23], // L shoulder - L hip
  [12, 24], // R shoulder - R hip
  [23, 24], // L hip - R hip
  // Left Arm
  [11, 13], // L shoulder - L elbow
  [13, 15], // L elbow - L wrist
  // Right Arm
  [12, 14], // R shoulder - R elbow
  [14, 16], // R elbow - R wrist
  // Left Leg
  [23, 25], // L hip - L knee
  [25, 27], // L knee - L ankle
  [27, 29], // L ankle - L heel
  [29, 31], // L heel - L toe
  [27, 31], // L ankle - L toe
  // Right Leg
  [24, 26], // R hip - R knee
  [26, 28], // R knee - R ankle
  [28, 30], // R ankle - R heel
  [30, 32], // R heel - R toe
  [28, 32], // R ankle - R toe
];

/**
 * Recursive scene disposal function to prevent WebGL memory context leaks.
 */
function disposeThreeScene(scene: THREE.Scene, renderer?: THREE.WebGLRenderer | null) {
  scene.traverse((obj) => {
    // Dispose Geometries
    if ("geometry" in obj && obj.geometry) {
      (obj.geometry as THREE.BufferGeometry).dispose();
    }
    // Dispose Materials
    if ("material" in obj && obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of materials) {
        // Dispose textures if present
        for (const key of Object.keys(mat)) {
          const prop = (mat as unknown as Record<string, unknown>)[key];
          if (prop && typeof prop === "object" && "dispose" in prop && typeof prop.dispose === "function") {
            (prop as { dispose: () => void }).dispose();
          }
        }
        mat.dispose();
      }
    }
  });

  scene.clear();

  if (renderer) {
    renderer.dispose();
  }
}

/**
 * Calculates 5-segment Dempster (1955) weighted Center of Mass:
 * 0.50 * MidTorso + 0.20 * MidThigh + 0.12 * MidShank + 0.10 * MidArm + 0.08 * MidFoot
 */
function calculateDempsterCoM(lmArray: Landmark[]): { x: number; y: number; z: number } {
  const avgPoints = (indices: number[]) => {
    let sumX = 0, sumY = 0, sumZ = 0, count = 0;
    for (const idx of indices) {
      const lm = lmArray[idx];
      if (
        lm &&
        typeof lm.x === "number" && !Number.isNaN(lm.x) &&
        typeof lm.y === "number" && !Number.isNaN(lm.y) &&
        (lm.visibility ?? 1) >= 0.3
      ) {
        sumX += lm.x;
        sumY += lm.y;
        sumZ += typeof lm.z === "number" && !Number.isNaN(lm.z) ? lm.z : 0;
        count++;
      }
    }
    if (count === 0) return { x: 0.5, y: 0.5, z: 0 };
    return { x: sumX / count, y: sumY / count, z: sumZ / count };
  };

  const midTorso = avgPoints([11, 12, 23, 24]);
  const midThigh = avgPoints([23, 24, 25, 26]);
  const midShank = avgPoints([25, 26, 27, 28]);
  const midArm = avgPoints([11, 12, 13, 14, 15, 16]);
  const midFoot = avgPoints([29, 30, 31, 32]);

  const comX = 0.50 * midTorso.x + 0.20 * midThigh.x + 0.12 * midShank.x + 0.10 * midArm.x + 0.08 * midFoot.x;
  const comY = 0.50 * midTorso.y + 0.20 * midThigh.y + 0.12 * midShank.y + 0.10 * midArm.y + 0.08 * midFoot.y;
  const comZ = 0.50 * midTorso.z + 0.20 * midThigh.z + 0.12 * midShank.z + 0.10 * midArm.z + 0.08 * midFoot.z;

  return { x: comX, y: comY, z: comZ };
}

export function DigitalTwinCanvas({
  landmarks,
  allFrames,
  currentFrameIndex = 0,
  width = 480,
  height = 360,
  className = "",
  showFloorGrid = true,
  showCoMTrail = true,
  isPlaying = false,
}: DigitalTwinCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<CameraViewMode>("orbit");
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const jointMeshesRef = useRef<THREE.Mesh[]>([]);
  const boneLinesRef = useRef<THREE.LineSegments | null>(null);
  const comMeshRef = useRef<THREE.Mesh | null>(null);
  const comDropLineRef = useRef<THREE.Line | null>(null);
  const bosMeshRef = useRef<THREE.Mesh | null>(null);
  const bosLineRef = useRef<THREE.LineLoop | null>(null);
  const trailLineRef = useRef<THREE.Line | null>(null);
  const needsRenderRef = useRef<boolean>(true);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const allFramesRef = useRef<Landmark[][] | undefined>(allFrames);
  const initialWidthRef = useRef<number>(width);
  const initialHeightRef = useRef<number>(height);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    needsRenderRef.current = true;
  }, [isPlaying]);

  useEffect(() => {
    allFramesRef.current = allFrames;
  }, [allFrames]);

  // Initialize Three.js scene (decoupled from width/height, isPlaying, allFrames)
  useEffect(() => {
    if (!containerRef.current) return;
    const containerNode = containerRef.current;

    let isDisposed = false;
    let animId: number;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Slate-900 clinical background
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, initialWidthRef.current / initialHeightRef.current, 0.1, 100);
    camera.position.set(0, 1.2, 3.5);
    camera.lookAt(0, 0.9, 0);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(initialWidthRef.current, initialHeightRef.current);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      rendererRef.current = renderer;
      containerNode.appendChild(renderer.domElement);
    } catch {
      // WebGL not available (e.g. mock/test environment)
      return;
    }

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.9, 0);
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight.position.set(2, 4, 3);
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x818cf8, 0.6);
    backLight.position.set(-2, 2, -3);
    scene.add(backLight);

    // Floor Grid
    if (showFloorGrid) {
      const grid = new THREE.GridHelper(4, 20, 0x38bdf8, 0x1e293b);
      grid.position.y = 0;
      scene.add(grid);
    }

    // Joint Spheres (33 MediaPipe joints)
    const jointGeo = new THREE.SphereGeometry(0.025, 12, 12);
    const jointMatL = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 }); // Sky blue left
    const jointMatR = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.3 }); // Rose red right
    const jointMatC = new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.3 }); // Purple torso

    const joints: THREE.Mesh[] = [];
    for (let i = 0; i < 33; i++) {
      const isLeft = i % 2 === 1;
      const mat = i < 11 ? jointMatC : isLeft ? jointMatL : jointMatR;
      const mesh = new THREE.Mesh(jointGeo, mat);
      scene.add(mesh);
      joints.push(mesh);
    }
    jointMeshesRef.current = joints;

    // Bone Line Segments
    const bonePositions = new Float32Array(CONNECTIONS.length * 2 * 3);
    const boneGeo = new THREE.BufferGeometry();
    boneGeo.setAttribute("position", new THREE.BufferAttribute(bonePositions, 3));
    const boneMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0, linewidth: 2 });
    const boneLines = new THREE.LineSegments(boneGeo, boneMat);
    scene.add(boneLines);
    boneLinesRef.current = boneLines;

    // Center of Mass (CoM) Indicator Sphere
    const comGeo = new THREE.SphereGeometry(0.045, 16, 16);
    const comMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xeab308, emissiveIntensity: 0.5 });
    const comMesh = new THREE.Mesh(comGeo, comMat);
    scene.add(comMesh);
    comMeshRef.current = comMesh;

    // CoM Vertical Drop Line (Dashed)
    const comDropGeo = new THREE.BufferGeometry();
    comDropGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const comDropMat = new THREE.LineDashedMaterial({ color: 0xfacc15, dashSize: 0.04, gapSize: 0.02 });
    const comDropLine = new THREE.Line(comDropGeo, comDropMat);
    scene.add(comDropLine);
    comDropLineRef.current = comDropLine;

    // Base of Support (BoS) Mesh & Line Loop
    const bosGeo = new THREE.BufferGeometry();
    bosGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    bosGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const bosMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
    const bosMesh = new THREE.Mesh(bosGeo, bosMat);
    scene.add(bosMesh);
    bosMeshRef.current = bosMesh;

    const bosLineGeo = new THREE.BufferGeometry();
    bosLineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    const bosLineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
    const bosLine = new THREE.LineLoop(bosLineGeo, bosLineMat);
    scene.add(bosLine);
    bosLineRef.current = bosLine;

    // CoM Trail
    const currentFrames = allFramesRef.current;
    if (showCoMTrail && currentFrames && currentFrames.length > 0) {
      const trailPoints: THREE.Vector3[] = [];
      for (const f of currentFrames) {
        if (f && f.length > 0) {
          const com = calculateDempsterCoM(f);
          const threeX = (com.x - 0.5) * 2.2;
          const threeY = (1.0 - com.y) * 1.9;
          const threeZ = -com.z * 2.2;
          trailPoints.push(new THREE.Vector3(threeX, threeY, threeZ));
        }
      }
      if (trailPoints.length > 1) {
        const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPoints);
        const trailMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.6 });
        const trailLine = new THREE.Line(trailGeo, trailMat);
        scene.add(trailLine);
        trailLineRef.current = trailLine;
      }
    }

    // Render efficiency loop
    const animate = () => {
      if (isDisposed) return;
      animId = requestAnimationFrame(animate);

      let controlsUpdated = false;
      if (controlsRef.current) {
        controlsUpdated = controlsRef.current.update();
      }

      if (isPlayingRef.current || needsRenderRef.current || controlsUpdated) {
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
        needsRenderRef.current = false;
      }
    };
    animate();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);
      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }
      if (sceneRef.current) {
        disposeThreeScene(sceneRef.current, rendererRef.current);
        sceneRef.current = null;
      }
      if (renderer && renderer.domElement && containerNode) {
        if (containerNode.contains(renderer.domElement)) {
          containerNode.removeChild(renderer.domElement);
        }
      }
    };
  }, [showFloorGrid, showCoMTrail]);

  // Dedicated Canvas Resize Effect
  useEffect(() => {
    if (rendererRef.current && cameraRef.current) {
      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      needsRenderRef.current = true;
    }
  }, [width, height]);

  // Update Joint Positions whenever `landmarks`, `allFrames`, `currentFrameIndex`, or `viewMode` updates
  useEffect(() => {
    const currentLandmarks = landmarks || (allFrames ? allFrames[currentFrameIndex] : undefined);
    const joints = jointMeshesRef.current;
    const boneLines = boneLinesRef.current;
    const comMesh = comMeshRef.current;
    const comDropLine = comDropLineRef.current;
    const bosMesh = bosMeshRef.current;
    const bosLine = bosLineRef.current;
    const trailLine = trailLineRef.current;

    if (!currentLandmarks || currentLandmarks.length === 0) {
      joints.forEach((j) => {
        if (j) j.visible = false;
      });
      if (boneLines) boneLines.visible = false;
      if (comMesh) comMesh.visible = false;
      if (comDropLine) comDropLine.visible = false;
      if (bosMesh) bosMesh.visible = false;
      if (bosLine) bosLine.visible = false;
      if (trailLine) trailLine.visible = false;
      needsRenderRef.current = true;
      return;
    }

    if (boneLines) boneLines.visible = true;
    if (comMesh) comMesh.visible = true;
    if (comDropLine) comDropLine.visible = true;
    if (trailLine) trailLine.visible = true;

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    // Calculate 5-segment Dempster CoM
    const com = calculateDempsterCoM(currentLandmarks);
    const comX = (com.x - 0.5) * 2.2;
    const comY = (1.0 - com.y) * 1.9;
    const comZ = -com.z * 2.2;

    // Position joints in 3D Space & Occlusion Filtering (< 0.3)
    for (let i = 0; i < 33; i++) {
      const mesh = joints[i];
      if (!mesh) continue;

      const lm = i < currentLandmarks.length ? currentLandmarks[i] : undefined;
      if (
        lm &&
        typeof lm.x === "number" && !Number.isNaN(lm.x) &&
        typeof lm.y === "number" && !Number.isNaN(lm.y)
      ) {
        const x = (lm.x - 0.5) * 2.2;
        const y = (1.0 - lm.y) * 1.9;
        const z = -(lm.z ?? 0) * 2.2;

        mesh.position.set(x, y, z);
        mesh.visible = (lm.visibility ?? 1) >= 0.3;
      } else {
        mesh.visible = false;
      }
    }

    // Update Bone Lines with Occlusion Filtering
    if (boneLines) {
      const posAttr = boneLines.geometry.getAttribute("position") as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;

      let idx = 0;
      for (const [startIdx, endIdx] of CONNECTIONS) {
        const startLm = startIdx < currentLandmarks.length ? currentLandmarks[startIdx] : undefined;
        const endLm = endIdx < currentLandmarks.length ? currentLandmarks[endIdx] : undefined;
        const isValid =
          startLm &&
          endLm &&
          typeof startLm.x === "number" && !Number.isNaN(startLm.x) &&
          typeof endLm.x === "number" && !Number.isNaN(endLm.x) &&
          (startLm.visibility ?? 1) >= 0.3 &&
          (endLm.visibility ?? 1) >= 0.3;

        if (isValid) {
          posArray[idx++] = (startLm.x - 0.5) * 2.2;
          posArray[idx++] = (1.0 - startLm.y) * 1.9;
          posArray[idx++] = -(startLm.z ?? 0) * 2.2;

          posArray[idx++] = (endLm.x - 0.5) * 2.2;
          posArray[idx++] = (1.0 - endLm.y) * 1.9;
          posArray[idx++] = -(endLm.z ?? 0) * 2.2;
        } else {
          // Collapse segment to origin
          posArray[idx++] = 0; posArray[idx++] = 0; posArray[idx++] = 0;
          posArray[idx++] = 0; posArray[idx++] = 0; posArray[idx++] = 0;
        }
      }
      posAttr.needsUpdate = true;
    }

    // Update CoM Indicator Mesh
    if (comMesh) {
      comMesh.position.set(comX, comY, comZ);
    }

    // Update CoM Floor Drop Line
    if (comDropLine) {
      const dropPosAttr = comDropLine.geometry.getAttribute("position") as THREE.BufferAttribute;
      const dropPosArray = dropPosAttr.array as Float32Array;
      // Point 0: CoM (comX, comY, comZ)
      dropPosArray[0] = comX;
      dropPosArray[1] = comY;
      dropPosArray[2] = comZ;
      // Point 1: Floor drop (comX, 0.0, comZ)
      dropPosArray[3] = comX;
      dropPosArray[4] = 0.0;
      dropPosArray[5] = comZ;
      dropPosAttr.needsUpdate = true;
      comDropLine.computeLineDistances();
    }

    // Update Base of Support (BoS) Polygon (landmarks 29, 31, 32, 30)
    const lm29 = currentLandmarks[29];
    const lm31 = currentLandmarks[31];
    const lm32 = currentLandmarks[32];
    const lm30 = currentLandmarks[30];

    const isFootValid = (lm?: Landmark) =>
      lm &&
      typeof lm.x === "number" && !Number.isNaN(lm.x) &&
      typeof lm.y === "number" && !Number.isNaN(lm.y) &&
      (lm.visibility ?? 1) >= 0.3;

    if (isFootValid(lm29) && isFootValid(lm31) && isFootValid(lm32) && isFootValid(lm30) && bosMesh && bosLine) {
      const v0 = [(lm29.x - 0.5) * 2.2, 0.001, -(lm29.z ?? 0) * 2.2];
      const v1 = [(lm31.x - 0.5) * 2.2, 0.001, -(lm31.z ?? 0) * 2.2];
      const v2 = [(lm32.x - 0.5) * 2.2, 0.001, -(lm32.z ?? 0) * 2.2];
      const v3 = [(lm30.x - 0.5) * 2.2, 0.001, -(lm30.z ?? 0) * 2.2];

      const bosPosAttr = bosMesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      const bosPosArr = bosPosAttr.array as Float32Array;
      bosPosArr.set([...v0, ...v1, ...v2, ...v3]);
      bosPosAttr.needsUpdate = true;

      const bosLinePosAttr = bosLine.geometry.getAttribute("position") as THREE.BufferAttribute;
      const bosLinePosArr = bosLinePosAttr.array as Float32Array;
      bosLinePosArr.set([...v0, ...v1, ...v2, ...v3]);
      bosLinePosAttr.needsUpdate = true;

      bosMesh.visible = true;
      bosLine.visible = true;
    } else if (bosMesh && bosLine) {
      bosMesh.visible = false;
      bosLine.visible = false;
    }

    // Camera & OrbitControls Subject Tracking
    if (camera) {
      const targetY = 0.9;
      if (viewMode === "orbit") {
        if (controls) {
          controls.target.set(comX, targetY, comZ);
          controls.update();
        }
      } else if (viewMode === "sagittal") {
        camera.position.set(comX + 3.2, 1.0, comZ);
        camera.lookAt(comX, targetY, comZ);
        if (controls) {
          controls.target.set(comX, targetY, comZ);
          controls.update();
        }
      } else if (viewMode === "frontal") {
        camera.position.set(comX, 1.0, comZ + 3.2);
        camera.lookAt(comX, targetY, comZ);
        if (controls) {
          controls.target.set(comX, targetY, comZ);
          controls.update();
        }
      } else if (viewMode === "transverse") {
        camera.position.set(comX, 3.5, comZ + 0.01);
        camera.lookAt(comX, 0, comZ);
        if (controls) {
          controls.target.set(comX, 0, comZ);
          controls.update();
        }
      }
    }

    needsRenderRef.current = true;
  }, [landmarks, allFrames, currentFrameIndex, viewMode]);

  // Handle Camera View Switching
  const handleViewChange = (mode: CameraViewMode) => {
    setViewMode(mode);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera) return;

    const currentLandmarks = landmarks || (allFrames ? allFrames[currentFrameIndex] : undefined);
    let comX = 0;
    let comZ = 0;
    if (currentLandmarks && currentLandmarks.length > 0) {
      const com = calculateDempsterCoM(currentLandmarks);
      comX = (com.x - 0.5) * 2.2;
      comZ = -com.z * 2.2;
    }

    switch (mode) {
      case "sagittal":
        camera.position.set(comX + 3.2, 1.0, comZ);
        camera.lookAt(comX, 0.9, comZ);
        if (controls) controls.target.set(comX, 0.9, comZ);
        break;
      case "frontal":
        camera.position.set(comX, 1.0, comZ + 3.2);
        camera.lookAt(comX, 0.9, comZ);
        if (controls) controls.target.set(comX, 0.9, comZ);
        break;
      case "transverse":
        camera.position.set(comX, 3.5, comZ + 0.01);
        camera.lookAt(comX, 0, comZ);
        if (controls) controls.target.set(comX, 0, comZ);
        break;
      case "orbit":
      default:
        camera.position.set(comX + 2.0, 1.5, comZ + 2.5);
        camera.lookAt(comX, 0.9, comZ);
        if (controls) controls.target.set(comX, 0.9, comZ);
        break;
    }
    if (controls) controls.update();
    needsRenderRef.current = true;
  };

  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-950 border border-slate-800 ${className}`}>
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full h-full flex items-center justify-center min-h-[300px]" />

      {/* Floating Camera View Mode Selector */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-700/60 shadow-lg">
        <Button
          variant={viewMode === "orbit" ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => handleViewChange("orbit")}
          title="3D Free Orbit"
        >
          <Move3d className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">3D Orbit</span>
        </Button>
        <Button
          variant={viewMode === "sagittal" ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => handleViewChange("sagittal")}
          title="Sagittal View (Side Profile)"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Sagittal</span>
        </Button>
        <Button
          variant={viewMode === "frontal" ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => handleViewChange("frontal")}
          title="Frontal View (Coronal Profile)"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Frontal</span>
        </Button>
        <Button
          variant={viewMode === "transverse" ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => handleViewChange("transverse")}
          title="Transverse View (Top-Down Plane)"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Top</span>
        </Button>
      </div>

      {/* Biomechanical Legend */}
      <div className="absolute bottom-3 right-3 flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-700/60 text-[11px] text-slate-300">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-sky-400" /> Left Limb
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-500" /> Right Limb
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-400" /> CoM
        </span>
      </div>
    </div>
  );
}


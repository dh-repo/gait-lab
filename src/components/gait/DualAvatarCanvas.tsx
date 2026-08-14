"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Camera, Eye, Compass, Move3d, Layers, Split, Waypoints, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Landmark } from "@/lib/gait/types";
import type { GaitSessionRecord } from "@/lib/gait/persistence";
import { PERRY_GAIT_PHASES } from "@/lib/gait/phases";
import {
  reconstructPoseAtPhase,
  calculateDempsterCoM,
  buildBilateralTrajectories,
  type TrajectoryJoint,
} from "@/lib/gait/poseReconstruction";

export type DualAvatarViewMode = "side-by-side" | "ghost-overlay";
export type CameraPlaneMode = "orbit" | "sagittal" | "frontal" | "transverse";

export interface DualAvatarCanvasProps {
  sessionA?: GaitSessionRecord | null;
  sessionB?: GaitSessionRecord | null;
  currentPhasePct: number; // 0.0 to 100.0%
  viewMode?: DualAvatarViewMode;
  cameraMode?: CameraPlaneMode;
  activeTrajectoryJoint?: TrajectoryJoint;
  ghostOpacity?: number;
  showFloorGrid?: boolean;
  isPlaying?: boolean;
  width?: number;
  height?: number;
  onCameraModeChange?: (mode: CameraPlaneMode) => void;
  onViewModeChange?: (mode: DualAvatarViewMode) => void;
  onTrajectoryJointChange?: (joint: TrajectoryJoint) => void;
  className?: string;
}

// MediaPipe 33 landmark anatomical bone connections
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
    if ("geometry" in obj && obj.geometry) {
      (obj.geometry as THREE.BufferGeometry).dispose();
    }
    if ("material" in obj && obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of materials) {
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

interface AvatarRig {
  joints: THREE.Mesh[];
  boneLines: THREE.LineSegments;
  comMesh: THREE.Mesh;
  comDropLine: THREE.Line;
  bosMesh: THREE.Mesh;
  bosLine: THREE.LineLoop;
  trajectoryLeft: THREE.Line | null;
  trajectoryRight: THREE.Line | null;
}

export function DualAvatarCanvas({
  sessionA,
  sessionB,
  currentPhasePct = 0,
  viewMode: controlledViewMode,
  cameraMode: controlledCameraMode,
  activeTrajectoryJoint: controlledTrajectoryJoint,
  ghostOpacity = 0.45,
  showFloorGrid = true,
  isPlaying = false,
  width,
  height = 420,
  onCameraModeChange,
  onViewModeChange,
  onTrajectoryJointChange,
  className = "",
}: DualAvatarCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Internal state with prop sync
  const [internalViewMode, setInternalViewMode] = useState<DualAvatarViewMode>(controlledViewMode || "side-by-side");
  const [internalCameraMode, setInternalCameraMode] = useState<CameraPlaneMode>(controlledCameraMode || "orbit");
  const [internalTrajectoryJoint, setInternalTrajectoryJoint] = useState<TrajectoryJoint>(
    controlledTrajectoryJoint || "none",
  );

  const viewMode = controlledViewMode ?? internalViewMode;
  const cameraMode = controlledCameraMode ?? internalCameraMode;
  const activeTrajectoryJoint = controlledTrajectoryJoint ?? internalTrajectoryJoint;

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const avatarARef = useRef<AvatarRig | null>(null);
  const avatarBRef = useRef<AvatarRig | null>(null);
  const deltaLineRef = useRef<THREE.Line | null>(null);
  const needsRenderRef = useRef<boolean>(true);
  const isPlayingRef = useRef<boolean>(isPlaying);

  // Calculate current Perry Gait Phase info
  const currentPerryPhase = useMemo(() => {
    const p = Math.max(0, Math.min(100, currentPhasePct));
    return PERRY_GAIT_PHASES.find((phase) => p >= phase.startPct && (p < phase.endPct || (p === 100 && phase.endPct === 100))) || PERRY_GAIT_PHASES[0];
  }, [currentPhasePct]);

  // Spatial trajectory delta calculation (cm)
  const [trajectoryDeltaCm, setTrajectoryDeltaCm] = useState<number | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    needsRenderRef.current = true;
  }, [isPlaying]);

  // Create Avatar Rig Helper
  const createAvatarRig = useCallback((scene: THREE.Scene, isGhost: boolean, isFollowUp: boolean): AvatarRig => {
    const opacity = isGhost ? ghostOpacity : 1.0;
    const transparent = isGhost;

    // Materials
    let matLeft: THREE.MeshStandardMaterial;
    let matRight: THREE.MeshStandardMaterial;
    let matCenter: THREE.MeshStandardMaterial;
    let boneColor: number;

    if (isGhost) {
      // Soft cyan ghost
      matLeft = new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity, roughness: 0.3 });
      matRight = new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity, roughness: 0.3 });
      matCenter = new THREE.MeshStandardMaterial({ color: 0x818cf8, transparent: true, opacity, roughness: 0.3 });
      boneColor = 0x38bdf8;
    } else if (isFollowUp) {
      // Follow-up solid (Emerald / Orange)
      matLeft = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 });
      matRight = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3 });
      matCenter = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.3 });
      boneColor = 0xa7f3d0;
    } else {
      // Baseline solid (Sky Blue / Rose)
      matLeft = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });
      matRight = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.3 });
      matCenter = new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.3 });
      boneColor = 0xe2e8f0;
    }

    const jointGeo = new THREE.SphereGeometry(0.025, 12, 12);
    const joints: THREE.Mesh[] = [];
    for (let i = 0; i < 33; i++) {
      const isLeft = i % 2 === 1;
      const mat = i < 11 ? matCenter : isLeft ? matLeft : matRight;
      const mesh = new THREE.Mesh(jointGeo, mat);
      scene.add(mesh);
      joints.push(mesh);
    }

    // Bone Line Segments
    const bonePositions = new Float32Array(CONNECTIONS.length * 2 * 3);
    const boneGeo = new THREE.BufferGeometry();
    boneGeo.setAttribute("position", new THREE.BufferAttribute(bonePositions, 3));
    const boneMat = new THREE.LineBasicMaterial({
      color: boneColor,
      linewidth: 2,
      transparent,
      opacity: transparent ? opacity * 0.9 : 1.0,
    });
    const boneLines = new THREE.LineSegments(boneGeo, boneMat);
    scene.add(boneLines);

    // Center of Mass (CoM) Indicator Sphere
    const comGeo = new THREE.SphereGeometry(0.045, 16, 16);
    const comMat = new THREE.MeshStandardMaterial({
      color: isGhost ? 0xfacc15 : isFollowUp ? 0xfbbf24 : 0xfacc15,
      emissive: 0xeab308,
      emissiveIntensity: isGhost ? 0.3 : 0.6,
      transparent,
      opacity,
    });
    const comMesh = new THREE.Mesh(comGeo, comMat);
    scene.add(comMesh);

    // CoM Drop Line
    const comDropGeo = new THREE.BufferGeometry();
    comDropGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const comDropMat = new THREE.LineDashedMaterial({
      color: 0xfacc15,
      dashSize: 0.04,
      gapSize: 0.02,
      transparent,
      opacity,
    });
    const comDropLine = new THREE.Line(comDropGeo, comDropMat);
    scene.add(comDropLine);

    // Base of Support (BoS) Mesh & Line
    const bosGeo = new THREE.BufferGeometry();
    bosGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    bosGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const bosMat = new THREE.MeshBasicMaterial({
      color: isFollowUp ? 0x10b981 : 0x38bdf8,
      transparent: true,
      opacity: isGhost ? opacity * 0.3 : 0.25,
      side: THREE.DoubleSide,
    });
    const bosMesh = new THREE.Mesh(bosGeo, bosMat);
    scene.add(bosMesh);

    const bosLineGeo = new THREE.BufferGeometry();
    bosLineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    const bosLineMat = new THREE.LineBasicMaterial({
      color: isFollowUp ? 0x10b981 : 0x38bdf8,
      linewidth: 2,
      transparent,
      opacity,
    });
    const bosLine = new THREE.LineLoop(bosLineGeo, bosLineMat);
    scene.add(bosLine);

    return {
      joints,
      boneLines,
      comMesh,
      comDropLine,
      bosMesh,
      bosLine,
      trajectoryLeft: null,
      trajectoryRight: null,
    };
  }, [ghostOpacity]);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return;
    const containerNode = containerRef.current;

    let isDisposed = false;
    let animId: number;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d); // Deep slate medical darkroom
    sceneRef.current = scene;

    const initialWidth = containerNode.clientWidth || width || 640;
    const initialHeight = height || 420;

    const camera = new THREE.PerspectiveCamera(45, initialWidth / initialHeight, 0.1, 100);
    camera.position.set(0, 1.5, 4.2);
    camera.lookAt(0, 0.9, 0);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(initialWidth, initialHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      rendererRef.current = renderer;
      containerNode.appendChild(renderer.domElement);
    } catch {
      // Headless / mock environment
      return;
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.9, 0);
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.3);
    dirLight1.position.set(3, 5, 4);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x10b981, 0.9);
    dirLight2.position.set(-3, 3, -2);
    scene.add(dirLight2);

    // Floor Grid
    if (showFloorGrid) {
      const grid = new THREE.GridHelper(6, 24, 0x38bdf8, 0x1e293b);
      grid.position.y = 0;
      scene.add(grid);
    }

    // Initialize Rigs
    const isGhostMode = viewMode === "ghost-overlay";
    avatarARef.current = createAvatarRig(scene, isGhostMode, false);
    avatarBRef.current = createAvatarRig(scene, false, true);

    // Trajectory Delta Line (Connecting joint A to joint B in ghost mode)
    const deltaGeo = new THREE.BufferGeometry();
    deltaGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const deltaMat = new THREE.LineDashedMaterial({
      color: 0xf59e0b, // Amber delta vector
      dashSize: 0.04,
      gapSize: 0.02,
      linewidth: 2,
    });
    const deltaLine = new THREE.Line(deltaGeo, deltaMat);
    deltaLine.visible = false;
    scene.add(deltaLine);
    deltaLineRef.current = deltaLine;

    // Animation Loop
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
  }, [showFloorGrid, createAvatarRig, viewMode]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth || width || 640;
      const h = height || 420;
      rendererRef.current.setSize(w, h);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      needsRenderRef.current = true;
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [width, height]);

  // Camera Mode Switcher
  const applyCameraMode = useCallback((mode: CameraPlaneMode) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera) return;

    const targetY = 0.9;
    switch (mode) {
      case "sagittal":
        camera.position.set(4.5, 1.0, 0);
        camera.lookAt(0, targetY, 0);
        if (controls) controls.target.set(0, targetY, 0);
        break;
      case "frontal":
        camera.position.set(0, 1.0, 4.5);
        camera.lookAt(0, targetY, 0);
        if (controls) controls.target.set(0, targetY, 0);
        break;
      case "transverse":
        camera.position.set(0, 4.8, 0.01);
        camera.lookAt(0, 0, 0);
        if (controls) controls.target.set(0, 0, 0);
        break;
      case "orbit":
      default:
        camera.position.set(0, 1.5, 4.2);
        camera.lookAt(0, targetY, 0);
        if (controls) controls.target.set(0, targetY, 0);
        break;
    }
    if (controls) controls.update();
    needsRenderRef.current = true;
  }, []);

  const handleCameraChange = (mode: CameraPlaneMode) => {
    setInternalCameraMode(mode);
    applyCameraMode(mode);
    onCameraModeChange?.(mode);
  };

  const handleViewModeChange = (mode: DualAvatarViewMode) => {
    setInternalViewMode(mode);
    onViewModeChange?.(mode);
    needsRenderRef.current = true;
  };

  const handleTrajectoryChange = (joint: TrajectoryJoint) => {
    setInternalTrajectoryJoint(joint);
    onTrajectoryJointChange?.(joint);
    needsRenderRef.current = true;
  };

  // Update Avatar Positions & Trajectories at Current Phase
  useEffect(() => {
    const scene = sceneRef.current;
    const rigA = avatarARef.current;
    const rigB = avatarBRef.current;
    if (!scene || !rigA || !rigB) return;

    const isGhostMode = viewMode === "ghost-overlay";
    const xOffsetA = isGhostMode ? 0.0 : -1.25;
    const xOffsetB = isGhostMode ? 0.0 : 1.25;

    // Synthesize Poses for Session A and Session B at current phase
    const lmsA = reconstructPoseAtPhase(sessionA, currentPhasePct);
    const lmsB = reconstructPoseAtPhase(sessionB, currentPhasePct);

    // Update Avatar Rig Function
    const updateRig = (rig: AvatarRig, landmarks: Landmark[], xOffset: number) => {
      const { joints, boneLines, comMesh, comDropLine, bosMesh, bosLine } = rig;

      // Dempster CoM
      const com = calculateDempsterCoM(landmarks);
      const comX = (com.x - 0.5) * 2.2 + xOffset;
      const comY = (1.0 - com.y) * 1.9;
      const comZ = -(com.z ?? 0) * 2.2;

      // Position Joints
      for (let i = 0; i < 33; i++) {
        const mesh = joints[i];
        if (!mesh) continue;
        const lm = landmarks[i];
        if (lm && typeof lm.x === "number" && !Number.isNaN(lm.x)) {
          const x = (lm.x - 0.5) * 2.2 + xOffset;
          const y = (1.0 - lm.y) * 1.9;
          const z = -(lm.z ?? 0) * 2.2;
          mesh.position.set(x, y, z);
          mesh.visible = (lm.visibility ?? 1) >= 0.25;
        } else {
          mesh.visible = false;
        }
      }

      // Update Bone Line Segments
      const posAttr = boneLines.geometry.getAttribute("position") as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;
      let idx = 0;
      for (const [startIdx, endIdx] of CONNECTIONS) {
        const startLm = landmarks[startIdx];
        const endLm = landmarks[endIdx];
        const isValid =
          startLm &&
          endLm &&
          typeof startLm.x === "number" &&
          typeof endLm.x === "number" &&
          (startLm.visibility ?? 1) >= 0.25 &&
          (endLm.visibility ?? 1) >= 0.25;

        if (isValid) {
          posArray[idx++] = (startLm.x - 0.5) * 2.2 + xOffset;
          posArray[idx++] = (1.0 - startLm.y) * 1.9;
          posArray[idx++] = -(startLm.z ?? 0) * 2.2;

          posArray[idx++] = (endLm.x - 0.5) * 2.2 + xOffset;
          posArray[idx++] = (1.0 - endLm.y) * 1.9;
          posArray[idx++] = -(endLm.z ?? 0) * 2.2;
        } else {
          posArray[idx++] = 0;
          posArray[idx++] = 0;
          posArray[idx++] = 0;
          posArray[idx++] = 0;
          posArray[idx++] = 0;
          posArray[idx++] = 0;
        }
      }
      posAttr.needsUpdate = true;

      // Update CoM & Drop Line
      comMesh.position.set(comX, comY, comZ);
      const dropPosAttr = comDropLine.geometry.getAttribute("position") as THREE.BufferAttribute;
      const dropPosArray = dropPosAttr.array as Float32Array;
      dropPosArray[0] = comX;
      dropPosArray[1] = comY;
      dropPosArray[2] = comZ;
      dropPosArray[3] = comX;
      dropPosArray[4] = 0.0;
      dropPosArray[5] = comZ;
      dropPosAttr.needsUpdate = true;
      comDropLine.computeLineDistances();

      // Update Base of Support Polygon (29: L Heel, 31: L Toe, 32: R Toe, 30: R Heel)
      const lm29 = landmarks[29];
      const lm31 = landmarks[31];
      const lm32 = landmarks[32];
      const lm30 = landmarks[30];
      if (lm29 && lm31 && lm32 && lm30) {
        const v0 = [(lm29.x - 0.5) * 2.2 + xOffset, 0.001, -(lm29.z ?? 0) * 2.2];
        const v1 = [(lm31.x - 0.5) * 2.2 + xOffset, 0.001, -(lm31.z ?? 0) * 2.2];
        const v2 = [(lm32.x - 0.5) * 2.2 + xOffset, 0.001, -(lm32.z ?? 0) * 2.2];
        const v3 = [(lm30.x - 0.5) * 2.2 + xOffset, 0.001, -(lm30.z ?? 0) * 2.2];

        const bosPosAttr = bosMesh.geometry.getAttribute("position") as THREE.BufferAttribute;
        (bosPosAttr.array as Float32Array).set([...v0, ...v1, ...v2, ...v3]);
        bosPosAttr.needsUpdate = true;

        const bosLinePosAttr = bosLine.geometry.getAttribute("position") as THREE.BufferAttribute;
        (bosLinePosAttr.array as Float32Array).set([...v0, ...v1, ...v2, ...v3]);
        bosLinePosAttr.needsUpdate = true;

        bosMesh.visible = true;
        bosLine.visible = true;
      }
    };

    updateRig(rigA, lmsA, xOffsetA);
    updateRig(rigB, lmsB, xOffsetB);

    // Trajectory Curves & Delta Line
    if (activeTrajectoryJoint !== "none") {
      // Remove old trajectory lines if any
      if (rigA.trajectoryLeft) scene.remove(rigA.trajectoryLeft);
      if (rigA.trajectoryRight) scene.remove(rigA.trajectoryRight);
      if (rigB.trajectoryLeft) scene.remove(rigB.trajectoryLeft);
      if (rigB.trajectoryRight) scene.remove(rigB.trajectoryRight);

      const trajA = buildBilateralTrajectories(sessionA, activeTrajectoryJoint, 101, xOffsetA);
      const trajB = buildBilateralTrajectories(sessionB, activeTrajectoryJoint, 101, xOffsetB);

      const createLine = (points: THREE.Vector3[], color: number, opacity = 0.7) => {
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, linewidth: 2 });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        return line;
      };

      rigA.trajectoryLeft = createLine(trajA.left, 0x38bdf8, 0.65);
      rigA.trajectoryRight = createLine(trajA.right, 0x818cf8, 0.55);
      rigB.trajectoryLeft = createLine(trajB.left, 0x10b981, 0.85);
      rigB.trajectoryRight = createLine(trajB.right, 0xf97316, 0.75);

      // Trajectory Delta Vector at Current Phase
      const phaseIdx = Math.min(100, Math.round(currentPhasePct));
      const ptA = trajA.left[phaseIdx];
      const ptB = trajB.left[phaseIdx];

      if (ptA && ptB && deltaLineRef.current) {
        const deltaAttr = deltaLineRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
        const arr = deltaAttr.array as Float32Array;
        arr[0] = ptA.x;
        arr[1] = ptA.y;
        arr[2] = ptA.z;
        arr[3] = ptB.x;
        arr[4] = ptB.y;
        arr[5] = ptB.z;
        deltaAttr.needsUpdate = true;
        deltaLineRef.current.computeLineDistances();
        deltaLineRef.current.visible = isGhostMode;

        // Calculate spatial distance in cm (1 unit = 1 meter approx)
        const distMeters = Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y, ptB.z - ptA.z);
        setTrajectoryDeltaCm(distMeters * 100);
      }
    } else {
      if (deltaLineRef.current) deltaLineRef.current.visible = false;
      setTrajectoryDeltaCm(null);
    }

    needsRenderRef.current = true;
  }, [sessionA, sessionB, currentPhasePct, viewMode, activeTrajectoryJoint]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-950 border border-slate-800 ${className}`}>
      {/* 3D Canvas Viewport */}
      <div ref={containerRef} className="w-full h-full flex items-center justify-center min-h-[380px]" />

      {/* Floating Top-Left Controls: Camera, Mode, & Trajectory */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 bg-slate-900/85 backdrop-blur-md p-1.5 rounded-lg border border-slate-700/60 shadow-xl z-10">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 pr-1.5 border-r border-slate-700/60">
          <Button
            variant={viewMode === "side-by-side" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => handleViewModeChange("side-by-side")}
            title="Side-by-Side View"
            data-testid="mode-side-by-side"
          >
            <Split className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Side-by-Side</span>
          </Button>
          <Button
            variant={viewMode === "ghost-overlay" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => handleViewModeChange("ghost-overlay")}
            title="Ghost Overlay View"
            data-testid="mode-ghost-overlay"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ghost Overlay</span>
          </Button>
        </div>

        {/* Camera Preset Selector */}
        <div className="flex items-center gap-1 pr-1.5 border-r border-slate-700/60">
          <Button
            variant={cameraMode === "orbit" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => handleCameraChange("orbit")}
            title="3D Free Orbit"
            data-testid="cam-orbit"
          >
            <Move3d className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Orbit</span>
          </Button>
          <Button
            variant={cameraMode === "sagittal" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => handleCameraChange("sagittal")}
            title="Sagittal View"
            data-testid="cam-sagittal"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Sagittal</span>
          </Button>
          <Button
            variant={cameraMode === "frontal" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => handleCameraChange("frontal")}
            title="Frontal View"
            data-testid="cam-frontal"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Frontal</span>
          </Button>
          <Button
            variant={cameraMode === "transverse" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => handleCameraChange("transverse")}
            title="Top-Down Transverse View"
            data-testid="cam-transverse"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Top</span>
          </Button>
        </div>

        {/* 3D Trajectory Selector */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400 font-medium px-1 flex items-center gap-1">
            <Waypoints className="w-3 h-3 text-amber-400" /> Trails:
          </span>
          {(["none", "ankle", "knee", "wrist", "com"] as TrajectoryJoint[]).map((j) => (
            <Button
              key={j}
              variant={activeTrajectoryJoint === j ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-1.5 text-[11px] uppercase font-mono"
              onClick={() => handleTrajectoryChange(j)}
              data-testid={`traj-${j}`}
            >
              {j}
            </Button>
          ))}
        </div>
      </div>

      {/* Top-Right Session Identification Badges */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        {viewMode === "side-by-side" ? (
          <>
            <Badge
              tone="info"
              className="bg-blue-950/80 border-blue-600 text-blue-300 text-xs px-2.5 py-1 backdrop-blur-sm shadow-md"
            >
              <span className="w-2 h-2 rounded-full bg-blue-400 mr-1.5" />
              A · {sessionA?.sessionName || "Baseline"}
            </Badge>
            <Badge
              tone="success"
              className="bg-emerald-950/80 border-emerald-600 text-emerald-300 text-xs px-2.5 py-1 backdrop-blur-sm shadow-md"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />
              B · {sessionB?.sessionName || "Follow-up"}
            </Badge>
          </>
        ) : (
          <Badge
            tone="accent"
            className="bg-purple-950/80 border-purple-600 text-purple-300 text-xs px-2.5 py-1 backdrop-blur-sm shadow-md flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            Ghost: A (Cyan) · Solid: B (Emerald)
          </Badge>
        )}
      </div>

      {/* Bottom-Left Phase & Trajectory Delta Telemetry */}
      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs shadow-lg z-10">
        <span className="font-mono text-slate-300">
          Phase: <span className="font-bold text-white">{currentPhasePct.toFixed(1)}%</span>
        </span>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-white shadow-sm"
          style={{ backgroundColor: currentPerryPhase.color }}
        >
          {currentPerryPhase.name} ({currentPerryPhase.startPct}–{currentPerryPhase.endPct}%)
        </span>

        {activeTrajectoryJoint !== "none" && trajectoryDeltaCm != null && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/70 border border-amber-600/40 text-amber-300 font-mono text-[11px]">
            Δ {activeTrajectoryJoint.toUpperCase()}: {trajectoryDeltaCm.toFixed(1)} cm
          </span>
        )}
      </div>

      {/* Bottom-Right Biomechanical Color Legend */}
      <div className="absolute bottom-3 right-3 flex items-center gap-3 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 text-[11px] text-slate-300 shadow-lg z-10">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-sky-400" /> Left (A)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Left (B)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-500" /> Right
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-400" /> CoM
        </span>
      </div>
    </div>
  );
}

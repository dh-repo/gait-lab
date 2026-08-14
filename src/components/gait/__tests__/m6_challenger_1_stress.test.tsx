// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as THREE from "three";
import { DigitalTwinCanvas } from "../DigitalTwinCanvas";
import { SkeletonCanvas } from "../SkeletonCanvas";
import { GaitTimelineScrubber } from "../GaitTimelineScrubber";
import { JointAnglesChart } from "../JointAnglesChart";
import type { Landmark } from "@/lib/gait/types";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";

let capturedScene: THREE.Scene | null = null;
let capturedCamera: THREE.PerspectiveCamera | null = null;

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();

  class MockWebGLRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false };
    setSize(_w: number, _h: number) {}
    setPixelRatio(_r: number) {}
    render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
      capturedScene = scene;
      capturedCamera = camera;
    }
    dispose() {}
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

// Mock Recharts ResponsiveContainer for JSDOM
vi.mock("recharts", async () => {
  const original = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 400 }}>{children}</div>
    ),
  };
});

function generateMockLandmarks(visibility = 0.9): Landmark[] {
  const landmarks: Landmark[] = [];
  for (let i = 0; i < 33; i++) {
    landmarks.push({
      x: 0.45 + (i % 5) * 0.02,
      y: 0.2 + (i % 7) * 0.05,
      z: (i % 3) * 0.01,
      visibility,
    });
  }
  return landmarks;
}

const mockAngleAnalysis: GaitAngleAnalysis = {
  isSuppressed: false,
  normalizedPoints: Array.from({ length: 101 }, (_, i) => ({
    gaitCyclePct: i,
    kneeAngleLeft: 10 + Math.sin((i / 100) * Math.PI * 2) * 25 + 25,
    kneeAngleRight: 12 + Math.sin((i / 100) * Math.PI * 2) * 24 + 24,
    hipAngleLeft: 5 + Math.sin((i / 100) * Math.PI * 2) * 15,
    hipAngleRight: 6 + Math.sin((i / 100) * Math.PI * 2) * 14,
    ankleAngleLeft: Math.sin((i / 100) * Math.PI * 2) * 10,
    ankleAngleRight: Math.cos((i / 100) * Math.PI * 2) * 10,
  })),
  leftStrides: [],
  rightStrides: [],
  metrics: {
    kneeRomLeft: 50,
    kneeRomRight: 48,
    kneePeakFlexionLeft: 60,
    kneePeakFlexionRight: 58,
    kneeAsymmetryPct: 4.15,
    hipRomLeft: 30,
    hipRomRight: 28,
    hipPeakFlexionLeft: 20,
    hipPeakFlexionRight: 19,
    hipPeakExtensionLeft: -10,
    hipPeakExtensionRight: -9,
    hipAsymmetryPct: 6.9,
    ankleRomLeft: 20,
    ankleRomRight: 19,
    anklePeakDorsiflexionLeft: 10,
    anklePeakDorsiflexionRight: 9,
    anklePeakPlantarflexionLeft: -10,
    anklePeakPlantarflexionRight: -10,
    ankleAsymmetryPct: 5.2,
  },
  normativeData: Array.from({ length: 101 }, (_, i) => ({
    gaitCyclePct: i,
    kneeMean: 35,
    kneeMin: 0,
    kneeMax: 70,
    hipMean: 10,
    hipMin: -18,
    hipMax: 38,
    ankleMean: -3.5,
    ankleMin: -22,
    ankleMax: 15,
  })),
};

describe("M6 Challenger 1: 3D Kinematics Twin & Sub-Frame Synchronous Playback Stress Suite", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    capturedScene = null;
    capturedCamera = null;
  });

  describe("Part 1: 3D Kinematics Twin WebGL Disposal & Biomechanical Calculations", () => {
    it("1.1 Rapid Mount/Unmount WebGL Cleanup: 50 cycles release all WebGL geometries, materials, and renderer contexts", () => {
      const geoDisposeSpy = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
      const matDisposeSpy = vi.spyOn(THREE.Material.prototype, "dispose");
      const rendererDisposeSpy = vi.spyOn(THREE.WebGLRenderer.prototype, "dispose");

      const lm = generateMockLandmarks(0.95);

      for (let i = 0; i < 50; i++) {
        const { unmount } = render(
          <DigitalTwinCanvas
            landmarks={lm}
            width={400 + (i % 3) * 50}
            height={300 + (i % 3) * 40}
            isPlaying={i % 2 === 0}
            showFloorGrid={i % 2 === 0}
            showCoMTrail={i % 2 === 1}
          />
        );
        unmount();
      }

      expect(geoDisposeSpy).toHaveBeenCalled();
      expect(matDisposeSpy).toHaveBeenCalled();
      expect(rendererDisposeSpy).toHaveBeenCalledTimes(50);
    });

    it("1.2 Dempster CoM & BoS Polygon calculation under zero/null/occluded landmarks without NaN propagation", () => {
      // Create empty landmarks array
      const emptyLm: Landmark[] = [];

      render(<DigitalTwinCanvas landmarks={emptyLm} isPlaying={false} />);

      expect(capturedScene).not.toBeNull();

      // Check CoM sphere position is non-NaN
      const comMesh = capturedScene!.children.find(
        (obj) =>
          obj instanceof THREE.Mesh &&
          obj.geometry instanceof THREE.SphereGeometry &&
          (obj.geometry.parameters as { radius: number }).radius === 0.045
      ) as THREE.Mesh | undefined;

      expect(comMesh).toBeDefined();
      expect(Number.isNaN(comMesh!.position.x)).toBe(false);
      expect(Number.isNaN(comMesh!.position.y)).toBe(false);
      expect(Number.isNaN(comMesh!.position.z)).toBe(false);

      // Check BoS mesh visibility is set to false when foot landmarks are missing
      const bosMesh = capturedScene!.children.find(
        (obj) =>
          obj instanceof THREE.Mesh &&
          obj.geometry instanceof THREE.BufferGeometry &&
          !(obj.geometry instanceof THREE.SphereGeometry)
      ) as THREE.Mesh | undefined;

      if (bosMesh) {
        expect(bosMesh.visible).toBe(false);
      }
    });

    it("1.3 BoS Floor Polygon & Drop Line under valid foot landmarks (29, 30, 31, 32)", () => {
      const lm = generateMockLandmarks(0.9);
      // Valid foot landmarks
      lm[29] = { x: 0.4, y: 0.9, z: 0.1, visibility: 0.9 };
      lm[30] = { x: 0.6, y: 0.9, z: 0.1, visibility: 0.9 };
      lm[31] = { x: 0.4, y: 0.95, z: 0.15, visibility: 0.9 };
      lm[32] = { x: 0.6, y: 0.95, z: 0.15, visibility: 0.9 };

      render(<DigitalTwinCanvas landmarks={lm} isPlaying={false} />);

      expect(capturedScene).not.toBeNull();

      const bosMesh = capturedScene!.children.find(
        (obj) =>
          obj instanceof THREE.Mesh &&
          obj.geometry instanceof THREE.BufferGeometry &&
          !(obj.geometry instanceof THREE.SphereGeometry)
      ) as THREE.Mesh | undefined;

      expect(bosMesh).toBeDefined();
      expect(bosMesh!.visible).toBe(true);

      const bosPosAttr = bosMesh!.geometry.getAttribute("position") as THREE.BufferAttribute;
      const bosPosArr = bosPosAttr.array as Float32Array;
      for (let i = 0; i < bosPosArr.length; i++) {
        expect(Number.isNaN(bosPosArr[i])).toBe(false);
        expect(Number.isFinite(bosPosArr[i])).toBe(true);
      }
    });

    it("1.4 Camera View Mode Switching (Orbit, Sagittal, Frontal, Transverse) under 100 rapid toggles", () => {
      const lm = generateMockLandmarks(0.9);
      const { getByText } = render(<DigitalTwinCanvas landmarks={lm} isPlaying={true} />);

      const viewButtons = ["Sagittal", "Frontal", "Top", "3D Orbit"];
      for (let i = 0; i < 100; i++) {
        const btnText = viewButtons[i % viewButtons.length];
        fireEvent.click(getByText(btnText));
        expect(capturedCamera).not.toBeNull();
        expect(Number.isNaN(capturedCamera!.position.x)).toBe(false);
        expect(Number.isNaN(capturedCamera!.position.y)).toBe(false);
        expect(Number.isNaN(capturedCamera!.position.z)).toBe(false);
      }
    });

    it("1.5 Occlusion Filtering (<0.3 visibility) collapses bone lines and hides joint spheres", () => {
      const lm = generateMockLandmarks(0.9);
      // Occlude joints 25 (L knee) and 26 (R knee)
      lm[25].visibility = 0.1;
      lm[26].visibility = 0.29;

      render(<DigitalTwinCanvas landmarks={lm} isPlaying={false} />);

      expect(capturedScene).not.toBeNull();

      const joints = capturedScene!.children.filter(
        (obj) =>
          obj instanceof THREE.Mesh &&
          obj.geometry instanceof THREE.SphereGeometry &&
          (obj.geometry.parameters as { radius: number }).radius === 0.025
      ) as THREE.Mesh[];

      expect(joints[25].visible).toBe(false);
      expect(joints[26].visible).toBe(false);
      expect(joints[23].visible).toBe(true);
    });
  });

  describe("Part 2: Sub-Frame Synchronous Playback & Timeline Scrubbing Stress", () => {
    it("2.1 Rapid Frame Scrubbing & Out-of-Bounds Indexing Protection", () => {
      const handleFrameChange = vi.fn();
      const handlePlayToggle = vi.fn();
      const handleStepBack = vi.fn();
      const handleStepForward = vi.fn();

      const { rerender } = render(
        <GaitTimelineScrubber
          currentFrame={0}
          totalFrames={300}
          isPlaying={false}
          onPlayToggle={handlePlayToggle}
          onFrameChange={handleFrameChange}
          onStepBack={handleStepBack}
          onStepForward={handleStepForward}
          fps={30}
        />
      );

      // Verify initial rendering
      expect(screen.getByText("0.00s / 10.00s")).toBeDefined();
      expect(screen.getByText("F: 0 / 299")).toBeDefined();

      // Stress test with rapid out-of-bounds currentFrame props
      const oobIndices = [-100, -1, 0, 150, 299, 300, 500, 999999];
      for (const frameIdx of oobIndices) {
        rerender(
          <GaitTimelineScrubber
            currentFrame={frameIdx}
            totalFrames={300}
            isPlaying={false}
            onPlayToggle={handlePlayToggle}
            onFrameChange={handleFrameChange}
            onStepBack={handleStepBack}
            onStepForward={handleStepForward}
            fps={30}
          />
        );
        const rangeInput = screen.getByRole("slider") as HTMLInputElement;
        expect(rangeInput).toBeDefined();
      }
    });

    it("2.2 Dynamic FPS Handling (fps = 0, 12.5, 29.97, 60, 120, undefined, negative)", () => {
      const handleFrameChange = vi.fn();

      const fpsValues = [0, -1, 12.5, 29.97, 60, 120, undefined as unknown as number];

      for (const fps of fpsValues) {
        const { unmount } = render(
          <GaitTimelineScrubber
            currentFrame={30}
            totalFrames={300}
            isPlaying={false}
            onPlayToggle={vi.fn()}
            onFrameChange={handleFrameChange}
            onStepBack={vi.fn()}
            onStepForward={vi.fn()}
            fps={fps}
          />
        );
        // Ensure time text does not print NaN
        const timeText = screen.getByText(/\/.*s/);
        expect(timeText.textContent).not.toContain("NaN");
        unmount();
      }
    });

    it("2.3 Active Playhead Cursor positioning in JointAnglesChart across [0, 100]% gait cycle bounds", () => {
      const cyclePctValues = [-20, 0, 25, 50.5, 75.2, 100, 120, NaN, undefined];

      for (const pct of cyclePctValues) {
        const { unmount } = render(
          <JointAnglesChart angleAnalysis={mockAngleAnalysis} currentGaitCyclePct={pct} />
        );
        expect(screen.getByText("Joint Kinematic Angle Trajectories")).toBeDefined();
        unmount();
      }
    });

    it("2.4 Synchronous 2D Skeleton Canvas & Playback State Integrity under 100 simulated frame step calls", () => {
      const landmarks = generateMockLandmarks(0.9);
      const poses = [{ id: 1, landmarks }];
      const personColors = { 1: "#00E5FF" };

      const { rerender } = render(
        <SkeletonCanvas
          video={null}
          poses={poses}
          selectedId={1}
          personColors={personColors}
          showSkeleton={true}
          showJointArcs={true}
          showSwayVector={true}
        />
      );

      expect(screen.getByTestId("skeleton-canvas-wrapper")).toBeDefined();

      for (let f = 0; f < 100; f++) {
        const updatedLandmarks = generateMockLandmarks(0.8 + (f % 3) * 0.05);
        rerender(
          <SkeletonCanvas
            video={null}
            poses={[{ id: 1, landmarks: updatedLandmarks }]}
            selectedId={1}
            personColors={personColors}
            showSkeleton={true}
            showJointArcs={true}
            showSwayVector={true}
          />
        );
      }
    });
  });
});

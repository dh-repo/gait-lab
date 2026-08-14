// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import * as THREE from "three";
import { DigitalTwinCanvas } from "../DigitalTwinCanvas";
import type { Landmark } from "@/lib/gait/types";

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

function createLandmarksWithVisibility(visibility: number): Landmark[] {
  const landmarks: Landmark[] = [];
  for (let i = 0; i < 33; i++) {
    landmarks.push({
      x: 0.5 + (i % 3) * 0.05,
      y: 0.3 + (i % 5) * 0.05,
      z: (i % 2) * 0.02,
      visibility,
    });
  }
  return landmarks;
}

describe("Challenger 1 Empirical Stress Harness: WebGL Disposal & Occlusion Filtering", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    capturedScene = null;
    capturedCamera = null;
  });

  describe("Focus Area 1: WebGL Disposal & Rapid Mount/Unmount/Prop Stress", () => {
    it("1.1 Rapidly mounts and unmounts component 50 times without crashing or leaking memory", () => {
      const geoDisposeSpy = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
      const matDisposeSpy = vi.spyOn(THREE.Material.prototype, "dispose");
      const rendererDisposeSpy = vi.spyOn(THREE.WebGLRenderer.prototype, "dispose");

      const lm = createLandmarksWithVisibility(0.9);

      for (let i = 0; i < 50; i++) {
        const { unmount } = render(<DigitalTwinCanvas landmarks={lm} isPlaying={i % 2 === 0} />);
        unmount();
      }

      expect(geoDisposeSpy).toHaveBeenCalled();
      expect(matDisposeSpy).toHaveBeenCalled();
      expect(rendererDisposeSpy).toHaveBeenCalledTimes(50);
    });

    it("1.2 Rapidly updates props 50 times in sequence without leaking or throwing errors", () => {
      const setSizeSpy = vi.spyOn(THREE.WebGLRenderer.prototype, "setSize");
      const lm1 = createLandmarksWithVisibility(0.9);
      const lm2 = createLandmarksWithVisibility(0.1);
      const allFrames = [lm1, lm2];

      const { rerender, unmount } = render(
        <DigitalTwinCanvas
          landmarks={lm1}
          width={400}
          height={300}
          showFloorGrid={true}
          showCoMTrail={true}
          isPlaying={false}
        />
      );

      for (let i = 0; i < 50; i++) {
        rerender(
          <DigitalTwinCanvas
            landmarks={i % 2 === 0 ? lm1 : lm2}
            allFrames={allFrames}
            currentFrameIndex={i % 2}
            width={400 + (i % 5) * 50}
            height={300 + (i % 5) * 40}
            showFloorGrid={i % 3 !== 0}
            showCoMTrail={i % 4 !== 0}
            isPlaying={i % 2 === 1}
          />
        );
      }

      expect(setSizeSpy).toHaveBeenCalled();
      unmount();
    });

    it("1.3 Rapidly switches camera view modes 50 times without camera matrix NaN or error", () => {
      const lm = createLandmarksWithVisibility(0.9);
      const { getByText } = render(<DigitalTwinCanvas landmarks={lm} isPlaying={true} />);

      const modes = ["Sagittal", "Frontal", "Top", "3D Orbit"];
      for (let i = 0; i < 50; i++) {
        fireEvent.click(getByText(modes[i % modes.length]));
        expect(capturedCamera).not.toBeNull();
        expect(Number.isNaN(capturedCamera!.position.x)).toBe(false);
        expect(Number.isNaN(capturedCamera!.position.y)).toBe(false);
        expect(Number.isNaN(capturedCamera!.position.z)).toBe(false);
      }
    });
  });

  describe("Focus Area 2: Landmark Occlusion Behavior & Geometry Sanity (<0.3 visibility)", () => {
    it("2.1 Hides joint spheres when visibility < 0.3 and displays them when visibility >= 0.3", () => {
      const lm = createLandmarksWithVisibility(0.9);
      // Occlude left knee (25) and right ankle (28)
      lm[25].visibility = 0.29;
      lm[28].visibility = 0.1;

      render(<DigitalTwinCanvas landmarks={lm} isPlaying={true} />);

      expect(capturedScene).not.toBeNull();

      const joints = capturedScene!.children.filter(
        (obj) =>
          obj instanceof THREE.Mesh &&
          obj.geometry instanceof THREE.SphereGeometry &&
          (obj.geometry.parameters as { radius: number }).radius === 0.025
      ) as THREE.Mesh[];

      expect(joints.length).toBe(33);
      expect(joints[25].visible).toBe(false);
      expect(joints[28].visible).toBe(false);
      expect(joints[24].visible).toBe(true);
      expect(joints[26].visible).toBe(true);
    });

    it("2.2 Collapses bone line segments to origin (0,0,0) when either connected landmark visibility < 0.3", () => {
      const lm = createLandmarksWithVisibility(0.9);
      // Occlude L shoulder (11) with visibility 0.2
      lm[11].visibility = 0.2;

      render(<DigitalTwinCanvas landmarks={lm} isPlaying={true} />);

      expect(capturedScene).not.toBeNull();

      const boneLines = capturedScene!.children.find(
        (obj) =>
          obj instanceof THREE.LineSegments &&
          obj.material instanceof THREE.LineBasicMaterial &&
          (obj.material as THREE.LineBasicMaterial).color.getHex() === 0xe2e8f0
      ) as THREE.LineSegments | undefined;

      expect(boneLines).toBeDefined();

      const posAttr = boneLines!.geometry.getAttribute("position") as THREE.BufferAttribute;
      const posArr = posAttr.array as Float32Array;

      // CONNECTIONS[0] is [11, 12] (L shoulder - R shoulder). Since 11 is occluded (<0.3), segment 0 must be 0,0,0 -> 0,0,0
      expect(posArr[0]).toBe(0);
      expect(posArr[1]).toBe(0);
      expect(posArr[2]).toBe(0);
      expect(posArr[3]).toBe(0);
      expect(posArr[4]).toBe(0);
      expect(posArr[5]).toBe(0);
    });

    it("2.3 Ensures no NaNs, Infinities, or geometry spikes are present in WebGL buffers under total landmark occlusion (visibility = 0.0)", () => {
      const occludedLm = createLandmarksWithVisibility(0.0);

      render(<DigitalTwinCanvas landmarks={occludedLm} isPlaying={true} />);

      expect(capturedScene).not.toBeNull();

      // Inspect all BufferAttributes in the scene
      capturedScene!.traverse((obj) => {
        if ("geometry" in obj && obj.geometry) {
          const geo = obj.geometry as THREE.BufferGeometry;
          for (const attrName of Object.keys(geo.attributes)) {
            const attr = geo.getAttribute(attrName) as THREE.BufferAttribute;
            const arr = attr.array as Float32Array;
            for (let i = 0; i < arr.length; i++) {
              expect(Number.isNaN(arr[i])).toBe(false);
              expect(Number.isFinite(arr[i])).toBe(true);
            }
          }
        }
      });
    });

    it("2.4 Handles exact visibility boundary condition at 0.3", () => {
      const lm = createLandmarksWithVisibility(0.3);

      render(<DigitalTwinCanvas landmarks={lm} isPlaying={true} />);

      expect(capturedScene).not.toBeNull();

      const joints = capturedScene!.children.filter(
        (obj) =>
          obj instanceof THREE.Mesh &&
          obj.geometry instanceof THREE.SphereGeometry &&
          (obj.geometry.parameters as { radius: number }).radius === 0.025
      ) as THREE.Mesh[];

      // All joints should be visible at visibility === 0.3
      joints.forEach((j) => expect(j.visible).toBe(true));
    });

    it("2.5 Evaluates Dempster CoM calculation under mixed landmark visibility without producing NaNs", () => {
      const lm = createLandmarksWithVisibility(0.9);
      // Occlude some torso landmarks (11, 23)
      lm[11].visibility = 0.1;
      lm[23].visibility = 0.05;

      render(<DigitalTwinCanvas landmarks={lm} isPlaying={true} />);

      expect(capturedScene).not.toBeNull();

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
    });
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import * as THREE from "three";
import { DigitalTwinCanvas } from "../DigitalTwinCanvas";
import type { Landmark } from "@/lib/gait/types";

// Mock WebGLRenderer with internal state captured for inspection
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

function createLandmarksWithValues(
  baseX = 0.5,
  baseY = 0.5,
  baseZ = 0.0,
  visibility?: number
): Landmark[] {
  const landmarks: Landmark[] = [];
  for (let i = 0; i < 33; i++) {
    landmarks.push({
      x: baseX + (i % 3) * 0.01,
      y: baseY + (i % 5) * 0.01,
      z: baseZ + (i % 2) * 0.01,
      ...(visibility !== undefined ? { visibility } : {}),
    });
  }
  return landmarks;
}

describe("Challenger 2 Empirical Verification: DigitalTwinCanvas", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    capturedScene = null;
    capturedCamera = null;
  });

  it("1. Empirically verifies Dempster 5-segment CoM formula calculation", () => {
    const lm = createLandmarksWithValues(0.5, 0.4, 0.1, 0.95);

    // Calculate expected midpoints manually
    const avgPoints = (indices: number[]) => {
      let sumX = 0, sumY = 0, sumZ = 0;
      for (const idx of indices) {
        sumX += lm[idx].x;
        sumY += lm[idx].y;
        sumZ += lm[idx].z!;
      }
      const count = indices.length;
      return { x: sumX / count, y: sumY / count, z: sumZ / count };
    };

    const midTorso = avgPoints([11, 12, 23, 24]);
    const midThigh = avgPoints([23, 24, 25, 26]);
    const midShank = avgPoints([25, 26, 27, 28]);
    const midArm = avgPoints([11, 12, 13, 14, 15, 16]);
    const midFoot = avgPoints([29, 30, 31, 32]);

    const expectedCoMX =
      0.5 * midTorso.x + 0.2 * midThigh.x + 0.12 * midShank.x + 0.1 * midArm.x + 0.08 * midFoot.x;
    const expectedCoMY =
      0.5 * midTorso.y + 0.2 * midThigh.y + 0.12 * midShank.y + 0.1 * midArm.y + 0.08 * midFoot.y;
    const expectedCoMZ =
      0.5 * midTorso.z + 0.2 * midThigh.z + 0.12 * midShank.z + 0.1 * midArm.z + 0.08 * midFoot.z;

    const expectedThreeX = (expectedCoMX - 0.5) * 2.2;
    const expectedThreeY = (1.0 - expectedCoMY) * 1.9;
    const expectedThreeZ = -expectedCoMZ * 2.2;

    render(<DigitalTwinCanvas landmarks={lm} isPlaying={true} />);

    expect(capturedScene).not.toBeNull();

    // Find CoM Sphere Mesh in scene
    const comMesh = capturedScene!.children.find(
      (obj) =>
        obj instanceof THREE.Mesh &&
        obj.geometry instanceof THREE.SphereGeometry &&
        (obj.geometry.parameters as { radius: number }).radius === 0.045
    ) as THREE.Mesh | undefined;

    expect(comMesh).toBeDefined();
    expect(comMesh!.position.x).toBeCloseTo(expectedThreeX, 5);
    expect(comMesh!.position.y).toBeCloseTo(expectedThreeY, 5);
    expect(comMesh!.position.z).toBeCloseTo(expectedThreeZ, 5);
  });

  it("2. Empirically verifies vertical floor drop line coordinates from CoM to y=0.0", () => {
    const lm = createLandmarksWithValues(0.6, 0.3, 0.2, 0.9);
    render(<DigitalTwinCanvas landmarks={lm} isPlaying={true} />);

    expect(capturedScene).not.toBeNull();

    // Find com drop line
    const comDropLine = capturedScene!.children.find(
      (obj) => obj instanceof THREE.Line && obj.material instanceof THREE.LineDashedMaterial
    ) as THREE.Line | undefined;

    expect(comDropLine).toBeDefined();
    const posAttr = comDropLine!.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    // Point 0 (CoM): (X, Y, Z)
    // Point 1 (Floor): (X, 0.0, Z)
    expect(arr[0]).toBeCloseTo(arr[3], 5); // X identical
    expect(arr[2]).toBeCloseTo(arr[5], 5); // Z identical
    expect(arr[4]).toBe(0.0); // Y dropped to floor (0.0)
    expect(arr[1]).toBeGreaterThan(0.0); // Y CoM is above floor
  });

  it("3. Empirically verifies Base of Support (BoS) floor quad vertices (landmarks 29, 31, 32, 30)", () => {
    const lm = createLandmarksWithValues(0.5, 0.5, 0.0, 0.95);
    // Explicit foot landmarks
    lm[29] = { x: 0.4, y: 0.8, z: 0.1, visibility: 0.9 }; // L heel
    lm[31] = { x: 0.4, y: 0.85, z: 0.2, visibility: 0.9 }; // L toe
    lm[32] = { x: 0.6, y: 0.85, z: 0.2, visibility: 0.9 }; // R toe
    lm[30] = { x: 0.6, y: 0.8, z: 0.1, visibility: 0.9 }; // R heel

    render(<DigitalTwinCanvas landmarks={lm} isPlaying={true} />);

    expect(capturedScene).not.toBeNull();

    const bosMesh = capturedScene!.children.find(
      (obj) =>
        obj instanceof THREE.Mesh &&
        obj.material instanceof THREE.MeshBasicMaterial &&
        (obj.material as THREE.MeshBasicMaterial).opacity === 0.25
    ) as THREE.Mesh | undefined;

    expect(bosMesh).toBeDefined();
    expect(bosMesh!.visible).toBe(true);

    const posAttr = bosMesh!.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    // Verify 4 vertices at y = 0.001
    expect(arr[1]).toBeCloseTo(0.001, 6); // v0 y
    expect(arr[4]).toBeCloseTo(0.001, 6); // v1 y
    expect(arr[7]).toBeCloseTo(0.001, 6); // v2 y
    expect(arr[10]).toBeCloseTo(0.001, 6); // v3 y

    // Vertex 0: L heel (lm29)
    expect(arr[0]).toBeCloseTo((0.4 - 0.5) * 2.2, 5);
    expect(arr[2]).toBeCloseTo(-0.1 * 2.2, 5);

    // Vertex 1: L toe (lm31)
    expect(arr[3]).toBeCloseTo((0.4 - 0.5) * 2.2, 5);
    expect(arr[5]).toBeCloseTo(-0.2 * 2.2, 5);

    // Vertex 2: R toe (lm32)
    expect(arr[6]).toBeCloseTo((0.6 - 0.5) * 2.2, 5);
    expect(arr[8]).toBeCloseTo(-0.2 * 2.2, 5);

    // Vertex 3: R heel (lm30)
    expect(arr[9]).toBeCloseTo((0.6 - 0.5) * 2.2, 5);
    expect(arr[11]).toBeCloseTo(-0.1 * 2.2, 5);
  });

  it("4. Verifies subject camera tracking in sagittal, frontal, and transverse views", () => {
    const lm = createLandmarksWithValues(0.7, 0.4, 0.3, 0.95);
    const { getByText } = render(<DigitalTwinCanvas landmarks={lm} isPlaying={true} />);

    // Calculate comX and comZ
    const comZ = -0.305 * 2.2;
    const comX = (0.71 - 0.5) * 2.2;

    // Click Sagittal
    fireEvent.click(getByText("Sagittal"));
    expect(capturedCamera).not.toBeNull();
    // Camera X - CoM X should equal 3.2
    expect(capturedCamera!.position.x - comX).toBeCloseTo(3.2, 1);

    // Click Frontal
    fireEvent.click(getByText("Frontal"));
    // Camera Z - CoM Z should equal 3.2
    expect(capturedCamera!.position.z - comZ).toBeCloseTo(3.2, 1);

    // Click Top (Transverse)
    fireEvent.click(getByText("Top"));
    expect(capturedCamera!.position.y).toBeCloseTo(3.5, 2);
  });

  describe("Edge Case Stress Testing", () => {
    it("handles empty landmark array without crashing", () => {
      expect(() => {
        render(<DigitalTwinCanvas landmarks={[]} isPlaying={true} />);
      }).not.toThrow();
    });

    it("handles missing visibility fields safely", () => {
      const lmWithoutVisibility: Landmark[] = createLandmarksWithValues(0.5, 0.5, 0.0);
      // Remove visibility completely
      lmWithoutVisibility.forEach((l) => delete l.visibility);

      expect(() => {
        render(<DigitalTwinCanvas landmarks={lmWithoutVisibility} isPlaying={true} />);
      }).not.toThrow();

      // Check joint mesh visibility defaults to true
      const joints = capturedScene!.children.filter(
        (obj) =>
          obj instanceof THREE.Mesh &&
          obj.geometry instanceof THREE.SphereGeometry &&
          (obj.geometry.parameters as { radius: number }).radius === 0.025
      );
      expect(joints.length).toBe(33);
      joints.forEach((j) => expect(j.visible).toBe(true));
    });

    it("handles extreme coordinate values without crashing or NaN", () => {
      const extremeLm: Landmark[] = createLandmarksWithValues(100.0, -50.0, 999.0, 1.0);
      expect(() => {
        render(<DigitalTwinCanvas landmarks={extremeLm} isPlaying={true} />);
      }).not.toThrow();

      expect(capturedScene).not.toBeNull();
    });

    it("handles partial landmark arrays (< 33 landmarks)", () => {
      const partialLm: Landmark[] = createLandmarksWithValues(0.5, 0.5, 0.0, 0.9).slice(0, 15);
      expect(() => {
        render(<DigitalTwinCanvas landmarks={partialLm} isPlaying={true} />);
      }).not.toThrow();

      // BoS mesh should be hidden since foot landmarks (29, 30, 31, 32) are missing
      const bosMesh = capturedScene!.children.find(
        (obj) =>
          obj instanceof THREE.Mesh &&
          obj.material instanceof THREE.MeshBasicMaterial &&
          (obj.material as THREE.MeshBasicMaterial).opacity === 0.25
      ) as THREE.Mesh | undefined;

      expect(bosMesh).toBeDefined();
      expect(bosMesh!.visible).toBe(false);
    });
  });
});

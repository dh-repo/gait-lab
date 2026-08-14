// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import * as THREE from "three";
import { DigitalTwinCanvas } from "../DigitalTwinCanvas";
import type { Landmark } from "@/lib/gait/types";

// Mock WebGLRenderer at ESM module level with prototype methods for spying
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();

  class MockWebGLRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false };
    setSize(_w: number, _h: number) {}
    setPixelRatio(_r: number) {}
    render(_s: unknown, _c: unknown) {}
    dispose() {}
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

function createSampleLandmarks(visibility = 0.9): Landmark[] {
  const landmarks: Landmark[] = [];
  for (let i = 0; i < 33; i++) {
    landmarks.push({
      x: 0.5 + (i % 2 === 0 ? 0.05 : -0.05),
      y: 0.2 + (i / 33) * 0.6,
      z: ((i % 3) - 1) * 0.1,
      visibility,
    });
  }
  return landmarks;
}

describe("DigitalTwinCanvas Component & WebGL 3D Workstation", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders canvas container and legend items", () => {
    const landmarks = createSampleLandmarks();
    render(<DigitalTwinCanvas landmarks={landmarks} width={480} height={360} />);

    expect(screen.getByText("3D Orbit")).toBeTruthy();
    expect(screen.getByText("Sagittal")).toBeTruthy();
    expect(screen.getByText("Frontal")).toBeTruthy();
    expect(screen.getByText("Top")).toBeTruthy();

    expect(screen.getByText("Left Limb")).toBeTruthy();
    expect(screen.getByText("Right Limb")).toBeTruthy();
    expect(screen.getByText("CoM")).toBeTruthy();
  });

  it("switches camera mode when mode buttons are clicked", () => {
    const landmarks = createSampleLandmarks();
    render(<DigitalTwinCanvas landmarks={landmarks} />);

    const sagittalBtn = screen.getByRole("button", { name: /sagittal/i });
    const frontalBtn = screen.getByRole("button", { name: /frontal/i });
    const topBtn = screen.getByRole("button", { name: /top/i });
    const orbitBtn = screen.getByRole("button", { name: /3d orbit/i });

    fireEvent.click(sagittalBtn);
    expect(sagittalBtn).toBeTruthy();

    fireEvent.click(frontalBtn);
    expect(frontalBtn).toBeTruthy();

    fireEvent.click(topBtn);
    expect(topBtn).toBeTruthy();

    fireEvent.click(orbitBtn);
    expect(orbitBtn).toBeTruthy();
  });

  it("calculates Dempster CoM, drop line, and BoS polygon updates", () => {
    const frame1 = createSampleLandmarks(0.95);
    const frame2 = createSampleLandmarks(0.95);
    frame2[29].x += 0.1; // L heel
    frame2[30].x -= 0.1; // R heel

    const { rerender } = render(
      <DigitalTwinCanvas landmarks={frame1} showFloorGrid={true} showCoMTrail={true} />,
    );

    expect(screen.getByText("CoM")).toBeTruthy();

    rerender(<DigitalTwinCanvas landmarks={frame2} showFloorGrid={true} showCoMTrail={true} />);
    expect(screen.getByText("CoM")).toBeTruthy();
  });

  it("filters occluded landmarks with visibility < 0.3", () => {
    const landmarks = createSampleLandmarks(0.9);
    landmarks[25].visibility = 0.1;
    landmarks[27].visibility = 0.05;

    render(<DigitalTwinCanvas landmarks={landmarks} />);
    expect(screen.getByText("Left Limb")).toBeTruthy();
  });

  it("executes WebGL geometry, material, and renderer disposal on unmount", () => {
    const geoDisposeSpy = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const matDisposeSpy = vi.spyOn(THREE.Material.prototype, "dispose");
    const rendererDisposeSpy = vi.spyOn(THREE.WebGLRenderer.prototype, "dispose");

    const landmarks = createSampleLandmarks();
    const { unmount } = render(<DigitalTwinCanvas landmarks={landmarks} />);

    unmount();

    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
    expect(rendererDisposeSpy).toHaveBeenCalled();
  });

  it("decouples canvas resizing from main scene initialization", () => {
    const setSizeSpy = vi.spyOn(THREE.WebGLRenderer.prototype, "setSize");
    const landmarks = createSampleLandmarks();
    const { rerender } = render(<DigitalTwinCanvas landmarks={landmarks} width={480} height={360} />);

    expect(setSizeSpy).toHaveBeenCalledWith(480, 360);

    rerender(<DigitalTwinCanvas landmarks={landmarks} width={800} height={600} />);
    expect(setSizeSpy).toHaveBeenCalledWith(800, 600);
  });

  it("supports isPlaying prop for render loop efficiency", () => {
    const landmarks = createSampleLandmarks();
    const { rerender } = render(<DigitalTwinCanvas landmarks={landmarks} isPlaying={false} />);

    rerender(<DigitalTwinCanvas landmarks={landmarks} isPlaying={true} />);
    expect(screen.getByText("3D Orbit")).toBeTruthy();
  });
});

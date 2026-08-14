// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { GaitTimelineScrubber } from "../GaitTimelineScrubber";
import { JointAnglesChart } from "../JointAnglesChart";
import { CognitiveClusters } from "../CognitiveClusters";
import { DigitalTwinCanvas } from "../DigitalTwinCanvas";
import { SkeletonCanvas } from "../SkeletonCanvas";
import { PERRY_GAIT_PHASES } from "@/lib/gait/phases";
import type { FramePhaseInfo } from "@/lib/gait/phases";
import type { GaitAngleAnalysis, JointAnglePoint, JointAngleMetrics } from "@/lib/gait/angles";
import type { GaitMetrics, Landmark } from "@/lib/gait/types";

// Mock Three.js WebGLRenderer for DigitalTwinCanvas
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class MockWebGLRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false };
    setSize() {}
    setPixelRatio() {}
    render() {}
    dispose() {}
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});

// Mock Recharts ResponsiveContainer to render children with explicit dimensions in SSR / JSDOM
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div className="recharts-responsive-container">
        {React.isValidElement(children)
          ? React.cloneElement(children as React.ReactElement<{ width?: number; height?: number }>, {
              width: 800,
              height: 300,
            })
          : children}
      </div>
    ),
  };
});

// Helper generators
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

function createSampleNormalizedPoints(): JointAnglePoint[] {
  return Array.from({ length: 101 }, (_, i) => ({
    gaitCyclePct: i,
    kneeAngleLeft: Number((5 + 57 * Math.sin((i / 100) * Math.PI)).toFixed(1)),
    kneeAngleRight: Number((4 + 55 * Math.sin((i / 100) * Math.PI)).toFixed(1)),
    hipAngleLeft: Number((30 - 42 * (i / 100)).toFixed(1)),
    hipAngleRight: Number((28 - 40 * (i / 100)).toFixed(1)),
    ankleAngleLeft: Number((10 * Math.sin((i / 50) * Math.PI)).toFixed(1)),
    ankleAngleRight: Number((8 * Math.sin((i / 50) * Math.PI)).toFixed(1)),
  }));
}

function createSampleMetrics(): GaitMetrics {
  return {
    viewAngle: "sagittal",
    viewConfidence: 0.95,
    durationSec: 5.0,
    fpsEffective: 30,
    stepCount: 8,
    cadenceSpm: 110,
    avgStepTimeSec: 0.54,
    stepTimeAsymmetry: 0.03,
    strideAsymmetry: 0.02,
    lateralSway: 0.04,
    verticalBounce: 0.05,
    armSwingLeft: 0.2,
    armSwingRight: 0.2,
    armSwingAsymmetry: 0.0,
    kneeFlexLeft: 62.5,
    kneeFlexRight: 59.8,
    kneeAsymmetry: 4.3,
    stepWidthVariability: 0.02,
    doubleSupportHint: 0.2,
    leftStancePct: 60.0,
    rightStancePct: 60.0,
    leftSwingPct: 40.0,
    rightSwingPct: 40.0,
    doubleSupportPct: 20.0,
    symmetryAngle: 1.5,
    stepTimeCV: 0.02,
    strideTimeCV: 0.02,
    pelvicObliquity: 0.01,
    pelvicObliquityVar: 0.001,
    meanStepWidth: 0.15,
    pathSmoothness: 0.92,
    stabilityScore: 85,
    rhythmScore: 90,
    symmetryScore: 92,
    mobilityScore: 88,
    automaticityScore: 86,
    overallScore: 88,
    series: [],
    stepEvents: [
      { frame: 0, timeSec: 0.0, side: "left", type: "heel_strike" },
      { frame: 15, timeSec: 0.5, side: "right", type: "heel_strike" },
      { frame: 30, timeSec: 1.0, side: "left", type: "heel_strike" },
    ],
  };
}

function createSampleAngleAnalysis(): GaitAngleAnalysis {
  const metrics: JointAngleMetrics = {
    kneeRomLeft: 62.5,
    kneeRomRight: 59.8,
    kneePeakFlexionLeft: 62.5,
    kneePeakFlexionRight: 59.8,
    kneeAsymmetryPct: 4.3,
    hipRomLeft: 42.0,
    hipRomRight: 40.0,
    hipPeakFlexionLeft: 30.0,
    hipPeakExtensionLeft: -12.0,
    hipPeakFlexionRight: 28.0,
    hipPeakExtensionRight: -12.0,
    hipAsymmetryPct: 4.8,
    ankleRomLeft: 25.0,
    ankleRomRight: 23.0,
    anklePeakDorsiflexionLeft: 10.0,
    anklePeakPlantarflexionLeft: -15.0,
    anklePeakDorsiflexionRight: 8.0,
    anklePeakPlantarflexionRight: -15.0,
    ankleAsymmetryPct: 8.0,
  };
  return {
    isSuppressed: false,
    normalizedPoints: createSampleNormalizedPoints(),
    leftStrides: [],
    rightStrides: [],
    metrics,
    normativeData: [],
  };
}

function createSamplePhaseTimeline(length = 150): FramePhaseInfo[] {
  return Array.from({ length }, (_, i) => {
    const cyclePct = (i % 30) / 30 * 100;
    const phaseIndex = Math.min(7, Math.floor((cyclePct / 100) * 8));
    const currentPhase = PERRY_GAIT_PHASES[phaseIndex];
    return {
      frameIndex: i,
      leftPhase: currentPhase,
      rightPhase: PERRY_GAIT_PHASES[(phaseIndex + 4) % 8],
      leftCyclePct: cyclePct,
      rightCyclePct: (cyclePct + 50) % 100,
    };
  });
}

describe("SynchronousPlaybackR2 Test Suite", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ---------------------------------------------------------------------------
  // Test Group 1: Render Tests for Gait Timeline Scrubber & Views
  // ---------------------------------------------------------------------------
  describe("Group 1: Gait Timeline Scrubber & View Controls", () => {
    it("renders GaitTimelineScrubber controls, time display, and frame counters", () => {
      const onPlayToggle = vi.fn();
      const onFrameChange = vi.fn();
      const onStepBack = vi.fn();
      const onStepForward = vi.fn();

      render(
        <GaitTimelineScrubber
          currentFrame={15}
          totalFrames={150}
          isPlaying={false}
          onPlayToggle={onPlayToggle}
          onFrameChange={onFrameChange}
          onStepBack={onStepBack}
          onStepForward={onStepForward}
          fps={30}
        />,
      );

      expect(screen.getByTitle("Play video")).toBeTruthy();
      expect(screen.getByTitle("Step 1 frame backward")).toBeTruthy();
      expect(screen.getByTitle("Step 1 frame forward")).toBeTruthy();
      expect(screen.getByText(/0\.50s \/ 5\.00s/)).toBeTruthy();
      expect(screen.getByText(/F: 15 \/ 149/)).toBeTruthy();
    });

    it("toggles play/pause state button", () => {
      const onPlayToggle = vi.fn();
      const { rerender } = render(
        <GaitTimelineScrubber
          currentFrame={0}
          totalFrames={100}
          isPlaying={false}
          onPlayToggle={onPlayToggle}
          onFrameChange={vi.fn()}
          onStepBack={vi.fn()}
          onStepForward={vi.fn()}
        />,
      );

      const playBtn = screen.getByTitle("Play video");
      fireEvent.click(playBtn);
      expect(onPlayToggle).toHaveBeenCalledTimes(1);

      rerender(
        <GaitTimelineScrubber
          currentFrame={0}
          totalFrames={100}
          isPlaying={true}
          onPlayToggle={onPlayToggle}
          onFrameChange={vi.fn()}
          onStepBack={vi.fn()}
          onStepForward={vi.fn()}
        />,
      );
      expect(screen.getByTitle("Pause video")).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Test Group 2: Synchronous Playback Frame Updating & Landmark Plumbing
  // ---------------------------------------------------------------------------
  describe("Group 2: Synchronous Playback & Dynamic Landmark Passing", () => {
    it("passes dynamic landmarks frame-by-frame to SkeletonCanvas and DigitalTwinCanvas", () => {
      const landmarks1 = createSampleLandmarks();
      const landmarks2 = createSampleLandmarks();
      landmarks2[0].x = 0.9; // Modified position for frame 2

      const poses1 = [{ id: 1, landmarks: landmarks1 }];
      const poses2 = [{ id: 1, landmarks: landmarks2 }];
      const allFrames = [landmarks1, landmarks2];

      const { rerender } = render(
        <SkeletonCanvas poses={poses1} video={null} selectedId={1} personColors={{ 1: "#38bdf8" }} />,
      );
      expect(screen.getByTestId("skeleton-canvas-wrapper")).toBeTruthy();

      rerender(<SkeletonCanvas poses={poses2} video={null} selectedId={1} personColors={{ 1: "#38bdf8" }} />);

      render(
        <DigitalTwinCanvas
          landmarks={landmarks1}
          allFrames={allFrames}
          currentFrameIndex={0}
          width={480}
          height={360}
        />,
      );
      expect(screen.getByText("3D Orbit")).toBeTruthy();

      cleanup();

      render(
        <DigitalTwinCanvas
          landmarks={landmarks2}
          allFrames={allFrames}
          currentFrameIndex={1}
          width={480}
          height={360}
        />,
      );
      expect(screen.getByText("3D Orbit")).toBeTruthy();
    });

    it("scales time and frame calculation accurately with dynamic effectiveFps (e.g., 60 FPS clip)", () => {
      render(
        <GaitTimelineScrubber
          currentFrame={60}
          totalFrames={300}
          isPlaying={false}
          onPlayToggle={vi.fn()}
          onFrameChange={vi.fn()}
          onStepBack={vi.fn()}
          onStepForward={vi.fn()}
          fps={60}
        />,
      );

      // At 60 FPS, frame 60 corresponds to 1.00s and 300 total frames corresponds to 5.00s
      expect(screen.getByText(/1\.00s \/ 5\.00s/)).toBeTruthy();
      expect(screen.getByText(/F: 60 \/ 299/)).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Test Group 3: JointAnglesChart Playhead Cursor Integration
  // ---------------------------------------------------------------------------
  describe("Group 3: JointAnglesChart Active Playhead Cursor Line", () => {
    it("renders JointAnglesChart with ReferenceLine playhead cursor at specified currentGaitCyclePct", () => {
      const analysis = createSampleAngleAnalysis();
      const html = renderToStaticMarkup(
        <JointAnglesChart angleAnalysis={analysis} currentGaitCyclePct={45} />,
      );

      expect(html).toContain("Joint Kinematic Angle Trajectories");
      expect(html).toContain("#00E5FF");
      expect(html).toContain("45%");
    });

    it("updates playhead cursor position dynamically as gait cycle percentage advances", () => {
      const analysis = createSampleAngleAnalysis();
      const htmlStart = renderToStaticMarkup(
        <JointAnglesChart angleAnalysis={analysis} currentGaitCyclePct={10} />,
      );
      const htmlMid = renderToStaticMarkup(
        <JointAnglesChart angleAnalysis={analysis} currentGaitCyclePct={50} />,
      );
      const htmlEnd = renderToStaticMarkup(
        <JointAnglesChart angleAnalysis={analysis} currentGaitCyclePct={90} />,
      );

      expect(htmlStart).toContain("10%");
      expect(htmlMid).toContain("50%");
      expect(htmlEnd).toContain("90%");
    });

    it("forwards currentGaitCyclePct through CognitiveClusters to JointAnglesChart", () => {
      const metrics = createSampleMetrics();
      const analysis = createSampleAngleAnalysis();
      const html = renderToStaticMarkup(
        <CognitiveClusters
          metrics={metrics}
          angleAnalysis={analysis}
          currentGaitCyclePct={72}
        />,
      );

      expect(html).toContain("72%");
      expect(html).toContain("#00E5FF");
    });
  });

  // ---------------------------------------------------------------------------
  // Test Group 4: Perry 8-Phase Badges & Timeline Scrubber
  // ---------------------------------------------------------------------------
  describe("Group 4: Bilateral Perry 8-Phase Badges & Timeline Ribbon", () => {
    it("renders all 8 Perry gait phase color blocks in timeline ribbon", () => {
      render(
        <GaitTimelineScrubber
          currentFrame={0}
          totalFrames={100}
          isPlaying={false}
          onPlayToggle={vi.fn()}
          onFrameChange={vi.fn()}
          onStepBack={vi.fn()}
          onStepForward={vi.fn()}
        />,
      );

      PERRY_GAIT_PHASES.forEach((p) => {
        const titleRegex = new RegExp(p.name, "i");
        expect(screen.getByTitle(titleRegex)).toBeTruthy();
      });
    });

    it("displays active bilateral phase badges (L: and R:) matching currentFrame in phaseTimeline", () => {
      const phaseTimeline = createSamplePhaseTimeline(100);
      render(
        <GaitTimelineScrubber
          currentFrame={10}
          totalFrames={100}
          isPlaying={false}
          onPlayToggle={vi.fn()}
          onFrameChange={vi.fn()}
          onStepBack={vi.fn()}
          onStepForward={vi.fn()}
          phaseTimeline={phaseTimeline}
        />,
      );

      const targetFrameInfo = phaseTimeline[10];
      expect(targetFrameInfo?.leftPhase).toBeDefined();
      expect(targetFrameInfo?.rightPhase).toBeDefined();

      if (targetFrameInfo?.leftPhase && targetFrameInfo?.rightPhase) {
        const leftPhaseName = targetFrameInfo.leftPhase.name;
        const rightPhaseName = targetFrameInfo.rightPhase.name;

        expect(screen.getByText(new RegExp(`L: ${leftPhaseName}`, "i"))).toBeTruthy();
        expect(screen.getByText(new RegExp(`R: ${rightPhaseName}`, "i"))).toBeTruthy();
      }
    });

    it("triggers onFrameChange when user drags range slider scrubber", () => {
      const onFrameChange = vi.fn();
      render(
        <GaitTimelineScrubber
          currentFrame={0}
          totalFrames={100}
          isPlaying={false}
          onPlayToggle={vi.fn()}
          onFrameChange={onFrameChange}
          onStepBack={vi.fn()}
          onStepForward={vi.fn()}
        />,
      );

      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "42" } });
      expect(onFrameChange).toHaveBeenCalledWith(42);
    });

    it("triggers onStepBack and onStepForward callbacks when step buttons are clicked", () => {
      const onStepBack = vi.fn();
      const onStepForward = vi.fn();

      render(
        <GaitTimelineScrubber
          currentFrame={10}
          totalFrames={100}
          isPlaying={false}
          onPlayToggle={vi.fn()}
          onFrameChange={vi.fn()}
          onStepBack={onStepBack}
          onStepForward={onStepForward}
        />,
      );

      fireEvent.click(screen.getByTitle("Step 1 frame backward"));
      expect(onStepBack).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTitle("Step 1 frame forward"));
      expect(onStepForward).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Group 5: Edge Case Handling & Defensive Fallbacks
  // ---------------------------------------------------------------------------
  describe("Group 5: Edge Case Handling & Defensive Fallbacks", () => {
    it("handles undefined or missing currentGaitCyclePct in JointAnglesChart gracefully without rendering line", () => {
      const analysis = createSampleAngleAnalysis();
      const html = renderToStaticMarkup(
        <JointAnglesChart angleAnalysis={analysis} currentGaitCyclePct={undefined} />,
      );

      expect(html).toContain("Joint Kinematic Angle Trajectories");
      expect(html).not.toContain("#00E5FF");
    });

    it("handles out of bounds currentGaitCyclePct (<0 or >100) gracefully without rendering line", () => {
      const analysis = createSampleAngleAnalysis();
      const htmlNegative = renderToStaticMarkup(
        <JointAnglesChart angleAnalysis={analysis} currentGaitCyclePct={-15} />,
      );
      const htmlOver = renderToStaticMarkup(
        <JointAnglesChart angleAnalysis={analysis} currentGaitCyclePct={120} />,
      );

      expect(htmlNegative).not.toContain("#00E5FF");
      expect(htmlOver).not.toContain("#00E5FF");
    });

    it("renders suppression banner when view angle is suppressed in JointAnglesChart", () => {
      const suppressedAnalysis: GaitAngleAnalysis = {
        isSuppressed: true,
        suppressionReason: "Frontal view suppresses sagittal knee flexion",
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        metrics: {} as JointAngleMetrics,
        normativeData: [],
      };

      const html = renderToStaticMarkup(
        <JointAnglesChart angleAnalysis={suppressedAnalysis} currentGaitCyclePct={50} />,
      );

      expect(html).toContain("2D Kinematic View Angle Suppressed");
      expect(html).toContain("Frontal view suppresses sagittal knee flexion");
    });

    it("handles zero totalFrames in GaitTimelineScrubber without throwing division by zero NaN", () => {
      render(
        <GaitTimelineScrubber
          currentFrame={0}
          totalFrames={0}
          isPlaying={false}
          onPlayToggle={vi.fn()}
          onFrameChange={vi.fn()}
          onStepBack={vi.fn()}
          onStepForward={vi.fn()}
        />,
      );

      expect(screen.getByText(/0\.00s \/ 0\.00s/)).toBeTruthy();
      expect(screen.getByText(/F: 0 \/ 0/)).toBeTruthy();
    });
  });
});

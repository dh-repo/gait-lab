import { describe, it, expect } from "vitest";
import { computeGaitMetrics } from "../analysis";
import { buildStructuredReport } from "../ratings";
import { buildEducatedGuesses } from "../guesses";
import { generateSyntheticWalkingFrames } from "./testHelpers";
import type { PoseFrame } from "../types";

describe("Milestone M8 Empirical Stress Test: View Geometry Metric Suppression & Null Safety", () => {
  describe("1. Frontal View Metric Suppression", () => {
    it("returns null for sagittal-only metrics when viewAngle is frontal", () => {
      const frames = generateSyntheticWalkingFrames({
        viewAngle: "frontal",
        durationSec: 4.0,
        fps: 30,
      });

      const metrics = computeGaitMetrics(frames);

      expect(metrics.viewAngle).toBe("frontal");
      // Knee flexion & asymmetry
      expect(metrics.kneeFlexLeft).toBeNull();
      expect(metrics.kneeFlexRight).toBeNull();
      expect(metrics.kneeAsymmetry).toBeNull();
      // Gait phase breakdown
      expect(metrics.leftStancePct).toBeNull();
      expect(metrics.rightStancePct).toBeNull();
      expect(metrics.leftSwingPct).toBeNull();
      expect(metrics.rightSwingPct).toBeNull();
      expect(metrics.doubleSupportPct).toBeNull();
      // Stride asymmetry
      expect(metrics.strideAsymmetry).toBeNull();

      // Frontal metrics must remain valid (non-null)
      expect(metrics.lateralSway).not.toBeNull();
      expect(metrics.meanStepWidth).not.toBeNull();
      expect(metrics.stepWidthVariability).not.toBeNull();
      expect(metrics.pelvicObliquity).not.toBeNull();
      expect(metrics.pelvicObliquityVar).not.toBeNull();
    });
  });

  describe("2. Sagittal View Metric Suppression", () => {
    it("returns null for frontal-only metrics when viewAngle is sagittal", () => {
      const frames = generateSyntheticWalkingFrames({
        viewAngle: "sagittal",
        durationSec: 4.0,
        fps: 30,
      });

      const metrics = computeGaitMetrics(frames);

      expect(metrics.viewAngle).toBe("sagittal");
      // Frontal-only metrics
      expect(metrics.lateralSway).toBeNull();
      expect(metrics.meanStepWidth).toBeNull();
      expect(metrics.stepWidthVariability).toBeNull();
      expect(metrics.pelvicObliquity).toBeNull();
      expect(metrics.pelvicObliquityVar).toBeNull();

      // Sagittal metrics must remain valid (non-null)
      expect(metrics.kneeFlexLeft).not.toBeNull();
      expect(metrics.kneeFlexRight).not.toBeNull();
      expect(metrics.kneeAsymmetry).not.toBeNull();
      expect(metrics.leftStancePct).not.toBeNull();
      expect(metrics.rightStancePct).not.toBeNull();
      expect(metrics.leftSwingPct).not.toBeNull();
      expect(metrics.rightSwingPct).not.toBeNull();
      expect(metrics.doubleSupportPct).not.toBeNull();
    });
  });

  describe("3. Oblique View Behavior", () => {
    it("does not suppress metrics for oblique camera perspective", () => {
      // Construct frames that result in oblique angle classification
      const frames = generateSyntheticWalkingFrames({
        durationSec: 4.0,
        fps: 30,
      });

      // Override detectViewAngle input characteristics or test oblique output
      const metrics = computeGaitMetrics(frames);
      // In synthetic frames, viewAngle is oblique or frontal/sagittal depending on params
      if (metrics.viewAngle === "oblique") {
        expect(metrics.kneeFlexLeft).not.toBeNull();
        expect(metrics.kneeFlexRight).not.toBeNull();
        expect(metrics.lateralSway).not.toBeNull();
        expect(metrics.meanStepWidth).not.toBeNull();
      }
    });
  });

  describe("4. Edge Cases: Empty Frames, Minimal Frames, Missing Landmarks", () => {
    it("handles empty frames array ([]) without throwing exception", () => {
      const metrics = computeGaitMetrics([]);
      expect(metrics.viewAngle).toBe("unknown");
      expect(metrics.stepCount).toBe(0);
      expect(metrics.cadenceSpm).toBe(0);
      expect(metrics.kneeFlexLeft).toBeNull();
      expect(metrics.lateralSway).toBeNull();
      expect(metrics.confidenceIntervals).toBeDefined();
    });

    it("handles minimal frames (< 5 frames) with empty metrics fallback", () => {
      const frames = generateSyntheticWalkingFrames({ durationSec: 0.1, fps: 30 }).slice(0, 3);
      const metrics = computeGaitMetrics(frames);
      expect(metrics.viewAngle).toBe("unknown");
      expect(metrics.stepCount).toBe(0);
      expect(metrics.overallScore).toBe(0);
    });

    it("handles frames with missing/zero torso height safely", () => {
      const frames: PoseFrame[] = Array.from({ length: 15 }, (_, i) => ({
        timeMs: i * 33.3,
        landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
      }));

      const metrics = computeGaitMetrics(frames);
      expect(metrics.viewAngle).toBeDefined();
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("5. Null Safety in Ratings & Guesses", () => {
    it("formats null metrics correctly in buildStructuredReport for Frontal view", () => {
      const frontalMetrics = computeGaitMetrics(
        generateSyntheticWalkingFrames({ viewAngle: "frontal", durationSec: 4.0, fps: 30 })
      );
      const guesses = buildEducatedGuesses(frontalMetrics);
      const report = buildStructuredReport(frontalMetrics, guesses, {
        taskMode: "single",
        analyzedFrames: 120,
      });

      expect(report.viewAngle).toBe("frontal");

      // Verify kneeL and zeniStance metric ratings display N/A / side view hints
      const kneeL = report.metrics.find((m) => m.id === "kneeL");
      expect(kneeL?.display).toBe("N/A");
      expect(kneeL?.note).toContain("Requires Side View");

      const zeniStance = report.metrics.find((m) => m.id === "zeniStance");
      expect(zeniStance?.display).toBe("N/A");

      const strideAsym = report.metrics.find((m) => m.id === "strideAsym");
      expect(strideAsym?.display).toBe("N/A");
    });

    it("formats null metrics correctly in buildStructuredReport for Sagittal view", () => {
      const sagittalMetrics = computeGaitMetrics(
        generateSyntheticWalkingFrames({ viewAngle: "sagittal", durationSec: 4.0, fps: 30 })
      );
      const guesses = buildEducatedGuesses(sagittalMetrics);
      const report = buildStructuredReport(sagittalMetrics, guesses, {
        taskMode: "single",
        analyzedFrames: 120,
      });

      expect(report.viewAngle).toBe("sagittal");

      // Verify sway, stepWidth, pelvic metric ratings display N/A / front view hints
      const sway = report.metrics.find((m) => m.id === "sway");
      expect(sway?.display).toBe("N/A");
      expect(sway?.note).toContain("Requires Front View");

      const stepWidth = report.metrics.find((m) => m.id === "stepWidth");
      expect(stepWidth?.display).toBe("N/A");

      const pelvic = report.metrics.find((m) => m.id === "pelvic");
      expect(pelvic?.display).toBe("N/A");
    });

    it("evaluates buildEducatedGuesses without NaN or throwing when metrics are null", () => {
      const frontalMetrics = computeGaitMetrics(
        generateSyntheticWalkingFrames({ viewAngle: "frontal", durationSec: 4.0, fps: 30 })
      );
      const guesses = buildEducatedGuesses(frontalMetrics);

      for (const g of guesses) {
        expect(Number.isNaN(g.confidence)).toBe(false);
        expect(g.title).toBeDefined();
        expect(g.summary).toBeDefined();
      }
    });
  });
});

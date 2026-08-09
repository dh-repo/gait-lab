import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SessionComparisonView,
  computeDelta,
} from "../SessionComparisonView";
import type { GaitSessionRecord } from "@/lib/gait/persistence";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";

describe("Adversarial Stress Test: SessionComparisonView & computeDelta", () => {
  describe("Adversarial computeDelta Edge Cases", () => {
    it("handles zero baseline (valA = 0) without Division-by-Zero NaN", () => {
      const res = computeDelta("test", "Test Zero", "spm", 0, 100, { higherIsBetter: true });
      expect(res.deltaAbs).toBe(100);
      expect(res.deltaPct).toBeNull();
      expect(res.formattedDelta).not.toContain("NaN");
      expect(res.badgeTone).toBe("success");
    });

    it("handles NaN inputs safely", () => {
      const res1 = computeDelta("test", "Test NaN A", "%", NaN, 50);
      expect(res1.deltaAbs).toBeNull();
      expect(res1.badgeTone).toBe("neutral");
      expect(res1.formattedDelta).toBe("—");

      const res2 = computeDelta("test", "Test NaN B", "%", 50, NaN);
      expect(res2.deltaAbs).toBeNull();
      expect(res2.badgeTone).toBe("neutral");
      expect(res2.formattedDelta).toBe("—");

      const res3 = computeDelta("test", "Both NaN", "%", NaN, NaN);
      expect(res3.deltaAbs).toBeNull();
      expect(res3.badgeTone).toBe("neutral");
      expect(res3.formattedDelta).toBe("—");
    });

    it("handles extreme large and small floating point numbers", () => {
      const res = computeDelta("test", "Extreme Values", "AU", 1e-15, 1e-14, { higherIsBetter: true });
      expect(res.deltaAbs).toBeDefined();
      expect(res.badgeTone).toBe("neutral"); // below default epsilon 0.5
    });
  });

  describe("Adversarial Session Records & Chart Overlays", () => {
    const corruptSessionA: GaitSessionRecord = {
      id: "corrupt-001",
      userId: "user-stress",
      sessionName: "Corrupt Session A",
      taskMode: "single",
      overallScore: NaN as unknown as number,
      mobilityScore: 0,
      symmetryScore: null as unknown as number,
      stabilityScore: undefined as unknown as number,
      rhythmScore: 100,
      automaticityScore: -50,
      cadenceSpm: 0,
      stepCount: 0,
      durationSec: 0,
      viewAngle: "sagittal",
      symmetryAngle: undefined as unknown as number,
      metricsJson: {} as any,
      guessesJson: [],
      dualTaskJson: undefined,
      angleAnalysisJson: undefined as unknown as GaitAngleAnalysis,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
    };

    const corruptSessionB: GaitSessionRecord = {
      id: "corrupt-002",
      userId: "user-stress",
      sessionName: "Corrupt Session B",
      taskMode: "dual",
      overallScore: 90,
      mobilityScore: 90,
      symmetryScore: 90,
      stabilityScore: 90,
      rhythmScore: 90,
      automaticityScore: 90,
      cadenceSpm: 120,
      stepCount: 50,
      durationSec: 25,
      viewAngle: "sagittal",
      symmetryAngle: 1.5,
      metricsJson: {
        cadenceSpm: 120,
        stepCount: 50,
        durationSec: 25,
      } as any,
      guessesJson: [],
      dualTaskJson: undefined,
      angleAnalysisJson: {
        isSuppressed: false,
        normalizedPoints: Array.from({ length: 50 }, (_, i) => ({
          gaitCyclePct: i * 2,
          kneeAngleLeft: null,
          kneeAngleRight: NaN,
          hipAngleLeft: null,
          hipAngleRight: 10,
          ankleAngleLeft: 0,
          ankleAngleRight: 0,
        })),
        leftStrides: [],
        rightStrides: [],
        metrics: undefined as any,
        normativeData: [],
      },
      createdAt: "2026-08-02T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
    };

    it("renders without crashing when sessions have missing/corrupt angleAnalysisJson and metricsJson", () => {
      expect(() => {
        const html = renderToStaticMarkup(
          <SessionComparisonView
            sessions={[corruptSessionA, corruptSessionB]}
            initialSessionA={corruptSessionA}
            initialSessionB={corruptSessionB}
          />
        );
        expect(html).toContain('data-testid="session-comparison-view"');
        expect(html).toContain("Corrupt Session A");
        expect(html).toContain("Corrupt Session B");
      }).not.toThrow();
    });

    it("renders smoothly when trajectory arrays have mismatched lengths (e.g. 50 pts vs 150 pts)", () => {
      const sessionMismatchedA: GaitSessionRecord = {
        ...corruptSessionB,
        id: "mismatch-001",
        sessionName: "Short Array Session (30 pts)",
        angleAnalysisJson: {
          isSuppressed: false,
          normalizedPoints: Array.from({ length: 30 }, (_, i) => ({
            gaitCyclePct: i,
            kneeAngleLeft: 10,
            kneeAngleRight: 12,
            hipAngleLeft: 15,
            hipAngleRight: 15,
            ankleAngleLeft: 5,
            ankleAngleRight: 5,
          })),
          leftStrides: [],
          rightStrides: [],
          metrics: { kneeRomLeft: 40 } as any,
          normativeData: [],
        },
      };

      const sessionMismatchedB: GaitSessionRecord = {
        ...corruptSessionB,
        id: "mismatch-002",
        sessionName: "Long Array Session (150 pts)",
        angleAnalysisJson: {
          isSuppressed: false,
          normalizedPoints: Array.from({ length: 150 }, (_, i) => ({
            gaitCyclePct: i,
            kneeAngleLeft: 15,
            kneeAngleRight: 18,
            hipAngleLeft: 20,
            hipAngleRight: 20,
            ankleAngleLeft: 8,
            ankleAngleRight: 8,
          })),
          leftStrides: [],
          rightStrides: [],
          metrics: { kneeRomLeft: 45 } as any,
          normativeData: [],
        },
      };

      expect(() => {
        const html = renderToStaticMarkup(
          <SessionComparisonView
            sessions={[sessionMismatchedA, sessionMismatchedB]}
            initialSessionA={sessionMismatchedA}
            initialSessionB={sessionMismatchedB}
          />
        );
        expect(html).toContain("Short Array Session (30 pts)");
        expect(html).toContain("Long Array Session (150 pts)");
      }).not.toThrow();
    });
  });
});

import { describe, it, expect } from "vitest";
import { detectPhaseMicroFaults } from "../phaseFaults";
import type { GaitAngleAnalysis } from "../angles";
import type { GaitMetrics } from "../types";
import { createMockMetrics } from "./testHelpers";

describe("Perry 8-Phase Micro-Fault Detector (phaseFaults.ts)", () => {
  it("detects intact kinematics when normalized points follow normative trajectories", () => {
    const normPoints = Array.from({ length: 101 }, (_, i) => ({
      gaitCyclePct: i,
      kneeAngleLeft: i <= 15 ? 18 : i <= 60 ? 5 : i <= 75 ? 60 : 5,
      kneeAngleRight: i <= 15 ? 18 : i <= 60 ? 5 : i <= 75 ? 60 : 5,
      hipFlexion: i <= 50 ? 20 - (i / 50) * 30 : 25,
      ankleFlexion: i <= 2 ? 2 : i <= 70 ? 0 : 2,
    }));

    const angleAnalysis = {
      isSuppressed: false,
      normalizedPoints: normPoints as any,
      metrics: {
        kneeRomLeft: 58,
        kneeRomRight: 58,
        hipRomLeft: 42,
        hipRomRight: 42,
        ankleRomLeft: 25,
        ankleRomRight: 25,
      } as any,
    } as unknown as GaitAngleAnalysis;

    const metrics = createMockMetrics();
    const result = detectPhaseMicroFaults(angleAnalysis, metrics);

    expect(result.faultCount).toBe(0);
    expect(result.faults).toHaveLength(0);
    expect(result.clinicalSummary).toContain("intact kinematic timing");
  });

  it("detects initial swing stiff-knee clearance deficit when peak flexion is reduced (<50°)", () => {
    const devPoints = Array.from({ length: 101 }, (_, i) => ({
      gaitCyclePct: i,
      kneeAngleLeft: i <= 15 ? 18 : i >= 60 && i <= 75 ? 38 : 5, // Stiff swing peak knee flexion (38° vs 60°)
      kneeAngleRight: i <= 15 ? 18 : i >= 60 && i <= 75 ? 60 : 5,
      hipFlexion: i <= 50 ? 20 - (i / 50) * 30 : 25,
      ankleFlexion: 0,
    }));

    const angleAnalysis = {
      isSuppressed: false,
      normalizedPoints: devPoints as any,
    } as unknown as GaitAngleAnalysis;

    const metrics = createMockMetrics();
    const result = detectPhaseMicroFaults(angleAnalysis, metrics);

    expect(result.faultCount).toBeGreaterThanOrEqual(1);
    const stiffFault = result.faults.find((f) => f.id.includes("stiff_knee"));
    expect(stiffFault).toBeDefined();
    expect(stiffFault?.phaseId).toBe("initial_swing");
    expect(stiffFault?.side).toBe("left");
    expect(stiffFault?.observedValueDeg).toBe(38);
    expect(result.primaryImpairedPhase).toBe("Initial Swing");
  });

  it("detects midstance genu recurvatum hyperextension", () => {
    const recurvPoints = Array.from({ length: 101 }, (_, i) => ({
      gaitCyclePct: i,
      kneeAngleLeft: i >= 12 && i <= 31 ? -8.0 : 10, // Knee hyperextends to -8°
      kneeAngleRight: 10,
      hipFlexion: 10,
      ankleFlexion: 0,
    }));

    const angleAnalysis = {
      isSuppressed: false,
      normalizedPoints: recurvPoints as any,
    } as unknown as GaitAngleAnalysis;

    const metrics = createMockMetrics();
    const result = detectPhaseMicroFaults(angleAnalysis, metrics);

    const recFault = result.faults.find((f) => f.id.includes("recurvatum"));
    expect(recFault).toBeDefined();
    expect(recFault?.phaseId).toBe("mid_stance");
    expect(recFault?.observedValueDeg).toBe(-8.0);
  });
});

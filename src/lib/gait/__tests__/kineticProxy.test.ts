import { describe, it, expect } from "vitest";
import { estimateKineticLoadingProxy } from "../kineticProxy";
import { createMockMetrics } from "./testHelpers";

describe("Vertical Ground Reaction Force & Kinetic Loading Proxy (kineticProxy.ts)", () => {
  it("reconstructs continuous 101-point bimodal M-wave GRF curve", () => {
    const metrics = createMockMetrics({
      gaitSpeedMps: 1.25,
      leftStancePct: 60.0,
      rightStancePct: 60.0,
      symmetryAngle: 2.0,
    });

    const result = estimateKineticLoadingProxy(metrics);

    expect(result.grfWaveform).toHaveLength(101);
    expect(result.leftPeakImpact_BW).toBeGreaterThan(1.0);
    expect(result.leftPeakPushOff_BW).toBeGreaterThan(1.0);
    expect(result.loadingAsymmetryIndexPct).toBeLessThan(5.0);
    expect(result.clinicalInterpretation).toContain("symmetrical bimodal M-waves");
  });

  it("calculates elevated loading asymmetry when single-limb stance is favored", () => {
    const asymmetricMetrics = createMockMetrics({
      gaitSpeedMps: 1.10,
      leftStancePct: 50.0,
      rightStancePct: 66.0,
      symmetryAngle: 14.0,
    });

    const result = estimateKineticLoadingProxy(asymmetricMetrics);

    expect(result.loadingAsymmetryIndexPct).toBeGreaterThan(10.0);
    expect(result.clinicalInterpretation).toContain("Elevated loading asymmetry");
  });
});

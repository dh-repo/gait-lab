import { describe, it, expect } from "vitest";
import { calculateDTE } from "../dte";
import { createMockMetrics } from "./testHelpers";

describe("Dual-Task Effect Module (dte.ts)", () => {
  it("calculates negative DTE (cost) and mutual_interference when both cadence and CV degrade", () => {
    const baseline = createMockMetrics({ cadenceSpm: 100.0, stepTimeCV: 0.04 });
    const dualTask = createMockMetrics({ cadenceSpm: 90.0, stepTimeCV: 0.08 });

    const result = calculateDTE(baseline, dualTask);

    expect(result.cadenceDTE).toBe(-10.0);
    expect(result.stepTimeCvDTE).toBe(-100.0);
    expect(result.cmiClassification).toBe("mutual_interference");
  });

  it("classifies cognitive_prioritization when cadence degrades but CV remains constant", () => {
    const baseline = createMockMetrics({ cadenceSpm: 100.0, stepTimeCV: 0.04 });
    const dualTask = createMockMetrics({ cadenceSpm: 92.0, stepTimeCV: 0.04 });

    const result = calculateDTE(baseline, dualTask);

    expect(result.cadenceDTE).toBe(-8.0);
    expect(result.stepTimeCvDTE).toBe(0.0);
    expect(result.cmiClassification).toBe("cognitive_prioritization");
  });

  it("classifies cognitive_prioritization when CV degrades but cadence is unchanged", () => {
    const baseline = createMockMetrics({ cadenceSpm: 100.0, stepTimeCV: 0.04 });
    const dualTask = createMockMetrics({ cadenceSpm: 100.0, stepTimeCV: 0.06 });

    const result = calculateDTE(baseline, dualTask);

    expect(result.cadenceDTE).toBe(0.0);
    expect(result.stepTimeCvDTE).toBe(-50.0);
    expect(result.cmiClassification).toBe("cognitive_prioritization");
  });

  it("classifies motor_prioritization when cadence increases by > 5%", () => {
    const baseline = createMockMetrics({ cadenceSpm: 100.0, stepTimeCV: 0.04 });
    const dualTask = createMockMetrics({ cadenceSpm: 110.0, stepTimeCV: 0.04 });

    const result = calculateDTE(baseline, dualTask);

    expect(result.cadenceDTE).toBe(10.0);
    expect(result.cmiClassification).toBe("motor_prioritization");
  });

  it("classifies motor_prioritization when stepTimeCvDTE > 5% even if cadence DTE <= 5%", () => {
    const baseline = createMockMetrics({ cadenceSpm: 100.0, stepTimeCV: 0.05 });
    const dualTask = createMockMetrics({ cadenceSpm: 100.0, stepTimeCV: 0.04 });

    const result = calculateDTE(baseline, dualTask);

    expect(result.stepTimeCvDTE).toBe(20.0);
    expect(result.cmiClassification).toBe("motor_prioritization");
  });

  it("classifies no_interference when dual task changes are within +/- 5%", () => {
    const baseline = createMockMetrics({ cadenceSpm: 100.0, stepTimeCV: 0.04 });
    const dualTask = createMockMetrics({ cadenceSpm: 98.0, stepTimeCV: 0.041 });

    const result = calculateDTE(baseline, dualTask);

    expect(result.cmiClassification).toBe("no_interference");
  });

  it("verifies exact boundary threshold behavior at -5.0% and +5.0%", () => {
    const baseline = createMockMetrics({ cadenceSpm: 100.0, stepTimeCV: 0.04 });

    // Exact -5.0% cadence change -> no_interference
    const dualBoundaryNeg = createMockMetrics({ cadenceSpm: 95.0, stepTimeCV: 0.04 });
    expect(calculateDTE(baseline, dualBoundaryNeg).cmiClassification).toBe("no_interference");

    // -5.1% cadence change -> cognitive_prioritization
    const dualJustNeg = createMockMetrics({ cadenceSpm: 94.8, stepTimeCV: 0.04 });
    expect(calculateDTE(baseline, dualJustNeg).cmiClassification).toBe("cognitive_prioritization");

    // Exact +5.0% cadence change -> no_interference
    const dualBoundaryPos = createMockMetrics({ cadenceSpm: 105.0, stepTimeCV: 0.04 });
    expect(calculateDTE(baseline, dualBoundaryPos).cmiClassification).toBe("no_interference");

    // +5.1% cadence change -> motor_prioritization
    const dualJustPos = createMockMetrics({ cadenceSpm: 105.2, stepTimeCV: 0.04 });
    expect(calculateDTE(baseline, dualJustPos).cmiClassification).toBe("motor_prioritization");
  });

  it("calculates symmetryDTE and lower-is-better metric sign inversion", () => {
    const baseline = createMockMetrics({ symmetryScore: 80.0, stepTimeCV: 0.04 });
    const dualTask = createMockMetrics({ symmetryScore: 90.0, stepTimeCV: 0.02 });

    const result = calculateDTE(baseline, dualTask);

    // Symmetry higher is better -> (90 - 80) / 80 * 100 = 12.5%
    expect(result.symmetryDTE).toBe(12.5);

    // Step time CV lower is better -> - (0.02 - 0.04) / 0.04 * 100 = +50.0%
    expect(result.stepTimeCvDTE).toBe(50.0);
  });

  it("uses fallbacks when baselines are near zero", () => {
    const baselineZero = createMockMetrics({
      cadenceSpm: 0,
      stepTimeCV: 0,
      symmetryScore: 0,
    });
    const dualTask = createMockMetrics({
      cadenceSpm: 100,
      stepTimeCV: 0.08,
      symmetryScore: 88.0,
    });

    const result = calculateDTE(baselineZero, dualTask);

    expect(result.cadenceDTE).toBe(0.0);
    // Base CV fallback 0.05 -> - (0.08 - 0.05) / 0.05 * 100 = -60.0%
    expect(result.stepTimeCvDTE).toBe(-60.0);
    // Base symmetry fallback 80.0 -> (88 - 80) / 80 * 100 = 10.0%
    expect(result.symmetryDTE).toBe(10.0);
  });

  it("clamps stepTimeCvDTE to [-100.0%, +100.0%] range", () => {
    const baseline = createMockMetrics({ stepTimeCV: 0.02 });
    // Extreme CV increase: - (0.10 - 0.02) / 0.02 * 100 = -400% -> clamped to -100.0%
    const extremeIncrease = createMockMetrics({ stepTimeCV: 0.10 });
    const resIncrease = calculateDTE(baseline, extremeIncrease);
    expect(resIncrease.stepTimeCvDTE).toBe(-100.0);

    // Extreme CV decrease: - (0.001 - 0.05) / 0.05 * 100 = +98% (clamped to <= 100%)
    const extremeDecrease = createMockMetrics({ stepTimeCV: 0.0001 });
    const resDecrease = calculateDTE(baseline, extremeDecrease);
    expect(resDecrease.stepTimeCvDTE).toBeLessThanOrEqual(100.0);
    expect(resDecrease.stepTimeCvDTE).toBeGreaterThanOrEqual(-100.0);
  });
});

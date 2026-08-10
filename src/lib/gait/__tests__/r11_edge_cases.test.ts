import { describe, it, expect } from "vitest";
import { hungarianAlgorithm } from "../analysis";
import {
  OneEuroFilter,
  computeSgWindowSize,
  savitzkyGolayAdaptive,
  kalmanFilter1D,
  kalmanFilter2D,
} from "../signal";
import {
  computePatientBaseline,
  detectAcuteWeaknessAnomalies,
} from "../fallrisk";
import {
  getNormativeReference,
  evaluateGaitNormatives,
} from "../normatives";
import { symmetryAngle, gaitSymmetryIndex } from "../symmetry";
import { calculateDTE } from "../dte";
import type { GaitMetrics } from "../types";

function createMockMetrics(overrides?: Partial<GaitMetrics>): GaitMetrics {
  return {
    viewAngle: "sagittal",
    viewConfidence: 0.95,
    fpsEffective: 30,
    avgStepTimeSec: 0.545,
    strideAsymmetry: 0.02,
    pathSmoothness: 0.95,
    series: [
      { t: 0, midHipX: 0.5, midHipY: 0.5, leftAnkleY: 0.9, rightAnkleY: 0.9, leftWristX: 0.38, rightWristX: 0.62, leftKneeAngle: 170, rightKneeAngle: 170 },
    ],
    stepEvents: [
      { frame: 10, timeSec: 0.33, type: "heel_strike", side: "left" },
    ],
    cadenceSpm: 112,
    stepCount: 18,
    durationSec: 9.6,
    gaitSpeedMps: 1.25,
    stepLength: 0.67,
    stepLengthLeft: 0.67,
    stepLengthRight: 0.67,
    stepTimeCV: 0.025,
    strideTimeCV: 0.025,
    stepTimeAsymmetry: 0.02,
    symmetryAngle: 2.2,
    leftStancePct: 60.5,
    rightStancePct: 60.5,
    doubleSupportPct: 21.0,
    doubleSupportHint: 0.21,
    lateralSway: 0.035,
    verticalBounce: 0.025,
    meanStepWidth: 0.15,
    stepWidthVariability: 0.015,
    pelvicObliquity: 0.02,
    pelvicObliquityVar: 0.008,
    armSwingLeft: 0.22,
    armSwingRight: 0.22,
    armSwingAsymmetry: 0.04,
    kneeFlexLeft: 58.0,
    kneeFlexRight: 58.0,
    kneeAsymmetry: 0.04,
    automaticityScore: 88,
    stabilityScore: 88,
    symmetryScore: 88,
    rhythmScore: 88,
    mobilityScore: 88,
    overallScore: 88,
    ...overrides,
  };
}

describe("R11 - Hungarian Algorithm Edge Cases (analysis.ts)", () => {
  it("returns empty array for 0x0 matrix", () => {
    expect(hungarianAlgorithm([])).toEqual([]);
  });

  it("handles 1x1 cost matrix correctly", () => {
    const cost = [[5]];
    const assignment = hungarianAlgorithm(cost);
    expect(assignment).toEqual([0]);
  });

  it("handles square 3x3 cost matrix", () => {
    const cost = [
      [10, 19, 8],
      [15, 18, 12],
      [14, 15, 10],
    ];
    // Row 0 -> col 2 (8), Row 1 -> col 0 (15) or col 1 (18), Row 2 -> col 1 (15) or col 2
    const assignment = hungarianAlgorithm(cost);
    expect(assignment.length).toBe(3);
    expect(assignment[0]).toBe(2); // 8 is min in row 0
  });

  it("handles large sentinel costs (e.g. 1e9) without precision overflow", () => {
    const INF = 1e9;
    const cost = [
      [1.0, INF, INF],
      [INF, 2.0, INF],
      [INF, INF, 3.0],
    ];
    const assignment = hungarianAlgorithm(cost);
    expect(assignment).toEqual([0, 1, 2]);
  });

  it("handles rectangular non-square cost matrices (more rows than cols or vice versa)", () => {
    const costRect = [
      [2, 9],
      [1, 8],
      [7, 3],
    ];
    const assignment = hungarianAlgorithm(costRect);
    expect(assignment.length).toBe(3);
  });
});

describe("R11 - Kalman 2-State Edge Cases (signal.ts)", () => {
  it("returns zeros for all-NaN signal", () => {
    const nanSignal = [NaN, NaN, NaN, NaN];
    const res = kalmanFilter1D(nanSignal);
    expect(res.position).toEqual([0, 0, 0, 0]);
    expect(res.velocity).toEqual([0, 0, 0, 0]);
  });

  it("handles initial occlusion and initializes at first finite index", () => {
    const signal = [NaN, NaN, 5.0, 6.0, 7.0];
    const res = kalmanFilter1D(signal);
    expect(res.position[0]).toBe(0);
    expect(res.position[1]).toBe(0);
    expect(res.position[2]).toBe(5.0);
    expect(res.position[4]).toBeCloseTo(7.0, 0);
  });

  it("tracks velocity sign reversal smoothly", () => {
    // Moving positive then negative
    const signal = [0, 2, 4, 6, 8, 6, 4, 2, 0];
    const res = kalmanFilter1D(signal);
    expect(res.velocity[2]).toBeGreaterThan(0);
    expect(res.velocity[7]).toBeLessThan(0);
  });

  it("kalmanFilter2D returns explicit position and velocity arrays", () => {
    const res = kalmanFilter2D([1, 2, 3, 4, 5]);
    expect(res.position).toBeDefined();
    expect(res.velocity).toBeDefined();
    expect(res.position.length).toBe(5);
    expect(res.velocity.length).toBe(5);
  });
});

describe("R11 - Adaptive Savitzky-Golay at 24/50/90/144/240 FPS & Short Signals (signal.ts)", () => {
  it("computeSgWindowSize maps FPS correctly across target frame rates", () => {
    expect(computeSgWindowSize(24)).toBe(5);
    expect(computeSgWindowSize(50)).toBe(9);
    expect(computeSgWindowSize(90)).toBe(15);
    expect(computeSgWindowSize(144)).toBe(15);
    expect(computeSgWindowSize(240)).toBe(15);
  });

  it("handles short signals (N < window) by returning signal clean and uncorrupted", () => {
    const shortSignal = [1.5, 2.5, 3.5];
    const res = savitzkyGolayAdaptive(shortSignal, 50); // window size = 9 > 3
    expect(res).toEqual([1.5, 2.5, 3.5]);
  });
});

describe("R11 - OneEuroFilter Deep Edge Cases (signal.ts)", () => {
  it("smooths sudden step inputs without overshoot", () => {
    const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0);
    const stepOutput: number[] = [];
    for (let i = 0; i < 5; i++) stepOutput.push(filter.filter(0));
    for (let i = 0; i < 15; i++) stepOutput.push(filter.filter(100));

    expect(stepOutput[5]).toBeLessThan(100);
    expect(stepOutput[19]).toBeCloseTo(100, 0);
  });

  it("supports VFR timestamps and reset sequence", () => {
    const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0);
    filter.filter(10, 0.0);
    filter.filter(20, 0.04);
    filter.filter(30, 0.08);

    filter.reset();
    expect(filter.filter(50, 1.0)).toBe(50);
  });

  it("returns xPrev for NaN or non-finite input", () => {
    const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0);
    filter.filter(42.0);
    expect(filter.filter(NaN)).toBe(42.0);
    expect(filter.filter(Infinity)).toBe(42.0);
  });
});

describe("R11 - Acute Weakness Rules & Clinical Warning Cards (fallrisk.ts)", () => {
  it("Rule 1: SPEED_DROP_ACUTE triggers when speed drops >20% below baseline with speed < 0.85", () => {
    const baseline = computePatientBaseline([
      { metricsJson: createMockMetrics({ gaitSpeedMps: 1.20 }) },
      { metricsJson: createMockMetrics({ gaitSpeedMps: 1.20 }) },
    ] as any);
    const current = createMockMetrics({ gaitSpeedMps: 0.70 });
    const res = detectAcuteWeaknessAnomalies(current, baseline);

    const flag = res.spikeFlags.find((f) => f.ruleId === "SPEED_DROP_ACUTE");
    expect(flag).toBeDefined();
    expect(flag?.percentChange).toBeLessThan(-20);
    expect(flag?.clinicalSignificance).toContain("acute systemic motor fatigue");
  });

  it("Rule 2: SWAY_SPIKE_ACUTE triggers when sway increases >30% above baseline with sway > 0.08", () => {
    const baseline = computePatientBaseline([
      { metricsJson: createMockMetrics({ lateralSway: 0.04 }) },
      { metricsJson: createMockMetrics({ lateralSway: 0.04 }) },
    ] as any);
    const current = createMockMetrics({ lateralSway: 0.09 });
    const res = detectAcuteWeaknessAnomalies(current, baseline);

    const flag = res.spikeFlags.find((f) => f.ruleId === "SWAY_SPIKE_ACUTE");
    expect(flag).toBeDefined();
    expect(flag?.clinicalSignificance).toContain("acute cerebellar ataxia");
  });

  it("Rule 3: IRREGULARITY_BURST_ACUTE triggers when CV jumps >50% and CV > 7.0%", () => {
    const baseline = computePatientBaseline([
      { metricsJson: createMockMetrics({ stepTimeCV: 0.03 }) }, // 3.0%
      { metricsJson: createMockMetrics({ stepTimeCV: 0.03 }) },
    ] as any);
    const current = createMockMetrics({ stepTimeCV: 0.08 }); // 8.0% (>50% jump & > 7%)
    const res = detectAcuteWeaknessAnomalies(current, baseline);

    const flag = res.spikeFlags.find((f) => f.ruleId === "IRREGULARITY_BURST_ACUTE");
    expect(flag).toBeDefined();
    expect(flag?.clinicalSignificance).toContain("encephalopathy");
  });

  it("Rule 4: DOUBLE_SUPPORT_ESCALATION triggers when DST escalates >25% and DST > 35%", () => {
    const baseline = computePatientBaseline([
      { metricsJson: createMockMetrics({ doubleSupportPct: 20.0 }) },
      { metricsJson: createMockMetrics({ doubleSupportPct: 20.0 }) },
    ] as any);
    const current = createMockMetrics({ doubleSupportPct: 38.0 });
    const res = detectAcuteWeaknessAnomalies(current, baseline);

    const flag = res.spikeFlags.find((f) => f.ruleId === "DOUBLE_SUPPORT_ESCALATION");
    expect(flag).toBeDefined();
    expect(flag?.clinicalSignificance).toContain("postural instability");
  });

  it("Rule 5: ASYMMETRY_SPIKE_ACUTE triggers when SA increases >4.0% absolute or >100% relative", () => {
    const baseline = computePatientBaseline([
      { metricsJson: createMockMetrics({ symmetryAngle: 2.0 }) },
      { metricsJson: createMockMetrics({ symmetryAngle: 2.0 }) },
    ] as any);
    const current = createMockMetrics({ symmetryAngle: 7.0 }); // +5.0% absolute
    const res = detectAcuteWeaknessAnomalies(current, baseline);

    const flag = res.spikeFlags.find((f) => f.ruleId === "ASYMMETRY_SPIKE_ACUTE");
    expect(flag).toBeDefined();
    expect(flag?.clinicalSignificance).toContain("TIA / acute stroke");
  });

  it("synthesizes baseline concordant warning card when no anomalies are detected", () => {
    const baseline = computePatientBaseline([
      { metricsJson: createMockMetrics() },
      { metricsJson: createMockMetrics() },
    ] as any);
    const current = createMockMetrics();
    const res = detectAcuteWeaknessAnomalies(current, baseline);
    expect(res.hasAcuteWeakness).toBe(false);
    expect(res.warningCards[0].id).toBe("card_baseline_concordant");
  });
});

describe("R11 - Normative Lookup per Age Tier & Out-of-Bounds Metrics (normatives.ts)", () => {
  it("evaluates boundary ages 17, 18, 49, 50, 64, 65, 74, 75, 84, 85", () => {
    expect(getNormativeReference("cadenceSpm", 17).citation).toBe("Bovi et al. (2011)");
    expect(getNormativeReference("cadenceSpm", 18).citation).toBe("Bovi et al. (2011)");
    expect(getNormativeReference("cadenceSpm", 49).citation).toBe("Bovi et al. (2011)");
    expect(getNormativeReference("cadenceSpm", 50).citation).toBe("Bovi et al. (2011)");
    expect(getNormativeReference("cadenceSpm", 64).citation).toBe("Bovi et al. (2011)");
    expect(getNormativeReference("cadenceSpm", 65).citation).toBe("Bovi et al. (2011)");
    expect(getNormativeReference("cadenceSpm", 74).citation).toBe("Bovi et al. (2011)");
    expect(getNormativeReference("cadenceSpm", 75).citation).toBe("Bovi et al. (2011)");
    expect(getNormativeReference("cadenceSpm", 84).citation).toBe("Bovi et al. (2011)");
    expect(getNormativeReference("cadenceSpm", 85).citation).toBe("Bovi et al. (2011)");
  });

  it("evaluates out-of-bounds metrics cleanly without throwing NaN or crashing", () => {
    const extremeMetrics = createMockMetrics({
      cadenceSpm: 300,
      stepTimeCV: 5.0,
      gaitSpeedMps: 10.0,
    });
    const res = evaluateGaitNormatives(extremeMetrics);
    expect(res.gdi.gdiScore).toBeDefined();
    expect(res.evaluations.length).toBeGreaterThan(0);
  });
});

describe("R11 - Zifchock SA Denominator 45 Verification (symmetry.ts)", () => {
  it("confirms exact Zifchock SA outputs for known thetaDeg values", () => {
    // 1. theta = arctan(10 / 10) = 45 deg -> SA = |45 - 45| / 45 * 100 = 0%
    expect(symmetryAngle(10, 10)).toBe(0.0);

    // 2. theta = arctan(10 / 20) = 26.565 deg -> SA = |45 - 26.565| / 45 * 100 = 40.97%
    expect(symmetryAngle(10, 20)).toBe(40.97);

    // 3. theta = arctan(5 / 15) = 18.435 deg -> SA = |45 - 18.435| / 45 * 100 = 59.03%
    expect(symmetryAngle(5, 15)).toBe(59.03);

    // 4. theta = arctan(0 / 10) = 0 deg -> SA = |45 - 0| / 45 * 100 = 100%
    expect(symmetryAngle(0, 10)).toBe(100.0);
  });

  it("gaitSymmetryIndex computes min/max ratio percentage correctly", () => {
    expect(gaitSymmetryIndex(10, 20)).toBe(50.0);
    expect(gaitSymmetryIndex(5, 15)).toBe(33.33);
    expect(gaitSymmetryIndex(10, 10)).toBe(100.0);
  });
});

describe("R11 - DTE Clamping & Clamped Metric Bounds (dte.ts)", () => {
  it("clamps stepTimeCvDTE to [-100%, +100%] even for near-zero baseline CV", () => {
    const base = createMockMetrics({ stepTimeCV: 0.001 });
    const dual = createMockMetrics({ stepTimeCV: 0.50 });
    const dte = calculateDTE(base, dual);
    expect(dte.stepTimeCvDTE).toBe(-100.0);
  });
});

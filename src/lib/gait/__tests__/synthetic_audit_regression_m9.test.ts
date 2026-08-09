import { describe, it, expect } from "vitest";
import { detectGaitEventsZeni, refinePeakTimestamp } from "../events";
import { computeHarmonicRatio } from "../smoothness";
import { computeFFTHarmonics } from "../signal";
import { computeGaitMetrics } from "../analysis";
import { generateSyntheticWalkingFrames } from "./testHelpers";

describe("Milestone M9: Comprehensive Synthetic Ground-Truth Test Suite (R1-R5 Audit Remediations)", () => {
  describe("R1 & R5: Follow-Cam Direction Inference & Peak Prominence Filtering", () => {
    it("correctly infers Left->Right direction in follow-cam shots with zero net hip drift", () => {
      const frames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        direction: 1,
        followCam: true,
      });

      const result = detectGaitEventsZeni(frames, 30);

      // Verify direction inference via foot orientation vector difference (toe.x - heel.x)
      expect(result.inferredDirection).toBe(1);
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(50);
      expect(result.leftStancePct).toBeLessThanOrEqual(70);
      expect(result.rightStancePct).toBeGreaterThanOrEqual(50);
      expect(result.rightStancePct).toBeLessThanOrEqual(70);
      expect(result.leftSwingPct + result.leftStancePct).toBeCloseTo(100, 1);
      expect(result.rightSwingPct + result.rightStancePct).toBeCloseTo(100, 1);
    });

    it("correctly infers Right->Left direction in follow-cam shots with zero net hip drift", () => {
      const frames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        direction: -1,
        followCam: true,
      });

      const result = detectGaitEventsZeni(frames, 30);

      // Verify direction inference via foot orientation vector difference (toe.x - heel.x)
      expect(result.inferredDirection).toBe(-1);
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(50);
      expect(result.leftStancePct).toBeLessThanOrEqual(70);
      expect(result.rightStancePct).toBeGreaterThanOrEqual(50);
      expect(result.rightStancePct).toBeLessThanOrEqual(70);
      expect(result.leftSwingPct + result.leftStancePct).toBeCloseTo(100, 1);
      expect(result.rightSwingPct + result.rightStancePct).toBeCloseTo(100, 1);
    });

    it("falls back to mid-hip net displacement when foot landmark visibility is low", () => {
      const frames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        direction: -1,
        lowVisibilityLandmarks: true, // foot/heel visibility < 0.4
      });

      const result = detectGaitEventsZeni(frames, 30);

      expect(result.inferredDirection).toBe(-1);
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(result.leftStancePct).toBeLessThanOrEqual(80);
    });

    it("suppresses low-amplitude noise ripples using topographic peak prominence filtering (R5)", () => {
      const framesWithNoise = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        noiseLevel: 0.04,
      });

      const result = detectGaitEventsZeni(framesWithNoise, 30);

      // Prominence filtering ensures spurious noise ripples do not corrupt event count or phase breakdown
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(result.leftStancePct).toBeLessThanOrEqual(80);
      expect(result.rightStancePct).toBeGreaterThanOrEqual(40);
      expect(result.rightStancePct).toBeLessThanOrEqual(80);
      expect(result.doubleSupportPct).toBeGreaterThan(0);
      expect(result.doubleSupportPct).toBeLessThanOrEqual(45);
    });
  });

  describe("R2: Harmonic Ratio f0 Fundamental Frequency & Hann Window Leakage Integration", () => {
    it("computes vertical Harmonic Ratio in literature-aligned range (~2.5 to 4.0+) for synthetic symmetric walking", () => {
      const fps = 30;
      const durationSec = 5.0;
      const totalFrames = Math.floor(fps * durationSec);
      const strideFreq = 0.8; // 0.8 Hz stride freq (1.6 Hz step freq)
      const meanStrideSec = 1 / strideFreq; // 1.25 s

      const hipY: number[] = [];
      const hipX: number[] = [];

      for (let i = 0; i < totalFrames; i++) {
        const t = i / fps;
        // Pure symmetric vertical trajectory driven by 2nd & 4th stride harmonics (even harmonics)
        const y = 0.5 + 0.03 * Math.cos(2 * Math.PI * (2 * strideFreq) * t) + 0.008 * Math.cos(2 * Math.PI * (4 * strideFreq) * t);
        // Pure symmetric lateral trajectory driven by 1st & 3rd stride harmonics (odd harmonics)
        const x = 0.5 + 0.04 * Math.sin(2 * Math.PI * (1 * strideFreq) * t) + 0.01 * Math.sin(2 * Math.PI * (3 * strideFreq) * t);

        hipY.push(y);
        hipX.push(x);
      }

      const hrResult = computeHarmonicRatio(hipY, hipX, fps, meanStrideSec);

      // Literature threshold for symmetric gait is HR >= 2.0 (higher indicates smoother, symmetric gait)
      expect(hrResult.hrVertical).toBeGreaterThanOrEqual(2.5);
      expect(hrResult.hrLateral).toBeGreaterThanOrEqual(2.0);
      expect(hrResult.overallHR).toBeGreaterThan(2.0);
    });

    it("verifies computeFFTHarmonics with explicit strideFreq parameter and +/- 1 FFT bin Hann leakage summation", () => {
      const fps = 30;
      const durationSec = 6.0;
      const totalFrames = Math.floor(fps * durationSec);
      const strideFreq = 0.85; // Unaligned fractional frequency

      const data: number[] = [];
      for (let i = 0; i < totalFrames; i++) {
        const t = i / fps;
        // Strong 2nd harmonic (even) relative to 1st harmonic (odd)
        data.push(1.0 * Math.sin(2 * Math.PI * (2 * strideFreq) * t) + 0.1 * Math.sin(2 * Math.PI * (1 * strideFreq) * t));
      }

      const harmonics = computeFFTHarmonics(data, fps, strideFreq, 10);

      expect(harmonics.evenSum).toBeGreaterThan(harmonics.oddSum * 2);
      expect(harmonics.harmonicRatio).toBeGreaterThan(2.0);
    });

    it("detects reduction in vertical HR when step asymmetry (odd stride harmonic) is introduced", () => {
      const fps = 30;
      const durationSec = 5.0;
      const totalFrames = Math.floor(fps * durationSec);
      const strideFreq = 0.8;
      const meanStrideSec = 1 / strideFreq;

      const hipYSymmetric: number[] = [];
      const hipYAsymmetric: number[] = [];
      const hipX: number[] = [];

      for (let i = 0; i < totalFrames; i++) {
        const t = i / fps;
        // Symmetric hipY (even harmonics only)
        const ySym = 0.5 + 0.03 * Math.cos(2 * Math.PI * (2 * strideFreq) * t);
        // Asymmetric hipY (injecting odd harmonic 1*f0)
        const yAsym = 0.5 + 0.03 * Math.cos(2 * Math.PI * (2 * strideFreq) * t) + 0.025 * Math.cos(2 * Math.PI * (1 * strideFreq) * t);
        const x = 0.5 + 0.04 * Math.sin(2 * Math.PI * (1 * strideFreq) * t);

        hipYSymmetric.push(ySym);
        hipYAsymmetric.push(yAsym);
        hipX.push(x);
      }

      const hrSym = computeHarmonicRatio(hipYSymmetric, hipX, fps, meanStrideSec);
      const hrAsym = computeHarmonicRatio(hipYAsymmetric, hipX, fps, meanStrideSec);

      expect(hrAsym.hrVertical).toBeLessThan(hrSym.hrVertical);
    });
  });

  describe("R3: Step-Time CV Length Invariance Across 10s, 30s, 60s, 120s Clips", () => {
    it(
      "maintains stepTimeCV invariance (< 0.1% variation) across 10s, 30s, 60s, and 120s clip durations",
      () => {
        const durations = [10.0, 30.0, 60.0, 120.0];
        const cvResults: number[] = [];

        for (const durationSec of durations) {
          const frames = generateSyntheticWalkingFrames({
            fps: 30,
            durationSec,
            direction: 1,
          });

          const metrics = computeGaitMetrics(frames);
          expect(metrics.stepTimeCV).not.toBeNull();
          if (metrics.stepTimeCV !== null) {
            cvResults.push(metrics.stepTimeCV);
          }
        }

        expect(cvResults.length).toBe(4);

        // Verify variation across all durations is < 0.1% (0.001)
        const maxCV = Math.max(...cvResults);
        const minCV = Math.min(...cvResults);
        const cvDiff = maxCV - minCV;

        expect(cvDiff).toBeLessThan(0.001); // < 0.1% variation
      },
      30000,
    );

    it("verifies parabolic subframe refinement achieves sub-3ms timestamp precision", () => {
      const fps = 30;
      const dt = 1 / fps;
      const truePeakSec = 1.0035; // +3.5 ms offset from discrete sample grid at 1.000 s
      const frameTimes = [1.0 - dt, 1.0, 1.0 + dt];

      // Quadratic signal around peak
      const signal = frameTimes.map((t) => 100 - 400 * Math.pow(t - truePeakSec, 2));

      const refined = refinePeakTimestamp(signal, 1, 1.0, fps);

      expect(Math.abs(refined - truePeakSec)).toBeLessThan(0.003); // < 3 ms error
    });
  });

  describe("R4: Camera View Metric Suppression & Split-Half Reliability 95% CIs", () => {
    it("emits null for sagittal metrics in Frontal view (knee flex, stance %, swing %, double support %, stride asym)", () => {
      const frontalFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        viewAngle: "frontal",
      });

      const metrics = computeGaitMetrics(frontalFrames);

      expect(metrics.viewAngle).toBe("frontal");
      // Sagittal-invalid metrics MUST emit null
      expect(metrics.kneeFlexLeft).toBeNull();
      expect(metrics.kneeFlexRight).toBeNull();
      expect(metrics.kneeAsymmetry).toBeNull();
      expect(metrics.strideAsymmetry).toBeNull();
      expect(metrics.leftStancePct).toBeNull();
      expect(metrics.rightStancePct).toBeNull();
      expect(metrics.leftSwingPct).toBeNull();
      expect(metrics.rightSwingPct).toBeNull();
      expect(metrics.doubleSupportPct).toBeNull();

      // Frontal-valid metrics MUST be populated
      expect(metrics.lateralSway).not.toBeNull();
      expect(metrics.meanStepWidth).not.toBeNull();
      expect(metrics.stepWidthVariability).not.toBeNull();
      expect(metrics.pelvicObliquity).not.toBeNull();
    });

    it("emits null for frontal metrics in Sagittal view (lateral sway, step width, pelvic obliquity)", () => {
      const sagittalFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        viewAngle: "sagittal",
      });

      const metrics = computeGaitMetrics(sagittalFrames);

      expect(metrics.viewAngle).toBe("sagittal");
      // Frontal-invalid metrics MUST emit null
      expect(metrics.lateralSway).toBeNull();
      expect(metrics.meanStepWidth).toBeNull();
      expect(metrics.stepWidthVariability).toBeNull();
      expect(metrics.pelvicObliquity).toBeNull();
      expect(metrics.pelvicObliquityVar).toBeNull();

      // Sagittal-valid metrics MUST be populated
      expect(metrics.kneeFlexLeft).not.toBeNull();
      expect(metrics.kneeFlexRight).not.toBeNull();
      expect(metrics.leftStancePct).not.toBeNull();
      expect(metrics.rightStancePct).not.toBeNull();
    });

    it("populates confidenceIntervals with split-half SE and 95% CIs (M +/- 1.96 * SE_split)", () => {
      const frames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 5.0,
        viewAngle: "sagittal",
      });

      const metrics = computeGaitMetrics(frames);

      expect(metrics.confidenceIntervals).toBeDefined();
      const ci = metrics.confidenceIntervals!;

      expect(ci.cadenceSpm).toBeDefined();
      expect(ci.stepTimeCV).toBeDefined();
      expect(ci.symmetryAngle).toBeDefined();
      expect(ci.harmonicRatio).toBeDefined();

      const cadenceBounds = ci.cadenceSpm!;
      expect(cadenceBounds.value).toBeCloseTo(metrics.cadenceSpm!, 2);
      expect(cadenceBounds.half1).not.toBeNull();
      expect(cadenceBounds.half2).not.toBeNull();
      expect(cadenceBounds.se).not.toBeNull();
      expect(cadenceBounds.ci95Lower).not.toBeNull();
      expect(cadenceBounds.ci95Upper).not.toBeNull();

      const h1 = cadenceBounds.half1;
      const h2 = cadenceBounds.half2;
      const seVal = cadenceBounds.se;
      const val = cadenceBounds.value;
      const lower = cadenceBounds.ci95Lower;
      const upper = cadenceBounds.ci95Upper;

      // Verify standard error formula SE = |half1 - half2| / sqrt(2)
      if (h1 != null && h2 != null && seVal != null) {
        const expectedSE = Math.abs(h1 - h2) / Math.sqrt(2);
        expect(seVal).toBeCloseTo(expectedSE, 2);
      }

      // Verify 95% CI bounds M +/- 1.96 * SE
      if (val != null && seVal != null && lower != null && upper != null) {
        const expectedLower = Math.max(0, val - 1.96 * seVal);
        const expectedUpper = val + 1.96 * seVal;
        expect(lower).toBeCloseTo(expectedLower, 2);
        expect(upper).toBeCloseTo(expectedUpper, 2);
      }
    });
  });
});

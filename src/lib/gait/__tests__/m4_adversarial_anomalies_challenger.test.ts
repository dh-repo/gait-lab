import { describe, it, expect } from "vitest";
import { classifyGaitAnomalies } from "../anomalies";
import type { GaitMetrics } from "../types";
import type { GaitAngleAnalysis } from "../angles";

const createBaseMetrics = (): GaitMetrics => ({
  viewAngle: "sagittal",
  viewConfidence: 0.9,
  durationSec: 10,
  fpsEffective: 30,
  stepCount: 20,
  cadenceSpm: 110,
  avgStepTimeSec: 0.54,
  stepTimeAsymmetry: 0.02,
  strideAsymmetry: null,
  lateralSway: null,
  verticalBounce: 0.03,
  armSwingLeft: 0.2,
  armSwingRight: 0.2,
  armSwingAsymmetry: 0.01,
  kneeFlexLeft: null,
  kneeFlexRight: null,
  kneeAsymmetry: null,
  stepWidthVariability: null,
  doubleSupportHint: 0.2,
  stepTimeCV: 0.02,
  strideTimeCV: 0.02,
  pelvicObliquity: null,
  pelvicObliquityVar: null,
  meanStepWidth: 0.12,
  pathSmoothness: 0.9,
  stabilityScore: 80,
  rhythmScore: 80,
  symmetryScore: 80,
  mobilityScore: 80,
  automaticityScore: 80,
  overallScore: 80,
  series: [],
  stepEvents: [],
});

describe("M4 Challenger Empirical Stress Suite - Gait Anomaly Classifiers", () => {
  describe("1. All 8 Individual Classifiers Triggering & Contract Compliance", () => {
    it("triggers Antalgic Guarding with valid contract schema", () => {
      const metrics = createBaseMetrics();
      metrics.leftStancePct = 48;
      metrics.rightStancePct = 60; // diff = 12 > 6.0
      const findings = classifyGaitAnomalies(metrics);
      const antalgic = findings.find(f => f.id === "antalgic_guarding");
      expect(antalgic).toBeDefined();
      expect(antalgic?.category).toBe("musculoskeletal");
      expect(antalgic?.literatureCitation).toContain("Perry");
      expect(antalgic?.therapeuticTarget).toBeTruthy();
    });

    it("triggers Parkinsonian Festination with valid contract schema", () => {
      const metrics = createBaseMetrics();
      metrics.cadenceSpm = 130;
      metrics.gaitSpeedMps = 0.8;
      metrics.stepLength = 0.35;
      const findings = classifyGaitAnomalies(metrics);
      const parkinsonian = findings.find(f => f.id === "parkinsonian_festination");
      expect(parkinsonian).toBeDefined();
      expect(parkinsonian?.category).toBe("neurological");
      expect(parkinsonian?.literatureCitation).toContain("Morris");
      expect(parkinsonian?.therapeuticTarget).toBeTruthy();
    });

    it("triggers Ataxic Wide-Base Stagger with valid contract schema", () => {
      const metrics = createBaseMetrics();
      metrics.meanStepWidth = 0.20;
      const findings = classifyGaitAnomalies(metrics);
      const ataxic = findings.find(f => f.id === "ataxic_wide_base");
      expect(ataxic).toBeDefined();
      expect(ataxic?.category).toBe("neurological");
      expect(ataxic?.literatureCitation).toContain("Morton");
      expect(ataxic?.therapeuticTarget).toBeTruthy();
    });

    it("triggers Hemiparetic Stiff-Knee with valid contract schema", () => {
      const metrics = createBaseMetrics();
      const angles: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        normativeData: [],
        metrics: {
          kneeRomLeft: 30,
          kneeRomRight: 55, // diff = 25 > 14, min = 30 < 45
          kneePeakFlexionLeft: 35,
          kneePeakFlexionRight: 60,
          kneeAsymmetryPct: 25,
          hipRomLeft: null, hipRomRight: null, hipPeakFlexionLeft: null, hipPeakExtensionLeft: null, hipPeakFlexionRight: null, hipPeakExtensionRight: null, hipAsymmetryPct: null,
          ankleRomLeft: null, ankleRomRight: null, anklePeakDorsiflexionLeft: null, anklePeakDorsiflexionRight: null, anklePeakPlantarflexionLeft: null, anklePeakPlantarflexionRight: null, ankleAsymmetryPct: null
        }
      };
      const findings = classifyGaitAnomalies(metrics, angles);
      const hemiparetic = findings.find(f => f.id === "hemiparetic_stiff_knee");
      expect(hemiparetic).toBeDefined();
      expect(hemiparetic?.category).toBe("neurological");
      expect(hemiparetic?.literatureCitation).toContain("Goldberg");
      expect(hemiparetic?.therapeuticTarget).toBeTruthy();
    });

    it("triggers Spastic Scissoring with valid contract schema", () => {
      const metrics = createBaseMetrics();
      metrics.meanStepWidth = 0.03; // < 0.05 & > -0.10
      const findings = classifyGaitAnomalies(metrics);
      const scissoring = findings.find(f => f.id === "spastic_scissoring");
      expect(scissoring).toBeDefined();
      expect(scissoring?.category).toBe("neurological");
      expect(scissoring?.literatureCitation).toContain("Sutherland");
      expect(scissoring?.therapeuticTarget).toBeTruthy();
    });

    it("triggers Trendelenburg Lurch with valid contract schema", () => {
      const metrics = createBaseMetrics();
      metrics.symmetryAngle = 12.0; // > 10.0
      metrics.leftStancePct = 52;
      metrics.rightStancePct = 58; // diff = 6.0 > 5.0
      const findings = classifyGaitAnomalies(metrics);
      const trendelenburg = findings.find(f => f.id === "trendelenburg_lurch");
      expect(trendelenburg).toBeDefined();
      expect(trendelenburg?.category).toBe("musculoskeletal");
      expect(trendelenburg?.literatureCitation).toContain("Hardcastle");
      expect(trendelenburg?.therapeuticTarget).toBeTruthy();
    });

    it("triggers Steppage / Foot Drop with valid contract schema (angle branch)", () => {
      const metrics = createBaseMetrics();
      const angles: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        normativeData: [],
        metrics: {
          kneeRomLeft: 55, kneeRomRight: 55,
          kneePeakFlexionLeft: 70, kneePeakFlexionRight: 60, // max = 70 > 66
          kneeAsymmetryPct: 5,
          hipRomLeft: null, hipRomRight: null, hipPeakFlexionLeft: null, hipPeakExtensionLeft: null, hipPeakFlexionRight: null, hipPeakExtensionRight: null, hipAsymmetryPct: null,
          ankleRomLeft: 10, ankleRomRight: 20,
          anklePeakDorsiflexionLeft: 1.5, anklePeakDorsiflexionRight: 10.0, // min = 1.5 < 2.0
          anklePeakPlantarflexionLeft: null, anklePeakPlantarflexionRight: null, ankleAsymmetryPct: 15
        }
      };
      const findings = classifyGaitAnomalies(metrics, angles);
      const steppage = findings.find(f => f.id === "steppage_foot_drop");
      expect(steppage).toBeDefined();
      expect(steppage?.category).toBe("neurological");
      expect(steppage?.literatureCitation).toContain("Perry");
      expect(steppage?.therapeuticTarget).toBeTruthy();
    });

    it("triggers Steppage / Foot Drop with valid contract schema (metrics fallback branch)", () => {
      const metrics = createBaseMetrics();
      metrics.verticalBounce = 0.06; // > 0.055
      metrics.stepTimeAsymmetry = 0.09; // > 0.08
      const findings = classifyGaitAnomalies(metrics);
      const steppage = findings.find(f => f.id === "steppage_foot_drop");
      expect(steppage).toBeDefined();
      expect(steppage?.category).toBe("neurological");
      expect(steppage?.literatureCitation).toContain("Perry");
      expect(steppage?.therapeuticTarget).toBeTruthy();
    });

    it("triggers Vaulting / Hip Hiking with valid contract schema", () => {
      const metrics = createBaseMetrics();
      metrics.verticalBounce = 0.07; // > 0.06
      metrics.leftStancePct = 50;
      metrics.rightStancePct = 55; // stanceDiff = 5.0 > 4.0
      const findings = classifyGaitAnomalies(metrics);
      const vaulting = findings.find(f => f.id === "vaulting_hip_hiking");
      expect(vaulting).toBeDefined();
      expect(vaulting?.category).toBe("biomechanical");
      expect(vaulting?.literatureCitation).toContain("Kerrigan");
      expect(vaulting?.therapeuticTarget).toBeTruthy();
    });
  });

  describe("2. Boundary Metrics Precision Stress Testing", () => {
    it("tests stance ratio boundary at exactly 6.0%, 6.001%, and 5.999%", () => {
      const mExact = createBaseMetrics();
      mExact.leftStancePct = 60.0;
      mExact.rightStancePct = 54.0; // stanceDiff = 6.0
      expect(classifyGaitAnomalies(mExact).some(f => f.id === "antalgic_guarding")).toBe(false);

      const mAbove = createBaseMetrics();
      mAbove.leftStancePct = 60.001;
      mAbove.rightStancePct = 54.0; // stanceDiff = 6.001 > 6.0
      expect(classifyGaitAnomalies(mAbove).some(f => f.id === "antalgic_guarding")).toBe(true);

      const mBelow = createBaseMetrics();
      mBelow.leftStancePct = 59.999;
      mBelow.rightStancePct = 54.0; // stanceDiff = 5.999 < 6.0
      expect(classifyGaitAnomalies(mBelow).some(f => f.id === "antalgic_guarding")).toBe(false);
    });

    it("tests cadence boundary at exactly 125 spm vs 126 spm vs 124 spm", () => {
      const m125 = createBaseMetrics();
      m125.cadenceSpm = 125;
      m125.gaitSpeedMps = 0.90;
      m125.stepLength = 0.40;
      expect(classifyGaitAnomalies(m125).some(f => f.id === "parkinsonian_festination")).toBe(false);

      const m126 = createBaseMetrics();
      m126.cadenceSpm = 126;
      m126.gaitSpeedMps = 0.90;
      m126.stepLength = 0.40;
      expect(classifyGaitAnomalies(m126).some(f => f.id === "parkinsonian_festination")).toBe(true);

      const m124 = createBaseMetrics();
      m124.cadenceSpm = 124;
      m124.gaitSpeedMps = 0.90;
      m124.stepLength = 0.40;
      expect(classifyGaitAnomalies(m124).some(f => f.id === "parkinsonian_festination")).toBe(false);
    });

    it("tests dorsiflexion boundary at 1.99°, 2.0°, and negative values", () => {
      const createAngleData = (dorsi: number, kneeFlex: number): GaitAngleAnalysis => ({
        isSuppressed: false,
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        normativeData: [],
        metrics: {
          kneeRomLeft: 55, kneeRomRight: 55,
          kneePeakFlexionLeft: kneeFlex, kneePeakFlexionRight: 60,
          kneeAsymmetryPct: 5,
          hipRomLeft: null, hipRomRight: null, hipPeakFlexionLeft: null, hipPeakExtensionLeft: null, hipPeakFlexionRight: null, hipPeakExtensionRight: null, hipAsymmetryPct: null,
          ankleRomLeft: 10, ankleRomRight: 20,
          anklePeakDorsiflexionLeft: dorsi, anklePeakDorsiflexionRight: 10.0,
          anklePeakPlantarflexionLeft: null, anklePeakPlantarflexionRight: null, ankleAsymmetryPct: 15
        }
      });

      // dorsi = 1.99 (<2.0) with kneeFlex = 67.0 (>66.0) -> Triggers
      const f1 = classifyGaitAnomalies(createBaseMetrics(), createAngleData(1.99, 67.0));
      expect(f1.some(f => f.id === "steppage_foot_drop")).toBe(true);

      // dorsi = 2.0 (not <2.0) with dorsiDiff = 8.0 (10.0 - 2.0 > 7.0) and kneeFlex = 67.0 (>66.0) -> Triggers via dorsiDiff
      const f2 = classifyGaitAnomalies(createBaseMetrics(), createAngleData(2.0, 67.0));
      expect(f2.some(f => f.id === "steppage_foot_drop")).toBe(true);

      // dorsi = -1.0 (<0.0) with normal kneeFlex = 60.0 -> Triggers via minAnkleDorsi < 0.0
      const f3 = classifyGaitAnomalies(createBaseMetrics(), createAngleData(-1.0, 60.0));
      expect(f3.some(f => f.id === "steppage_foot_drop")).toBe(true);
    });

    it("tests vertical bounce boundary at 0.055m vs 0.0551m and pelvic obliquity at 0.04 vs 0.045", () => {
      const m55 = createBaseMetrics();
      m55.verticalBounce = 0.055;
      m55.stepTimeAsymmetry = 0.085;
      expect(classifyGaitAnomalies(m55).some(f => f.id === "steppage_foot_drop")).toBe(false);

      const m551 = createBaseMetrics();
      m551.verticalBounce = 0.0551;
      m551.stepTimeAsymmetry = 0.085;
      expect(classifyGaitAnomalies(m551).some(f => f.id === "steppage_foot_drop")).toBe(true);

      const mPelvic04 = createBaseMetrics();
      mPelvic04.pelvicObliquity = 0.04;
      mPelvic04.leftStancePct = 50;
      mPelvic04.rightStancePct = 55; // stanceDiff = 5.0 > 4.0
      expect(classifyGaitAnomalies(mPelvic04).some(f => f.id === "vaulting_hip_hiking")).toBe(false);

      const mPelvic045 = createBaseMetrics();
      mPelvic045.pelvicObliquity = 0.045;
      mPelvic045.leftStancePct = 50;
      mPelvic045.rightStancePct = 55; // stanceDiff = 5.0 > 4.0
      expect(classifyGaitAnomalies(mPelvic045).some(f => f.id === "vaulting_hip_hiking")).toBe(true);
    });
  });

  describe("3. Simultaneous Multi-Anomaly Co-Occurrence Safety", () => {
    it("simultaneously triggers Parkinsonian + Ataxic + Steppage without errors or overwriting", () => {
      const metrics = createBaseMetrics();
      metrics.cadenceSpm = 135;
      metrics.gaitSpeedMps = 0.75;
      metrics.stepLength = 0.30;
      metrics.stepTimeCV = 0.12; // Parkinsonian + Ataxic candidate
      metrics.meanStepWidth = 0.22; // Ataxic candidate

      const angles: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        normativeData: [],
        metrics: {
          kneeRomLeft: 50, kneeRomRight: 50,
          kneePeakFlexionLeft: 72, kneePeakFlexionRight: 60, // max = 72 > 66
          kneeAsymmetryPct: 5,
          hipRomLeft: null, hipRomRight: null, hipPeakFlexionLeft: null, hipPeakExtensionLeft: null, hipPeakFlexionRight: null, hipPeakExtensionRight: null, hipAsymmetryPct: null,
          ankleRomLeft: 10, ankleRomRight: 20,
          anklePeakDorsiflexionLeft: -3.0, anklePeakDorsiflexionRight: 10.0, // min = -3.0 < 0
          anklePeakPlantarflexionLeft: null, anklePeakPlantarflexionRight: null, ankleAsymmetryPct: 15
        }
      };

      const findings = classifyGaitAnomalies(metrics, angles);
      const ids = findings.map(f => f.id);
      expect(ids).toContain("parkinsonian_festination");
      expect(ids).toContain("ataxic_wide_base");
      expect(ids).toContain("steppage_foot_drop");
      expect(findings.length).toBeGreaterThanOrEqual(3);
    });

    it("simultaneously triggers 7 mutually compatible anomalies in a single pass", () => {
      const metrics: GaitMetrics = {
        ...createBaseMetrics(),
        leftStancePct: 45,
        rightStancePct: 62, // diff = 17 > 6.0 (Antalgic), min = 45 < 52 (Antalgic), stanceDiff = 17 > 5.0 (Trendelenburg), stanceDiff = 17 > 4.0 (Vaulting)
        cadenceSpm: 135,
        gaitSpeedMps: 0.75,
        stepLength: 0.35,
        stepTimeCV: 0.14, // Parkinsonian
        meanStepWidth: 0.01, // Spastic scissoring (<0.05)
        symmetryAngle: 15.0, // Trendelenburg (>10.0)
        verticalBounce: 0.08, // Vaulting (>0.06)
        pelvicObliquity: 0.06, // Vaulting (>0.04)
      };

      const angles: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        normativeData: [],
        metrics: {
          kneeRomLeft: 28, kneeRomRight: 55, // diff = 27 > 14, min = 28 < 45 (Hemiparetic stiff knee), minKneeRom = 28 < 50 (Vaulting)
          kneePeakFlexionLeft: 75, kneePeakFlexionRight: 55, // max = 75 > 66 (Steppage)
          kneeAsymmetryPct: 25,
          hipRomLeft: null, hipRomRight: null, hipPeakFlexionLeft: null, hipPeakExtensionLeft: null, hipPeakFlexionRight: null, hipPeakExtensionRight: null, hipAsymmetryPct: null,
          ankleRomLeft: 5, ankleRomRight: 20,
          anklePeakDorsiflexionLeft: -4.0, anklePeakDorsiflexionRight: 10.0, // min = -4.0 < 0 (Steppage)
          anklePeakPlantarflexionLeft: null, anklePeakPlantarflexionRight: null, ankleAsymmetryPct: 20
        }
      };

      const findings = classifyGaitAnomalies(metrics, angles);
      const ids = findings.map(f => f.id);
      expect(ids).toContain("antalgic_guarding");
      expect(ids).toContain("parkinsonian_festination");
      expect(ids).toContain("hemiparetic_stiff_knee");
      expect(ids).toContain("spastic_scissoring");
      expect(ids).toContain("trendelenburg_lurch");
      expect(ids).toContain("steppage_foot_drop");
      expect(ids).toContain("vaulting_hip_hiking");
      expect(findings.length).toBe(7);
    });
  });

  describe("4. Robustness against extreme, missing, and invalid inputs", () => {
    it("handles empty/undefined optional metrics without throwing", () => {
      const minimalMetrics: GaitMetrics = {
        viewAngle: "sagittal",
        viewConfidence: 0.5,
        durationSec: 5,
        fpsEffective: 30,
        stepCount: 10,
        cadenceSpm: 0,
        avgStepTimeSec: 0,
        stepTimeAsymmetry: 0,
        strideAsymmetry: null,
        lateralSway: null,
        verticalBounce: 0,
        armSwingLeft: 0,
        armSwingRight: 0,
        armSwingAsymmetry: 0,
        kneeFlexLeft: null,
        kneeFlexRight: null,
        kneeAsymmetry: null,
        stepWidthVariability: null,
        doubleSupportHint: 0,
        stepTimeCV: 0,
        strideTimeCV: 0,
        pelvicObliquity: null,
        pelvicObliquityVar: null,
        meanStepWidth: null,
        pathSmoothness: 0,
        stabilityScore: 50,
        rhythmScore: 50,
        symmetryScore: 50,
        mobilityScore: 50,
        automaticityScore: 50,
        overallScore: 50,
        series: [],
        stepEvents: [],
      };

      expect(() => classifyGaitAnomalies(minimalMetrics)).not.toThrow();
      const findings = classifyGaitAnomalies(minimalMetrics);
      expect(Array.isArray(findings)).toBe(true);
    });

    it("handles angles object with null metric fields gracefully", () => {
      const metrics = createBaseMetrics();
      const anglesWithNulls: GaitAngleAnalysis = {
        isSuppressed: true,
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        normativeData: [],
        metrics: {
          kneeRomLeft: null, kneeRomRight: null, kneePeakFlexionLeft: null, kneePeakFlexionRight: null, kneeAsymmetryPct: null,
          hipRomLeft: null, hipRomRight: null, hipPeakFlexionLeft: null, hipPeakExtensionLeft: null, hipPeakFlexionRight: null, hipPeakExtensionRight: null, hipAsymmetryPct: null,
          ankleRomLeft: null, ankleRomRight: null, anklePeakDorsiflexionLeft: null, anklePeakDorsiflexionRight: null, anklePeakPlantarflexionLeft: null, anklePeakPlantarflexionRight: null, ankleAsymmetryPct: null
        }
      };

      expect(() => classifyGaitAnomalies(metrics, anglesWithNulls)).not.toThrow();
    });

    it("handles extreme physical values (super-speed, extreme cadence, extreme step width)", () => {
      const extremeMetrics = createBaseMetrics();
      extremeMetrics.cadenceSpm = 999;
      extremeMetrics.gaitSpeedMps = 100.0;
      extremeMetrics.meanStepWidth = 10.0;
      extremeMetrics.verticalBounce = 5.0;

      expect(() => classifyGaitAnomalies(extremeMetrics)).not.toThrow();
      const findings = classifyGaitAnomalies(extremeMetrics);
      expect(findings.length).toBeGreaterThan(0);
      for (const f of findings) {
        expect(f.confidence).toBeLessThanOrEqual(1.0);
        expect(f.confidence).toBeGreaterThanOrEqual(0.0);
      }
    });
  });
});

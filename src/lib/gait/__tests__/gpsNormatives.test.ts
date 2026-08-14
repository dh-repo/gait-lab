import { describe, it, expect } from "vitest";
import {
  getGPSNormativeCurves,
  calculateGVS,
  classifyGPSSeverity,
  computeFullGPSAndMAP,
  evaluateGPSDelta,
  GPS_VARIABLES_META,
  GPS_VARIABLE_ORDER,
  GPS_CONTROL_THRESHOLD_DEG,
  GPS_MCID_THRESHOLD_DEG,
} from "../gpsNormatives";
import { calculateGPSAndMAP } from "../normatives";
import type { GaitAngleAnalysis } from "../angles";

describe("gpsNormatives.ts — Baker et al. (2009) GPS & MAP Engine", () => {
  describe("1. Normative Reference Datasets & Lifespan Stratification", () => {
    it("generates 101-point continuous curves for all 9 Baker variables", () => {
      const curves = getGPSNormativeCurves();
      expect(curves).toHaveLength(101);
      expect(curves[0].gaitCyclePct).toBe(0);
      expect(curves[100].gaitCyclePct).toBe(100);

      const first = curves[0];
      // Pelvis (3)
      expect(first.pelvicTiltMean).toBeDefined();
      expect(first.pelvicTiltSd).toBe(4.0);
      expect(first.pelvicObliquityMean).toBeDefined();
      expect(first.pelvicRotationMean).toBeDefined();
      // Hip (3)
      expect(first.hipFlexionMean).toBeDefined();
      expect(first.hipAbductionMean).toBeDefined();
      expect(first.hipRotationMean).toBeDefined();
      // Knee (1)
      expect(first.kneeFlexionMean).toBeDefined();
      // Ankle (1)
      expect(first.ankleFlexionMean).toBeDefined();
      // Foot (1)
      expect(first.footProgressionMean).toBeDefined();
    });

    it("applies age stratification scaling across pediatric and geriatric tiers", () => {
      const pediatric = getGPSNormativeCurves(12);
      const adult = getGPSNormativeCurves(30);
      const elderly = getGPSNormativeCurves(70);
      const advanced80 = getGPSNormativeCurves(80);
      const advanced90 = getGPSNormativeCurves(90);

      // Peak swing knee flexion declines with age
      const peakKneePed = Math.max(...pediatric.map((p) => p.kneeFlexionMean));
      const peakKneeAdult = Math.max(...adult.map((p) => p.kneeFlexionMean));
      const peakKneeElderly = Math.max(...elderly.map((p) => p.kneeFlexionMean));
      const peakKnee80 = Math.max(...advanced80.map((p) => p.kneeFlexionMean));
      const peakKnee90 = Math.max(...advanced90.map((p) => p.kneeFlexionMean));

      expect(peakKneePed).toBeGreaterThanOrEqual(peakKneeAdult);
      expect(peakKneeAdult).toBeGreaterThan(peakKneeElderly);
      expect(peakKneeElderly).toBeGreaterThan(peakKnee80);
      expect(peakKnee80).toBeGreaterThan(peakKnee90);
    });

    it("verifies metadata dictionary covers all 9 kinematic variables", () => {
      expect(GPS_VARIABLE_ORDER).toHaveLength(9);
      for (const varId of GPS_VARIABLE_ORDER) {
        const meta = GPS_VARIABLES_META[varId];
        expect(meta.id).toBe(varId);
        expect(meta.label).toBeDefined();
        expect(meta.plane).toMatch(/sagittal|frontal|transverse/);
        expect(meta.joint).toMatch(/pelvis|hip|knee|ankle|foot/);
        expect(meta.controlMeanDeg).toBe(GPS_CONTROL_THRESHOLD_DEG);
      }
    });
  });

  describe("2. Gait Variable Score (GVS) Mathematical RMSE Calculation", () => {
    it("returns GVS = 0.0° when patient curve matches normative mean identically", () => {
      const normMean = [10, 20, 30, 40, 50, 60, 50, 40, 30, 20, 10];
      const patient = [...normMean];
      const gvs = calculateGVS(patient, normMean);
      expect(gvs).toBe(0.0);
    });

    it("returns exact RMSE for constant uniform angular offset (+10.0° -> GVS = 10.0°)", () => {
      const normMean = [10, 20, 30, 40, 50, 60, 50, 40, 30, 20, 10];
      const patient = normMean.map((v) => v + 10.0);
      const gvs = calculateGVS(patient, normMean);
      expect(gvs).toBeCloseTo(10.0, 2);
    });

    it("computes accurate RMSE for alternating deviations (+3° and -3° -> GVS = 3.0°)", () => {
      const normMean = new Array(20).fill(25.0);
      const patient = normMean.map((v, i) => (i % 2 === 0 ? v + 3.0 : v - 3.0));
      const gvs = calculateGVS(patient, normMean);
      expect(gvs).toBeCloseTo(3.0, 2);
    });

    it("handles null and non-finite numbers safely in trajectory data", () => {
      const normMean = new Array(20).fill(15.0);
      const patient = new Array(20).fill(15.0);
      patient[0] = null;
      patient[1] = undefined;
      patient[2] = NaN;
      patient[3] = Infinity;
      const gvs = calculateGVS(patient, normMean);
      expect(gvs).toBe(0.0);
    });

    it("returns null when fewer than 10 valid points exist", () => {
      const normMean = new Array(20).fill(15.0);
      const sparsePatient = new Array(20).fill(null);
      sparsePatient[0] = 15.0;
      sparsePatient[1] = 16.0;
      const gvs = calculateGVS(sparsePatient, normMean);
      expect(gvs).toBeNull();
    });
  });

  describe("3. Clinical Severity Classification", () => {
    it("maps scores to clinical bands per Baker et al. (2009)", () => {
      expect(classifyGPSSeverity(0.0)).toBe("normal");
      expect(classifyGPSSeverity(4.8)).toBe("normal");
      expect(classifyGPSSeverity(5.0)).toBe("mild");
      expect(classifyGPSSeverity(6.9)).toBe("mild");
      expect(classifyGPSSeverity(7.0)).toBe("moderate");
      expect(classifyGPSSeverity(9.9)).toBe("moderate");
      expect(classifyGPSSeverity(10.0)).toBe("severe");
      expect(classifyGPSSeverity(15.5)).toBe("severe");
    });
  });

  describe("4. Full GPS & MAP Engine (computeFullGPSAndMAP)", () => {
    it("evaluates healthy gait with all 9 kinematic variables to GPS = 0.0°", () => {
      const normCurves = getGPSNormativeCurves();
      const mockPoints = normCurves.map((nc) => ({
        gaitCyclePct: nc.gaitCyclePct,
        pelvicTiltAngle: nc.pelvicTiltMean,
        pelvicObliquityAngle: nc.pelvicObliquityMean,
        pelvicRotationAngle: nc.pelvicRotationMean,
        hipAngleLeft: nc.hipFlexionMean,
        hipAngleRight: nc.hipFlexionMean,
        hipAbductionLeft: nc.hipAbductionMean,
        hipAbductionRight: nc.hipAbductionMean,
        hipRotationLeft: nc.hipRotationMean,
        hipRotationRight: nc.hipRotationMean,
        kneeAngleLeft: nc.kneeFlexionMean,
        kneeAngleRight: nc.kneeFlexionMean,
        ankleAngleLeft: nc.ankleFlexionMean,
        ankleAngleRight: nc.ankleFlexionMean,
        footProgressionLeft: nc.footProgressionMean,
        footProgressionRight: nc.footProgressionMean,
      }));

      const analysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: mockPoints as any,
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: undefined as any,
      };

      const result = computeFullGPSAndMAP(analysis);
      expect(result.overallGPS).toBe(0.0);
      expect(result.leftGPS).toBe(0.0);
      expect(result.rightGPS).toBe(0.0);
      expect(result.asymmetryDeltaGPS).toBe(0.0);
      expect(result.evaluatedVariableCount).toBe(9);
      expect(result.severity).toBe("normal");
      expect(result.interpretation).toContain("Normal normative kinematic profile");
    });

    it("evaluates standard 3-joint sagittal capture (Knee, Hip, Ankle) accurately", () => {
      const normCurves = getGPSNormativeCurves();
      const mockPoints = normCurves.map((nc) => ({
        gaitCyclePct: nc.gaitCyclePct,
        kneeAngleLeft: nc.kneeFlexionMean + 10.0,
        kneeAngleRight: nc.kneeFlexionMean + 10.0,
        hipAngleLeft: nc.hipFlexionMean,
        hipAngleRight: nc.hipFlexionMean,
        ankleAngleLeft: nc.ankleFlexionMean,
        ankleAngleRight: nc.ankleFlexionMean,
      }));

      const analysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: mockPoints as any,
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: undefined as any,
      };

      const result = computeFullGPSAndMAP(analysis);
      expect(result.evaluatedVariableCount).toBe(3);
      const kneeEntry = result.gvsEntries.find((e) => e.variable === "kneeFlexion");
      expect(kneeEntry?.overallGVS).toBeCloseTo(10.0, 1);
      // RMS across (10, 0, 0) = sqrt(100 / 3) ≈ 5.77°
      expect(result.overallGPS).toBeCloseTo(5.77, 1);
      expect(result.severity).toBe("mild");
    });

    it("detects unilateral asymmetric pathology (Left limb perturbed, Right limb normal)", () => {
      const normCurves = getGPSNormativeCurves();
      const mockPoints = normCurves.map((nc) => ({
        gaitCyclePct: nc.gaitCyclePct,
        kneeAngleLeft: nc.kneeFlexionMean + 14.0, // Stiff/deviated left knee
        kneeAngleRight: nc.kneeFlexionMean, // Healthy right knee
        hipAngleLeft: nc.hipFlexionMean,
        hipAngleRight: nc.hipFlexionMean,
        ankleAngleLeft: nc.ankleFlexionMean,
        ankleAngleRight: nc.ankleFlexionMean,
      }));

      const analysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: mockPoints as any,
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: undefined as any,
      };

      const result = computeFullGPSAndMAP(analysis);
      expect(result.leftGPS).toBeGreaterThan(result.rightGPS!);
      expect(result.rightGPS).toBe(0.0);
      expect(result.asymmetryDeltaGPS).toBeGreaterThan(GPS_MCID_THRESHOLD_DEG);
    });

    it("handles view suppression and empty input gracefully", () => {
      const suppressedAnalysis: GaitAngleAnalysis = {
        isSuppressed: true,
        suppressionReason: "Frontal camera view: Sagittal joint angle kinematics suppressed.",
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: [],
      };

      const result = computeFullGPSAndMAP(suppressedAnalysis);
      expect(result.overallGPS).toBe(0.0);
      expect(result.evaluatedVariableCount).toBe(0);
      expect(result.interpretation).toContain("suppressed in frontal camera view");

      const undefinedResult = computeFullGPSAndMAP(undefined);
      expect(undefinedResult.overallGPS).toBe(0.0);
      expect(undefinedResult.evaluatedVariableCount).toBe(0);
    });
  });

  describe("5. Longitudinal Comparison & MCID Evaluation (evaluateGPSDelta)", () => {
    it("identifies clinically meaningful improvement when ΔGPS <= -1.6°", () => {
      const delta = evaluateGPSDelta(8.4, 6.2); // -2.2° change
      expect(delta.deltaGPS).toBe(-2.2);
      expect(delta.isClinicallyMeaningful).toBe(true);
      expect(delta.direction).toBe("improved");
      expect(delta.message).toContain("meaningful kinematic improvement");
    });

    it("identifies clinically meaningful deterioration when ΔGPS >= +1.6°", () => {
      const delta = evaluateGPSDelta(5.1, 7.3); // +2.2° change
      expect(delta.deltaGPS).toBe(2.2);
      expect(delta.isClinicallyMeaningful).toBe(true);
      expect(delta.direction).toBe("deteriorated");
      expect(delta.message).toContain("meaningful kinematic deterioration");
    });

    it("classifies sub-MCID changes as unchanged measurement variation", () => {
      const delta = evaluateGPSDelta(6.0, 6.8); // +0.8° change (< 1.6°)
      expect(delta.deltaGPS).toBe(0.8);
      expect(delta.isClinicallyMeaningful).toBe(false);
      expect(delta.direction).toBe("unchanged");
    });
  });

  describe("6. Backward Compatibility with normatives.ts calculateGPSAndMAP", () => {
    it("preserves exact shape and behavior for legacy callers", () => {
      const normCurves = getGPSNormativeCurves();
      const mockPoints = normCurves.map((nc) => ({
        gaitCyclePct: nc.gaitCyclePct,
        kneeAngleLeft: nc.kneeFlexionMean,
        kneeAngleRight: nc.kneeFlexionMean,
        hipAngleLeft: nc.hipFlexionMean,
        hipAngleRight: nc.hipFlexionMean,
        ankleAngleLeft: nc.ankleFlexionMean,
        ankleAngleRight: nc.ankleFlexionMean,
      }));

      const legacyRes = calculateGPSAndMAP({
        isSuppressed: false,
        normalizedPoints: mockPoints as any,
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: undefined as any,
      });

      expect(legacyRes.gpsScore).toBe(0.0);
      expect(legacyRes.evaluatedJointCount).toBe(3);
      expect(legacyRes.map.kneeFlexionExtension).toBe(0.0);
      expect(legacyRes.map.hipFlexionExtension).toBe(0.0);
      expect(legacyRes.map.ankleDorsiflexionPlantarflexion).toBe(0.0);
      expect(legacyRes.citation).toBe("Baker et al. (2009)");
    });
  });
});

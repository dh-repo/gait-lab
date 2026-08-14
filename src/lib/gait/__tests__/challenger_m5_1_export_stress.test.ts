import { describe, it, expect } from "vitest";
import {
  exportGaitMetricsAsCsv,
  exportTimeSeriesKinematicsAsCsv,
  exportGaitSessionAsJson,
} from "../export";
import type { GaitMetrics, AnalysisResult } from "../types";

describe("Challenger M5-1: Empirical Adversarial Exporter Stress Harness", () => {
  // --------------------------------------------------------------------------
  // 1. exportGaitMetricsAsCsv Stress Testing
  // --------------------------------------------------------------------------
  describe("exportGaitMetricsAsCsv - Adversarial Values", () => {
    it("handles a completely empty metrics object without throwing or outputting fake defaults", () => {
      const emptyMetrics = {} as GaitMetrics;

      let csv = "";
      expect(() => {
        csv = exportGaitMetricsAsCsv(emptyMetrics);
      }).not.toThrow();

      const lines = csv.trim().split("\n");
      // Header + 32 metrics = 33 lines
      expect(lines.length).toBe(33);
      expect(lines[0]).toBe("Parameter,Value,Unit,Reference Range");

      // Verify that every metric row outputs "N/A" rather than undefined, NaN, or fake numbers
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i]).toContain('"N/A"');
        expect(lines[i]).not.toContain('"undefined"');
        expect(lines[i]).not.toContain('"NaN"');
        expect(lines[i]).not.toContain('"null"');
      }

      // Verify explicit absence of hardcoded default values
      expect(csv).not.toContain('"60.0"');
      expect(csv).not.toContain('"40.0"');
      expect(csv).not.toContain('"100"');
      expect(csv).not.toContain('"75"');
    });

    it("handles partially null and undefined metric values correctly", () => {
      const partialMetrics = {
        gaitSpeedMps: 1.15,
        cadenceSpm: null as any,
        durationSec: undefined as any,
        stepCount: 10,
        avgStepTimeSec: null as any,
        stepTimeCV: 0.03,
        strideTimeCV: null as any,
        leftStancePct: null as any,
        rightStancePct: 60.0,
        leftSwingPct: undefined as any,
        rightSwingPct: 40.0,
        doubleSupportPct: null as any,
        doubleSupportHint: undefined as any,
        symmetryAngle: null as any,
        stepTimeAsymmetry: undefined as any,
        strideAsymmetry: null as any,
        meanStepWidth: 0.12,
        lateralSway: null as any,
        verticalBounce: null as any,
        pelvicObliquity: null as any,
        pelvicObliquityVar: null as any,
        armSwingLeft: null as any,
        armSwingRight: 0.25,
        armSwingAsymmetry: null as any,
        kneeFlexLeft: null as any,
        kneeFlexRight: 58.0,
        kneeAsymmetry: null as any,
        overallScore: null as any,
        stabilityScore: undefined as any,
        mobilityScore: 80,
        symmetryScore: null as any,
        rhythmScore: undefined as any,
        automaticityScore: null as any,
        series: [],
        stepEvents: [],
      } as unknown as GaitMetrics;

      const csv = exportGaitMetricsAsCsv(partialMetrics);

      // Populated fields
      expect(csv).toContain('"Gait Speed","1.15","m/s","1.10 - 1.40"');
      expect(csv).toContain('"Step Count","10","steps","-"');
      expect(csv).toContain('"Right Stance Phase","60.0","%","58 - 62%"');
      expect(csv).toContain('"Right Swing Phase","40.0","%","38 - 42%"');
      expect(csv).toContain('"Mean Step Width","12.0","cm","8.0 - 12.0"');
      expect(csv).toContain('"Right Arm Swing Amplitude","0.25","m","0.15 - 0.35 m"');
      expect(csv).toContain('"Right Knee ROM","58.0","deg","55 - 65 deg"');
      expect(csv).toContain('"Mobility Score","80","/100",">= 75"');

      // Null / Undefined fields
      expect(csv).toContain('"Cadence","N/A","spm","100 - 120"');
      expect(csv).toContain('"Duration","N/A","s","-"');
      expect(csv).toContain('"Left Stance Phase","N/A","%","58 - 62%"');
      expect(csv).toContain('"Double Support Phase","N/A","%","15 - 22%"');
      expect(csv).toContain('"Overall Score","N/A","/100",">= 75"');
      expect(csv).toContain('"Stability Score","N/A","/100",">= 75"');
    });

    it("handles explicit NaN values gracefully by emitting N/A", () => {
      const nanMetrics = {
        gaitSpeedMps: NaN,
        cadenceSpm: NaN,
        durationSec: NaN,
        stepCount: NaN,
        avgStepTimeSec: NaN,
        stepTimeCV: NaN,
        strideTimeCV: NaN,
        leftStancePct: NaN,
        rightStancePct: NaN,
        leftSwingPct: NaN,
        rightSwingPct: NaN,
        doubleSupportPct: NaN,
        doubleSupportHint: NaN,
        symmetryAngle: NaN,
        stepTimeAsymmetry: NaN,
        strideAsymmetry: NaN,
        meanStepWidth: NaN,
        lateralSway: NaN,
        verticalBounce: NaN,
        pelvicObliquity: NaN,
        pelvicObliquityVar: NaN,
        armSwingLeft: NaN,
        armSwingRight: NaN,
        armSwingAsymmetry: NaN,
        kneeFlexLeft: NaN,
        kneeFlexRight: NaN,
        kneeAsymmetry: NaN,
        overallScore: NaN,
        stabilityScore: NaN,
        mobilityScore: NaN,
        symmetryScore: NaN,
        rhythmScore: NaN,
        automaticityScore: NaN,
        series: [],
        stepEvents: [],
      } as unknown as GaitMetrics;

      const csv = exportGaitMetricsAsCsv(nanMetrics);

      expect(csv).not.toContain("NaN");
      const lines = csv.trim().split("\n");
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i]).toContain('"N/A"');
      }
    });

    it("correctly handles negative metric values without corruption or unexpected coercion", () => {
      const negativeMetrics = {
        gaitSpeedMps: -0.5,
        cadenceSpm: -10,
        durationSec: -5.0,
        stepCount: -2,
        avgStepTimeSec: -0.25,
        stepTimeCV: -0.01,
        strideTimeCV: -0.02,
        leftStancePct: -10.0,
        rightStancePct: -20.0,
        leftSwingPct: -5.0,
        rightSwingPct: -15.0,
        doubleSupportPct: -5.0,
        doubleSupportHint: -0.05,
        symmetryAngle: -3.5,
        stepTimeAsymmetry: -0.04,
        strideAsymmetry: -0.05,
        meanStepWidth: -0.08,
        lateralSway: -0.03,
        verticalBounce: -0.02,
        pelvicObliquity: -4.5,
        pelvicObliquityVar: -0.2,
        armSwingLeft: -0.1,
        armSwingRight: -0.15,
        armSwingAsymmetry: -0.02,
        kneeFlexLeft: -12.5,
        kneeFlexRight: -10.0,
        kneeAsymmetry: -1.5,
        overallScore: -15,
        stabilityScore: -20,
        mobilityScore: -30,
        symmetryScore: -5,
        rhythmScore: -10,
        automaticityScore: -40,
        series: [],
        stepEvents: [],
      } as unknown as GaitMetrics;

      const csv = exportGaitMetricsAsCsv(negativeMetrics);

      expect(csv).toContain('"Gait Speed","-0.50","m/s","1.10 - 1.40"');
      expect(csv).toContain('"Cadence","-10","spm","100 - 120"');
      expect(csv).toContain('"Left Knee ROM","-12.5","deg","55 - 65 deg"');
      expect(csv).toContain('"Pelvic Obliquity","-4.50","deg","< 4.0 deg"');
      expect(csv).toContain('"Overall Score","-15","/100",">= 75"');
    });

    it("verifies doubleSupport fallback logic between doubleSupportPct and doubleSupportHint", () => {
      // Case A: doubleSupportPct exists -> uses doubleSupportPct
      const metricsA: GaitMetrics = { doubleSupportPct: 18.5, doubleSupportHint: 0.15 } as any;
      expect(exportGaitMetricsAsCsv(metricsA)).toContain('"Double Support Phase","18.5","%","15 - 22%"');

      // Case B: doubleSupportPct is null, doubleSupportHint exists -> uses doubleSupportHint * 100
      const metricsB: GaitMetrics = { doubleSupportPct: null, doubleSupportHint: 0.175 } as any;
      expect(exportGaitMetricsAsCsv(metricsB)).toContain('"Double Support Phase","17.5","%","15 - 22%"');

      // Case C: doubleSupportPct is NaN, doubleSupportHint exists -> uses doubleSupportHint * 100
      const metricsC: GaitMetrics = { doubleSupportPct: NaN, doubleSupportHint: 0.22 } as any;
      expect(exportGaitMetricsAsCsv(metricsC)).toContain('"Double Support Phase","22.0","%","15 - 22%"');

      // Case D: doubleSupportPct is null, doubleSupportHint is NaN -> outputs N/A
      const metricsD: GaitMetrics = { doubleSupportPct: null, doubleSupportHint: NaN } as any;
      expect(exportGaitMetricsAsCsv(metricsD)).toContain('"Double Support Phase","N/A","%","15 - 22%"');
    });
  });

  // --------------------------------------------------------------------------
  // 2. exportTimeSeriesKinematicsAsCsv Stress Testing
  // --------------------------------------------------------------------------
  describe("exportTimeSeriesKinematicsAsCsv - Adversarial Series Data", () => {
    const expectedHeaders =
      "Timestamp_s,MidHip_X,MidHip_Y,LeftAnkle_Y,RightAnkle_Y,LeftWrist_X,RightWrist_X,LeftKnee_Angle_Deg,RightKnee_Angle_Deg";

    it("handles undefined, null, and empty array inputs", () => {
      expect(exportTimeSeriesKinematicsAsCsv(undefined as any)).toBe(expectedHeaders);
      expect(exportTimeSeriesKinematicsAsCsv(null as any)).toBe(expectedHeaders);
      expect(exportTimeSeriesKinematicsAsCsv([])).toBe(expectedHeaders);
    });

    it("handles sparse frame entries with missing properties", () => {
      const sparseSeries = [
        { t: 0.0 }, // completely empty frame
        { t: 0.033, midHipX: 0.5 }, // only t and midHipX
        { t: 0.066, leftKneeAngle: 45.2 }, // only t and leftKneeAngle
      ];

      const csv = exportTimeSeriesKinematicsAsCsv(sparseSeries as any);
      const lines = csv.trim().split("\n");

      expect(lines.length).toBe(4);
      expect(lines[1]).toBe("0.0000,,,,,,,,");
      expect(lines[2]).toBe("0.0330,0.5000,,,,,,,");
      expect(lines[3]).toBe("0.0660,,,,,,,45.20,");
    });

    it("handles null and undefined elements within series array gracefully", () => {
      const seriesWithCorruptedElements = [
        null as any,
        undefined as any,
        { t: 0.1, midHipX: 0.52, midHipY: 0.48, leftAnkleY: 0.81, rightAnkleY: 0.79, leftWristX: 0.39, rightWristX: 0.61, leftKneeAngle: 20.0, rightKneeAngle: 18.5 },
      ];

      let csv = "";
      expect(() => {
        csv = exportTimeSeriesKinematicsAsCsv(seriesWithCorruptedElements);
      }).not.toThrow();

      const lines = csv.trim().split("\n");
      expect(lines.length).toBe(4);
      expect(lines[1]).toBe(",,,,,,,,");
      expect(lines[2]).toBe(",,,,,,,,");
      expect(lines[3]).toBe("0.1000,0.5200,0.4800,0.8100,0.7900,0.3900,0.6100,20.00,18.50");
    });

    it("handles NaN coordinates in frame points without throwing or printing NaN", () => {
      const nanSeries = [
        {
          t: NaN,
          midHipX: NaN,
          midHipY: 0.5,
          leftAnkleY: NaN,
          rightAnkleY: 0.8,
          leftWristX: NaN,
          rightWristX: NaN,
          leftKneeAngle: NaN,
          rightKneeAngle: 15.0,
        },
      ];

      const csv = exportTimeSeriesKinematicsAsCsv(nanSeries);
      const lines = csv.trim().split("\n");

      expect(lines.length).toBe(2);
      expect(lines[1]).toBe(",,0.5000,,0.8000,,,,15.00");
      expect(csv).not.toContain("NaN");
    });

    it("supports property aliases kneeAngleLeft and kneeAngleRight when primary names are undefined or null", () => {
      const aliasSeries = [
        {
          t: 0.05,
          midHipX: 0.5,
          midHipY: 0.5,
          leftAnkleY: 0.8,
          rightAnkleY: 0.8,
          leftWristX: 0.4,
          rightWristX: 0.6,
          // Primary names omitted (undefined)
          kneeAngleLeft: 35.4,
          kneeAngleRight: 32.1,
        },
        {
          t: 0.10,
          midHipX: 0.5,
          midHipY: 0.5,
          leftAnkleY: 0.8,
          rightAnkleY: 0.8,
          leftWristX: 0.4,
          rightWristX: 0.6,
          // Primary names explicitly null
          leftKneeAngle: null as any,
          rightKneeAngle: null as any,
          kneeAngleLeft: 40.0,
          kneeAngleRight: 38.0,
        },
        {
          t: 0.15,
          midHipX: 0.5,
          midHipY: 0.5,
          leftAnkleY: 0.8,
          rightAnkleY: 0.8,
          leftWristX: 0.4,
          rightWristX: 0.6,
          // Both primary and alias present -> primary should take precedence
          leftKneeAngle: 10.0,
          rightKneeAngle: 12.0,
          kneeAngleLeft: 99.0,
          kneeAngleRight: 99.0,
        },
      ];

      const csv = exportTimeSeriesKinematicsAsCsv(aliasSeries as any);
      const lines = csv.trim().split("\n");

      expect(lines.length).toBe(4);
      expect(lines[1]).toBe("0.0500,0.5000,0.5000,0.8000,0.8000,0.4000,0.6000,35.40,32.10");
      expect(lines[2]).toBe("0.1000,0.5000,0.5000,0.8000,0.8000,0.4000,0.6000,40.00,38.00");
      expect(lines[3]).toBe("0.1500,0.5000,0.5000,0.8000,0.8000,0.4000,0.6000,10.00,12.00");
    });

    it("handles negative timestamps and coordinates", () => {
      const negativeSeries = [
        {
          t: -0.5,
          midHipX: -0.25,
          midHipY: -0.10,
          leftAnkleY: -0.80,
          rightAnkleY: -0.75,
          leftWristX: -0.45,
          rightWristX: -0.55,
          leftKneeAngle: -15.5,
          rightKneeAngle: -10.2,
        },
      ];

      const csv = exportTimeSeriesKinematicsAsCsv(negativeSeries);
      const lines = csv.trim().split("\n");
      expect(lines[1]).toBe("-0.5000,-0.2500,-0.1000,-0.8000,-0.7500,-0.4500,-0.5500,-15.50,-10.20");
    });
  });

  // --------------------------------------------------------------------------
  // 3. exportGaitSessionAsJson & downloadBlob Verification
  // --------------------------------------------------------------------------
  describe("exportGaitSessionAsJson & downloadBlob", () => {
    it("exports valid JSON structure when result metrics contain missing/null subfields", () => {
      const partialResult: AnalysisResult = {
        metrics: {} as GaitMetrics,
        guesses: [],
        personId: 99,
        analyzedFrames: 0,
        notes: [],
        taskMode: "dual",
      };

      const jsonStr = exportGaitSessionAsJson(partialResult);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.metadata.patient.patientId).toBe("ANONYMOUS");
      expect(parsed.analyzedFrames).toBe(0);
      expect(parsed.taskMode).toBe("dual");
    });
  });
});

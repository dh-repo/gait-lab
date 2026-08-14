import { describe, it, expect, vi } from "vitest";
import {
  exportGaitSessionAsJson,
  exportGaitMetricsAsCsv,
  exportTimeSeriesKinematicsAsCsv,
  downloadBlob,
} from "../export";
import type { AnalysisResult, GaitMetrics } from "../types";

describe("Kinematic Data Exporter", () => {
  const mockMetrics: GaitMetrics = {
    viewAngle: "sagittal",
    viewConfidence: 0.95,
    durationSec: 10.0,
    fpsEffective: 30,
    stepCount: 18,
    cadenceSpm: 108,
    avgStepTimeSec: 0.55,
    stepTimeAsymmetry: 0.01,
    strideAsymmetry: 0.012,
    lateralSway: 0.025,
    verticalBounce: 0.03,
    armSwingLeft: 0.2,
    armSwingRight: 0.2,
    armSwingAsymmetry: 0.02,
    kneeFlexLeft: 60.5,
    kneeFlexRight: 59.8,
    kneeAsymmetry: 1.2,
    stepWidthVariability: 0.01,
    doubleSupportHint: 0.2,
    leftStancePct: 61.2,
    rightStancePct: 58.8,
    leftSwingPct: 38.8,
    rightSwingPct: 41.2,
    doubleSupportPct: 20.0,
    symmetryAngle: 2.1,
    stepTimeCV: 0.022,
    strideTimeCV: 0.018,
    pelvicObliquity: 2.5,
    pelvicObliquityVar: 0.4,
    meanStepWidth: 0.11,
    pathSmoothness: 0.92,
    stabilityScore: 85,
    rhythmScore: 88,
    symmetryScore: 90,
    mobilityScore: 84,
    automaticityScore: 87,
    overallScore: 86,
    gaitSpeedMps: 1.25,
    series: [
      {
        t: 0.0,
        midHipX: 0.5,
        midHipY: 0.5,
        leftAnkleY: 0.8,
        rightAnkleY: 0.8,
        leftWristX: 0.4,
        rightWristX: 0.6,
        leftKneeAngle: 15.0,
        rightKneeAngle: 14.5,
      },
      {
        t: 0.0333,
        midHipX: 0.51,
        midHipY: 0.5,
        leftAnkleY: 0.78,
        rightAnkleY: 0.82,
        leftWristX: 0.41,
        rightWristX: 0.59,
        leftKneeAngle: 18.0,
        rightKneeAngle: 12.0,
      },
    ],
    stepEvents: [],
  };

  const mockAnalysis: AnalysisResult = {
    metrics: mockMetrics,
    guesses: [],
    personId: 1,
    analyzedFrames: 300,
    notes: ["Session completed cleanly"],
    taskMode: "single",
  };

  describe("exportGaitSessionAsJson", () => {
    it("exports session accurately into valid JSON with custom patient metadata", () => {
      const jsonStr = exportGaitSessionAsJson(mockAnalysis, {
        patientId: "PT-TEST-101",
        assessmentDate: "2026-08-13",
        assessmentCondition: "Single-Task Baseline",
        clinicianNotes: "Patient ambulatory without assistive device.",
      });

      const parsed = JSON.parse(jsonStr);
      expect(parsed.metadata.patient.patientId).toBe("PT-TEST-101");
      expect(parsed.metadata.patient.assessmentDate).toBe("2026-08-13");
      expect(parsed.metadata.patient.assessmentCondition).toBe("Single-Task Baseline");
      expect(parsed.metadata.patient.clinicianNotes).toBe("Patient ambulatory without assistive device.");
      expect(parsed.metrics.cadenceSpm).toBe(108);
      expect(parsed.metrics.gaitSpeedMps).toBe(1.25);
      expect(parsed.analyzedFrames).toBe(300);
      expect(parsed.taskMode).toBe("single");
    });

    it("generates default anonymous patient metadata when patientMeta is omitted", () => {
      const jsonStr = exportGaitSessionAsJson(mockAnalysis);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.metadata.patient.patientId).toBe("ANONYMOUS");
      expect(parsed.metadata.patient.assessmentCondition).toBe("Single-Task Walk");
      expect(typeof parsed.metadata.exportedAt).toBe("string");
      expect(parsed.metadata.exportedAt).toContain("T");
    });

    it("handles session export cleanly when optional fields (dualTaskCost, angleAnalysis) are undefined", () => {
      const analysisWithoutOptional: AnalysisResult = {
        ...mockAnalysis,
        dualTaskCost: undefined,
        angleAnalysis: undefined,
      };

      const jsonStr = exportGaitSessionAsJson(analysisWithoutOptional);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.dualTaskCost).toBeUndefined();
      expect(parsed.angleAnalysis).toBeUndefined();
      expect(parsed.analyzedFrames).toBe(300);
    });
  });

  describe("exportGaitMetricsAsCsv", () => {
    it("exports tabular summary CSV with required headers and all expanded metrics", () => {
      const csv = exportGaitMetricsAsCsv(mockMetrics);
      expect(csv).toContain("Parameter,Value,Unit,Reference Range");

      const requiredMetrics = [
        "Gait Speed",
        "Cadence",
        "Duration",
        "Step Count",
        "Avg Step Time",
        "Step Time CV",
        "Stride Time CV",
        "Left Stance Phase",
        "Right Stance Phase",
        "Left Swing Phase",
        "Right Swing Phase",
        "Double Support Phase",
        "Zifchock Symmetry Angle",
        "Step Time Asymmetry",
        "Stride Asymmetry",
        "Mean Step Width",
        "Lateral Trunk Sway",
        "Vertical CoM Bounce",
        "Pelvic Obliquity",
        "Pelvic Obliquity Var",
        "Left Arm Swing Amplitude",
        "Right Arm Swing Amplitude",
        "Arm Swing Asymmetry",
        "Left Knee ROM",
        "Right Knee ROM",
        "Knee Flexion Asymmetry",
        "Overall Score",
        "Stability Score",
        "Mobility Score",
        "Symmetry Score",
        "Rhythm Score",
        "Automaticity Score",
      ];

      for (const metricName of requiredMetrics) {
        expect(csv).toContain(`"${metricName}"`);
      }

      // Check line count: Header + 32 metrics = 33 lines
      const lines = csv.trim().split("\n");
      expect(lines.length).toBe(33);
    });

    it('exports "N/A" for null or undefined metric fields instead of fake default numbers', () => {
      const nullMetrics: GaitMetrics = {
        ...mockMetrics,
        leftStancePct: null,
        rightStancePct: null,
        leftSwingPct: null,
        rightSwingPct: null,
        doubleSupportPct: null,
        doubleSupportHint: undefined as any,
        meanStepWidth: null,
        kneeFlexLeft: null,
        kneeFlexRight: null,
        kneeAsymmetry: null,
        pelvicObliquity: null,
        pelvicObliquityVar: null,
        strideAsymmetry: null,
        lateralSway: null,
        overallScore: null as any,
        stabilityScore: undefined as any,
      };

      const csv = exportGaitMetricsAsCsv(nullMetrics);

      expect(csv).toContain('"Left Stance Phase","N/A","%","58 - 62%"');
      expect(csv).toContain('"Right Stance Phase","N/A","%","58 - 62%"');
      expect(csv).toContain('"Left Swing Phase","N/A","%","38 - 42%"');
      expect(csv).toContain('"Right Swing Phase","N/A","%","38 - 42%"');
      expect(csv).toContain('"Double Support Phase","N/A","%","15 - 22%"');
      expect(csv).toContain('"Mean Step Width","N/A","cm","8.0 - 12.0"');
      expect(csv).toContain('"Left Knee ROM","N/A","deg","55 - 65 deg"');
      expect(csv).toContain('"Pelvic Obliquity","N/A","deg","< 4.0 deg"');

      // Verify fake hardcoded defaults do NOT appear for missing metrics
      expect(csv).not.toContain('"Left Stance Phase","60.0"');
      expect(csv).not.toContain('"Right Stance Phase","60.0"');
      expect(csv).not.toContain('"Left Swing Phase","40.0"');
      expect(csv).not.toContain('"Right Swing Phase","40.0"');
      expect(csv).not.toContain('"Mean Step Width","12.0"');
    });

    it("correctly formats units and numerical rounding for populated metrics", () => {
      const csv = exportGaitMetricsAsCsv(mockMetrics);

      expect(csv).toContain('"Gait Speed","1.25","m/s","1.10 - 1.40"');
      expect(csv).toContain('"Cadence","108","spm","100 - 120"');
      expect(csv).toContain('"Duration","10.00","s","-"');
      expect(csv).toContain('"Step Count","18","steps","-"');
      expect(csv).toContain('"Avg Step Time","0.550","s","0.45 - 0.60"');
      expect(csv).toContain('"Step Time CV","2.20","%","< 3.5%"');
      expect(csv).toContain('"Stride Time CV","1.80","%","< 3.0%"');
      expect(csv).toContain('"Left Stance Phase","61.2","%","58 - 62%"');
      expect(csv).toContain('"Right Stance Phase","58.8","%","58 - 62%"');
      expect(csv).toContain('"Zifchock Symmetry Angle","2.10","%","< 5.0%"');
      expect(csv).toContain('"Mean Step Width","11.0","cm","8.0 - 12.0"');
      expect(csv).toContain('"Overall Score","86","/100",">= 75"');
      expect(csv).toContain('"Stability Score","85","/100",">= 75"');
    });
  });

  describe("exportTimeSeriesKinematicsAsCsv", () => {
    it("exports time-series kinematics CSV for valid series entries with 4-decimal precision", () => {
      const csv = exportTimeSeriesKinematicsAsCsv(mockMetrics.series);
      expect(csv).toContain(
        "Timestamp_s,MidHip_X,MidHip_Y,LeftAnkle_Y,RightAnkle_Y,LeftWrist_X,RightWrist_X,LeftKnee_Angle_Deg,RightKnee_Angle_Deg"
      );

      const lines = csv.trim().split("\n");
      expect(lines.length).toBe(3); // Header + 2 data rows
      expect(lines[1]).toBe("0.0000,0.5000,0.5000,0.8000,0.8000,0.4000,0.6000,15.00,14.50");
      expect(lines[2]).toBe("0.0333,0.5100,0.5000,0.7800,0.8200,0.4100,0.5900,18.00,12.00");
    });

    it("handles missing, null, or undefined frame properties gracefully without throwing TypeError", () => {
      const incompleteSeries = [
        {
          t: 0.0,
          midHipX: null as any,
          midHipY: 0.5,
          leftAnkleY: undefined as any,
          rightAnkleY: 0.8,
          leftWristX: 0.4,
          rightWristX: NaN,
          leftKneeAngle: undefined as any,
          rightKneeAngle: 14.5,
        },
      ];

      let csv = "";
      expect(() => {
        csv = exportTimeSeriesKinematicsAsCsv(incompleteSeries);
      }).not.toThrow();

      const lines = csv.trim().split("\n");
      expect(lines.length).toBe(2);
      expect(lines[1]).toBe("0.0000,,0.5000,,0.8000,0.4000,,,14.50");
    });

    it("handles empty, null, or undefined series input safely", () => {
      const expectedHeader =
        "Timestamp_s,MidHip_X,MidHip_Y,LeftAnkle_Y,RightAnkle_Y,LeftWrist_X,RightWrist_X,LeftKnee_Angle_Deg,RightKnee_Angle_Deg";

      expect(exportTimeSeriesKinematicsAsCsv([])).toBe(expectedHeader);
      expect(exportTimeSeriesKinematicsAsCsv(null as any)).toBe(expectedHeader);
      expect(exportTimeSeriesKinematicsAsCsv(undefined as any)).toBe(expectedHeader);
    });

    it("supports alternate knee angle property names (kneeAngleLeft / kneeAngleRight)", () => {
      const aliasSeries = [
        {
          t: 0.1,
          midHipX: 0.5,
          midHipY: 0.5,
          leftAnkleY: 0.8,
          rightAnkleY: 0.8,
          leftWristX: 0.4,
          rightWristX: 0.6,
          leftKneeAngle: undefined as any,
          rightKneeAngle: undefined as any,
          kneeAngleLeft: 22.5,
          kneeAngleRight: 19.8,
        },
      ];

      const csv = exportTimeSeriesKinematicsAsCsv(aliasSeries);
      const lines = csv.trim().split("\n");
      expect(lines[1]).toBe("0.1000,0.5000,0.5000,0.8000,0.8000,0.4000,0.6000,22.50,19.80");
    });
  });

  describe("downloadBlob", () => {
    it("triggers browser blob download when window and document are defined", () => {
      const clickMock = vi.fn();
      const appendChildMock = vi.fn();
      const removeChildMock = vi.fn();
      const mockAnchor = {
        href: "",
        download: "",
        click: clickMock,
      };

      const globalAny = globalThis as any;
      const originalWindow = globalAny.window;
      const originalDocument = globalAny.document;
      const originalUrl = globalAny.URL;

      try {
        globalAny.window = {};
        globalAny.document = {
          createElement: vi.fn().mockReturnValue(mockAnchor),
          body: {
            appendChild: appendChildMock,
            removeChild: removeChildMock,
          },
        };
        globalAny.URL = {
          createObjectURL: vi.fn().mockReturnValue("blob:http://localhost/mock-uuid"),
          revokeObjectURL: vi.fn(),
        };

        downloadBlob("test content", "export.csv", "text/csv");

        expect(globalAny.document.createElement).toHaveBeenCalledWith("a");
        expect(mockAnchor.download).toBe("export.csv");
        expect(mockAnchor.href).toBe("blob:http://localhost/mock-uuid");
        expect(appendChildMock).toHaveBeenCalledWith(mockAnchor);
        expect(clickMock).toHaveBeenCalled();
        expect(removeChildMock).toHaveBeenCalledWith(mockAnchor);
        expect(globalAny.URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-uuid");
      } finally {
        globalAny.window = originalWindow;
        globalAny.document = originalDocument;
        globalAny.URL = originalUrl;
      }
    });

    it("safely exits without throwing when running in SSR environment (window undefined)", () => {
      const globalAny = globalThis as any;
      const originalWindow = globalAny.window;
      try {
        delete globalAny.window;
        expect(() => {
          downloadBlob("test content", "export.csv");
        }).not.toThrow();
      } finally {
        globalAny.window = originalWindow;
      }
    });
  });
});


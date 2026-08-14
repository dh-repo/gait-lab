import { describe, it, expect, vi } from "vitest";
import {
  exportGaitSessionAsJson,
  exportGaitMetricsAsCsv,
  exportTimeSeriesKinematicsAsCsv,
  downloadBlob,
} from "../export";
import type { AnalysisResult, GaitMetrics, PatientMetadata } from "../types";

describe("Milestone 5 Empirical Verification Test Suite (Challenger 2)", () => {
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

  const mockAnalysisResult: AnalysisResult = {
    metrics: mockMetrics,
    guesses: [
      {
        personId: 1,
        confidence: 0.98,
        matchedFeatures: { height: 1.75, gaitSpeed: 1.25 },
      } as any,
    ],
    personId: 1,
    analyzedFrames: 300,
    notes: ["Clean session without occlusion"],
    taskMode: "single",
    dualTaskCost: undefined,
    angleAnalysis: {
      flexionExtremes: [],
      cadenceSpm: 108,
      asymmetryPct: 1.2,
      qualityScore: 90,
    } as any,
  };

  describe("1. exportGaitSessionAsJson Empirical Verification", () => {
    it("1.1 Exports valid JSON when all optional parameters are missing or undefined", () => {
      const minimalAnalysis: AnalysisResult = {
        metrics: mockMetrics,
        guesses: [],
        personId: undefined as any,
        analyzedFrames: 0,
        notes: undefined as any,
        taskMode: undefined as any,
        dualTaskCost: undefined,
        angleAnalysis: undefined,
      };

      let jsonString = "";
      expect(() => {
        jsonString = exportGaitSessionAsJson(minimalAnalysis);
      }).not.toThrow();

      expect(typeof jsonString).toBe("string");
      const parsed = JSON.parse(jsonString);

      expect(parsed.metrics).toEqual(mockMetrics);
      expect(parsed.guesses).toEqual([]);
      expect(parsed.dualTaskCost).toBeUndefined();
      expect(parsed.angleAnalysis).toBeUndefined();
      expect(parsed.analyzedFrames).toBe(0);
      expect(parsed.taskMode).toBeUndefined();
      expect(parsed.metadata.patient.patientId).toBe("ANONYMOUS");
    });

    it("1.2 Correctly serializes custom patient metadata with special characters, quotes, and newlines", () => {
      const customMeta: PatientMetadata = {
        patientId: "PT-999-SPECIAL",
        assessmentDate: "2026-08-13",
        assessmentCondition: "Dual-Task Fast Walk <script>alert(1)</script>",
        clinicianNotes: 'Notes with "double quotes", \'singles\', \n newlines, \t tabs, and emoji 🚶‍♂️',
      };

      const jsonString = exportGaitSessionAsJson(mockAnalysisResult, customMeta);
      const parsed = JSON.parse(jsonString);

      expect(parsed.metadata.patient.patientId).toBe("PT-999-SPECIAL");
      expect(parsed.metadata.patient.assessmentDate).toBe("2026-08-13");
      expect(parsed.metadata.patient.assessmentCondition).toBe(
        "Dual-Task Fast Walk <script>alert(1)</script>"
      );
      expect(parsed.metadata.patient.clinicianNotes).toBe(
        'Notes with "double quotes", \'singles\', \n newlines, \t tabs, and emoji 🚶‍♂️'
      );
    });

    it("1.3 Generates default ANONYMOUS fallback metadata when patientMeta is omitted or null", () => {
      // Omitted (undefined)
      const jsonStrUndefined = exportGaitSessionAsJson(mockAnalysisResult);
      const parsedUndefined = JSON.parse(jsonStrUndefined);

      expect(parsedUndefined.metadata.patient.patientId).toBe("ANONYMOUS");
      expect(parsedUndefined.metadata.patient.assessmentCondition).toBe("Single-Task Walk");
      expect(parsedUndefined.metadata.patient.clinicianNotes).toBe("");
      expect(parsedUndefined.metadata.patient.assessmentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(parsedUndefined.metadata.generator).toBe(
        "Gait Lab Quantitative Biomechanics Suite v2.0"
      );
      expect(typeof parsedUndefined.metadata.exportedAt).toBe("string");

      // Passed as null
      const jsonStrNull = exportGaitSessionAsJson(mockAnalysisResult, null as any);
      const parsedNull = JSON.parse(jsonStrNull);
      expect(parsedNull.metadata.patient.patientId).toBe("ANONYMOUS");
    });

    it("1.4 Empirical Vulnerability Test: Partial patientMeta or empty object {} bypasses fallback default object", () => {
      // Empty object passed as patientMeta
      const emptyMeta = {} as PatientMetadata;
      const jsonStr = exportGaitSessionAsJson(mockAnalysisResult, emptyMeta);
      const parsed = JSON.parse(jsonStr);

      // Empirical Observation: empty object {} is truthy, so patientMeta || fallback keeps {}
      // Result: patient.patientId is undefined instead of falling back to "ANONYMOUS"
      expect(parsed.metadata.patient.patientId).toBeUndefined();
      expect(parsed.metadata.patient.assessmentCondition).toBeUndefined();

      // Partial patientMeta missing assessmentDate
      const partialMeta = { patientId: "PT-PARTIAL-101" } as PatientMetadata;
      const jsonStrPartial = exportGaitSessionAsJson(mockAnalysisResult, partialMeta);
      const parsedPartial = JSON.parse(jsonStrPartial);

      expect(parsedPartial.metadata.patient.patientId).toBe("PT-PARTIAL-101");
      expect(parsedPartial.metadata.patient.assessmentDate).toBeUndefined();
    });
  });

  describe("2. CSV Export Functions Empirical Verification", () => {
    it("2.1 exportGaitMetricsAsCsv handles missing/null/NaN metrics cleanly with N/A fallbacks", () => {
      const incompleteMetrics: GaitMetrics = {
        ...mockMetrics,
        gaitSpeedMps: null as any,
        cadenceSpm: NaN,
        leftStancePct: undefined as any,
        doubleSupportPct: null as any,
        doubleSupportHint: 0.18, // should fallback to 0.18 * 100 = 18.0
        overallScore: null as any,
      };

      const csv = exportGaitMetricsAsCsv(incompleteMetrics);
      expect(csv).toContain('"Gait Speed","N/A","m/s","1.10 - 1.40"');
      expect(csv).toContain('"Cadence","N/A","spm","100 - 120"');
      expect(csv).toContain('"Left Stance Phase","N/A","%","58 - 62%"');
      expect(csv).toContain('"Double Support Phase","18.0","%","15 - 22%"');
      expect(csv).toContain('"Overall Score","N/A","/100",">= 75"');
    });

    it("2.2 exportTimeSeriesKinematicsAsCsv handles missing frame data and alternate property names", () => {
      const aliasAndMissingSeries = [
        {
          t: 0.123456,
          midHipX: 0.5,
          midHipY: null as any,
          kneeAngleLeft: 45.123, // alternate alias
          kneeAngleRight: 42.456, // alternate alias
        },
      ];

      const csv = exportTimeSeriesKinematicsAsCsv(aliasAndMissingSeries);
      const lines = csv.trim().split("\n");
      expect(lines.length).toBe(2);
      expect(lines[1]).toBe("0.1235,0.5000,,,,,,45.12,42.46");
    });
  });

  describe("3. downloadBlob SSR & DOM Stress Verification", () => {
    it("3.1 Exits safely without throwing in Node SSR environment (window or document undefined)", () => {
      const globalAny = globalThis as any;
      const originalWindow = globalAny.window;
      const originalDocument = globalAny.document;

      try {
        delete globalAny.window;
        delete globalAny.document;

        expect(() => {
          downloadBlob("test payload", "test.json", "application/json");
        }).not.toThrow();

        globalAny.window = {};
        delete globalAny.document;

        expect(() => {
          downloadBlob("test payload", "test.json", "application/json");
        }).not.toThrow();

        delete globalAny.window;
        globalAny.document = {};

        expect(() => {
          downloadBlob("test payload", "test.json", "application/json");
        }).not.toThrow();
      } finally {
        globalAny.window = originalWindow;
        globalAny.document = originalDocument;
      }
    });

    it("3.2 Triggers full DOM download lifecycle (create, append, click, remove, revoke) in browser context", () => {
      const clickMock = vi.fn();
      const appendChildMock = vi.fn();
      const removeChildMock = vi.fn();
      const revokeMock = vi.fn();
      const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/mock-uuid-1234");

      const mockLink = {
        href: "",
        download: "",
        click: clickMock,
      };

      const globalAny = globalThis as any;
      const originalWindow = globalAny.window;
      const originalDocument = globalAny.document;
      const originalURL = globalAny.URL;

      try {
        globalAny.window = {};
        globalAny.document = {
          createElement: vi.fn().mockReturnValue(mockLink),
          body: {
            appendChild: appendChildMock,
            removeChild: removeChildMock,
          },
        };
        globalAny.URL = {
          createObjectURL: createObjectURLMock,
          revokeObjectURL: revokeMock,
        };

        downloadBlob('{"key":"value"}', "gait_session_PT101.json", "application/json");

        expect(globalAny.document.createElement).toHaveBeenCalledWith("a");
        expect(mockLink.href).toBe("blob:http://localhost/mock-uuid-1234");
        expect(mockLink.download).toBe("gait_session_PT101.json");
        expect(appendChildMock).toHaveBeenCalledWith(mockLink);
        expect(clickMock).toHaveBeenCalledTimes(1);
        expect(removeChildMock).toHaveBeenCalledWith(mockLink);
        expect(revokeMock).toHaveBeenCalledWith("blob:http://localhost/mock-uuid-1234");
      } finally {
        globalAny.window = originalWindow;
        globalAny.document = originalDocument;
        globalAny.URL = originalURL;
      }
    });

    it("3.3 Empirical Failure Mode Test A: Unhandled TypeError and ObjectURL memory leak when document.body is null", () => {
      const globalAny = globalThis as any;
      const originalWindow = globalAny.window;
      const originalDocument = globalAny.document;
      const originalURL = globalAny.URL;

      const revokeMock = vi.fn();
      const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/leaked-blob-url-1");

      try {
        globalAny.window = {};
        // Scenario: document.body is null (e.g. script executed in <head> before <body> exists)
        globalAny.document = {
          createElement: vi.fn().mockReturnValue({ href: "", download: "", click: vi.fn() }),
          body: null,
        };
        globalAny.URL = {
          createObjectURL: createObjectURLMock,
          revokeObjectURL: revokeMock,
        };

        let thrownErr: any = null;
        try {
          downloadBlob("some text", "file.txt");
        } catch (err) {
          thrownErr = err;
        }

        // Empirical check: document.body being null causes an unhandled TypeError
        expect(thrownErr).not.toBeNull();
        expect(thrownErr instanceof TypeError).toBe(true);

        // Empirical check: revokeObjectURL is NOT called when appendChild throws, resulting in a memory leak!
        expect(revokeMock).not.toHaveBeenCalled();
      } finally {
        globalAny.window = originalWindow;
        globalAny.document = originalDocument;
        globalAny.URL = originalURL;
      }
    });

    it("3.4 Empirical Failure Mode Test B: Element orphan and ObjectURL leak when link.click() throws", () => {
      const globalAny = globalThis as any;
      const originalWindow = globalAny.window;
      const originalDocument = globalAny.document;
      const originalURL = globalAny.URL;

      const removeChildMock = vi.fn();
      const revokeMock = vi.fn();
      const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/leaked-blob-url-2");

      try {
        globalAny.window = {};
        globalAny.document = {
          createElement: vi.fn().mockReturnValue({
            href: "",
            download: "",
            click: () => {
              throw new Error("SecurityError: Blocked auto-download");
            },
          }),
          body: {
            appendChild: vi.fn(),
            removeChild: removeChildMock,
          },
        };
        globalAny.URL = {
          createObjectURL: createObjectURLMock,
          revokeObjectURL: revokeMock,
        };

        expect(() => {
          downloadBlob("test content", "export.csv");
        }).toThrow("SecurityError: Blocked auto-download");

        // Empirical Observation: because there is no try...finally block:
        // 1. removeChild is NOT called (anchor element remains orphaned in document.body)
        expect(removeChildMock).not.toHaveBeenCalled();
        // 2. revokeObjectURL is NOT called (Blob ObjectURL is leaked)
        expect(revokeMock).not.toHaveBeenCalled();
      } finally {
        globalAny.window = originalWindow;
        globalAny.document = originalDocument;
        globalAny.URL = originalURL;
      }
    });

    it("3.5 Handles large payloads (1MB) and special character filenames without crashing", () => {
      const largePayload = "X".repeat(1024 * 1024); // 1MB string
      const specialFilename = "gait_session_PT#101&date=2026/08/13.json";

      const clickMock = vi.fn();
      const globalAny = globalThis as any;
      const originalWindow = globalAny.window;
      const originalDocument = globalAny.document;
      const originalURL = globalAny.URL;

      try {
        globalAny.window = {};
        globalAny.document = {
          createElement: vi.fn().mockReturnValue({ href: "", download: "", click: clickMock }),
          body: {
            appendChild: vi.fn(),
            removeChild: vi.fn(),
          },
        };
        globalAny.URL = {
          createObjectURL: (_createObjectURLMock: any) => "blob:http://localhost/large-blob",
          revokeObjectURL: vi.fn(),
        };

        expect(() => {
          downloadBlob(largePayload, specialFilename, "application/json");
        }).not.toThrow();

        expect(clickMock).toHaveBeenCalled();
      } finally {
        globalAny.window = originalWindow;
        globalAny.document = originalDocument;
        globalAny.URL = originalURL;
      }
    });
  });
});

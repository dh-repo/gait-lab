import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JointAnglesChart } from "@/components/gait/JointAnglesChart";
import { ClinicalReportView } from "@/components/gait/ClinicalReportView";
import { CognitiveClusters } from "@/components/gait/CognitiveClusters";
import { ReportPanel } from "@/components/gait/ReportPanel";
import { createMockMetrics } from "./testHelpers";
import type { AnalysisResult, GaitMetrics, PatientMetadata, DualTaskCost } from "../types";
import type { GaitAngleAnalysis } from "../angles";
import type { GaitSessionRecord } from "../persistence";

describe("Milestone 1 Empirical Stress Test Suite (Challenger M1-2)", () => {
  const baseMetrics: GaitMetrics = createMockMetrics({
    overallScore: 82,
    mobilityScore: 80,
    symmetryScore: 85,
    stabilityScore: 78,
    rhythmScore: 84,
    automaticityScore: 81,
    cadenceSpm: 108,
    stepCount: 14,
    durationSec: 7.2,
    viewAngle: "sagittal",
    symmetryAngle: 2.4,
  });

  const sampleResult: AnalysisResult = {
    metrics: baseMetrics,
    guesses: [
      {
        id: "g1",
        title: "Normal Gait Pattern",
        summary: "No significant biomechanical deviations.",
        evidence: ["Cadence within normative bounds"],
        confidence: 0.9,
        severity: "low",
        category: "general",
      },
    ],
    personId: 1,
    analyzedFrames: 216,
    taskMode: "single",
    notes: ["Test run"],
  };

  const samplePatientMeta: PatientMetadata = {
    patientId: "PT-77123",
    assessmentDate: "2026-08-09",
    assessmentCondition: "Single-Task Baseline",
    clinicianNotes: "Baseline evaluation post-rehab.",
  };

  const sampleAngleAnalysis: GaitAngleAnalysis = {
    isSuppressed: false,
    normalizedPoints: Array.from({ length: 101 }, (_, i) => ({
      gaitCyclePct: i,
      kneeAngleLeft: 5 + 50 * Math.sin((i / 100) * Math.PI),
      kneeAngleRight: 4 + 48 * Math.sin((i / 100) * Math.PI),
      hipAngleLeft: 25 - 35 * (i / 100),
      hipAngleRight: 24 - 34 * (i / 100),
      ankleAngleLeft: 10 * Math.sin((i / 50) * Math.PI),
      ankleAngleRight: 9 * Math.sin((i / 50) * Math.PI),
    })),
    leftStrides: [],
    rightStrides: [],
    metrics: {
      kneeRomLeft: 55.0,
      kneeRomRight: 52.0,
      kneePeakFlexionLeft: 55.0,
      kneePeakFlexionRight: 52.0,
      kneeAsymmetryPct: 5.6,
      hipRomLeft: 35.0,
      hipRomRight: 34.0,
      hipPeakFlexionLeft: 25.0,
      hipPeakExtensionLeft: -10.0,
      hipPeakFlexionRight: 24.0,
      hipPeakExtensionRight: -10.0,
      hipAsymmetryPct: 2.9,
      ankleRomLeft: 20.0,
      ankleRomRight: 19.0,
      anklePeakDorsiflexionLeft: 10.0,
      anklePeakPlantarflexionLeft: -10.0,
      anklePeakDorsiflexionRight: 9.0,
      anklePeakPlantarflexionRight: -10.0,
      ankleAsymmetryPct: 5.1,
    },
    normativeData: [],
  };

  describe("1. Persistence & Legacy Record Boundary Cases", () => {
    it("handles legacy session record with undefined angleAnalysisJson and patientMetaJson", () => {
      const legacyRecord: GaitSessionRecord = {
        id: "gs_legacy_001",
        userId: "usr_1",
        sessionName: "Legacy Session 2025",
        taskMode: "single",
        overallScore: 75,
        stabilityScore: 70,
        rhythmScore: 72,
        symmetryScore: 80,
        mobilityScore: 76,
        automaticityScore: 74,
        cadenceSpm: 100,
        stepCount: 10,
        durationSec: 6.0,
        viewAngle: "sagittal",
        symmetryAngle: 3.0,
        metricsJson: baseMetrics,
        guessesJson: [],
        angleAnalysisJson: undefined,
        patientMetaJson: undefined,
        createdAt: "2025-10-10T10:00:00Z",
        updatedAt: "2025-10-10T10:00:00Z",
      };

      // Hydration mapping in SessionHistoryDrawer / GaitApp
      const hydratedResult: AnalysisResult = {
        metrics: legacyRecord.metricsJson,
        guesses: legacyRecord.guessesJson,
        personId: 1,
        analyzedFrames: legacyRecord.stepCount * 10,
        notes: [`Loaded from saved session: ${legacyRecord.sessionName}`],
        taskMode: (legacyRecord.taskMode as any) || "single",
        dualTaskCost: legacyRecord.dualTaskJson,
        angleAnalysis: legacyRecord.angleAnalysisJson,
        patientMeta: legacyRecord.patientMetaJson,
      };

      expect(hydratedResult.angleAnalysis).toBeUndefined();
      expect(hydratedResult.patientMeta).toBeUndefined();

      // Ensure rendering with this hydrated legacy result does not crash
      const htmlReport = renderToStaticMarkup(
        <ReportPanel result={hydratedResult} />
      );
      expect(htmlReport).toContain("Clinical summary report");
      expect(htmlReport).toContain("Overall Gait Score");
    });

    it("handles legacy session record missing optional metric fields (symmetryAngle, stancePct)", () => {
      const partialMetrics: GaitMetrics = createMockMetrics({
        overallScore: 60,
        stabilityScore: 60,
        rhythmScore: 60,
        symmetryScore: 60,
        mobilityScore: 60,
        automaticityScore: 60,
        cadenceSpm: 90,
        stepCount: 8,
        durationSec: 5.3,
        stepTimeCV: 0.05,
        stepTimeAsymmetry: 0.04,
        strideTimeCV: 0.04,
        avgStepTimeSec: 0.66,
        doubleSupportPct: undefined as any,
        leftStancePct: undefined as any,
        rightStancePct: undefined as any,
        leftSwingPct: undefined as any,
        rightSwingPct: undefined as any,
        symmetryAngle: undefined as any,
        lateralSway: undefined as any,
        verticalBounce: 0.05,
        pelvicObliquity: undefined as any,
        pathSmoothness: 0.75,
        fpsEffective: 30,
        viewAngle: "frontal",
        viewConfidence: 0.8,
      });

      const legacyResult: AnalysisResult = {
        metrics: partialMetrics,
        guesses: [],
        personId: 1,
        analyzedFrames: 80,
        taskMode: "single",
        notes: ["Legacy test note"],
      };

      const htmlClusters = renderToStaticMarkup(
        <CognitiveClusters metrics={legacyResult.metrics} />
      );
      expect(htmlClusters).toContain("1. Spatiotemporal Pace");
      expect(htmlClusters).toContain("2. Inter-limb Symmetry &amp; ROM");
      expect(htmlClusters).toContain("3. Trunk Stability &amp; Smoothness");

      const htmlView = renderToStaticMarkup(
        <ClinicalReportView
          result={legacyResult}
          patientMeta={samplePatientMeta}
        />
      );
      expect(htmlView).toContain("Gait analysis summary");
    });

    it("handles JSON stringification boundary conditions where JSON fields are raw strings", () => {
      // In some DB configurations or legacy fallback, stringified JSON strings might be passed
      const stringifiedMetrics = JSON.stringify(baseMetrics);
      const stringifiedMeta = JSON.stringify(samplePatientMeta);

      const parsedMetrics = typeof stringifiedMetrics === "string" ? JSON.parse(stringifiedMetrics) : stringifiedMetrics;
      const parsedMeta = typeof stringifiedMeta === "string" ? JSON.parse(stringifiedMeta) : stringifiedMeta;

      expect(parsedMetrics.overallScore).toBe(baseMetrics.overallScore);
      expect(parsedMeta.patientId).toBe(samplePatientMeta.patientId);
    });
  });

  describe("2. JointAnglesChart Edge Case & Incomplete Angle Rendering", () => {
    it("renders gracefully when angleAnalysis is null/undefined or has missing fields", () => {
      const emptyAnalysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        metrics: {
          kneeRomLeft: null as any,
          kneeRomRight: null as any,
          kneePeakFlexionLeft: null as any,
          kneePeakFlexionRight: null as any,
          kneeAsymmetryPct: null as any,
          hipRomLeft: null as any,
          hipRomRight: null as any,
          hipPeakFlexionLeft: null as any,
          hipPeakExtensionLeft: null as any,
          hipPeakFlexionRight: null as any,
          hipPeakExtensionRight: null as any,
          hipAsymmetryPct: null as any,
          ankleRomLeft: null as any,
          ankleRomRight: null as any,
          anklePeakDorsiflexionLeft: null as any,
          anklePeakPlantarflexionLeft: null as any,
          anklePeakDorsiflexionRight: null as any,
          anklePeakPlantarflexionRight: null as any,
          ankleAsymmetryPct: null as any,
        },
        normativeData: [],
      };

      const html = renderToStaticMarkup(<JointAnglesChart angleAnalysis={emptyAnalysis} />);
      expect(html).toContain("Joint Kinematic Angle Trajectories");
      expect(html).toContain("Left Peak ROM: —");
      expect(html).toContain("Right Peak ROM: —");
      expect(html).toContain("ROM Asymmetry: —");
    });

    it("renders when normalizedPoints contains incomplete/NaN joint angles", () => {
      const incompletePointsAnalysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: [
          {
            gaitCyclePct: 0,
            kneeAngleLeft: NaN,
            kneeAngleRight: undefined as any,
            hipAngleLeft: 20,
            hipAngleRight: 20,
            ankleAngleLeft: 5,
            ankleAngleRight: 5,
          },
          {
            gaitCyclePct: 50,
            kneeAngleLeft: 45,
            kneeAngleRight: 40,
            hipAngleLeft: NaN,
            hipAngleRight: 10,
            ankleAngleLeft: 0,
            ankleAngleRight: NaN,
          },
        ],
        leftStrides: [],
        rightStrides: [],
        metrics: sampleAngleAnalysis.metrics,
        normativeData: [],
      };

      const html = renderToStaticMarkup(<JointAnglesChart angleAnalysis={incompletePointsAnalysis} />);
      expect(html).toContain("Joint Kinematic Angle Trajectories");
      expect(html).toContain("Left Peak ROM: 55.0°");
    });

    it("renders view suppression banner without crashing when view angle is frontal", () => {
      const suppressed: GaitAngleAnalysis = {
        isSuppressed: true,
        suppressionReason: "Frontal view suppresses sagittal angles.",
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        metrics: sampleAngleAnalysis.metrics,
        normativeData: [],
      };

      const html = renderToStaticMarkup(<JointAnglesChart angleAnalysis={suppressed} />);
      expect(html).toContain("2D Kinematic View Angle Suppressed");
      expect(html).toContain("Frontal view suppresses sagittal angles.");
    });
  });

  describe("3. ClinicalReportView & Patient Metadata Edge Cases", () => {
    it("renders cleanly with empty patient metadata fields", () => {
      const emptyMeta: PatientMetadata = {
        patientId: "",
        assessmentDate: "",
        assessmentCondition: "",
        clinicianNotes: "",
      };

      const html = renderToStaticMarkup(
        <ClinicalReportView result={sampleResult} patientMeta={emptyMeta} />
      );

      expect(html).toContain('data-testid="patient-id-input"');
      expect(html).toContain('data-testid="assessment-date-input"');
      expect(html).toContain('data-testid="assessment-condition-input"');
      expect(html).toContain('data-testid="clinician-notes-input"');
      expect(html).toContain('data-testid="radar-chart-container"');
      expect(html).toContain('data-testid="clinician-signoff-block"');
    });

    it("renders dual-task cost block when present", () => {
      const dtc: DualTaskCost = {
        cadenceCostPct: 8.5,
        stepTimeCvCostPct: 24.0,
        stabilityCostPts: 4.2,
        automaticityCostPts: 6.0,
        summary: "Significant cognitive-motor interference detected under dual-task condition.",
        cadenceDTE: -8.5,
        stepTimeCvDTE: -24.0,
        symmetryDTE: -1.2,
        cmiClassification: "cognitive_prioritization",
      };

      const dtcResult: AnalysisResult = {
        ...sampleResult,
        taskMode: "dual",
        dualTaskCost: dtc,
      };

      const html = renderToStaticMarkup(
        <ClinicalReportView result={dtcResult} patientMeta={samplePatientMeta} />
      );

      expect(html).toContain("Dual-Task Cost Rating");
      expect(html).toContain("Significant cognitive-motor interference detected under dual-task condition.");
      expect(html).toContain("9%"); // 8.5.toFixed(0) = 9
      expect(html).toContain("24%");
    });
  });

  describe("4. CognitiveClusters Component Edge Cases", () => {
    it("renders without dualTaskCost or angleAnalysis provided", () => {
      const html = renderToStaticMarkup(<CognitiveClusters metrics={baseMetrics} />);

      expect(html).toContain("1. Spatiotemporal Pace");
      expect(html).toContain("2. Inter-limb Symmetry &amp; ROM");
      expect(html).toContain("3. Trunk Stability &amp; Smoothness");
      expect(html).toContain("4. Dual-Task Cognitive Cost");
      expect(html).toContain("Baseline");
    });

    it("evaluates ClinicalStatus thresholds correctly for Normal, Borderline, and Pathological", () => {
      const pathologicalMetrics = createMockMetrics({
        stepTimeCV: 0.12,
        cadenceSpm: 75,
        stepTimeAsymmetry: 0.10,
        symmetryAngle: 8.5,
        stabilityScore: 40,
        pathSmoothness: 0.60,
      });

      const html = renderToStaticMarkup(<CognitiveClusters metrics={pathologicalMetrics} />);
      expect(html).toContain("Outside typical range");
    });
  });

  describe("5. End-to-End Session Hydration & Drawer Integration", () => {
    it("simulates full drawer session load into GaitApp state without exceptions", () => {
      const mockRecord: GaitSessionRecord = {
        id: "gs_test_99",
        userId: "usr_demo",
        sessionName: "Post-op Follow Up",
        taskMode: "dual",
        overallScore: 78,
        stabilityScore: 75,
        rhythmScore: 80,
        symmetryScore: 82,
        mobilityScore: 76,
        automaticityScore: 77,
        cadenceSpm: 104,
        stepCount: 16,
        durationSec: 9.2,
        viewAngle: "sagittal",
        symmetryAngle: 2.8,
        metricsJson: baseMetrics,
        guessesJson: sampleResult.guesses,
        dualTaskJson: {
          cadenceCostPct: 5.0,
          stepTimeCvCostPct: 15.0,
          stabilityCostPts: 2.0,
          automaticityCostPts: 3.0,
          summary: "Mild DTE",
          cadenceDTE: -5.0,
          stepTimeCvDTE: -15.0,
          symmetryDTE: -0.5,
          cmiClassification: "no_interference",
        },
        angleAnalysisJson: sampleAngleAnalysis,
        patientMetaJson: samplePatientMeta,
        createdAt: "2026-08-09T12:00:00Z",
        updatedAt: "2026-08-09T12:00:00Z",
      };

      // Execute drawer load handler logic directly
      let loadedResult: AnalysisResult | null = null;
      let loadedMeta: PatientMetadata | null = null;

      const handleLoadSession = (res: AnalysisResult, _name: string) => {
        loadedResult = res;
        if (res.patientMeta) {
          loadedMeta = res.patientMeta;
        }
      };

      handleLoadSession(
        {
          metrics: mockRecord.metricsJson,
          guesses: mockRecord.guessesJson,
          personId: 1,
          analyzedFrames: mockRecord.stepCount * 10,
          notes: [`Loaded from saved session: ${mockRecord.sessionName}`],
          taskMode: (mockRecord.taskMode as any) || "single",
          dualTaskCost: mockRecord.dualTaskJson,
          angleAnalysis: mockRecord.angleAnalysisJson,
          patientMeta: mockRecord.patientMetaJson,
        },
        mockRecord.sessionName
      );

      expect(loadedResult).not.toBeNull();
      expect(loadedMeta).toEqual(samplePatientMeta);
      expect((loadedResult as any).angleAnalysis).toEqual(sampleAngleAnalysis);

      // Verify rendering of all UI views with this hydrated session
      const reportHtml = renderToStaticMarkup(
        <ReportPanel result={loadedResult!} patientMeta={loadedMeta!} />
      );
      expect(reportHtml).toContain("PT-77123");

      const clustersHtml = renderToStaticMarkup(
        <CognitiveClusters
          metrics={loadedResult!.metrics}
          dualTaskCost={loadedResult!.dualTaskCost}
          angleAnalysis={loadedResult!.angleAnalysis}
        />
      );
      expect(clustersHtml).toContain("Mild DTE");
      expect(clustersHtml).toContain("SA: 2.4%");
    });
  });
});

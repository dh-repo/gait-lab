import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClinicalReportView, type PatientMetadata } from "../ClinicalReportView";
import type { AnalysisResult } from "@/lib/gait/types";

describe("ClinicalReportView Component", () => {
  const mockResult: AnalysisResult = {
    personId: 1,
    analyzedFrames: 300,
    taskMode: "single",
    notes: ["Sample test session"],
    metrics: {
      viewAngle: "sagittal",
      viewConfidence: 0.95,
      durationSec: 10.0,
      fpsEffective: 30,
      stepCount: 18,
      cadenceSpm: 108,
      avgStepTimeSec: 0.555,
      stepTimeAsymmetry: 2.1,
      strideAsymmetry: 1.8,
      lateralSway: 0.045,
      verticalBounce: 0.032,
      armSwingLeft: 0.15,
      armSwingRight: 0.14,
      armSwingAsymmetry: 6.6,
      kneeFlexLeft: 60.5,
      kneeFlexRight: 58.2,
      kneeAsymmetry: 3.8,
      stepWidthVariability: 0.012,
      doubleSupportHint: 0.22,
      leftStancePct: 61.2,
      rightStancePct: 60.8,
      leftSwingPct: 38.8,
      rightSwingPct: 39.2,
      doubleSupportPct: 21.5,
      symmetryAngle: 3.2,
      stepTimeCV: 0.021,
      strideTimeCV: 0.019,
      pelvicObliquity: 0.012,
      pelvicObliquityVar: 0.003,
      meanStepWidth: 0.14,
      pathSmoothness: 0.92,
      confidenceIntervals: {
        cadenceSpm: { value: 108, ci95Lower: 104.2, ci95Upper: 111.8, splitHalfDiff: 1.2 },
        stepTimeCV: { value: 0.021, ci95Lower: 0.018, ci95Upper: 0.024, splitHalfDiff: 0.001 },
      },
      stabilityScore: 82,
      rhythmScore: 88,
      symmetryScore: 91,
      mobilityScore: 85,
      automaticityScore: 86,
      overallScore: 86,
      series: [],
      stepEvents: [],
    },
    guesses: [
      {
        id: "g1",
        title: "Typical Casual Gait",
        summary: "Symmetrical step timing and smooth trunk trajectory.",
        evidence: ["Cadence: 108 spm", "Step time CV: 2.1%"],
        confidence: 0.88,
        severity: "low",
        category: "general",
        patternTag: "Normal",
      },
    ],
  };

  const mockPatientMeta: PatientMetadata = {
    patientId: "PT-94821",
    assessmentDate: "2026-08-09",
    assessmentCondition: "Single-Task Walk",
    clinicianNotes: "Patient walks comfortably without assistive device.",
  };

  it("renders 5-domain radar chart container and 5 health domains", () => {
    const html = renderToStaticMarkup(
      <ClinicalReportView result={mockResult} patientMeta={mockPatientMeta} />,
    );

    expect(html).toContain('data-testid="clinical-report-view"');
    expect(html).toContain('data-testid="radar-chart-container"');
    expect(html).toContain("5-Domain Gait Health Radar");
    expect(html).toContain("Pace, Symmetry, Smoothness, Rhythmicity");
    expect(html).toContain("recharts-responsive-container");
  });

  it("renders patient metadata state and form input fields with explicit label associations", () => {
    const html = renderToStaticMarkup(
      <ClinicalReportView result={mockResult} patientMeta={mockPatientMeta} />,
    );

    expect(html).toContain('for="patient-id-input"');
    expect(html).toContain('for="assessment-date-input"');
    expect(html).toContain('for="assessment-condition-input"');
    expect(html).toContain('for="clinician-notes-input"');
    expect(html).toContain('data-testid="patient-id-input"');
    expect(html).toContain('data-testid="assessment-date-input"');
    expect(html).toContain('data-testid="assessment-condition-input"');
    expect(html).toContain('data-testid="clinician-notes-input"');
    expect(html).toContain("PT-94821");
    expect(html).toContain("2026-08-09");
    expect(html).toContain("Single-Task Walk");
    expect(html).toContain("Patient walks comfortably without assistive device.");
  });

  it("renders region landmark with aria-label", () => {
    const html = renderToStaticMarkup(
      <ClinicalReportView result={mockResult} patientMeta={mockPatientMeta} />,
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Clinical Gait Assessment Report"');
  });

  it("triggers window.print when print button handler is invoked", () => {
    const printSpy = vi.fn();
    const win = typeof window !== "undefined" ? window : (globalThis as any);
    const origPrint = win.print;
    win.print = printSpy;

    const onPrintMock = vi.fn(() => win.print());
    const html = renderToStaticMarkup(
      <ClinicalReportView
        result={mockResult}
        patientMeta={mockPatientMeta}
        onPrint={onPrintMock}
      />,
    );

    expect(html).toContain("Print / Export PDF");
    expect(html).toContain('aria-label="Print or Export PDF Report"');
    onPrintMock();
    expect(printSpy).toHaveBeenCalledTimes(1);

    win.print = origPrint;
  });

  it("renders SA badge as N/A when symmetryAngle is unmeasured", () => {
    const noSa: AnalysisResult = {
      ...mockResult,
      metrics: { ...mockResult.metrics, symmetryAngle: undefined },
    };
    const html = renderToStaticMarkup(
      <ClinicalReportView result={noSa} patientMeta={mockPatientMeta} />,
    );

    expect(html).toContain("SA: N/A");
    expect(html).not.toContain("SA: 0.0%");
  });

  it("renders the measured SA value when symmetryAngle is present", () => {
    const html = renderToStaticMarkup(
      <ClinicalReportView result={mockResult} patientMeta={mockPatientMeta} />,
    );

    expect(html).toContain("SA: 3.2%");
  });

  it("prints dual-task tiles with DTE sign convention, not cost sign", () => {
    const withDte: AnalysisResult = {
      ...mockResult,
      taskMode: "dual",
      dualTaskCost: {
        cadenceCostPct: 12.0,
        stepTimeCvCostPct: 18.0,
        stabilityCostPts: 6,
        automaticityCostPts: 4,
        summary:
          "Dual-Task Effect (mutual_interference): Cadence DTE = -12%, Step Time CV DTE = -18%, Symmetry DTE = -3%.",
        cadenceDTE: -12.0,
        stepTimeCvDTE: -18.0,
        cmiClassification: "mutual_interference",
      },
    };
    const html = renderToStaticMarkup(
      <ClinicalReportView result={withDte} patientMeta={mockPatientMeta} />,
    );

    expect(html).toContain("Cadence DTE");
    expect(html).toContain("Step Time CV DTE");
    expect(html).toContain(">-12%<");
    expect(html).toContain("-18");
    expect(html).not.toContain(">12%<");
  });

  it("falls back to negated cost values when DTE fields are absent", () => {
    const noDte: AnalysisResult = {
      ...mockResult,
      taskMode: "dual",
      dualTaskCost: {
        cadenceCostPct: 12.0,
        stepTimeCvCostPct: 18.0,
        stabilityCostPts: 6,
        automaticityCostPts: 4,
        summary: "Dual-task summary",
      },
    };
    const html = renderToStaticMarkup(
      <ClinicalReportView result={noDte} patientMeta={mockPatientMeta} />,
    );

    expect(html).toContain(">-12%<");
    expect(html).toContain("-18");
  });
});

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SOAPNoteModal } from "../SOAPNoteModal";
import type { AnalysisResult, PatientMetadata } from "@/lib/gait/types";

describe("SOAPNoteModal Component & EHR Generator", () => {
  const mockAnalysisWithAnomalies: AnalysisResult = {
    personId: 101,
    analyzedFrames: 300,
    taskMode: "single",
    notes: ["Patient baseline assessment"],
    metrics: {
      viewAngle: "sagittal",
      viewConfidence: 0.95,
      durationSec: 10.0,
      fpsEffective: 30,
      stepCount: 18,
      cadenceSpm: 108,
      avgStepTimeSec: 0.55,
      stepTimeAsymmetry: 0.02,
      strideAsymmetry: 0.015,
      lateralSway: 0.035,
      verticalBounce: 0.03,
      armSwingLeft: 0.2,
      armSwingRight: 0.2,
      armSwingAsymmetry: 0.02,
      kneeFlexLeft: 60,
      kneeFlexRight: 60,
      kneeAsymmetry: 0,
      stepWidthVariability: 0.01,
      doubleSupportHint: 0.2,
      leftStancePct: 48.0, // Triggers antalgic_guarding (stanceDiff = 16%)
      rightStancePct: 64.0,
      leftSwingPct: 52.0,
      rightSwingPct: 36.0,
      doubleSupportPct: 20.0,
      symmetryAngle: 6.5,
      stepTimeCV: 0.025,
      strideTimeCV: 0.02,
      pelvicObliquity: 0.01,
      pelvicObliquityVar: 0.001,
      meanStepWidth: 0.12,
      pathSmoothness: 0.9,
      stabilityScore: 80,
      rhythmScore: 80,
      symmetryScore: 80,
      mobilityScore: 80,
      automaticityScore: 80,
      overallScore: 80,
      gaitSpeedMps: 1.2,
      stepLength: 0.65,
      series: [],
      stepEvents: [],
    },
    guesses: [],
  };

  const mockPatientMeta: PatientMetadata = {
    patientId: "PT-10023",
    assessmentDate: "2026-08-13",
    assessmentCondition: "Single-Task Walk",
    clinicianNotes: "Patient reports left knee stiffness.",
  };

  it("renders trigger button by default when initialOpen is false", () => {
    const html = renderToStaticMarkup(
      <SOAPNoteModal analysis={mockAnalysisWithAnomalies} patientMetadata={mockPatientMeta} />
    );
    expect(html).toContain("Generate EHR SOAP Note");
    expect(html).not.toContain("Automated Clinical SOAP Note");
  });

  it("renders custom trigger element when provided", () => {
    const html = renderToStaticMarkup(
      <SOAPNoteModal
        analysis={mockAnalysisWithAnomalies}
        patientMetadata={mockPatientMeta}
        trigger={<button data-testid="custom-trigger">Open Consultation Note</button>}
      />
    );
    expect(html).toContain('data-testid="custom-trigger"');
    expect(html).toContain("Open Consultation Note");
  });

  it("displays modal header and patient metadata when initialOpen is true", () => {
    const html = renderToStaticMarkup(
      <SOAPNoteModal
        analysis={mockAnalysisWithAnomalies}
        patientMetadata={mockPatientMeta}
        initialOpen={true}
      />
    );
    expect(html).toContain("Automated Clinical SOAP Note");
    expect(html).toContain("PATIENT ID: PT-10023");
    expect(html).toContain("DATE OF ASSESSMENT: 2026-08-13");
    expect(html).toContain("ASSESSMENT PROTOCOL: Single-Task Walk");
  });

  it("renders structured SOAP sections (Subjective, Objective, Assessment, Plan)", () => {
    const html = renderToStaticMarkup(
      <SOAPNoteModal
        analysis={mockAnalysisWithAnomalies}
        patientMetadata={mockPatientMeta}
        initialOpen={true}
      />
    );
    expect(html).toContain("S (SUBJECTIVE):");
    expect(html).toContain("O (OBJECTIVE KINEMATICS &amp; TELEMETRY):");
    expect(html).toContain("A (ASSESSMENT &amp; CLINICAL IMPRESSIONS):");
    expect(html).toContain("P (PLAN &amp; THERAPEUTIC RECOMMENDATIONS):");
  });

  it("formats literature citations under each anomaly finding in Section A", () => {
    const html = renderToStaticMarkup(
      <SOAPNoteModal
        analysis={mockAnalysisWithAnomalies}
        patientMetadata={mockPatientMeta}
        initialOpen={true}
      />
    );
    expect(html).toContain("Antalgic Guarding Pattern");
    expect(html).toContain("- Literature Citation: Perry, J., &amp; Burnfield, J. M. (2010)");
  });

  it("includes therapeutic targets in Section P (Plan)", () => {
    const html = renderToStaticMarkup(
      <SOAPNoteModal
        analysis={mockAnalysisWithAnomalies}
        patientMetadata={mockPatientMeta}
        initialOpen={true}
      />
    );
    expect(html).toContain("- Antalgic Guarding Pattern Focus: Weight-bearing tolerance");
  });

  it("renders fallback message in Section A when no anomalies are detected", () => {
    const normalAnalysis: AnalysisResult = {
      ...mockAnalysisWithAnomalies,
      metrics: {
        ...mockAnalysisWithAnomalies.metrics,
        leftStancePct: 60.0,
        rightStancePct: 60.0,
        symmetryAngle: 1.5,
      },
    };

    const html = renderToStaticMarkup(
      <SOAPNoteModal
        analysis={normalAnalysis}
        patientMetadata={mockPatientMeta}
        initialOpen={true}
      />
    );
    expect(html).toContain(
      "Overall gait kinematics within normal normative biological envelopes."
    );
  });
});

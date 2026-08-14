import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PatientHandoutModal } from "../rehab/PatientHandoutModal";
import type { GaitMetrics, PatientMetadata } from "@/lib/gait/types";
import type { AnomalyFinding } from "@/lib/gait/anomalies";
import { generateHomeExerciseProgram } from "@/lib/gait/rehab/generator";

describe("PatientHandoutModal Component", () => {
  const mockMetrics: GaitMetrics = {
    viewAngle: "sagittal",
    viewConfidence: 0.95,
    durationSec: 10.0,
    fpsEffective: 30,
    stepCount: 18,
    cadenceSpm: 110,
    avgStepTimeSec: 0.545,
    stepTimeAsymmetry: 0.02,
    strideAsymmetry: 0.015,
    lateralSway: 0.035,
    verticalBounce: 0.028,
    armSwingLeft: 0.15,
    armSwingRight: 0.14,
    armSwingAsymmetry: 0.05,
    kneeFlexLeft: 62.0,
    kneeFlexRight: 61.5,
    kneeAsymmetry: 0.02,
    stepWidthVariability: 0.01,
    doubleSupportHint: 0.2,
    leftStancePct: 48.0,
    rightStancePct: 64.0,
    leftSwingPct: 52.0,
    rightSwingPct: 36.0,
    doubleSupportPct: 20.0,
    symmetryAngle: 6.5,
    stepTimeCV: 0.025,
    strideTimeCV: 0.02,
    pelvicObliquity: 0.01,
    pelvicObliquityVar: 0.002,
    meanStepWidth: 0.12,
    pathSmoothness: 0.94,
    stabilityScore: 80,
    rhythmScore: 80,
    symmetryScore: 80,
    mobilityScore: 80,
    automaticityScore: 80,
    overallScore: 80,
    series: [],
    stepEvents: [],
  };

  const mockAnomaly: AnomalyFinding = {
    id: "antalgic_guarding",
    name: "Antalgic Guarding Pattern",
    category: "musculoskeletal",
    severity: "severe",
    confidence: 0.95,
    evidence: ["Marked stance asymmetry (16% difference)"],
    clinicalSignificance: "Pain avoidance behavior",
    literatureCitation: "Perry & Burnfield (2010)",
    therapeuticTarget: "Weight-bearing tolerance",
  };

  const mockPatientMeta: PatientMetadata = {
    patientId: "PT-9021",
    assessmentDate: "2026-08-14",
    assessmentCondition: "Single-Task Walk",
    clinicianNotes: "Left hip pain.",
  };

  const mockProgram = generateHomeExerciseProgram(
    mockMetrics,
    [mockAnomaly],
    undefined,
    mockPatientMeta
  );

  it("renders trigger element when provided and initialOpen is false", () => {
    const html = renderToStaticMarkup(
      <PatientHandoutModal
        program={mockProgram}
        patientMetadata={mockPatientMeta}
        trigger={<button data-testid="open-handout">Open Handout</button>}
      />
    );

    expect(html).toContain('data-testid="open-handout"');
    expect(html).toContain("Open Handout");
    expect(html).not.toContain("GAIT LAB REHABILITATION &amp; PHYSICAL THERAPY");
  });

  it("renders clinic banner, patient ID, and clinician info when open", () => {
    const html = renderToStaticMarkup(
      <PatientHandoutModal
        program={mockProgram}
        patientMetadata={mockPatientMeta}
        isOpen={true}
      />
    );

    expect(html).toContain("GAIT LAB REHABILITATION &amp; PHYSICAL THERAPY");
    expect(html).toContain("PATIENT ID:");
    expect(html).toContain("PT-9021");
    expect(html).toContain("DATE:");
    expect(html).toContain("2026-08-14");
    expect(html).toContain("CLINICIAN:");
  });

  it("renders red flags safety callout box", () => {
    const html = renderToStaticMarkup(
      <PatientHandoutModal
        program={mockProgram}
        patientMetadata={mockPatientMeta}
        isOpen={true}
      />
    );

    expect(html).toContain("When to Stop &amp; Contact the Clinic Immediately (Red Flags)");
    expect(html).toContain("Sudden inability to bear weight on the affected limb.");
  });

  it("renders 7-day adherence tracking grid with Mon-Sun labels", () => {
    const html = renderToStaticMarkup(
      <PatientHandoutModal
        program={mockProgram}
        patientMetadata={mockPatientMeta}
        isOpen={true}
      />
    );

    expect(html).toContain("7-Day Patient Compliance &amp; Adherence Tracker");
    expect(html).toContain("MON");
    expect(html).toContain("TUE");
    expect(html).toContain("WED");
    expect(html).toContain("THU");
    expect(html).toContain("FRI");
    expect(html).toContain("SAT");
    expect(html).toContain("SUN");
  });

  it("renders exercise cards with step-by-step instructions and coaching cues", () => {
    const html = renderToStaticMarkup(
      <PatientHandoutModal
        program={mockProgram}
        patientMetadata={mockPatientMeta}
        isOpen={true}
      />
    );

    expect(html).toContain("Prescribed Exercise Regimen");
    expect(html).toContain("Instructions:");
    expect(html).toContain("Coaching Cue:");
    expect(html).toContain("Sets ×");
    expect(html).toContain("Rest:");
  });

  it("renders clinician verification and signature line", () => {
    const html = renderToStaticMarkup(
      <PatientHandoutModal
        program={mockProgram}
        patientMetadata={mockPatientMeta}
        isOpen={true}
      />
    );

    expect(html).toContain("Clinician Verification &amp; Signature");
    expect(html).toContain("SIGNATURE: __________________________");
    expect(html).toContain("Phase Progression Milestone Criteria");
  });
});

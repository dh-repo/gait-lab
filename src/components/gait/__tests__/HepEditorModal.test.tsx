import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HepEditorModal } from "../rehab/HepEditorModal";
import type { GaitMetrics, PatientMetadata } from "@/lib/gait/types";
import type { AnomalyFinding } from "@/lib/gait/anomalies";
import { generateHomeExerciseProgram } from "@/lib/gait/rehab/generator";

describe("HepEditorModal Component", () => {
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
    clinicianNotes: "Left hip pain following prolonged walking.",
  };

  const mockProgram = generateHomeExerciseProgram(
    mockMetrics,
    [mockAnomaly],
    undefined,
    mockPatientMeta
  );

  it("renders trigger element when initialOpen is false", () => {
    const html = renderToStaticMarkup(
      <HepEditorModal
        initialProgram={mockProgram}
        patientMetadata={mockPatientMeta}
        trigger={<button data-testid="open-hep-editor">Open Customizer</button>}
      />
    );

    expect(html).toContain('data-testid="open-hep-editor"');
    expect(html).toContain("Open Customizer");
    expect(html).not.toContain("Clinical Home Exercise Program (HEP) Customizer");
  });

  it("renders modal header, phase tabs, and telemetry when isOpen is true", () => {
    const html = renderToStaticMarkup(
      <HepEditorModal
        initialProgram={mockProgram}
        patientMetadata={mockPatientMeta}
        isOpen={true}
      />
    );

    expect(html).toContain("Clinical Home Exercise Program (HEP) Customizer");
    expect(html).toContain("Phase 1: Acute / Protective");
    expect(html).toContain("Phase 2: Subacute / Restorative");
    expect(html).toContain("Phase 3: Functional Integration");
    expect(html).toContain("PATIENT ID");
    expect(html).toContain("PT-9021");
    expect(html).toContain("FALL RISK");
  });

  it("renders all prescribed exercise cards with stepper controls", () => {
    const html = renderToStaticMarkup(
      <HepEditorModal
        initialProgram={mockProgram}
        patientMetadata={mockPatientMeta}
        isOpen={true}
      />
    );

    expect(html).toContain("Prescribed Exercises");
    expect(html).toContain("Sets:");
    expect(html).toContain("Reps:");
    expect(html).toContain("Hold (sec):");
    expect(html).toContain("Rest (sec):");
    expect(html).toContain("Days / Wk:");
    expect(html).toContain("Limb:");
    expect(html).toContain("Include");
  });

  it("renders add exercise dropdown with available database options", () => {
    const html = renderToStaticMarkup(
      <HepEditorModal
        initialProgram={mockProgram}
        patientMetadata={mockPatientMeta}
        isOpen={true}
      />
    );

    expect(html).toContain("+ Select Exercise to Add...");
    expect(html).toContain("Add");
  });

  it("renders clinician overall notes textarea and save buttons", () => {
    const html = renderToStaticMarkup(
      <HepEditorModal
        initialProgram={mockProgram}
        patientMetadata={mockPatientMeta}
        isOpen={true}
      />
    );

    expect(html).toContain("General Clinician Prescription Notes &amp; Safety Guidelines:");
    expect(html).toContain("Save Prescription");
    expect(html).toContain("Preview Handout");
    expect(html).toContain("Reset Defaults");
  });
});

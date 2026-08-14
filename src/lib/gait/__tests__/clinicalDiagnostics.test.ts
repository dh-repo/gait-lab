import { describe, it, expect } from "vitest";
import { synthesizeClinicalIntelligence } from "../clinicalDiagnostics";
import { createMockMetrics } from "./testHelpers";
import type { AnomalyFinding } from "../anomalies";

describe("Clinical Intelligence & Differential Diagnostics (clinicalDiagnostics.ts)", () => {
  it("synthesizes antalgic gait impression with ICD-10 R26.2 and SMART PT goals", () => {
    const metrics = createMockMetrics({
      leftStancePct: 50.0,
      rightStancePct: 65.0,
      symmetryAngle: 12.5,
    });

    const anomalies: AnomalyFinding[] = [
      {
        id: "antalgic_guarding",
        name: "Antalgic Guarding Pattern",
        category: "musculoskeletal",
        severity: "moderate",
        confidence: 0.85,
        evidence: ["Stance asymmetry"],
        clinicalSignificance: "Pain avoidance",
        literatureCitation: "Perry (2010)",
        therapeuticTarget: "Weight-bearing tolerance",
      },
    ];

    const report = synthesizeClinicalIntelligence(metrics, anomalies);

    expect(report.primaryImpression).toContain("Antalgic Gait");
    expect(report.primaryIcd10Code).toBe("R26.2");
    expect(report.primaryImpressionConfidence).toBeGreaterThanOrEqual(75);
    expect(report.smartGoals.some((g) => g.id === "goal_symmetry")).toBe(true);
    expect(report.laymanExplanation.summary).toContain("putting slightly more weight");
  });

  it("identifies healthy pediatric profile with developmental ICD-10 Z00.129", () => {
    const metrics = createMockMetrics({
      cadenceSpm: 124,
      gaitSpeedMps: 0.85,
      stepTimeCV: 0.055,
      symmetryAngle: 2.5,
    });

    const report = synthesizeClinicalIntelligence(metrics, [], undefined, undefined, undefined, undefined, {
      patientId: "PED-10",
      age: 10,
      sex: "female",
      assessmentDate: "2026-08-14",
      assessmentCondition: "Single-Task Walk",
      clinicianNotes: "Healthy child",
    });

    expect(report.isPediatric).toBe(true);
    expect(report.primaryImpression).toContain("Healthy Pediatric Locomotor Development");
    expect(report.primaryIcd10Code).toBe("Z00.129");
    expect(report.laymanExplanation.summary).toContain("normal, healthy walking development");
  });
});

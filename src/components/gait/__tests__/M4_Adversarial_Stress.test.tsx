import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SOAPNoteModal } from "../SOAPNoteModal";
import { CognitiveClusters } from "../CognitiveClusters";
import * as anomaliesModule from "@/lib/gait/anomalies";
import { classifyGaitAnomalies, type AnomalyFinding } from "@/lib/gait/anomalies";
import type { AnalysisResult, GaitMetrics, PatientMetadata } from "@/lib/gait/types";

describe("Milestone 4 Adversarial Stress Testing — EHR SOAP Note & Cognitive Clusters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseMetrics: GaitMetrics = {
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
    leftStancePct: 60.0,
    rightStancePct: 60.0,
    leftSwingPct: 40.0,
    rightSwingPct: 40.0,
    doubleSupportPct: 20.0,
    symmetryAngle: 1.5,
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
  };

  const baseAnalysis: AnalysisResult = {
    personId: 101,
    analyzedFrames: 300,
    taskMode: "single",
    notes: ["Patient baseline assessment"],
    metrics: baseMetrics,
    guesses: [],
  };

  const basePatientMeta: PatientMetadata = {
    patientId: "PT-99881",
    assessmentDate: "2026-08-13",
    assessmentCondition: "Single-Task Walk",
    clinicianNotes: "Patient reports mild bilateral fatigue.",
  };

  const ALL_8_ANOMALIES: AnomalyFinding[] = [
    {
      id: "antalgic_guarding",
      name: "Antalgic Guarding Pattern",
      category: "musculoskeletal",
      severity: "severe",
      confidence: 0.95,
      evidence: ["Stance asymmetry 16.0%."],
      clinicalSignificance: "Unilateral weight-bearing pain avoidance.",
      literatureCitation: "Perry, J., & Burnfield, J. M. (2010). Gait Analysis: Normal and Pathological Function. SLACK Inc.",
      therapeuticTarget: "Weight-bearing tolerance, unweighting gait training, pain management.",
    },
    {
      id: "parkinsonian_festination",
      name: "Parkinsonian Shuffling / Festination",
      category: "neurological",
      severity: "moderate",
      confidence: 0.85,
      evidence: ["High cadence 132 spm."],
      clinicalSignificance: "Basal ganglia dysfunction.",
      literatureCitation: "Morris, M. E., et al. (2001). Stride length regulation in Parkinson's disease. Brain, 124(1), 80-88.",
      therapeuticTarget: "Rhythmic auditory cueing (RAS), large-amplitude visual stepping cues (LSVT BIG).",
    },
    {
      id: "ataxic_wide_base",
      name: "Ataxic Wide-Base Gait",
      category: "neurological",
      severity: "severe",
      confidence: 0.90,
      evidence: ["Broadened base of support 22 cm."],
      clinicalSignificance: "Cerebellar or sensory ataxia.",
      literatureCitation: "Morton, S. M., & Bastian, A. J. (2004). Cerebellar control of balance and locomotion. The Neuroscientist, 10(3), 247-259.",
      therapeuticTarget: "Dynamic balance stability training, core stability, weighted vest sensory feedback.",
    },
    {
      id: "hemiparetic_stiff_knee",
      name: "Stiff-Knee Swing Deficit",
      category: "neurological",
      severity: "moderate",
      confidence: 0.85,
      evidence: ["Knee ROM asymmetry 26°."],
      clinicalSignificance: "Upper motor neuron lesion / post-stroke hemiparesis.",
      literatureCitation: "Goldberg, S. R., et al. (2006). Mechanics of normal and stiff-knee gait. Journal of Biomechanics, 39(12), 2276-2286.",
      therapeuticTarget: "Quadriceps spasticity management, functional electrical stimulation (FES) for hamstring recruitment.",
    },
    {
      id: "spastic_scissoring",
      name: "Narrow Base / Scissoring Tendency",
      category: "neurological",
      severity: "severe",
      confidence: 0.78,
      evidence: ["Narrow step width 1 cm."],
      clinicalSignificance: "Bilateral corticospinal tract involvement.",
      literatureCitation: "Sutherland, D. H., et al. (1993). The development of mature walking. Mac Keith Press.",
      therapeuticTarget: "Hip adductor stretching, botulinum toxin therapy, wide-track gait re-education.",
    },
    {
      id: "trendelenburg_lurch",
      name: "Trendelenburg Pelvic Instability",
      category: "musculoskeletal",
      severity: "moderate",
      confidence: 0.75,
      evidence: ["Symmetry angle 12.5°."],
      clinicalSignificance: "Abductor mechanism insufficiency.",
      literatureCitation: "Hardcastle, P., & Nade, S. (1985). The significance of the Trendelenburg test. JBJS, 67(5), 741-746.",
      therapeuticTarget: "Closed-chain hip abductor strengthening, pelvic leveling cues.",
    },
    {
      id: "steppage_foot_drop",
      name: "Steppage / Foot Drop Pattern",
      category: "neurological",
      severity: "severe",
      confidence: 0.88,
      evidence: ["Deficient peak dorsiflexion -2°."],
      clinicalSignificance: "Peroneal nerve injury / L5 radiculopathy.",
      literatureCitation: "Perry, J., & Burnfield, J. M. (2010). Gait Analysis: Normal and Pathological Function. SLACK Inc.",
      therapeuticTarget: "Ankle-foot orthosis (AFO) fitting, dorsiflexor functional electrical stimulation (FES), anterior tibialis strengthening.",
    },
    {
      id: "vaulting_hip_hiking",
      name: "Vaulting / Hip Hiking Clearance Compensation",
      category: "biomechanical",
      severity: "moderate",
      confidence: 0.80,
      evidence: ["Elevated vertical CoM bounce 7 cm."],
      clinicalSignificance: "Clearance compensation for stiff swing limb.",
      literatureCitation: "Kerrigan, D. C., et al. (2000). Modifying your gait: Vaulting and hip hiking mechanisms in stiff-knee gait. Gait & Posture, 11(3), 207-211.",
      therapeuticTarget: "Swing-limb knee flexion mobilization, contralateral stance calf lengthening, swing-phase limb shortening strategies.",
    },
  ];

  describe("1. Anomaly Count Scaling in SOAPNoteModal (0, 1, 4, 8 Anomalies)", () => {
    it("renders SOAP note with 0 anomalies (normative fallback in Section A and P)", () => {
      const html = renderToStaticMarkup(
        <SOAPNoteModal analysis={baseAnalysis} patientMetadata={basePatientMeta} initialOpen={true} />
      );

      expect(html).toContain("Overall gait kinematics within normal normative biological envelopes.");
      expect(html).toContain("- Continue general maintenance mobility exercises and progressive balance conditioning.");
      expect(html).not.toContain("Literature Citation:");
    });

    it("renders SOAP note with 1 anomaly (Antalgic Guarding)", () => {
      const oneAnomalyAnalysis: AnalysisResult = {
        ...baseAnalysis,
        metrics: {
          ...baseMetrics,
          leftStancePct: 48.0,
          rightStancePct: 64.0,
        },
      };

      const html = renderToStaticMarkup(
        <SOAPNoteModal analysis={oneAnomalyAnalysis} patientMetadata={basePatientMeta} initialOpen={true} />
      );

      expect(html).toContain("1. [SEVERE] Antalgic Guarding Pattern:");
      expect(html).toContain("- Literature Citation: Perry, J., &amp; Burnfield, J. M. (2010)");
      expect(html).toContain("- Antalgic Guarding Pattern Focus: Weight-bearing tolerance");
    });

    it("renders SOAP note with 4 anomalies (Antalgic, Parkinsonian, Trendelenburg, Vaulting)", () => {
      const fourAnomalyMetrics: GaitMetrics = {
        ...baseMetrics,
        leftStancePct: 48.0,
        rightStancePct: 64.0,
        cadenceSpm: 130,
        gaitSpeedMps: 0.8,
        stepLength: 0.4,
        stepTimeCV: 0.05,
        stepTimeAsymmetry: 0.02,
        symmetryAngle: 12.0,
        verticalBounce: 0.07,
        pelvicObliquity: 0.05,
      };

      const fourAnomalyAnalysis: AnalysisResult = {
        ...baseAnalysis,
        metrics: fourAnomalyMetrics,
      };

      const detected = classifyGaitAnomalies(fourAnomalyMetrics);
      expect(detected.length).toBe(4);

      const html = renderToStaticMarkup(
        <SOAPNoteModal analysis={fourAnomalyAnalysis} patientMetadata={basePatientMeta} initialOpen={true} />
      );

      expect(html).toContain("1. [SEVERE] Antalgic Guarding Pattern:");
      expect(html).toContain("2. [MODERATE] Parkinsonian Shuffling / Festination:");
      expect(html).toContain("3. [MODERATE] Trendelenburg Pelvic Instability:");
      expect(html).toContain("4. [MODERATE] Vaulting / Hip Hiking Clearance Compensation:");

      // Check Section A literature citations
      expect(html).toContain("Perry, J., &amp; Burnfield, J. M. (2010)");
      expect(html).toContain("Morris, M. E., et al. (2001)");
      expect(html).toContain("Hardcastle, P., &amp; Nade, S. (1985)");
      expect(html).toContain("Kerrigan, D. C., et al. (2000)");

      // Check Section P therapeutic recommendations
      expect(html).toContain("- Antalgic Guarding Pattern Focus:");
      expect(html).toContain("- Parkinsonian Shuffling / Festination Focus:");
      expect(html).toContain("- Trendelenburg Pelvic Instability Focus:");
      expect(html).toContain("- Vaulting / Hip Hiking Clearance Compensation Focus:");
    });

    it("renders SOAP note with all 8 anomalies simultaneously by verifying complete formatting", () => {
      vi.spyOn(anomaliesModule, "classifyGaitAnomalies").mockReturnValue(ALL_8_ANOMALIES);

      const html = renderToStaticMarkup(
        <SOAPNoteModal analysis={baseAnalysis} patientMetadata={basePatientMeta} initialOpen={true} />
      );

      ALL_8_ANOMALIES.forEach((a, idx) => {
        expect(html).toContain(`${idx + 1}. [${a.severity.toUpperCase()}] ${a.name}`);
        const escapedCitation = a.literatureCitation
          .replace(/&/g, "&amp;")
          .replace(/'/g, "&#x27;");
        expect(html).toContain(escapedCitation);
      });

      expect(ALL_8_ANOMALIES.length).toBe(8);
    });
  });

  describe("2. Edge Cases — Missing Patient Metadata & Clinician Notes", () => {
    it("handles completely undefined patientMetadata cleanly with fallbacks", () => {
      const html = renderToStaticMarkup(
        <SOAPNoteModal analysis={baseAnalysis} patientMetadata={undefined} initialOpen={true} />
      );

      expect(html).toContain("PATIENT ID: PT-ANONYMOUS");
      expect(html).toContain("ASSESSMENT PROTOCOL: Single-Task Walk");
      expect(html).toContain("Clinician Intake Notes: General mobility and stability evaluation.");
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("null");
    });

    it("handles empty string fields in patientMetadata cleanly", () => {
      const emptyMeta: PatientMetadata = {
        patientId: "",
        assessmentDate: "",
        assessmentCondition: "",
        clinicianNotes: "",
      };

      const html = renderToStaticMarkup(
        <SOAPNoteModal analysis={baseAnalysis} patientMetadata={emptyMeta} initialOpen={true} />
      );

      expect(html).toContain("PATIENT ID: PT-ANONYMOUS");
      expect(html).toContain("ASSESSMENT PROTOCOL: Single-Task Walk");
      expect(html).toContain("Clinician Intake Notes: General mobility and stability evaluation.");
    });
  });

  describe("3. Edge Cases — Nullish Metrics in AnalysisResult", () => {
    it("handles nullish/undefined numeric metrics in GaitMetrics without crashing or NaN rendering", () => {
      const nullishMetrics: GaitMetrics = {
        viewAngle: "unknown",
        viewConfidence: 0,
        durationSec: 0,
        fpsEffective: 0,
        stepCount: 0,
        cadenceSpm: 0,
        avgStepTimeSec: 0,
        stepTimeAsymmetry: 0,
        strideAsymmetry: null,
        lateralSway: null,
        verticalBounce: 0,
        armSwingLeft: 0,
        armSwingRight: 0,
        armSwingAsymmetry: 0,
        kneeFlexLeft: null,
        kneeFlexRight: null,
        kneeAsymmetry: null,
        stepWidthVariability: null,
        doubleSupportHint: 0,
        stepTimeCV: 0,
        strideTimeCV: 0,
        pelvicObliquity: null,
        pelvicObliquityVar: null,
        meanStepWidth: null,
        pathSmoothness: 0,
        stabilityScore: 0,
        rhythmScore: 0,
        symmetryScore: 0,
        mobilityScore: 0,
        automaticityScore: 0,
        overallScore: 0,
        series: [],
        stepEvents: [],
        gaitSpeedMps: null,
        stepLength: null,
        leftStancePct: null,
        rightStancePct: null,
        leftSwingPct: null,
        rightSwingPct: null,
        symmetryAngle: null,
      };

      const nullishAnalysis: AnalysisResult = {
        personId: 0,
        analyzedFrames: 0,
        taskMode: "single",
        notes: [],
        metrics: nullishMetrics,
        guesses: [],
        angleAnalysis: undefined,
      };

      const html = renderToStaticMarkup(
        <SOAPNoteModal analysis={nullishAnalysis} initialOpen={true} />
      );

      expect(html).toContain("Gait Speed: 0.00 m/s");
      expect(html).toContain("Cadence: 0 steps/min");
      expect(html).toContain("Step Length: 0.00 m");
      expect(html).toContain("Step Width: 12.0 cm"); // 0.12 fallback
      expect(html).toContain("Stance Phase: Left 60.0% | Right 60.0%");
      expect(html).toContain("Swing Phase: Left 40.0% | Right 40.0%");
      expect(html).toContain("Zifchock Symmetry Angle (SA): 0.0%");
      expect(html).toContain("Overall Score: 0/100");
    });
  });

  describe("4. CognitiveClusters Component Stress Tests", () => {
    it("renders CognitiveClusters with 0 anomalies", () => {
      const html = renderToStaticMarkup(
        <CognitiveClusters metrics={baseMetrics} taskMode="single" />
      );

      expect(html).toContain("1. Spatiotemporal Pace");
      expect(html).toContain("2. Inter-limb Symmetry &amp; ROM");
      expect(html).toContain("3. Trunk Stability &amp; Smoothness");
      expect(html).toContain("4. Dual-Task Cognitive Cost");
      expect(html).not.toContain("Automated Clinical Anomaly Screening");
    });

    it("renders CognitiveClusters with 4 flagged anomalies and citations", () => {
      const fourAnomalyMetrics: GaitMetrics = {
        ...baseMetrics,
        leftStancePct: 48.0,
        rightStancePct: 64.0,
        cadenceSpm: 130,
        gaitSpeedMps: 0.8,
        stepLength: 0.4,
        stepTimeCV: 0.05,
        stepTimeAsymmetry: 0.02,
        symmetryAngle: 12.0,
        verticalBounce: 0.07,
        pelvicObliquity: 0.05,
      };

      const html = renderToStaticMarkup(
        <CognitiveClusters metrics={fourAnomalyMetrics} taskMode="single" />
      );

      expect(html).toContain("Automated Clinical Anomaly Screening (4 Flagged)");
      expect(html).toContain("Antalgic Guarding Pattern");
      expect(html).toContain("Citation: Perry, J., &amp; Burnfield, J. M. (2010)");
      expect(html).toContain("Citation: Morris, M. E., et al. (2001)");
      expect(html).toContain("Citation: Hardcastle, P., &amp; Nade, S. (1985)");
      expect(html).toContain("Citation: Kerrigan, D. C., et al. (2000)");
    });

    it("handles CognitiveClusters with nullish metrics gracefully", () => {
      const nullishMetrics: GaitMetrics = {
        ...baseMetrics,
        cadenceSpm: 0,
        avgStepTimeSec: 0,
        stepTimeCV: 0,
        symmetryAngle: null,
        stepTimeAsymmetry: 0,
        leftStancePct: null,
        rightStancePct: null,
        doubleSupportPct: null,
        pathSmoothness: 0,
        automaticityScore: 0,
        lateralSway: null,
        verticalBounce: 0,
        pelvicObliquity: null,
      };

      const html = renderToStaticMarkup(
        <CognitiveClusters metrics={nullishMetrics} taskMode="single" />
      );

      expect(html).toContain("1. Spatiotemporal Pace");
      expect(html).toContain("SA: N/A");
      expect(html).toContain("Stance / Swing Ratio");
      expect(html).toContain("N/A (Requires Side View)");
    });
  });
});

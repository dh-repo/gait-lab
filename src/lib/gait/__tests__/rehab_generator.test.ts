import { describe, it, expect } from "vitest";
import type { GaitMetrics, PatientMetadata } from "@/lib/gait/types";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";
import type { AnomalyFinding } from "@/lib/gait/anomalies";
import {
  generateHomeExerciseProgram,
  calculateScaledDosage,
  filterExercisesByPhase,
  getExercisesForAnomaly,
  getProtocolForAnomaly,
  inferAffectedSide,
  formatSoapPlanSection,
} from "@/lib/gait/rehab/generator";
import {
  CLINICAL_EXERCISE_DATABASE,
  ANOMALY_CLINICAL_PROTOCOLS,
} from "@/lib/gait/rehab/database";

describe("Rehabilitation & Home Exercise Program (HEP) Generator", () => {
  const baseMetrics: GaitMetrics = {
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
    leftStancePct: 60.0,
    rightStancePct: 60.0,
    leftSwingPct: 40.0,
    rightSwingPct: 40.0,
    doubleSupportPct: 20.0,
    symmetryAngle: 1.5,
    stepTimeCV: 0.02,
    strideTimeCV: 0.02,
    pelvicObliquity: 0.01,
    pelvicObliquityVar: 0.002,
    meanStepWidth: 0.12,
    pathSmoothness: 0.94,
    stabilityScore: 85,
    rhythmScore: 90,
    symmetryScore: 92,
    mobilityScore: 88,
    automaticityScore: 90,
    overallScore: 89,
    series: [],
    stepEvents: [],
  };

  const baseAngleAnalysis: GaitAngleAnalysis = {
    isSuppressed: false,
    normalizedPoints: [],
    leftStrides: [],
    rightStrides: [],
    normativeData: [],
    metrics: {
      kneeRomLeft: 58.0,
      kneeRomRight: 57.5,
      kneePeakFlexionLeft: 62.0,
      kneePeakFlexionRight: 61.5,
      kneeAsymmetryPct: 1.0,
      hipRomLeft: 42.0,
      hipRomRight: 41.5,
      hipPeakFlexionLeft: 32.0,
      hipPeakFlexionRight: 31.5,
      hipPeakExtensionLeft: 10.0,
      hipPeakExtensionRight: 9.5,
      hipAsymmetryPct: 1.2,
      ankleRomLeft: 25.0,
      ankleRomRight: 24.5,
      anklePeakDorsiflexionLeft: 12.0,
      anklePeakDorsiflexionRight: 11.5,
      anklePeakPlantarflexionLeft: 13.0,
      anklePeakPlantarflexionRight: 13.0,
      ankleAsymmetryPct: 2.0,
    },
  };

  const mockPatientMeta: PatientMetadata = {
    patientId: "PT-7701",
    assessmentDate: "2026-08-14",
    assessmentCondition: "Single-Task Walk",
    clinicianNotes: "Baseline rehabilitation evaluation.",
  };

  const ALL_8_ANOMALY_IDS = [
    "antalgic_guarding",
    "parkinsonian_festination",
    "ataxic_wide_base",
    "hemiparetic_stiff_knee",
    "spastic_scissoring",
    "trendelenburg_lurch",
    "steppage_foot_drop",
    "vaulting_hip_hiking",
  ];

  describe("1. Clinical Protocol Database Integrity", () => {
    it("contains comprehensive protocol metadata for all 8 anomalies plus general conditioning", () => {
      ALL_8_ANOMALY_IDS.forEach((id) => {
        const protocol = ANOMALY_CLINICAL_PROTOCOLS[id];
        expect(protocol).toBeDefined();
        expect(protocol.anomalyId).toBe(id);
        expect(protocol.targetMuscles.length).toBeGreaterThan(0);
        expect(protocol.citations.length).toBeGreaterThan(0);
        expect(protocol.progressionCriteria.length).toBeGreaterThan(0);
        expect(protocol.precautions.length).toBeGreaterThan(0);
        expect(protocol.redFlags.length).toBeGreaterThan(0);
      });

      expect(ANOMALY_CLINICAL_PROTOCOLS["general_conditioning"]).toBeDefined();
    });

    it("contains evidence-based exercises covering Phase 1, Phase 2, and Phase 3 for every anomaly", () => {
      ALL_8_ANOMALY_IDS.forEach((id) => {
        const p1 = filterExercisesByPhase("phase_1_acute", id);
        const p2 = filterExercisesByPhase("phase_2_subacute", id);
        const p3 = filterExercisesByPhase("phase_3_functional", id);

        expect(p1.length).toBeGreaterThanOrEqual(2);
        expect(p2.length).toBeGreaterThanOrEqual(2);
        expect(p3.length).toBeGreaterThanOrEqual(2);

        // Verify each exercise has instructions, cues, equipment, precautions
        [...p1, ...p2, ...p3].forEach((ex) => {
          expect(ex.instructions.length).toBeGreaterThan(0);
          expect(ex.coachingCues.length).toBeGreaterThan(0);
          expect(ex.clinicalRationale.length).toBeGreaterThan(0);
          expect(ex.targetMuscleGroups.length).toBeGreaterThan(0);
          expect(ex.defaultSets).toBeGreaterThan(0);
          expect(ex.defaultReps).toBeGreaterThan(0);
        });
      });
    });

    it("provides general conditioning exercises across all 3 phases", () => {
      const p1 = filterExercisesByPhase("phase_1_acute", "general_conditioning");
      const p2 = filterExercisesByPhase("phase_2_subacute", "general_conditioning");
      const p3 = filterExercisesByPhase("phase_3_functional", "general_conditioning");

      expect(p1.length).toBeGreaterThanOrEqual(2);
      expect(p2.length).toBeGreaterThanOrEqual(2);
      expect(p3.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("2. Prescription Generation & Anomaly Mapping", () => {
    it("generates targeted program for Antalgic Guarding with joint offloading in Phase 1", () => {
      const antalgicAnomaly: AnomalyFinding = {
        id: "antalgic_guarding",
        name: "Antalgic Guarding Pattern",
        category: "musculoskeletal",
        severity: "severe",
        confidence: 0.95,
        evidence: ["Marked stance asymmetry (16% difference)"],
        clinicalSignificance: "Significant pain avoidance behavior",
        literatureCitation: "Perry & Burnfield (2010)",
        therapeuticTarget: "Weight-bearing tolerance and unweighting gait training",
      };

      const metrics = {
        ...baseMetrics,
        leftStancePct: 48.0,
        rightStancePct: 64.0,
      };

      const program = generateHomeExerciseProgram(
        metrics,
        [antalgicAnomaly],
        baseAngleAnalysis,
        mockPatientMeta
      );

      expect(program.targetAcuityPhase).toBe("phase_1_acute");
      expect(program.primaryAnomalies).toContain("antalgic_guarding");
      expect(program.exercises.length).toBeGreaterThanOrEqual(3);
      expect(program.exercises.some((e) => e.name.includes("Quad Sets") || e.name.includes("Heel Slides"))).toBe(true);
      expect(program.redFlags.length).toBeGreaterThan(0);
      expect(program.progressionCriteria.length).toBeGreaterThan(0);
    });

    it("generates targeted program for Parkinsonian Festination with LSVT BIG high-amplitude exercises", () => {
      const parkinsonAnomaly: AnomalyFinding = {
        id: "parkinsonian_festination",
        name: "Parkinsonian Shuffling / Festination",
        category: "neurological",
        severity: "moderate",
        confidence: 0.9,
        evidence: ["Cadence 130 spm, step length 0.40 m"],
        clinicalSignificance: "Basal ganglia locomotor degradation",
        literatureCitation: "Morris, M. E., et al. (2001)",
        therapeuticTarget: "High-amplitude stepping, auditory pacing, and trunk rotation",
      };

      const program = generateHomeExerciseProgram(
        { ...baseMetrics, cadenceSpm: 130 },
        [parkinsonAnomaly],
        baseAngleAnalysis,
        mockPatientMeta,
        { preferredPhase: "phase_2_subacute" }
      );

      expect(program.targetAcuityPhase).toBe("phase_2_subacute");
      expect(program.exercises.some((e) => e.name.includes("BIG") || e.name.includes("Auditory Stimulation"))).toBe(true);
      expect(program.dosageChecklist.daysPerWeek).toBeGreaterThanOrEqual(3);
      expect(program.dosageChecklist.trackingGrid.length).toBe(7);
    });

    it("generates targeted program for Ataxic Wide-Base Stagger with Frenkel coordination drills", () => {
      const ataxicAnomaly: AnomalyFinding = {
        id: "ataxic_wide_base",
        name: "Ataxic Wide-Base Stagger",
        category: "neurological",
        severity: "moderate",
        confidence: 0.88,
        evidence: ["Step width 22 cm, CV 9.5%"],
        clinicalSignificance: "Cerebellar coordination deficit",
        literatureCitation: "Morton & Bastian (2004)",
        therapeuticTarget: "Narrow base stability, Frenkel coordination, and balance",
      };

      const program = generateHomeExerciseProgram(
        { ...baseMetrics, meanStepWidth: 0.22, stepTimeCV: 0.095 },
        [ataxicAnomaly],
        baseAngleAnalysis,
        mockPatientMeta,
        { preferredPhase: "phase_1_acute" }
      );

      expect(program.exercises.some((e) => e.name.includes("Frenkel") || e.name.includes("Dead Bug"))).toBe(true);
      expect(program.fallRiskCategory).toBe("high");
    });

    it("generates targeted program for Hemiparetic Stiff-Knee with hamstring activation and rectus stretching", () => {
      const stiffKneeAnomaly: AnomalyFinding = {
        id: "hemiparetic_stiff_knee",
        name: "Hemiparetic Circumduction / Stiff-Knee Gait",
        category: "neurological",
        severity: "moderate",
        confidence: 0.92,
        evidence: ["Knee ROM asymmetry 18.0°, Peak flexion 40.0°"],
        clinicalSignificance: "Spastic quadriceps restraint during pre-swing",
        literatureCitation: "Goldberg et al. (2006)",
        therapeuticTarget: "Hamstring activation, rectus femoris elongation, and swing clearance",
      };

      const angles: GaitAngleAnalysis = {
        ...baseAngleAnalysis,
        metrics: {
          ...baseAngleAnalysis.metrics!,
          kneeRomLeft: 38.0,
          kneeRomRight: 58.0,
          kneePeakFlexionLeft: 40.0,
          kneePeakFlexionRight: 62.0,
        },
      };

      const program = generateHomeExerciseProgram(
        baseMetrics,
        [stiffKneeAnomaly],
        angles,
        mockPatientMeta,
        { preferredPhase: "phase_2_subacute" }
      );

      expect(program.exercises.some((e) => e.name.includes("Hamstring") || e.name.includes("Hurdles"))).toBe(true);
      const leftEx = program.exercises.find((e) => e.affectedSideRequired);
      if (leftEx) {
        expect(leftEx.affectedSide).toBe("Left");
      }
    });

    it("generates targeted program for Spastic Scissoring with adductor elongation and monster walks", () => {
      const scissoringAnomaly: AnomalyFinding = {
        id: "spastic_scissoring",
        name: "Spastic Scissoring Gait",
        category: "neurological",
        severity: "moderate",
        confidence: 0.85,
        evidence: ["Step width 3.5 cm"],
        clinicalSignificance: "Adductor hypertonicity",
        literatureCitation: "Sutherland et al. (1993)",
        therapeuticTarget: "Adductor stretching, gluteus medius strengthening, and corridor walking",
      };

      const program = generateHomeExerciseProgram(
        { ...baseMetrics, meanStepWidth: 0.035 },
        [scissoringAnomaly],
        baseAngleAnalysis,
        mockPatientMeta,
        { preferredPhase: "phase_2_subacute" }
      );

      expect(program.exercises.some((e) => e.name.includes("Monster Walks") || e.name.includes("Abduction"))).toBe(true);
    });

    it("generates targeted program for Trendelenburg Pelvic Instability with CKC pelvic drops", () => {
      const trendelenburgAnomaly: AnomalyFinding = {
        id: "trendelenburg_lurch",
        name: "Trendelenburg Pelvic Instability",
        category: "biomechanical",
        severity: "moderate",
        confidence: 0.91,
        evidence: ["Symmetry Angle 12.5%, Stance Diff 7.0%"],
        clinicalSignificance: "Gluteus medius abductor insufficiency",
        literatureCitation: "Hardcastle & Nade (1985)",
        therapeuticTarget: "Gluteus medius strengthening and closed-chain pelvic leveling",
      };

      const program = generateHomeExerciseProgram(
        { ...baseMetrics, symmetryAngle: 12.5, leftStancePct: 53.0, rightStancePct: 62.0 },
        [trendelenburgAnomaly],
        baseAngleAnalysis,
        mockPatientMeta,
        { preferredPhase: "phase_2_subacute" }
      );

      expect(program.exercises.some((e) => e.name.includes("Pelvic Drops") || e.name.includes("Wall Press") || e.name.includes("Side Plank"))).toBe(true);
    });

    it("generates targeted program for Steppage / Foot Drop with dorsiflexion and NMES", () => {
      const steppageAnomaly: AnomalyFinding = {
        id: "steppage_foot_drop",
        name: "Steppage / Foot Drop Pattern",
        category: "neurological",
        severity: "moderate",
        confidence: 0.89,
        evidence: ["Peak dorsiflexion -2.0°"],
        clinicalSignificance: "Peroneal neuropathy",
        literatureCitation: "Stewart (2008)",
        therapeuticTarget: "Anterior tibialis strengthening, NMES, and AFO gait re-education",
      };

      const program = generateHomeExerciseProgram(
        baseMetrics,
        [steppageAnomaly],
        baseAngleAnalysis,
        mockPatientMeta,
        { preferredPhase: "phase_1_acute" }
      );

      expect(program.exercises.some((e) => e.name.includes("Dorsiflexion") || e.name.includes("NMES"))).toBe(true);
    });

    it("generates targeted program for Vaulting / Clearance Compensation with calf stretching and biofeedback", () => {
      const vaultingAnomaly: AnomalyFinding = {
        id: "vaulting_hip_hiking",
        name: "Vaulting / Clearance Compensation",
        category: "biomechanical",
        severity: "moderate",
        confidence: 0.9,
        evidence: ["Vertical bounce 7.2 cm"],
        clinicalSignificance: "Premature stance heel rise",
        literatureCitation: "Baker et al. (2009)",
        therapeuticTarget: "Stance calf stretching, swing limb shortening, and vertical oscillation feedback",
      };

      const program = generateHomeExerciseProgram(
        { ...baseMetrics, verticalBounce: 0.072 },
        [vaultingAnomaly],
        baseAngleAnalysis,
        mockPatientMeta,
        { preferredPhase: "phase_2_subacute" }
      );

      expect(program.exercises.some((e) => e.name.includes("Knee Flexion Quick-Lift") || e.name.includes("Step-Up") || e.name.includes("Biofeedback"))).toBe(true);
    });

    it("generates general conditioning program when 0 anomalies are detected", () => {
      const program = generateHomeExerciseProgram(
        baseMetrics,
        [],
        baseAngleAnalysis,
        mockPatientMeta
      );

      expect(program.primaryAnomalies).toContain("general_conditioning");
      expect(program.exercises.length).toBeGreaterThanOrEqual(3);
      expect(program.exercises.some((e) => e.anomalyId === "general_conditioning")).toBe(true);
    });
  });

  describe("3. Multi-Anomaly Prioritization & Deduplication", () => {
    it("prioritizes severe anomalies over mild anomalies and limits total exercises to max", () => {
      const severeAnomaly: AnomalyFinding = {
        id: "hemiparetic_stiff_knee",
        name: "Hemiparetic Circumduction / Stiff-Knee Gait",
        category: "neurological",
        severity: "severe",
        confidence: 0.95,
        evidence: ["Severe stiff knee"],
        clinicalSignificance: "Severe deficit",
        literatureCitation: "Goldberg et al. (2006)",
        therapeuticTarget: "Hamstring recruitment",
      };

      const mildAnomaly1: AnomalyFinding = {
        id: "vaulting_hip_hiking",
        name: "Vaulting Gait",
        category: "biomechanical",
        severity: "mild",
        confidence: 0.6,
        evidence: ["Mild bounce"],
        clinicalSignificance: "Mild compensation",
        literatureCitation: "Baker et al. (2009)",
        therapeuticTarget: "Calf stretch",
      };

      const mildAnomaly2: AnomalyFinding = {
        id: "trendelenburg_lurch",
        name: "Trendelenburg Lurch",
        category: "biomechanical",
        severity: "mild",
        confidence: 0.55,
        evidence: ["Mild lurch"],
        clinicalSignificance: "Mild drop",
        literatureCitation: "Hardcastle & Nade (1985)",
        therapeuticTarget: "Glute strength",
      };

      const program = generateHomeExerciseProgram(
        baseMetrics,
        [mildAnomaly1, mildAnomaly2, severeAnomaly],
        baseAngleAnalysis,
        mockPatientMeta,
        { maxExercisesPerProgram: 5 }
      );

      expect(program.exercises.length).toBeLessThanOrEqual(5);
      // Severe anomaly exercises should be first
      expect(program.exercises[0].anomalyId).toBe("hemiparetic_stiff_knee");
      // All exercise IDs must be unique
      const ids = program.exercises.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("4. Dynamic Dosage Scaling & Age Modifiers", () => {
    it("de-intensifies dosage for geriatric / high fall risk patients (age >= 75)", () => {
      const exercise = CLINICAL_EXERCISE_DATABASE.find(
        (e) => e.id === "antalgic_p2_mini_squats"
      )!;

      const scaled = calculateScaledDosage(exercise, {
        patientAge: 80,
        fallRiskCategory: "high",
      });

      expect(scaled.prescribedReps).toBeLessThanOrEqual(exercise.defaultReps);
      expect(scaled.prescribedRestIntervalSec).toBeGreaterThanOrEqual(exercise.defaultRestIntervalSec);
      expect(scaled.prescribedSets).toBeLessThanOrEqual(3);
    });

    it("increases training volume for younger athletic patients (age < 50, low fall risk)", () => {
      const exercise = CLINICAL_EXERCISE_DATABASE.find(
        (e) => e.id === "antalgic_p2_mini_squats"
      )!;

      const scaled = calculateScaledDosage(exercise, {
        patientAge: 35,
        fallRiskCategory: "low",
      });

      expect(scaled.prescribedReps).toBeGreaterThanOrEqual(exercise.defaultReps);
      expect(scaled.prescribedRestIntervalSec).toBeLessThanOrEqual(exercise.defaultRestIntervalSec);
    });
  });

  describe("5. SOAP Note Section P Formatting & Backwards Compatibility", () => {
    it("preserves exact legacy test substrings when anomalies are present", () => {
      const antalgicAnomaly: AnomalyFinding = {
        id: "antalgic_guarding",
        name: "Antalgic Guarding Pattern",
        category: "musculoskeletal",
        severity: "severe",
        confidence: 0.95,
        evidence: ["Stance diff 16%"],
        clinicalSignificance: "Pain avoidance",
        literatureCitation: "Perry & Burnfield (2010)",
        therapeuticTarget: "Weight-bearing tolerance",
      };

      const program = generateHomeExerciseProgram(
        baseMetrics,
        [antalgicAnomaly],
        baseAngleAnalysis,
        mockPatientMeta
      );

      const formatted = formatSoapPlanSection([antalgicAnomaly], program);

      expect(formatted).toContain("- Antalgic Guarding Pattern Focus: Weight-bearing tolerance");
      expect(formatted).toContain("- Re-evaluate spatio-temporal symmetry progression in 4-6 weeks to track Minimal Detectable Change (MDC95).");
      expect(formatted).toContain("Prescribed Physical Therapy Regimen");
      expect(formatted).toContain("Active Prescribed Exercises:");
    });

    it("preserves exact legacy fallback string when 0 anomalies are present", () => {
      const program = generateHomeExerciseProgram(
        baseMetrics,
        [],
        baseAngleAnalysis,
        mockPatientMeta
      );

      const formatted = formatSoapPlanSection([], program);

      expect(formatted).toContain("- Continue general maintenance mobility exercises and progressive balance conditioning.");
      expect(formatted).toContain("- Re-evaluate spatio-temporal symmetry progression in 4-6 weeks to track Minimal Detectable Change (MDC95).");
    });
  });

  describe("6. Helper Utilities", () => {
    it("retrieves exercises and protocols by anomaly ID correctly", () => {
      const parkinsonExs = getExercisesForAnomaly("parkinsonian_festination");
      expect(parkinsonExs.length).toBeGreaterThanOrEqual(6);

      const protocol = getProtocolForAnomaly("parkinsonian_festination");
      expect(protocol.anomalyName).toContain("Parkinsonian");

      const unknownProto = getProtocolForAnomaly("unknown_anomaly_id");
      expect(unknownProto.anomalyId).toBe("general_conditioning");
    });

    it("infers affected side from metrics and kinematics correctly", () => {
      const sideAntalgicL = inferAffectedSide(
        "antalgic_guarding",
        { ...baseMetrics, leftStancePct: 45, rightStancePct: 65 }
      );
      expect(sideAntalgicL).toBe("Left");

      const sideAntalgicR = inferAffectedSide(
        "antalgic_guarding",
        { ...baseMetrics, leftStancePct: 65, rightStancePct: 45 }
      );
      expect(sideAntalgicR).toBe("Right");

      const sideStiffKnee = inferAffectedSide(
        "hemiparetic_stiff_knee",
        baseMetrics,
        {
          ...baseAngleAnalysis,
          metrics: {
            ...baseAngleAnalysis.metrics,
            kneeRomLeft: 35,
            kneeRomRight: 60,
          },
        }
      );
      expect(sideStiffKnee).toBe("Left");
    });
  });
});

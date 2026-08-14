/**
 * Automated Rehabilitation & Home Exercise Program (HEP) Generator
 *
 * Maps detected clinical gait anomalies and biomechanical telemetry to
 * customized, evidence-based physical therapy prescriptions with dynamic
 * dosage scaling and progression milestones.
 */

import type { GaitMetrics, PatientMetadata } from "../types";
import type { GaitAngleAnalysis } from "../angles";
import type { AnomalyFinding } from "../anomalies";
import type {
  RehabPhase,
  ExerciseDefinition,
  PrescribedExercise,
  HomeExerciseProgram,
  PrescriptionGenerationOptions,
  DosageChecklist,
  DosageChecklistDay,
} from "./types";
import { CLINICAL_EXERCISE_DATABASE, ANOMALY_CLINICAL_PROTOCOLS } from "./database";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * Filters exercise database by specific rehabilitation phase and optional anomaly ID.
 */
export function filterExercisesByPhase(
  phase: RehabPhase,
  anomalyId?: string
): ExerciseDefinition[] {
  return CLINICAL_EXERCISE_DATABASE.filter((ex) => {
    const matchesPhase = ex.phase === phase;
    const matchesAnomaly = anomalyId ? ex.anomalyId === anomalyId : true;
    return matchesPhase && matchesAnomaly;
  });
}

/**
 * Retrieves all exercises associated with a given anomaly ID.
 */
export function getExercisesForAnomaly(anomalyId: string): ExerciseDefinition[] {
  return CLINICAL_EXERCISE_DATABASE.filter((ex) => ex.anomalyId === anomalyId);
}

/**
 * Retrieves clinical protocol metadata for a given anomaly ID.
 */
export function getProtocolForAnomaly(anomalyId: string) {
  return ANOMALY_CLINICAL_PROTOCOLS[anomalyId] || ANOMALY_CLINICAL_PROTOCOLS["general_conditioning"];
}

/**
 * Calculates dynamically scaled dosage based on patient age, frailty, and fall risk.
 */
export function calculateScaledDosage(
  exercise: ExerciseDefinition,
  options?: {
    patientAge?: number;
    fallRiskCategory?: "low" | "moderate" | "high";
    affectedSide?: "Left" | "Right" | "Bilateral";
  }
): PrescribedExercise {
  const age = options?.patientAge ?? 65;
  const fallRisk = options?.fallRiskCategory ?? "moderate";

  let sets = exercise.defaultSets;
  let reps = exercise.defaultReps;
  let restSec = exercise.defaultRestIntervalSec;
  let freq = exercise.defaultFrequencyPerWeek;

  // Geriatric / high fall risk dosage de-intensification
  if (age >= 75 || fallRisk === "high") {
    sets = Math.min(exercise.defaultSets, 3);
    reps = Math.max(5, Math.round(exercise.defaultReps * 0.8));
    restSec = exercise.defaultRestIntervalSec + 15;
    freq = Math.min(exercise.defaultFrequencyPerWeek, 4);
  } else if (age < 50 && fallRisk === "low") {
    // Athletic / low fall risk progressive overload
    sets = exercise.defaultSets;
    reps = Math.round(exercise.defaultReps * 1.2);
    restSec = Math.max(30, exercise.defaultRestIntervalSec - 15);
    freq = exercise.defaultFrequencyPerWeek;
  }

  return {
    ...exercise,
    prescribedSets: sets,
    prescribedReps: reps,
    prescribedHoldSec: exercise.defaultHoldSec,
    prescribedDurationSec: exercise.defaultDurationSec,
    prescribedTempo: exercise.defaultTempo || "Controlled",
    prescribedFrequencyPerWeek: freq,
    prescribedRestIntervalSec: restSec,
    clinicianCustomNotes: "",
    isCustomized: false,
    affectedSide: options?.affectedSide || (exercise.affectedSideRequired ? "Bilateral" : undefined),
    includedInHandout: true,
  };
}

/**
 * Determines affected side (Left, Right, Bilateral) from biomechanical metrics and angle analysis.
 */
export function inferAffectedSide(
  anomalyId: string,
  metrics: GaitMetrics,
  angleAnalysis?: GaitAngleAnalysis
): "Left" | "Right" | "Bilateral" {
  const stanceL = metrics.leftStancePct ?? 60;
  const stanceR = metrics.rightStancePct ?? 60;

  if (anomalyId === "antalgic_guarding") {
    return stanceL < stanceR ? "Left" : "Right";
  }

  if (anomalyId === "hemiparetic_stiff_knee") {
    const romL = angleAnalysis?.metrics?.kneeRomLeft ?? 55;
    const romR = angleAnalysis?.metrics?.kneeRomRight ?? 55;
    if (romL < romR) return "Left";
    if (romR < romL) return "Right";
    return "Bilateral";
  }

  if (anomalyId === "trendelenburg_lurch") {
    return stanceL > stanceR ? "Right" : "Left"; // Stance limb with gluteal deficit
  }

  if (anomalyId === "steppage_foot_drop") {
    const flexL = angleAnalysis?.metrics?.kneePeakFlexionLeft ?? 60;
    const flexR = angleAnalysis?.metrics?.kneePeakFlexionRight ?? 60;
    if (flexL > flexR + 5) return "Left";
    if (flexR > flexL + 5) return "Right";
    return "Bilateral";
  }

  if (anomalyId === "vaulting_hip_hiking") {
    return stanceL < stanceR ? "Right" : "Left"; // Stance limb vaulting
  }

  return "Bilateral";
}

/**
 * Generates an automated evidence-based Home Exercise Program (HEP).
 */
export function generateHomeExerciseProgram(
  metrics: GaitMetrics,
  anomalies: AnomalyFinding[],
  angleAnalysis?: GaitAngleAnalysis,
  patientMetadata?: PatientMetadata,
  options?: PrescriptionGenerationOptions
): HomeExerciseProgram {
  const patientId = patientMetadata?.patientId || "PT-ANONYMOUS";
  const patientName =
    options?.patientName || (patientMetadata?.patientId ? `Patient ${patientMetadata.patientId}` : "Anonymous Patient");
  const clinician = options?.prescribingClinician || "Attending Physical Therapist";
  const today = patientMetadata?.assessmentDate || new Date().toISOString().split("T")[0];
  const maxExercises = options?.maxExercisesPerProgram ?? 6;
  const patientAge = options?.patientAge ?? patientMetadata?.age ?? 35;
  const isPediatric = patientAge < 18;

  // Determine fall risk category
  let fallRisk: "low" | "moderate" | "high" = options?.fallRiskCategory ?? "moderate";
  if (!options?.fallRiskCategory) {
    if (isPediatric) {
      if (anomalies.some((a) => a.severity === "severe") || (metrics.stabilityScore ?? 100) < 40) {
        fallRisk = "moderate";
      } else {
        fallRisk = "low";
      }
    } else {
      if (
        (metrics.stepTimeCV ?? 0) > 0.06 ||
        (metrics.stabilityScore ?? 100) < 60 ||
        anomalies.some((a) => a.severity === "severe")
      ) {
        fallRisk = "high";
      } else if (
        (metrics.stepTimeCV ?? 0) < 0.035 &&
        (metrics.stabilityScore ?? 100) >= 75 &&
        !anomalies.some((a) => a.severity === "severe" || a.severity === "moderate")
      ) {
        fallRisk = "low";
      }
    }
  }

  // Determine rehabilitation phase
  let targetPhase: RehabPhase = options?.preferredPhase || "phase_2_subacute";
  if (!options?.preferredPhase) {
    if (fallRisk === "high" || anomalies.some((a) => a.severity === "severe")) {
      targetPhase = "phase_1_acute";
    } else if (
      fallRisk === "low" &&
      (anomalies.length === 0 || anomalies.every((a) => a.severity === "mild"))
    ) {
      targetPhase = "phase_3_functional";
    } else {
      targetPhase = "phase_2_subacute";
    }
  }

  // Sort and prioritize anomalies (severe > moderate > mild, high confidence first)
  const prioritizedAnomalies = [...anomalies].sort((a, b) => {
    const severityScore = (s: string) => (s === "severe" ? 3 : s === "moderate" ? 2 : 1);
    const scoreDiff = severityScore(b.severity) - severityScore(a.severity);
    if (scoreDiff !== 0) return scoreDiff;
    return b.confidence - a.confidence;
  });

  const primaryAnomalyIds =
    prioritizedAnomalies.length > 0
      ? prioritizedAnomalies.slice(0, 3).map((a) => a.id)
      : ["general_conditioning"];

  // Select exercises matching primary anomalies and phase
  const selectedExercises: PrescribedExercise[] = [];
  const addedIds = new Set<string>();

  for (const anomalyId of primaryAnomalyIds) {
    const matchingDefs = CLINICAL_EXERCISE_DATABASE.filter(
      (ex) => ex.anomalyId === anomalyId && ex.phase === targetPhase
    );

    const affectedSide = inferAffectedSide(anomalyId, metrics, angleAnalysis);

    for (const def of matchingDefs) {
      if (!addedIds.has(def.id) && selectedExercises.length < maxExercises) {
        addedIds.add(def.id);
        selectedExercises.push(
          calculateScaledDosage(def, {
            patientAge,
            fallRiskCategory: fallRisk,
            affectedSide: def.affectedSideRequired ? affectedSide : "Bilateral",
          })
        );
      }
    }
  }

  // If fewer than 3 exercises, add complementary general conditioning exercises for that phase
  if (selectedExercises.length < 3) {
    const genDefs = CLINICAL_EXERCISE_DATABASE.filter(
      (ex) => ex.anomalyId === "general_conditioning" && ex.phase === targetPhase
    );
    for (const def of genDefs) {
      if (!addedIds.has(def.id) && selectedExercises.length < maxExercises) {
        addedIds.add(def.id);
        selectedExercises.push(
          calculateScaledDosage(def, {
            patientAge,
            fallRiskCategory: fallRisk,
            affectedSide: "Bilateral",
          })
        );
      }
    }
  }

  // Aggregate progression criteria and red flags from anomaly protocols
  const progressionSet = new Set<string>();
  const redFlagsSet = new Set<string>();

  for (const anomalyId of primaryAnomalyIds) {
    const protocol = getProtocolForAnomaly(anomalyId);
    protocol.progressionCriteria.forEach((p) => progressionSet.add(p));
    protocol.redFlags.forEach((r) => redFlagsSet.add(r));
  }

  // Default progression criteria and red flags if none
  if (progressionSet.size === 0) {
    ANOMALY_CLINICAL_PROTOCOLS["general_conditioning"].progressionCriteria.forEach((p) =>
      progressionSet.add(p)
    );
  }
  if (redFlagsSet.size === 0) {
    ANOMALY_CLINICAL_PROTOCOLS["general_conditioning"].redFlags.forEach((r) =>
      redFlagsSet.add(r)
    );
  }

  // 7-day adherence tracking grid
  const trackingGrid: DosageChecklistDay[] = DAYS_OF_WEEK.map((name, index) => ({
    dayIndex: index,
    dayName: name,
    completed: false,
  }));

  const maxFreq = selectedExercises.reduce(
    (max, ex) => Math.max(max, ex.prescribedFrequencyPerWeek),
    4
  );

  const dosageChecklist: DosageChecklist = {
    daysPerWeek: maxFreq,
    sessionsPerDay: 1,
    trackingGrid,
  };

  // Compose clinical summary rationale
  const primaryAnomalyNames =
    prioritizedAnomalies.length > 0
      ? prioritizedAnomalies.map((a) => a.name).join(", ")
      : "General Locomotor Conditioning";

  const phaseTitle =
    targetPhase === "phase_1_acute"
      ? "Phase 1: Acute / Joint Offloading"
      : targetPhase === "phase_2_subacute"
      ? "Phase 2: Subacute / Restorative"
      : "Phase 3: Functional / Dynamic Integration";

  const programTitle = `${primaryAnomalyNames} — ${phaseTitle}`;
  const clinicalSummaryRationale =
    prioritizedAnomalies.length > 0
      ? `Targeted physical therapy regimen developed for ${primaryAnomalyNames} addressing ${prioritizedAnomalies
          .map((a) => a.therapeuticTarget)
          .join("; ")} with ${fallRisk.toUpperCase()} fall-risk dosage adjustments.`
      : "Progressive functional locomotion conditioning and postural stability maintenance protocol.";

  const estimatedDurationWeeks = targetPhase === "phase_1_acute" ? 4 : targetPhase === "phase_2_subacute" ? 6 : 8;

  return {
    id: `HEP-${patientId}-${today}-${Date.now().toString(36).slice(-4)}`,
    programTitle,
    patientId,
    patientName,
    prescribingClinician: clinician,
    generatedDate: today,
    lastModifiedDate: today,
    targetAcuityPhase: targetPhase,
    primaryAnomalies: primaryAnomalyIds,
    clinicalSummaryRationale,
    fallRiskCategory: fallRisk,
    exercises: selectedExercises,
    progressionCriteria: Array.from(progressionSet),
    redFlags: Array.from(redFlagsSet),
    estimatedDurationWeeks,
    dosageChecklist,
    overallNotes:
      options?.customClinicianNotes ||
      `Perform exercises in a safe, clutter-free environment. Maintain prescribed frequency of ${maxFreq} days/week.`,
  };
}

/**
 * Formats structured Home Exercise Program details into Section P of a SOAP note,
 * maintaining strict backwards-compatibility with existing unit test substring assertions.
 */
export function formatSoapPlanSection(
  anomalies: AnomalyFinding[],
  program?: HomeExerciseProgram
): string {
  const lines: string[] = [];

  // Exact backward-compatible therapeutic target mapping
  if (anomalies.length > 0) {
    anomalies.forEach((a) => {
      lines.push(`- ${a.name} Focus: ${a.therapeuticTarget}`);
    });
  } else {
    lines.push("- Continue general maintenance mobility exercises and progressive balance conditioning.");
  }

  // Structured Home Exercise Program Summary
  if (program && program.exercises.length > 0) {
    lines.push("");
    lines.push(`1. Prescribed Physical Therapy Regimen [${program.programTitle}]:`);
    lines.push(
      `   - Frequency: ${program.dosageChecklist.daysPerWeek} days/week | Estimated Course: ${program.estimatedDurationWeeks} weeks | Fall Risk: ${program.fallRiskCategory.toUpperCase()}`
    );
    lines.push("   - Active Prescribed Exercises:");

    program.exercises
      .filter((ex) => ex.includedInHandout)
      .forEach((ex, idx) => {
        const holdText = ex.prescribedHoldSec ? `, ${ex.prescribedHoldSec}s hold` : "";
        const durText = ex.prescribedDurationSec ? `, ${ex.prescribedDurationSec}s duration` : "";
        const sideText = ex.affectedSide ? ` [${ex.affectedSide}]` : "";
        lines.push(
          `     ${idx + 1}. ${ex.name}${sideText}: ${ex.prescribedSets} sets x ${ex.prescribedReps} reps${holdText}${durText} (${ex.prescribedRestIntervalSec}s rest)`
        );
        if (ex.coachingCues.length > 0) {
          lines.push(`        * Coaching Cue: ${ex.coachingCues[0]}`);
        }
      });

    if (program.progressionCriteria.length > 0) {
      lines.push("");
      lines.push("   - Milestone Progression Criteria:");
      program.progressionCriteria.slice(0, 2).forEach((c) => {
        lines.push(`     * ${c}`);
      });
    }

    if (program.redFlags.length > 0) {
      lines.push("");
      lines.push("   - Safety Precautions & Red Flags:");
      program.redFlags.slice(0, 2).forEach((r) => {
        lines.push(`     * STOP & CONTACT CLINIC: ${r}`);
      });
    }
    lines.push("");
  }

  // Standard re-evaluation milestone anchor
  lines.push("- Re-evaluate spatio-temporal symmetry progression in 4-6 weeks to track Minimal Detectable Change (MDC95).");

  return lines.join("\n");
}

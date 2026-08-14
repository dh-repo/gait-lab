/**
 * Rehabilitation & Home Exercise Program (HEP) Type Contracts
 *
 * Provides type contracts for evidence-based physical therapy regimens,
 * dynamic dosage scaling, and multi-phase progression.
 */

export type RehabPhase = "phase_1_acute" | "phase_2_subacute" | "phase_3_functional";

export type ExerciseCategory =
  | "strengthening"
  | "stretching"
  | "neuromotor_cueing"
  | "balance_coordination"
  | "gait_retraining"
  | "aerobic"
  | "functional";

export type IllustrationType =
  | "bed_exercise"
  | "seated_exercise"
  | "standing_balance"
  | "gait_drill"
  | "stretching"
  | "equipment_drill";

export interface ExerciseDefinition {
  id: string;
  anomalyId: string;
  name: string;
  targetMuscleGroups: string[];
  category: ExerciseCategory;
  phase: RehabPhase;
  defaultSets: number;
  defaultReps: number;
  defaultHoldSec?: number;
  defaultDurationSec?: number;
  defaultTempo?: string;
  defaultFrequencyPerWeek: number;
  defaultRestIntervalSec: number;
  equipment: string[];
  instructions: string[];
  coachingCues: string[];
  clinicalRationale: string;
  precautions: string[];
  progressionMilestones: string[];
  illustrationType?: IllustrationType;
  affectedSideRequired?: boolean;
  literatureCitation?: string;
}

export interface PrescribedExercise extends ExerciseDefinition {
  prescribedSets: number;
  prescribedReps: number;
  prescribedHoldSec?: number;
  prescribedDurationSec?: number;
  prescribedTempo: string;
  prescribedFrequencyPerWeek: number;
  prescribedRestIntervalSec: number;
  clinicianCustomNotes?: string;
  isCustomized?: boolean;
  affectedSide?: "Left" | "Right" | "Bilateral";
  includedInHandout: boolean;
}

export interface DosageChecklistDay {
  dayIndex: number; // 0 = Mon, 1 = Tue, ..., 6 = Sun
  dayName: string;
  completed: boolean;
}

export interface DosageChecklist {
  daysPerWeek: number;
  sessionsPerDay?: number;
  trackingGrid: DosageChecklistDay[];
}

export interface HomeExerciseProgram {
  id: string;
  programTitle: string;
  patientId: string;
  patientName?: string;
  prescribingClinician: string;
  generatedDate: string;
  lastModifiedDate: string;
  targetAcuityPhase: RehabPhase;
  primaryAnomalies: string[];
  clinicalSummaryRationale: string;
  fallRiskCategory: "low" | "moderate" | "high";
  exercises: PrescribedExercise[];
  progressionCriteria: string[];
  redFlags: string[];
  estimatedDurationWeeks: number;
  dosageChecklist: DosageChecklist;
  overallNotes: string;
}

export interface PrescriptionGenerationOptions {
  preferredPhase?: RehabPhase;
  patientAge?: number;
  fallRiskCategory?: "low" | "moderate" | "high";
  customClinicianNotes?: string;
  maxExercisesPerProgram?: number;
  prescribingClinician?: string;
  patientName?: string;
}

export interface AnomalyProtocol {
  anomalyId: string;
  anomalyName: string;
  targetMuscles: string[];
  citations: string[];
  phase1Summary: string;
  phase2Summary: string;
  phase3Summary: string;
  progressionCriteria: string[];
  precautions: string[];
  redFlags: string[];
}

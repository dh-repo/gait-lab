import type { GaitMetrics } from "./types";

/**
 * Standardized Dual-Task Effect (DTE) & Cognitive-Motor Interference (CMI).
 * 
 * Literature References:
 * - Kelly, V. E., Eusterbrock, A. J., & Shumway-Cook, A. (2010).
 *   A review of dual-task walking deficits in people with Parkinson's disease.
 *   Parkinson's Disease, 2010.
 * - Plummer, P., & Eskes, G. (2015).
 *   Measuring cognitive-motor interference in recovery and rehabilitation.
 *   Frontiers in Human Neuroscience, 9, 22.
 */

export interface DTEAnalysis {
  cadenceDTE: number;
  stepTimeCvDTE: number;
  symmetryDTE: number;
  cmiClassification:
    | "no_interference"
    | "cognitive_prioritization"
    | "motor_prioritization"
    | "mutual_interference";
}

/**
 * Calculates Standardized Dual-Task Effect (DTE) metrics and classifies Cognitive-Motor Interference.
 * 
 * DTE Formulas:
 * - For metrics where HIGHER is better (cadence, symmetryScore):
 *   DTE = ((DualTask - Baseline) / Baseline) * 100%
 * - For metrics where LOWER is better (stepTimeCV):
 *   DTE = -((DualTask - Baseline) / Baseline) * 100%
 */
export function calculateDTE(baseline: GaitMetrics, dualTask: GaitMetrics): DTEAnalysis {
  // 1. Cadence DTE (higher is better)
  let cadenceDTE = 0;
  if (baseline.cadenceSpm > 1e-6) {
    cadenceDTE =
      ((dualTask.cadenceSpm - baseline.cadenceSpm) / baseline.cadenceSpm) * 100;
  }

  // 2. Step Time CV DTE (lower is better -> sign-adjusted)
  let stepTimeCvDTE = 0;
  if (baseline.stepTimeCV > 1e-6) {
    stepTimeCvDTE =
      -((dualTask.stepTimeCV - baseline.stepTimeCV) / baseline.stepTimeCV) * 100;
  }

  // 3. Symmetry DTE (higher symmetryScore is better)
  let symmetryDTE = 0;
  if (baseline.symmetryScore > 1e-6) {
    symmetryDTE =
      ((dualTask.symmetryScore - baseline.symmetryScore) / baseline.symmetryScore) * 100;
  } else if (baseline.stepTimeAsymmetry > 1e-6) {
    // Fallback: stepTimeAsymmetry (lower is better -> sign-adjusted)
    symmetryDTE =
      -((dualTask.stepTimeAsymmetry - baseline.stepTimeAsymmetry) /
        baseline.stepTimeAsymmetry) *
      100;
  }

  // Composite Motor DTE
  const compositeMotorDTE = (cadenceDTE + stepTimeCvDTE + symmetryDTE) / 3;

  // Thresholds for CMI classification (Plummer & Eskes 2015 framework)
  const THRESHOLD = 5.0; // 5% significant threshold

  let cmiClassification: DTEAnalysis["cmiClassification"] = "no_interference";

  if (Math.abs(compositeMotorDTE) <= THRESHOLD) {
    cmiClassification = "no_interference";
  } else if (compositeMotorDTE > THRESHOLD) {
    cmiClassification = "motor_prioritization";
  } else {
    // compositeMotorDTE < -THRESHOLD
    if (cadenceDTE < -THRESHOLD && stepTimeCvDTE < -THRESHOLD) {
      cmiClassification = "mutual_interference";
    } else {
      cmiClassification = "cognitive_prioritization";
    }
  }

  return {
    cadenceDTE: Number(cadenceDTE.toFixed(2)),
    stepTimeCvDTE: Number(stepTimeCvDTE.toFixed(2)),
    symmetryDTE: Number(symmetryDTE.toFixed(2)),
    cmiClassification,
  };
}

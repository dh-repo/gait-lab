import type { GaitMetrics } from "./types";

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
 * Standardized Dual-Task Effect (DTE) and Cognitive-Motor Interference (CMI) Analysis
 * (Kelly et al. 2010, Plummer & Eskes 2015).
 *
 * Formulas:
 * - Higher-is-better metrics (Cadence, Symmetry):
 *   DTE = ((DualTask - Baseline) / Baseline) * 100%
 *
 * - Lower-is-better metrics (Step Time CV):
 *   DTE = -((DualTask - Baseline) / Baseline) * 100%
 *
 * All DTE values are signed such that negative percentages represent performance COST/decline.
 *
 * Plummer & Eskes (2015) Taxonomy:
 * - 'no_interference': |DTE| <= 5%
 * - 'motor_prioritization': DTE > +5% (motor performance improved during dual task)
 * - 'cognitive_prioritization': DTE < -5% (motor performance declined while cognitive task was prioritized)
 * - 'mutual_interference': both cadenceDTE < -5% and stepTimeCvDTE < -5%
 */
export function calculateDTE(
  baseline: GaitMetrics,
  dualTask: GaitMetrics,
): DTEAnalysis {
  const defaultResult: DTEAnalysis = {
    cadenceDTE: 0.0,
    stepTimeCvDTE: 0.0,
    symmetryDTE: 0.0,
    cmiClassification: "no_interference",
  };

  if (!baseline || !dualTask) {
    return defaultResult;
  }

  // 1. Cadence DTE (higher is better)
  let cadenceDTE = 0.0;
  if (baseline.cadenceSpm > 1e-6) {
    cadenceDTE =
      ((dualTask.cadenceSpm - baseline.cadenceSpm) / baseline.cadenceSpm) * 100;
  }

  // 2. Step Time CV DTE (lower is better -> inverted sign)
  let stepTimeCvDTE = 0.0;
  const baseCv = baseline.stepTimeCV > 1e-6 ? baseline.stepTimeCV : 0.05;
  stepTimeCvDTE = -((dualTask.stepTimeCV - baseCv) / baseCv) * 100;

  // 3. Symmetry Score DTE (higher is better)
  let symmetryDTE = 0.0;
  const baseSym =
    baseline.symmetryScore > 1e-6 ? baseline.symmetryScore : 80.0;
  symmetryDTE = ((dualTask.symmetryScore - baseSym) / baseSym) * 100;

  // Round results to 1 decimal place
  cadenceDTE = Number(cadenceDTE.toFixed(1));
  stepTimeCvDTE = Number(stepTimeCvDTE.toFixed(1));
  symmetryDTE = Number(symmetryDTE.toFixed(1));

  // 4. Cognitive-Motor Interference (CMI) Classification (Plummer & Eskes 2015)
  let cmiClassification: DTEAnalysis["cmiClassification"] = "no_interference";

  if (cadenceDTE < -5.0 && stepTimeCvDTE < -5.0) {
    cmiClassification = "mutual_interference";
  } else if (cadenceDTE < -5.0 || stepTimeCvDTE < -5.0) {
    cmiClassification = "cognitive_prioritization";
  } else if (cadenceDTE > 5.0 || stepTimeCvDTE > 5.0) {
    cmiClassification = "motor_prioritization";
  } else {
    cmiClassification = "no_interference";
  }

  return {
    cadenceDTE,
    stepTimeCvDTE,
    symmetryDTE,
    cmiClassification,
  };
}

import type { GaitMetrics, PatientMetadata } from "./types";

export type SexCategory = "male" | "female" | "combined";
export type AgeGroupCategory = "young" | "middle" | "elderly" | "combined";

export interface NormativeReferenceRange {
  paramId: string;
  label: string;
  unit: string;
  mean: number;
  sd: number;
  min95: number;
  max95: number;
  citation: "Winter (2009)" | "Bovi et al. (2011)";
}

export interface NormativeEvaluationResult {
  paramId: string;
  label: string;
  observedValue: number;
  normativeMean: number;
  normativeSd: number;
  zScore: number;
  percentile: number;
  band: "normal" | "mild_deviation" | "moderate_deviation" | "severe_deviation";
  unit: string;
  citation: string;
}

export interface GaitDeviationIndexResult {
  gdiScore: number;
  zRms: number;
  evaluatedCount: number;
  interpretation: string;
  paramZScores: Record<string, number>;
}

export type PatientMetaInput =
  | (Partial<PatientMetadata> & { age?: number; sex?: SexCategory | string })
  | undefined;

// Dataset 1: Winter (2009) — Biomechanics and Motor Control of Human Movement (4th Ed.)
const WINTER_NORMATIVES: Record<string, { label: string; unit: string; mean: number; sd: number }> = {
  cadenceSpm: { label: "Cadence", unit: "spm", mean: 105.0, sd: 8.0 },
  stepTimeCV: { label: "Step Time CV", unit: "ratio", mean: 0.02, sd: 0.006 },
  stancePct: { label: "Stance Phase %", unit: "%", mean: 60.5, sd: 2.0 },
  doubleSupportPct: { label: "Double Support Phase %", unit: "%", mean: 20.8, sd: 2.5 },
  kneeFlexionRom: { label: "Knee Flexion ROM", unit: "°", mean: 58.0, sd: 4.5 },
};

// Dataset 2: Bovi et al. (2011) — Lifespan Stratified Reference Data
type BoviDataPoint = { mean: number; sd: number };
type BoviSexMap = Record<SexCategory, BoviDataPoint>;
type BoviAgeMap = Record<AgeGroupCategory, BoviSexMap>;

const BOVI_NORMATIVES: Record<string, { label: string; unit: string; data: BoviAgeMap }> = {
  cadenceSpm: {
    label: "Cadence",
    unit: "spm",
    data: {
      young: {
        male: { mean: 112.4, sd: 7.5 },
        female: { mean: 117.8, sd: 6.8 },
        combined: { mean: 115.1, sd: 7.2 },
      },
      middle: {
        male: { mean: 108.6, sd: 8.0 },
        female: { mean: 114.2, sd: 7.2 },
        combined: { mean: 111.4, sd: 7.6 },
      },
      elderly: {
        male: { mean: 103.2, sd: 9.5 },
        female: { mean: 109.5, sd: 8.8 },
        combined: { mean: 106.35, sd: 9.15 },
      },
      combined: {
        male: { mean: 108.1, sd: 8.3 },
        female: { mean: 113.8, sd: 7.6 },
        combined: { mean: 110.95, sd: 8.0 },
      },
    },
  },
  stepTimeCV: {
    label: "Step Time CV",
    unit: "ratio",
    data: {
      young: {
        male: { mean: 0.021, sd: 0.005 },
        female: { mean: 0.020, sd: 0.005 },
        combined: { mean: 0.0205, sd: 0.005 },
      },
      middle: {
        male: { mean: 0.024, sd: 0.007 },
        female: { mean: 0.023, sd: 0.006 },
        combined: { mean: 0.0235, sd: 0.0065 },
      },
      elderly: {
        male: { mean: 0.032, sd: 0.011 },
        female: { mean: 0.030, sd: 0.010 },
        combined: { mean: 0.031, sd: 0.0105 },
      },
      combined: {
        male: { mean: 0.0257, sd: 0.0077 },
        female: { mean: 0.0243, sd: 0.007 },
        combined: { mean: 0.025, sd: 0.0073 },
      },
    },
  },
  stancePct: {
    label: "Stance Phase %",
    unit: "%",
    data: {
      young: {
        male: { mean: 60.2, sd: 1.5 },
        female: { mean: 59.8, sd: 1.4 },
        combined: { mean: 60.0, sd: 1.5 },
      },
      middle: {
        male: { mean: 61.4, sd: 1.8 },
        female: { mean: 60.8, sd: 1.6 },
        combined: { mean: 61.1, sd: 1.7 },
      },
      elderly: {
        male: { mean: 62.8, sd: 2.5 },
        female: { mean: 62.1, sd: 2.2 },
        combined: { mean: 62.45, sd: 2.35 },
      },
      combined: {
        male: { mean: 61.47, sd: 1.93 },
        female: { mean: 60.9, sd: 1.73 },
        combined: { mean: 61.18, sd: 1.85 },
      },
    },
  },
  doubleSupportPct: {
    label: "Double Support Phase %",
    unit: "%",
    data: {
      young: {
        male: { mean: 20.1, sd: 2.0 },
        female: { mean: 19.6, sd: 1.8 },
        combined: { mean: 19.85, sd: 1.9 },
      },
      middle: {
        male: { mean: 21.5, sd: 2.2 },
        female: { mean: 20.9, sd: 2.0 },
        combined: { mean: 21.2, sd: 2.1 },
      },
      elderly: {
        male: { mean: 23.8, sd: 3.0 },
        female: { mean: 23.1, sd: 2.8 },
        combined: { mean: 23.45, sd: 2.9 },
      },
      combined: {
        male: { mean: 21.8, sd: 2.4 },
        female: { mean: 21.2, sd: 2.2 },
        combined: { mean: 21.5, sd: 2.3 },
      },
    },
  },
  kneeFlexionRom: {
    label: "Knee Flexion ROM",
    unit: "°",
    data: {
      young: {
        male: { mean: 60.5, sd: 3.8 },
        female: { mean: 59.2, sd: 3.5 },
        combined: { mean: 59.85, sd: 3.65 },
      },
      middle: {
        male: { mean: 57.4, sd: 4.0 },
        female: { mean: 56.8, sd: 3.7 },
        combined: { mean: 57.1, sd: 3.85 },
      },
      elderly: {
        male: { mean: 53.5, sd: 4.8 },
        female: { mean: 54.1, sd: 4.5 },
        combined: { mean: 53.8, sd: 4.65 },
      },
      combined: {
        male: { mean: 57.13, sd: 4.2 },
        female: { mean: 56.7, sd: 3.9 },
        combined: { mean: 56.92, sd: 4.05 },
      },
    },
  },
};

/** Calculates z-score: (value - mean) / sd. Returns 0 if invalid or sd <= 0. */
export function calculateZScore(value: number, mean: number, sd: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) {
    return 0;
  }
  return (value - mean) / sd;
}

/** Error function erf(x) approximation via Abramowitz & Stegun formula 7.1.26. */
export function erf(x: number): number {
  if (!Number.isFinite(x)) return x < 0 ? -1 : 1;
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return sign * y;
}

/** Maps a z-score to a normal CDF percentile [0.1, 99.9]. */
export function calculatePercentile(zScore: number): number {
  if (!Number.isFinite(zScore)) return 50.0;
  const cdf = 0.5 * (1.0 + erf(zScore / Math.SQRT2));
  const rawPercentile = cdf * 100.0;
  return Math.max(0.1, Math.min(99.9, rawPercentile));
}

function normalizeParamId(paramId: string): string {
  switch (paramId) {
    case "cadence":
    case "cadenceSpm":
      return "cadenceSpm";
    case "stepTimeCV":
      return "stepTimeCV";
    case "stance":
    case "stancePct":
    case "leftStancePct":
    case "rightStancePct":
    case "zeniStance":
      return "stancePct";
    case "ds":
    case "doubleSupport":
    case "doubleSupportPct":
    case "doubleSupportHint":
      return "doubleSupportPct";
    case "kneeFlex":
    case "kneeFlexion":
    case "kneeFlexionRom":
    case "kneeFlexLeft":
    case "kneeFlexRight":
    case "kneeL":
    case "kneeR":
      return "kneeFlexionRom";
    default:
      return paramId;
  }
}

/** Retrieves normative mean, SD, 95% range, and citation for a given parameter, age, and sex. */
export function getNormativeReference(
  paramId: string,
  age?: number,
  sex?: SexCategory | string,
): NormativeReferenceRange {
  const normKey = normalizeParamId(paramId);

  let parsedSex: SexCategory = "combined";
  if (sex === "male" || sex === "female") {
    parsedSex = sex;
  }

  let ageGroup: AgeGroupCategory = "combined";
  if (typeof age === "number" && Number.isFinite(age)) {
    if (age < 50) ageGroup = "young";
    else if (age <= 64) ageGroup = "middle";
    else ageGroup = "elderly";
  }

  // If age or sex is explicitly provided, look up in Bovi et al. (2011)
  if (age !== undefined || (sex && sex !== "combined")) {
    const boviEntry = BOVI_NORMATIVES[normKey];
    if (boviEntry) {
      const dataPoint = boviEntry.data[ageGroup][parsedSex];
      return {
        paramId: normKey,
        label: boviEntry.label,
        unit: boviEntry.unit,
        mean: dataPoint.mean,
        sd: dataPoint.sd,
        min95: dataPoint.mean - 1.96 * dataPoint.sd,
        max95: dataPoint.mean + 1.96 * dataPoint.sd,
        citation: "Bovi et al. (2011)",
      };
    }
  }

  // Default to Winter (2009) baseline
  const winterEntry = WINTER_NORMATIVES[normKey] || WINTER_NORMATIVES.cadenceSpm;
  return {
    paramId: normKey,
    label: winterEntry.label,
    unit: winterEntry.unit,
    mean: winterEntry.mean,
    sd: winterEntry.sd,
    min95: winterEntry.mean - 1.96 * winterEntry.sd,
    max95: winterEntry.mean + 1.96 * winterEntry.sd,
    citation: "Winter (2009)",
  };
}

/**
 * Calculates camera-adapted Gait Deviation Index (Schwartz & Rozumalski 2008).
 * 100 = normative mean, -10 points per 1 SD of RMS Z-score deviation across parameters.
 * Clamped to [0, 130].
 */
export function calculateGDI(
  metrics: GaitMetrics,
  patientMeta?: PatientMetaInput,
): GaitDeviationIndexResult {
  const age = patientMeta?.age;
  const sex = patientMeta?.sex as SexCategory | undefined;

  const paramValues: { paramId: string; value: number }[] = [];

  if (typeof metrics.cadenceSpm === "number" && metrics.cadenceSpm > 0) {
    paramValues.push({ paramId: "cadenceSpm", value: metrics.cadenceSpm });
  }

  if (typeof metrics.stepTimeCV === "number" && Number.isFinite(metrics.stepTimeCV)) {
    paramValues.push({ paramId: "stepTimeCV", value: metrics.stepTimeCV });
  }

  const stanceValues: number[] = [];
  if (typeof metrics.leftStancePct === "number" && Number.isFinite(metrics.leftStancePct)) {
    stanceValues.push(metrics.leftStancePct);
  }
  if (typeof metrics.rightStancePct === "number" && Number.isFinite(metrics.rightStancePct)) {
    stanceValues.push(metrics.rightStancePct);
  }
  if (stanceValues.length > 0) {
    const avgStance = stanceValues.reduce((a, b) => a + b, 0) / stanceValues.length;
    paramValues.push({ paramId: "stancePct", value: avgStance });
  }

  if (typeof metrics.doubleSupportPct === "number" && Number.isFinite(metrics.doubleSupportPct)) {
    paramValues.push({ paramId: "doubleSupportPct", value: metrics.doubleSupportPct });
  } else if (typeof metrics.doubleSupportHint === "number" && Number.isFinite(metrics.doubleSupportHint)) {
    paramValues.push({ paramId: "doubleSupportPct", value: metrics.doubleSupportHint * 100 });
  }

  const kneeValues: number[] = [];
  if (typeof metrics.kneeFlexLeft === "number" && Number.isFinite(metrics.kneeFlexLeft)) {
    kneeValues.push(metrics.kneeFlexLeft);
  }
  if (typeof metrics.kneeFlexRight === "number" && Number.isFinite(metrics.kneeFlexRight)) {
    kneeValues.push(metrics.kneeFlexRight);
  }
  if (kneeValues.length > 0) {
    const avgKnee = kneeValues.reduce((a, b) => a + b, 0) / kneeValues.length;
    paramValues.push({ paramId: "kneeFlexionRom", value: avgKnee });
  }

  const paramZScores: Record<string, number> = {};
  let zSumSq = 0;
  let evaluatedCount = 0;

  for (const item of paramValues) {
    const ref = getNormativeReference(item.paramId, age, sex);
    const z = calculateZScore(item.value, ref.mean, ref.sd);
    paramZScores[item.paramId] = z;
    zSumSq += z * z;
    evaluatedCount++;
  }

  const zRms = evaluatedCount > 0 ? Math.sqrt(zSumSq / evaluatedCount) : 0;
  const rawGdi = 100 - 10 * zRms;
  const gdiScore = Math.max(0, Math.min(130, rawGdi));

  let interpretation = "";
  if (gdiScore >= 100) {
    interpretation = "Normal normative gait alignment (within 0 SD deviation).";
  } else if (gdiScore >= 90) {
    interpretation = "Mild gait deviation (within 1 SD of normative mean).";
  } else if (gdiScore >= 80) {
    interpretation = "Moderate gait deviation (1–2 SD from normative mean).";
  } else {
    interpretation = "Severe gait deviation (>2 SD from normative mean).";
  }

  return {
    gdiScore,
    zRms,
    evaluatedCount,
    interpretation,
    paramZScores,
  };
}

/** Evaluates all available gait metrics against age/sex-stratified normative reference data. */
export function evaluateGaitNormatives(
  metrics: GaitMetrics,
  patientMeta?: PatientMetaInput,
): { gdi: GaitDeviationIndexResult; evaluations: NormativeEvaluationResult[] } {
  const gdi = calculateGDI(metrics, patientMeta);
  const age = patientMeta?.age;
  const sex = patientMeta?.sex as SexCategory | undefined;

  const evaluations: NormativeEvaluationResult[] = [];

  const checkAndAdd = (paramId: string, value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const ref = getNormativeReference(paramId, age, sex);
    const zScore = calculateZScore(value, ref.mean, ref.sd);
    const percentile = calculatePercentile(zScore);

    const absZ = Math.abs(zScore);
    let band: NormativeEvaluationResult["band"] = "normal";
    if (absZ >= 3.0) band = "severe_deviation";
    else if (absZ >= 2.0) band = "moderate_deviation";
    else if (absZ >= 1.0) band = "mild_deviation";

    evaluations.push({
      paramId,
      label: ref.label,
      observedValue: value,
      normativeMean: ref.mean,
      normativeSd: ref.sd,
      zScore,
      percentile,
      band,
      unit: ref.unit,
      citation: ref.citation,
    });
  };

  checkAndAdd("cadenceSpm", metrics.cadenceSpm);
  checkAndAdd("stepTimeCV", metrics.stepTimeCV);

  const stanceValues: number[] = [];
  if (typeof metrics.leftStancePct === "number" && Number.isFinite(metrics.leftStancePct)) {
    stanceValues.push(metrics.leftStancePct);
  }
  if (typeof metrics.rightStancePct === "number" && Number.isFinite(metrics.rightStancePct)) {
    stanceValues.push(metrics.rightStancePct);
  }
  if (stanceValues.length > 0) {
    checkAndAdd("stancePct", stanceValues.reduce((a, b) => a + b, 0) / stanceValues.length);
  }

  if (typeof metrics.doubleSupportPct === "number" && Number.isFinite(metrics.doubleSupportPct)) {
    checkAndAdd("doubleSupportPct", metrics.doubleSupportPct);
  } else if (typeof metrics.doubleSupportHint === "number" && Number.isFinite(metrics.doubleSupportHint)) {
    checkAndAdd("doubleSupportPct", metrics.doubleSupportHint * 100);
  }

  const kneeValues: number[] = [];
  if (typeof metrics.kneeFlexLeft === "number" && Number.isFinite(metrics.kneeFlexLeft)) {
    kneeValues.push(metrics.kneeFlexLeft);
  }
  if (typeof metrics.kneeFlexRight === "number" && Number.isFinite(metrics.kneeFlexRight)) {
    kneeValues.push(metrics.kneeFlexRight);
  }
  if (kneeValues.length > 0) {
    checkAndAdd("kneeFlexionRom", kneeValues.reduce((a, b) => a + b, 0) / kneeValues.length);
  }

  return { gdi, evaluations };
}

import type { GaitMetrics, PatientMetadata } from "./types";
import type { GaitAngleAnalysis } from "./angles";

export type SexCategory = "male" | "female" | "combined";
export type AgeGroupCategory =
  | "pediatric"
  | "young"
  | "middle"
  | "elderly"
  | "advanced_75_84"
  | "advanced_85_plus"
  | "combined";

export interface NormativeReferenceRange {
  paramId: string;
  label: string;
  unit: string;
  mean: number;
  sd: number;
  min95: number;
  max95: number;
  citation: "Winter (2009)" | "Bovi et al. (2011)" | "Hollman et al. (2010)";
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

export interface MAPSubScores {
  pelvicTilt?: number | null;
  hipFlexionExtension: number | null;
  kneeFlexionExtension: number | null;
  ankleDorsiflexionPlantarflexion: number | null;
  pelvicObliquity?: number | null;
}

export interface GaitProfileScoreResult {
  /** Overall Gait Profile Score in degrees (RMS of MAP sub-scores) */
  gpsScore: number;
  /** Movement Analysis Profile per-joint RMSE sub-scores in degrees */
  map: MAPSubScores;
  /** Number of joint variables evaluated in GPS */
  evaluatedJointCount: number;
  /** Qualitative interpretation based on GPS score */
  interpretation: string;
  /** Citation reference */
  citation: "Baker et al. (2009)";
}

export type PatientMetaInput =
  | (Partial<PatientMetadata> & { age?: number; sex?: SexCategory | string })
  | undefined;

// Dataset 1: Winter (2009) & Hollman (2010) Baseline Normatives
const WINTER_NORMATIVES: Record<string, { label: string; unit: string; mean: number; sd: number }> = {
  cadenceSpm: { label: "Cadence", unit: "spm", mean: 105.0, sd: 8.0 },
  stepTimeCV: { label: "Step Time CV", unit: "ratio", mean: 0.02, sd: 0.006 },
  stancePct: { label: "Stance Phase %", unit: "%", mean: 60.5, sd: 2.0 },
  doubleSupportPct: { label: "Double Support Phase %", unit: "%", mean: 20.8, sd: 2.5 },
  kneeFlexionRom: { label: "Knee Flexion ROM", unit: "°", mean: 58.0, sd: 4.5 },
  gaitSpeed: { label: "Gait Speed", unit: "m/s", mean: 1.35, sd: 0.15 },
  stepLength: { label: "Step Length", unit: "m", mean: 0.68, sd: 0.06 },
  hipRom: { label: "Hip Flexion ROM", unit: "°", mean: 42.0, sd: 4.0 },
  ankleRom: { label: "Ankle ROM", unit: "°", mean: 27.0, sd: 3.5 },
  ankleDorsiflexion: { label: "Ankle Dorsiflexion", unit: "°", mean: 10.0, sd: 3.0 },
  stepWidth: { label: "Step Width", unit: "m", mean: 0.16, sd: 0.03 },
  pelvicObliquity: { label: "Pelvic Obliquity", unit: "°", mean: 2.0, sd: 1.0 },
  trunkLateralSway: { label: "Trunk Lateral Sway", unit: "°", mean: 3.0, sd: 1.2 },
  swingLateralArc: { label: "Swing Lateral Arc", unit: "m", mean: 0.04, sd: 0.02 },
};

// Dataset 2: Bovi et al. (2011) — Lifespan Stratified Reference Data
type BoviDataPoint = { mean: number; sd: number };
type BoviSexMap = Record<SexCategory, BoviDataPoint>;
type BoviAgeMap = Record<string, BoviSexMap>;

const BOVI_NORMATIVES: Record<string, { label: string; unit: string; data: BoviAgeMap }> = {
  cadenceSpm: {
    label: "Cadence",
    unit: "spm",
    data: {
      pediatric: {
        male: { mean: 124.0, sd: 9.0 },
        female: { mean: 128.0, sd: 8.5 },
        combined: { mean: 126.0, sd: 8.8 },
      },
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
      advanced_75_84: {
        male: { mean: 98.5, sd: 9.8 },
        female: { mean: 104.0, sd: 9.2 },
        combined: { mean: 101.25, sd: 9.5 },
      },
      advanced_85_plus: {
        male: { mean: 92.0, sd: 10.5 },
        female: { mean: 97.5, sd: 10.0 },
        combined: { mean: 94.75, sd: 10.25 },
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
      pediatric: {
        male: { mean: 0.028, sd: 0.008 },
        female: { mean: 0.026, sd: 0.007 },
        combined: { mean: 0.027, sd: 0.0075 },
      },
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
      advanced_75_84: {
        male: { mean: 0.038, sd: 0.013 },
        female: { mean: 0.035, sd: 0.012 },
        combined: { mean: 0.0365, sd: 0.0125 },
      },
      advanced_85_plus: {
        male: { mean: 0.046, sd: 0.016 },
        female: { mean: 0.042, sd: 0.015 },
        combined: { mean: 0.044, sd: 0.0155 },
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
      pediatric: {
        male: { mean: 58.5, sd: 1.8 },
        female: { mean: 58.2, sd: 1.6 },
        combined: { mean: 58.35, sd: 1.7 },
      },
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
      advanced_75_84: {
        male: { mean: 64.2, sd: 2.8 },
        female: { mean: 63.5, sd: 2.6 },
        combined: { mean: 63.85, sd: 2.7 },
      },
      advanced_85_plus: {
        male: { mean: 65.8, sd: 3.2 },
        female: { mean: 65.0, sd: 3.0 },
        combined: { mean: 65.4, sd: 3.1 },
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
      pediatric: {
        male: { mean: 17.5, sd: 2.1 },
        female: { mean: 17.0, sd: 1.9 },
        combined: { mean: 17.25, sd: 2.0 },
      },
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
      advanced_75_84: {
        male: { mean: 26.5, sd: 3.5 },
        female: { mean: 25.8, sd: 3.2 },
        combined: { mean: 26.15, sd: 3.35 },
      },
      advanced_85_plus: {
        male: { mean: 29.2, sd: 4.2 },
        female: { mean: 28.5, sd: 3.8 },
        combined: { mean: 28.85, sd: 4.0 },
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
      pediatric: {
        male: { mean: 63.0, sd: 4.2 },
        female: { mean: 62.5, sd: 4.0 },
        combined: { mean: 62.75, sd: 4.1 },
      },
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
      advanced_75_84: {
        male: { mean: 49.5, sd: 5.2 },
        female: { mean: 50.2, sd: 4.9 },
        combined: { mean: 49.85, sd: 5.05 },
      },
      advanced_85_plus: {
        male: { mean: 45.0, sd: 5.8 },
        female: { mean: 46.0, sd: 5.5 },
        combined: { mean: 45.5, sd: 5.65 },
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
    case "speed":
    case "gaitSpeed":
    case "gaitSpeedMps":
      return "gaitSpeed";
    case "hipRom":
    case "hipFlexion":
    case "hipFlexionRom":
      return "hipRom";
    case "ankleRom":
    case "ankleFlexion":
    case "ankleFlexionRom":
      return "ankleRom";
    case "stepLength":
      return "stepLength";
    case "ankleDorsiflexion":
      return "ankleDorsiflexion";
    case "stepWidth":
      return "stepWidth";
    case "pelvicObliquity":
      return "pelvicObliquity";
    case "trunkLateralSway":
      return "trunkLateralSway";
    case "swingLateralArc":
      return "swingLateralArc";
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
    if (age < 18) ageGroup = "pediatric";
    else if (age < 50) ageGroup = "young";
    else if (age <= 64) ageGroup = "middle";
    else if (age <= 74) ageGroup = "elderly";
    else if (age <= 84) ageGroup = "advanced_75_84";
    else ageGroup = "advanced_85_plus";
  }

  // If age or sex is explicitly provided, look up in Bovi et al. (2011)
  if (age !== undefined || (sex && sex !== "combined")) {
    const boviEntry = BOVI_NORMATIVES[normKey];
    if (boviEntry) {
      let dataPoint = boviEntry.data[ageGroup]?.[parsedSex];
      if (!dataPoint) {
        // Fallback for age groups not directly defined in Bovi table
        const fallbackAge =
          ageGroup === "pediatric"
            ? "young"
            : ageGroup === "advanced_75_84" || ageGroup === "advanced_85_plus"
            ? "elderly"
            : "combined";
        dataPoint = boviEntry.data[fallbackAge]?.[parsedSex] || boviEntry.data.combined[parsedSex];
      }
      if (dataPoint) {
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

export {
  type GPSKinematicVariable,
  type GPSAnatomicalPlane,
  type GPSJointSegment,
  type GPSSeverity,
  type GVSVariableMeta,
  type GVSScoreEntry,
  type FullGPSResult,
  type GPSNormativePoint,
  GPS_VARIABLES_META,
  GPS_VARIABLE_ORDER,
  GPS_CONTROL_THRESHOLD_DEG,
  GPS_MCID_THRESHOLD_DEG,
  getGPSNormativeCurves,
  calculateGVS,
  classifyGPSSeverity,
  computeFullGPSAndMAP,
  evaluateGPSDelta,
} from "./gpsNormatives";
import { computeFullGPSAndMAP } from "./gpsNormatives";

/**
 * Calculates Gait Profile Score (GPS) & Movement Analysis Profile (MAP) per Baker et al. (2009).
 * Computes RMSE between patient joint angle curves and normative reference curves across evaluated variables.
 */
export function calculateGPSAndMAP(
  angleAnalysis?: GaitAngleAnalysis,
): GaitProfileScoreResult {
  const fullResult = computeFullGPSAndMAP(angleAnalysis);

  const kneeEntry = fullResult.gvsEntries.find((e) => e.variable === "kneeFlexion");
  const hipEntry = fullResult.gvsEntries.find((e) => e.variable === "hipFlexion");
  const ankleEntry = fullResult.gvsEntries.find((e) => e.variable === "ankleFlexion");
  const tiltEntry = fullResult.gvsEntries.find((e) => e.variable === "pelvicTilt");
  const oblEntry = fullResult.gvsEntries.find((e) => e.variable === "pelvicObliquity");

  return {
    gpsScore: fullResult.overallGPS,
    map: {
      kneeFlexionExtension: kneeEntry?.overallGVS ?? null,
      hipFlexionExtension: hipEntry?.overallGVS ?? null,
      ankleDorsiflexionPlantarflexion: ankleEntry?.overallGVS ?? null,
      pelvicTilt: tiltEntry?.overallGVS ?? null,
      pelvicObliquity: oblEntry?.overallGVS ?? null,
    },
    evaluatedJointCount: fullResult.evaluatedVariableCount,
    interpretation: fullResult.interpretation,
    citation: "Baker et al. (2009)",
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

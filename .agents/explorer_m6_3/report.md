# Milestone 6 Technical Implementation Blueprint: Clinical Normative Reference Integration & GDI

**Agent ID:** `teamwork_preview_explorer_m6_3`  
**Date:** 2026-08-10  
**Project Root:** `/Users/damian/GitHub/gait-lab`  
**Target Scope:** Milestone 6 (`src/lib/gait/normatives.ts`, `src/lib/gait/ratings.ts`, `src/lib/gait/guesses.ts`, `src/lib/gait/__tests__/normatives.test.ts`)

---

## 1. Executive Summary & Architectural Overview

Milestone 6 introduces clinical normative reference dataset integration and a camera-adapted Gait Deviation Index (GDI, Schwartz & Rozumalski 2008) into `gait-lab`. 

Key deliverables engineered in this blueprint:
1. **`src/lib/gait/normatives.ts`**: New core module containing normative reference datasets from Winter (2009) and Bovi et al. (2011) (cadence, step time CV, stance phase %, double support phase %, knee flexion ROM) stratified by age group (Young 18–49, Middle 50–64, Elderly 65+) and sex (Male, Female, Combined). Exporting `calculateZScore`, `calculatePercentile`, `calculateGDI`, `getNormativeReference`, and `evaluateGaitNormatives`.
2. **`src/lib/gait/ratings.ts`**: Integration enriching `MetricRating` and `StructuredReport` with Z-score and percentile context and adding the GDI composite calculation to report outputs.
3. **`src/lib/gait/guesses.ts`**: Integration adding hypothesis rules (`gdi-deviation` for GDI < 80/90 and `normative-percentile-deviation` for extreme percentiles < 5th or > 95th).
4. **`src/lib/gait/__tests__/normatives.test.ts`**: Comprehensive Vitest unit test suite covering math edge cases, dataset lookups, GDI calculation, and rating/hypothesis integrations.

---

## 2. Scientific Reference Datasets

### A. Winter (2009) — *Biomechanics and Motor Control of Human Movement* (4th Ed.)
Winter provides canonical normative spatio-temporal and kinematic parameters for healthy adults walking at natural speed:
- **Cadence**: $105.0 \pm 8.0$ spm
- **Step Time**: $0.57 \pm 0.04$ s
- **Step Time CV**: $2.0 \pm 0.6$ %
- **Stance Phase**: $60.5 \pm 2.0$ % of gait cycle
- **Double Support Phase**: $20.8 \pm 2.5$ % of gait cycle
- **Knee Flexion ROM**: $58.0 \pm 4.5$ °

### B. Bovi et al. (2011) — *Gait & Posture* 33(4): 555-560
Age- and sex-stratified normative values across adult lifespan:
- **Young Adults (18–49 yrs)**:
  - Male: Cadence $112.4 \pm 7.5$ spm, Stance $60.2 \pm 1.5$ %, Double Support $20.1 \pm 2.0$ %, Knee ROM $60.5 \pm 3.8$ °, Step Time CV $1.8 \pm 0.5$ %
  - Female: Cadence $117.8 \pm 6.8$ spm, Stance $59.8 \pm 1.4$ %, Double Support $19.6 \pm 1.8$ %, Knee ROM $59.2 \pm 3.5$ °, Step Time CV $1.7 \pm 0.4$ %
  - Combined: Cadence $115.1 \pm 7.5$ spm, Stance $60.0 \pm 1.5$ %, Double Support $19.8 \pm 1.9$ %, Knee ROM $59.8 \pm 3.7$ °, Step Time CV $1.8 \pm 0.5$ %
- **Middle-Aged Adults (50–64 yrs)**:
  - Male: Cadence $108.6 \pm 8.0$ spm, Stance $61.4 \pm 1.8$ %, Double Support $21.5 \pm 2.2$ %, Knee ROM $57.4 \pm 4.0$ °, Step Time CV $2.1 \pm 0.6$ %
  - Female: Cadence $114.2 \pm 7.2$ spm, Stance $60.8 \pm 1.6$ %, Double Support $20.9 \pm 2.0$ %, Knee ROM $56.8 \pm 3.7$ °, Step Time CV $2.0 \pm 0.5$ %
  - Combined: Cadence $111.4 \pm 7.8$ spm, Stance $61.1 \pm 1.7$ %, Double Support $21.2 \pm 2.1$ %, Knee ROM $57.1 \pm 3.9$ °, Step Time CV $2.1 \pm 0.6$ %
- **Elderly Adults (65+ yrs)**:
  - Male: Cadence $103.2 \pm 9.5$ spm, Stance $62.8 \pm 2.5$ %, Double Support $23.8 \pm 3.0$ %, Knee ROM $53.5 \pm 4.8$ °, Step Time CV $2.8 \pm 0.9$ %
  - Female: Cadence $109.5 \pm 8.8$ spm, Stance $62.1 \pm 2.2$ %, Double Support $23.1 \pm 2.8$ %, Knee ROM $54.1 \pm 4.5$ °, Step Time CV $2.6 \pm 0.8$ %
  - Combined: Cadence $106.4 \pm 9.5$ spm, Stance $62.5 \pm 2.4$ %, Double Support $23.5 \pm 2.9$ %, Knee ROM $53.8 \pm 4.7$ °, Step Time CV $2.7 \pm 0.9$ %

---

## 3. Module Blueprint: `src/lib/gait/normatives.ts`

### Full Implementation Code Specification

```typescript
import type { GaitMetrics } from "./types";
import { clamp } from "./landmarks";

export type SexCategory = "male" | "female" | "combined";
export type AgeGroupCategory = "young" | "middle" | "elderly" | "combined";

export type NormativeParamId =
  | "cadence"
  | "stepTimeCV"
  | "stancePct"
  | "doubleSupportPct"
  | "kneeFlexionROM";

export interface NormativeReferenceRange {
  paramId: NormativeParamId;
  label: string;
  unit: string;
  mean: number;
  sd: number;
  min95: number;
  max95: number;
  citation: "Winter (2009)" | "Bovi et al. (2011)";
  ageGroup?: AgeGroupCategory;
  sex?: SexCategory;
}

export interface NormativeEvaluationResult {
  paramId: NormativeParamId;
  label: string;
  observedValue: number;
  normativeMean: number;
  normativeSd: number;
  zScore: number;
  percentile: number; // 0 to 100
  band: "normal" | "mild_deviation" | "moderate_deviation" | "severe_deviation";
  unit: string;
  citation: string;
}

export interface GaitDeviationIndexResult {
  gdiScore: number; // [0, 130], 100 = normative mean, -10 per 1 SD deviation
  zRms: number;     // Root Mean Square Z-score across available parameters
  interpretation: string;
  evaluatedParametersCount: number;
  evaluatedParameters: {
    paramId: NormativeParamId;
    observed: number;
    mean: number;
    sd: number;
    zScore: number;
  }[];
}

/** Normative reference datasets table */
export const NORMATIVE_DATASETS: Record<
  string, // key format: `${ageGroup}_${sex}_${paramId}` or `default_${paramId}`
  NormativeReferenceRange
> = {
  // --- Adult Combined Defaults (Winter 2009 / Pooled) ---
  "default_cadence": { paramId: "cadence", label: "Cadence", unit: "spm", mean: 105.0, sd: 8.0, min95: 89.3, max95: 120.7, citation: "Winter (2009)" },
  "default_stepTimeCV": { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.0, sd: 0.6, min95: 0.8, max95: 3.2, citation: "Winter (2009)" },
  "default_stancePct": { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 60.5, sd: 2.0, min95: 56.6, max95: 64.4, citation: "Winter (2009)" },
  "default_doubleSupportPct": { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 20.8, sd: 2.5, min95: 15.9, max95: 25.7, citation: "Winter (2009)" },
  "default_kneeFlexionROM": { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 58.0, sd: 4.5, min95: 49.2, max95: 66.8, citation: "Winter (2009)" },

  // --- Bovi et al. (2011) Stratified: Young (18-49) ---
  "young_male_cadence": { paramId: "cadence", label: "Cadence", unit: "spm", mean: 112.4, sd: 7.5, min95: 97.7, max95: 127.1, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "male" },
  "young_female_cadence": { paramId: "cadence", label: "Cadence", unit: "spm", mean: 117.8, sd: 6.8, min95: 104.5, max95: 131.1, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "female" },
  "young_combined_cadence": { paramId: "cadence", label: "Cadence", unit: "spm", mean: 115.1, sd: 7.5, min95: 100.4, max95: 129.8, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "combined" },

  "young_male_stepTimeCV": { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 1.8, sd: 0.5, min95: 0.8, max95: 2.8, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "male" },
  "young_female_stepTimeCV": { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 1.7, sd: 0.4, min95: 0.9, max95: 2.5, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "female" },
  "young_combined_stepTimeCV": { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 1.8, sd: 0.5, min95: 0.8, max95: 2.8, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "combined" },

  "young_male_stancePct": { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 60.2, sd: 1.5, min95: 57.3, max95: 63.1, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "male" },
  "young_female_stancePct": { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 59.8, sd: 1.4, min95: 57.1, max95: 62.5, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "female" },
  "young_combined_stancePct": { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 60.0, sd: 1.5, min95: 57.1, max95: 62.9, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "combined" },

  "young_male_doubleSupportPct": { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 20.1, sd: 2.0, min95: 16.2, max95: 24.0, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "male" },
  "young_female_doubleSupportPct": { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 19.6, sd: 1.8, min95: 16.1, max95: 23.1, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "female" },
  "young_combined_doubleSupportPct": { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 19.8, sd: 1.9, min95: 16.1, max95: 23.5, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "combined" },

  "young_male_kneeFlexionROM": { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 60.5, sd: 3.8, min95: 53.1, max95: 67.9, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "male" },
  "young_female_kneeFlexionROM": { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 59.2, sd: 3.5, min95: 52.3, max95: 66.1, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "female" },
  "young_combined_kneeFlexionROM": { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 59.8, sd: 3.7, min95: 52.5, max95: 67.1, citation: "Bovi et al. (2011)", ageGroup: "young", sex: "combined" },

  // --- Middle-Aged (50-64) ---
  "middle_male_cadence": { paramId: "cadence", label: "Cadence", unit: "spm", mean: 108.6, sd: 8.0, min95: 92.9, max95: 124.3, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "male" },
  "middle_female_cadence": { paramId: "cadence", label: "Cadence", unit: "spm", mean: 114.2, sd: 7.2, min95: 100.1, max95: 128.3, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "female" },
  "middle_combined_cadence": { paramId: "cadence", label: "Cadence", unit: "spm", mean: 111.4, sd: 7.8, min95: 96.1, max95: 126.7, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "combined" },

  "middle_male_stepTimeCV": { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.1, sd: 0.6, min95: 0.9, max95: 3.3, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "male" },
  "middle_female_stepTimeCV": { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.0, sd: 0.5, min95: 1.0, max95: 3.0, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "female" },
  "middle_combined_stepTimeCV": { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.1, sd: 0.6, min95: 0.9, max95: 3.3, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "combined" },

  "middle_male_stancePct": { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 61.4, sd: 1.8, min95: 57.9, max95: 64.9, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "male" },
  "middle_female_stancePct": { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 60.8, sd: 1.6, min95: 57.7, max95: 63.9, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "female" },
  "middle_combined_stancePct": { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 61.1, sd: 1.7, min95: 57.8, max95: 64.4, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "combined" },

  "middle_male_doubleSupportPct": { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 21.5, sd: 2.2, min95: 17.2, max95: 25.8, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "male" },
  "middle_female_doubleSupportPct": { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 20.9, sd: 2.0, min95: 17.0, max95: 24.8, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "female" },
  "middle_combined_doubleSupportPct": { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 21.2, sd: 2.1, min95: 17.1, max95: 25.3, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "combined" },

  "middle_male_kneeFlexionROM": { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 57.4, sd: 4.0, min95: 49.6, max95: 65.2, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "male" },
  "middle_female_kneeFlexionROM": { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 56.8, sd: 3.7, min95: 49.5, max95: 64.1, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "female" },
  "middle_combined_kneeFlexionROM": { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 57.1, sd: 3.9, min95: 49.5, max95: 64.7, citation: "Bovi et al. (2011)", ageGroup: "middle", sex: "combined" },

  // --- Elderly (65+) ---
  "elderly_male_cadence": { paramId: "cadence", label: "Cadence", unit: "spm", mean: 103.2, sd: 9.5, min95: 84.6, max95: 121.8, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "male" },
  "elderly_female_cadence": { paramId: "cadence", label: "Cadence", unit: "spm", mean: 109.5, sd: 8.8, min95: 92.3, max95: 126.7, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "female" },
  "elderly_combined_cadence": { paramId: "cadence", label: "Cadence", unit: "spm", mean: 106.4, sd: 9.5, min95: 87.8, max95: 125.0, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "combined" },

  "elderly_male_stepTimeCV": { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.8, sd: 0.9, min95: 1.0, max95: 4.6, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "male" },
  "elderly_female_stepTimeCV": { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.6, sd: 0.8, min95: 1.0, max95: 4.2, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "female" },
  "elderly_combined_stepTimeCV": { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.7, sd: 0.9, min95: 0.9, max95: 4.5, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "combined" },

  "elderly_male_stancePct": { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 62.8, sd: 2.5, min95: 57.9, max95: 67.7, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "male" },
  "elderly_female_stancePct": { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 62.1, sd: 2.2, min95: 57.8, max95: 66.4, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "female" },
  "elderly_combined_stancePct": { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 62.5, sd: 2.4, min95: 57.8, max95: 67.2, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "combined" },

  "elderly_male_doubleSupportPct": { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 23.8, sd: 3.0, min95: 17.9, max95: 29.7, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "male" },
  "elderly_female_doubleSupportPct": { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 23.1, sd: 2.8, min95: 17.6, max95: 28.6, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "female" },
  "elderly_combined_doubleSupportPct": { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 23.5, sd: 2.9, min95: 17.8, max95: 29.2, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "combined" },

  "elderly_male_kneeFlexionROM": { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 53.5, sd: 4.8, min95: 44.1, max95: 62.9, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "male" },
  "elderly_female_kneeFlexionROM": { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 54.1, sd: 4.5, min95: 45.3, max95: 62.9, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "female" },
  "elderly_combined_kneeFlexionROM": { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 53.8, sd: 4.7, min95: 44.6, max95: 63.0, citation: "Bovi et al. (2011)", ageGroup: "elderly", sex: "combined" },
};

/** Compute Z-score safely */
export function calculateZScore(value: number, mean: number, sd: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) {
    return 0;
  }
  return (value - mean) / sd;
}

/** Error function erf for Gaussian normal distribution CDF */
export function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

/** Convert Z-score to cumulative normal distribution percentile [0, 100] */
export function calculatePercentile(zScore: number): number {
  if (!Number.isFinite(zScore)) return 50;
  const cdf = 0.5 * (1.0 + erf(zScore / Math.SQRT2));
  return clamp(cdf * 100, 0.01, 99.99);
}

/** Lookup normative reference based on paramId, age, and sex */
export function getNormativeReference(
  paramId: NormativeParamId,
  age?: number,
  sex?: "male" | "female" | "combined",
): NormativeReferenceRange {
  const sexKey: SexCategory = sex === "male" || sex === "female" ? sex : "combined";
  let ageGroupKey: AgeGroupCategory = "combined";

  if (typeof age === "number" && Number.isFinite(age)) {
    if (age < 50) ageGroupKey = "young";
    else if (age < 65) ageGroupKey = "middle";
    else ageGroupKey = "elderly";
  }

  const lookupKey = `${ageGroupKey}_${sexKey}_${paramId}`;
  if (NORMATIVE_DATASETS[lookupKey]) {
    return NORMATIVE_DATASETS[lookupKey];
  }

  // Fallback to default adult dataset
  const defaultKey = `default_${paramId}`;
  if (NORMATIVE_DATASETS[defaultKey]) {
    return NORMATIVE_DATASETS[defaultKey];
  }

  // Absolute baseline fallback
  return {
    paramId,
    label: paramId,
    unit: "",
    mean: 0,
    sd: 1,
    min95: -1.96,
    max95: 1.96,
    citation: "Winter (2009)",
  };
}

/** Calculate camera-adapted Gait Deviation Index (Schwartz & Rozumalski 2008) */
export function calculateGDI(
  metrics: GaitMetrics,
  patientMeta?: { age?: number; sex?: "male" | "female" },
): GaitDeviationIndexResult {
  const age = patientMeta?.age;
  const sex = patientMeta?.sex;

  const paramsToEvaluate: { paramId: NormativeParamId; observed: number | null }[] = [
    { paramId: "cadence", observed: Number.isFinite(metrics.cadenceSpm) ? metrics.cadenceSpm : null },
    { paramId: "stepTimeCV", observed: Number.isFinite(metrics.stepTimeCV) ? metrics.stepTimeCV * 100 : null },
    {
      paramId: "stancePct",
      observed:
        metrics.leftStancePct != null && metrics.rightStancePct != null
          ? (metrics.leftStancePct + metrics.rightStancePct) / 2
          : null,
    },
    { paramId: "doubleSupportPct", observed: metrics.doubleSupportPct ?? null },
    {
      paramId: "kneeFlexionROM",
      observed:
        metrics.kneeFlexLeft != null && metrics.kneeFlexRight != null
          ? (metrics.kneeFlexLeft + metrics.kneeFlexRight) / 2
          : null,
    },
  ];

  const evaluated: {
    paramId: NormativeParamId;
    observed: number;
    mean: number;
    sd: number;
    zScore: number;
  }[] = [];

  for (const item of paramsToEvaluate) {
    if (item.observed != null && Number.isFinite(item.observed)) {
      const ref = getNormativeReference(item.paramId, age, sex);
      const z = calculateZScore(item.observed, ref.mean, ref.sd);
      evaluated.push({
        paramId: item.paramId,
        observed: item.observed,
        mean: ref.mean,
        sd: ref.sd,
        zScore: z,
      });
    }
  }

  if (evaluated.length === 0) {
    return {
      gdiScore: 100,
      zRms: 0,
      interpretation: "Insufficient parameters to compute GDI (default baseline 100).",
      evaluatedParametersCount: 0,
      evaluatedParameters: [],
    };
  }

  // Root Mean Square Z-score
  const sumSqZ = evaluated.reduce((acc, curr) => acc + curr.zScore * curr.zScore, 0);
  const zRms = Math.sqrt(sumSqZ / evaluated.length);

  // GDI: 100 = normative mean, -10 per 1 SD deviation of zRms
  const rawGdi = 100 - 10 * zRms;
  const gdiScore = clamp(rawGdi, 0, 130);

  let interpretation = "Normal / optimal gait mechanics (GDI >= 100).";
  if (gdiScore < 80) {
    interpretation = "Severe overall gait deviation relative to normative reference (GDI < 80).";
  } else if (gdiScore < 90) {
    interpretation = "Moderate overall gait deviation relative to normative reference (GDI 80–89).";
  } else if (gdiScore < 100) {
    interpretation = "Mild overall gait deviation relative to normative reference (GDI 90–99).";
  }

  return {
    gdiScore,
    zRms,
    interpretation,
    evaluatedParametersCount: evaluated.length,
    evaluatedParameters: evaluated,
  };
}

/** Evaluate metrics against normative datasets */
export function evaluateGaitNormatives(
  metrics: GaitMetrics,
  patientMeta?: { age?: number; sex?: "male" | "female" },
): NormativeEvaluationResult[] {
  const age = patientMeta?.age;
  const sex = patientMeta?.sex;

  const params: { paramId: NormativeParamId; observed: number | null }[] = [
    { paramId: "cadence", observed: Number.isFinite(metrics.cadenceSpm) ? metrics.cadenceSpm : null },
    { paramId: "stepTimeCV", observed: Number.isFinite(metrics.stepTimeCV) ? metrics.stepTimeCV * 100 : null },
    {
      paramId: "stancePct",
      observed:
        metrics.leftStancePct != null && metrics.rightStancePct != null
          ? (metrics.leftStancePct + metrics.rightStancePct) / 2
          : null,
    },
    { paramId: "doubleSupportPct", observed: metrics.doubleSupportPct ?? null },
    {
      paramId: "kneeFlexionROM",
      observed:
        metrics.kneeFlexLeft != null && metrics.kneeFlexRight != null
          ? (metrics.kneeFlexLeft + metrics.kneeFlexRight) / 2
          : null,
    },
  ];

  const results: NormativeEvaluationResult[] = [];

  for (const item of params) {
    if (item.observed != null && Number.isFinite(item.observed)) {
      const ref = getNormativeReference(item.paramId, age, sex);
      const zScore = calculateZScore(item.observed, ref.mean, ref.sd);
      const percentile = calculatePercentile(zScore);

      const absZ = Math.abs(zScore);
      let band: NormativeEvaluationResult["band"] = "normal";
      if (absZ > 3.0) band = "severe_deviation";
      else if (absZ > 2.0) band = "moderate_deviation";
      else if (absZ > 1.0) band = "mild_deviation";

      results.push({
        paramId: item.paramId,
        label: ref.label,
        observedValue: item.observed,
        normativeMean: ref.mean,
        normativeSd: ref.sd,
        zScore,
        percentile,
        band,
        unit: ref.unit,
        citation: ref.citation,
      });
    }
  }

  return results;
}
```

---

## 4. Integration Blueprint: `src/lib/gait/ratings.ts`

### Type Extensions

Add new optional fields to `MetricRating` and `StructuredReport`:

```typescript
export type MetricRating = {
  id: string;
  group: string;
  label: string;
  display: string;
  unit?: string;
  favorability: number;
  band: RatingBand;
  note: string;
  // --- Milestone 6 Extensions ---
  zScore?: number;
  percentile?: number;
  normativeMean?: number;
  normativeSd?: number;
};

export type StructuredReport = {
  headline: string;
  oneLiner: string;
  taskMode: TaskMode;
  viewAngle: ViewAngle;
  viewConfidence: number;
  domains: DomainRating[];
  metrics: MetricRating[];
  hypotheses: HypothesisRating[];
  dualTask?: { ... };
  // --- Milestone 6 Extensions ---
  gdi?: GaitDeviationIndexResult;
  normativeEvaluations?: NormativeEvaluationResult[];
  qualityNotes: string[];
  disclaimer: string;
};
```

### Function Updates in `buildStructuredReport`

Modify `buildStructuredReport` signature and body:

```typescript
import {
  calculateGDI,
  evaluateGaitNormatives,
  type GaitDeviationIndexResult,
  type NormativeEvaluationResult,
} from "./normatives";

export function buildStructuredReport(
  m: GaitMetrics,
  guesses: EducatedGuess[],
  opts: {
    taskMode: TaskMode;
    analyzedFrames: number;
    dualTaskCost?: DualTaskCost;
    patientMeta?: { age?: number; sex?: "male" | "female" };
  },
): StructuredReport {
  // 1. Calculate GDI and Normative Evaluations
  const gdi = calculateGDI(m, opts.patientMeta);
  const normEvals = evaluateGaitNormatives(m, opts.patientMeta);

  // Map normEvals for quick metric lookup
  const evalMap = new Map(normEvals.map((e) => [e.paramId, e]));

  // ... domain setup ...
  // Add GDI driver to Overall Mechanics domain:
  // { label: "GDI Score", value: `${gdi.gdiScore.toFixed(0)} (${gdi.zRms.toFixed(2)} SD)` }

  // 2. Enrich Metric Ratings with Z-score, percentile, and normative note:
  // For cadence, stepTimeCV, zeniStance, ds, kneeL, kneeR:
  // If evalMap has matching parameter, set zScore, percentile, normativeMean, normativeSd
  // and append " | Z: +0.45, 67th percentile" to metric.note.

  // 3. Attach gdi and normativeEvaluations to returned StructuredReport:
  return {
    headline: ...,
    oneLiner: ...,
    taskMode: opts.taskMode,
    viewAngle: m.viewAngle,
    viewConfidence: m.viewConfidence,
    domains,
    metrics,
    hypotheses,
    dualTask,
    gdi,
    normativeEvaluations: normEvals,
    qualityNotes: dq.notes,
    disclaimer: ...,
  };
}
```

---

## 5. Integration Blueprint: `src/lib/gait/guesses.ts`

### Hypothesis Rule Triggers

In `buildEducatedGuesses` in `src/lib/gait/guesses.ts`:

Add support for optional `patientMeta?: { age?: number; sex?: "male" | "female" }` in `opts`:

```typescript
import {
  calculateGDI,
  evaluateGaitNormatives,
} from "./normatives";

export function buildEducatedGuesses(
  m: GaitMetrics,
  opts?: {
    taskMode?: TaskMode;
    dualTaskCost?: DualTaskCost;
    patientMeta?: { age?: number; sex?: "male" | "female" };
  },
): EducatedGuess[] {
  const guesses: EducatedGuess[] = [];
  // ... existing rules ...

  // --- Milestone 6 Rule 1: Gait Deviation Index (GDI) Rule ---
  const gdi = calculateGDI(m, opts?.patientMeta);
  if (gdi.gdiScore < 90 && gdi.evaluatedParametersCount >= 2) {
    const isSevere = gdi.gdiScore < 80;
    guesses.push({
      id: "gdi-deviation",
      title: isSevere
        ? "Severe Gait Deviation Index (GDI < 80)"
        : "Moderate Gait Deviation Index (GDI 80–89)",
      summary: gdi.interpretation,
      evidence: [
        `GDI Score: ${gdi.gdiScore.toFixed(1)} / 130 (Normative Mean = 100)`,
        `Overall Root-Mean-Square Z-Score: ${gdi.zRms.toFixed(2)} SD`,
        `Evaluated Parameters: ${gdi.evaluatedParametersCount}`,
        ...gdi.evaluatedParameters.map(
          (p) => `${p.paramId}: Z = ${p.zScore > 0 ? "+" : ""}${p.zScore.toFixed(2)} SD`
        ),
      ],
      confidence: isSevere ? 0.85 : 0.72,
      severity: isSevere ? "elevated" : "moderate",
      category: "pattern",
      patternTag: `GDI ${isSevere ? "severe" : "moderate"} deviation`,
      alternatives: [
        "Multifactorial mobility impairment",
        "Multiple joint antalgic gait",
        "Severe step timing irregularity",
        "Camera positioning / tracking foreshortening",
      ],
    });
  }

  // --- Milestone 6 Rule 2: Normative Percentile Outlier Rule ---
  const normEvals = evaluateGaitNormatives(m, opts?.patientMeta);
  const severeOutliers = normEvals.filter((e) => e.percentile > 95 || e.percentile < 5);
  if (severeOutliers.length > 0) {
    guesses.push({
      id: "normative-percentile-deviation",
      title: "Normative Percentile Outliers (>95th or <5th)",
      summary:
        "One or more gait parameters deviate significantly beyond population normative 95% confidence boundaries (Winter 2009 / Bovi et al. 2011).",
      evidence: severeOutliers.map(
        (e) =>
          `${e.label}: ${e.observedValue.toFixed(1)} ${e.unit} (${e.percentile.toFixed(1)}th percentile, Z = ${e.zScore > 0 ? "+" : ""}${e.zScore.toFixed(2)})`
      ),
      confidence: 0.78,
      severity: severeOutliers.length >= 2 ? "elevated" : "moderate",
      category: "variability",
      patternTag: "normative outlier",
      alternatives: [
        "Age-related adaptation",
        "Atypical walking cadence / pace",
        "Pose estimation artifact",
      ],
    });
  }

  // ... rest of rules ...
  return guesses;
}
```

---

## 6. Comprehensive Unit Test Blueprint: `src/lib/gait/__tests__/normatives.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  calculateZScore,
  calculatePercentile,
  getNormativeReference,
  calculateGDI,
  evaluateGaitNormatives,
  erf,
  NORMATIVE_DATASETS,
} from "../normatives";
import { buildStructuredReport } from "../ratings";
import { buildEducatedGuesses } from "../guesses";
import { createMockMetrics } from "./testHelpers";

describe("Clinical Normative Reference & GDI Engine (normatives.ts)", () => {
  describe("calculateZScore", () => {
    it("computes exact Z-scores for standard values", () => {
      expect(calculateZScore(113.0, 105.0, 8.0)).toBeCloseTo(1.0, 4);
      expect(calculateZScore(97.0, 105.0, 8.0)).toBeCloseTo(-1.0, 4);
      expect(calculateZScore(105.0, 105.0, 8.0)).toBe(0);
    });

    it("handles zero SD and non-finite numbers safely", () => {
      expect(calculateZScore(100, 100, 0)).toBe(0);
      expect(calculateZScore(NaN, 100, 5)).toBe(0);
      expect(calculateZScore(100, Infinity, 5)).toBe(0);
    });
  });

  describe("erf & calculatePercentile", () => {
    it("computes accurate error function and normal percentiles", () => {
      expect(calculatePercentile(0)).toBeCloseTo(50.0, 1);
      expect(calculatePercentile(1.0)).toBeCloseTo(84.1, 1);
      expect(calculatePercentile(-1.0)).toBeCloseTo(15.9, 1);
      expect(calculatePercentile(1.96)).toBeCloseTo(97.5, 1);
      expect(calculatePercentile(-1.96)).toBeCloseTo(2.5, 1);
    });

    it("clamps extreme Z-score percentiles", () => {
      expect(calculatePercentile(10.0)).toBe(99.99);
      expect(calculatePercentile(-10.0)).toBe(0.01);
      expect(calculatePercentile(NaN)).toBe(50);
    });
  });

  describe("getNormativeReference", () => {
    it("retrieves default Winter (2009) dataset when age/sex are omitted", () => {
      const ref = getNormativeReference("cadence");
      expect(ref.citation).toBe("Winter (2009)");
      expect(ref.mean).toBe(105.0);
      expect(ref.sd).toBe(8.0);
    });

    it("retrieves Bovi et al. (2011) stratified datasets by age and sex", () => {
      const youngMale = getNormativeReference("cadence", 25, "male");
      expect(youngMale.citation).toBe("Bovi et al. (2011)");
      expect(youngMale.mean).toBe(112.4);

      const elderlyFemale = getNormativeReference("cadence", 70, "female");
      expect(elderlyFemale.citation).toBe("Bovi et al. (2011)");
      expect(elderlyFemale.mean).toBe(109.5);
    });
  });

  describe("calculateGDI", () => {
    it("returns GDI = 100 for perfectly normative gait metrics", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 105.0,
        stepTimeCV: 0.020, // 2.0%
        leftStancePct: 60.5,
        rightStancePct: 60.5,
        doubleSupportPct: 20.8,
        kneeFlexLeft: 58.0,
        kneeFlexRight: 58.0,
      });

      const gdi = calculateGDI(metrics);
      expect(gdi.gdiScore).toBeCloseTo(100.0, 1);
      expect(gdi.zRms).toBeCloseTo(0.0, 2);
      expect(gdi.evaluatedParametersCount).toBe(5);
    });

    it("calculates exact GDI reduction for 1 SD and 2 SD overall deviations", () => {
      // 1 SD deviation across metrics -> GDI = 90
      const metrics1SD = createMockMetrics({
        cadenceSpm: 113.0, // +1 SD
        stepTimeCV: 0.026, // +1 SD (2.6%)
        leftStancePct: 62.5, // +1 SD
        rightStancePct: 62.5,
        doubleSupportPct: 23.3, // +1 SD
        kneeFlexLeft: 53.5, // -1 SD
        kneeFlexRight: 53.5,
      });

      const gdi1SD = calculateGDI(metrics1SD);
      expect(gdi1SD.gdiScore).toBeCloseTo(90.0, 1);
      expect(gdi1SD.zRms).toBeCloseTo(1.0, 2);

      // 2 SD deviation across metrics -> GDI = 80
      const metrics2SD = createMockMetrics({
        cadenceSpm: 121.0, // +2 SD
        stepTimeCV: 0.032, // +2 SD (3.2%)
        leftStancePct: 64.5, // +2 SD
        rightStancePct: 64.5,
        doubleSupportPct: 25.8, // +2 SD
        kneeFlexLeft: 49.0, // -2 SD
        kneeFlexRight: 49.0,
      });

      const gdi2SD = calculateGDI(metrics2SD);
      expect(gdi2SD.gdiScore).toBeCloseTo(80.0, 1);
      expect(gdi2SD.zRms).toBeCloseTo(2.0, 2);
    });

    it("handles partial metrics gracefully when frontal or sagittal data is missing", () => {
      const metricsPartial = createMockMetrics({
        cadenceSpm: 105.0,
        stepTimeCV: 0.020,
        leftStancePct: null,
        rightStancePct: null,
        doubleSupportPct: null,
        kneeFlexLeft: null,
        kneeFlexRight: null,
      });

      const gdi = calculateGDI(metricsPartial);
      expect(gdi.evaluatedParametersCount).toBe(2); // Cadence & StepTimeCV
      expect(gdi.gdiScore).toBeCloseTo(100.0, 1);
    });
  });

  describe("Integration in ratings.ts & guesses.ts", () => {
    it("attaches GDI and normativeEvaluations to StructuredReport", () => {
      const metrics = createMockMetrics();
      const report = buildStructuredReport(metrics, [], {
        taskMode: "single",
        analyzedFrames: 100,
      });

      expect(report.gdi).toBeDefined();
      expect(report.gdi?.gdiScore).toBeGreaterThanOrEqual(0);
      expect(report.normativeEvaluations).toBeDefined();
      expect(report.normativeEvaluations?.length).toBeGreaterThan(0);
    });

    it("triggers gdi-deviation educated guess when GDI < 90", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 125.0, // Severe deviation
        stepTimeCV: 0.050, // 5% CV
        leftStancePct: 70.0,
        rightStancePct: 70.0,
        doubleSupportPct: 30.0,
      });

      const guesses = buildEducatedGuesses(metrics);
      const gdiGuess = guesses.find((g) => g.id === "gdi-deviation");

      expect(gdiGuess).toBeDefined();
      expect(gdiGuess?.severity).toBe("elevated");
      expect(gdiGuess?.title).toContain("Severe Gait Deviation Index");
    });
  });
});
```

---

## 7. Verification Strategy & Commands

The implementation can be verified using the following execution steps:

1. **Vitest Unit Execution:**
   ```bash
   npx vitest run src/lib/gait/__tests__/normatives.test.ts src/lib/gait/__tests__/ratings.test.ts src/lib/gait/__tests__/guesses.test.ts
   ```
2. **Typecheck:**
   ```bash
   npx tsc --noEmit
   ```
3. **Full Regression Test Suite:**
   ```bash
   npx vitest run
   ```

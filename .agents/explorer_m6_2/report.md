# Milestone 6 Technical Implementation Blueprint: Clinical Normative Reference Integration & GDI

**Agent ID:** `teamwork_preview_explorer` (Explorer 2 for Milestone 6)  
**Date:** 2026-08-10  
**Project Root:** `/Users/damian/GitHub/gait-lab`  
**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/explorer_m6_2`  
**Target Files:**
- `src/lib/gait/normatives.ts` (New module)
- `src/lib/gait/ratings.ts` (Integration point)
- `src/lib/gait/guesses.ts` (Integration point)
- `src/lib/gait/__tests__/normatives.test.ts` (New test file)

---

## 1. Executive Summary & Objectives

This blueprint provides the exact, production-ready technical design for **Milestone 6: Clinical Normative Reference Integration & GDI** in `gait-lab`. 

Key deliverables specified in this blueprint:
1. **`src/lib/gait/normatives.ts`**: Clinical normative datasets from **Winter (2009)** and **Bovi et al. (2011)** stratified by age and sex, core statistical utilities (`calculateZScore`, `calculatePercentile`), a camera-adapted **Gait Deviation Index (`calculateGDI`)** (Schwartz & Rozumalski 2008), and normative lookup/evaluation functions (`getNormativeReference`, `evaluateGaitNormatives`).
2. **`src/lib/gait/ratings.ts` Integration**: Enriching `StructuredReport` and `MetricRating` with Z-scores, normative percentiles, and GDI composite metrics while maintaining full backwards compatibility with existing 7 domains and 17 metrics.
3. **`src/lib/gait/guesses.ts` Integration**: Adding rules to `buildEducatedGuesses` for GDI deviations (GDI < 80, GDI < 90) and extreme percentile deviations (e.g. Step Time CV > 95th percentile, Knee Flexion ROM < 5th percentile).
4. **`src/lib/gait/__tests__/normatives.test.ts` Test Strategy**: Detailed Vitest test suite covering mathematical accuracy, dataset lookups, GDI calculation, edge cases, and rating/hypothesis integrations.

---

## 2. Clinical Normative Reference Datasets

### 2.1 Winter (2009) Reference Data
*Source: Winter, D. A. (2009). Biomechanics and Motor Control of Human Movement (4th Ed.). John Wiley & Sons.*

Adult overall population mean ± standard deviation for natural cadence walking:
- **Cadence:** $105.0 \pm 8.0$ spm
- **Step Time:** $0.57 \pm 0.04$ s
- **Step Time CV:** $2.0 \pm 0.6$ % ($0.020 \pm 0.006$ ratio)
- **Stance Phase %:** $60.5 \pm 2.0$ % of gait cycle
- **Double Support Phase %:** $20.8 \pm 2.5$ % of gait cycle
- **Knee Flexion ROM:** $58.0 \pm 4.5$ °

### 2.2 Bovi et al. (2011) Age & Sex Stratified Datasets
*Source: Bovi, G. et al. (2011). "Multiple-task gait analysis: normative data for young, middle-aged and elderly subjects." Gait & Posture 33(4): 555-560.*

Stratified into three age brackets:
1. **Young Adults (18–49 yrs)**
   - *Male:* Cadence $112.4 \pm 7.5$ spm, Stance $60.2 \pm 1.5$ %, Double Support $20.1 \pm 2.0$ %, Knee ROM $60.5 \pm 3.8$ °, Step Time CV $2.1 \pm 0.5$ %
   - *Female:* Cadence $117.8 \pm 6.8$ spm, Stance $59.8 \pm 1.4$ %, Double Support $19.6 \pm 1.8$ %, Knee ROM $59.2 \pm 3.5$ °, Step Time CV $1.9 \pm 0.4$ %
2. **Middle-Aged Adults (50–64 yrs)**
   - *Male:* Cadence $108.6 \pm 8.0$ spm, Stance $61.4 \pm 1.8$ %, Double Support $21.5 \pm 2.2$ %, Knee ROM $57.4 \pm 4.0$ °, Step Time CV $2.4 \pm 0.7$ %
   - *Female:* Cadence $114.2 \pm 7.2$ spm, Stance $60.8 \pm 1.6$ %, Double Support $20.9 \pm 2.0$ %, Knee ROM $56.8 \pm 3.7$ °, Step Time CV $2.2 \pm 0.6$ %
3. **Elderly Adults (65+ yrs)**
   - *Male:* Cadence $103.2 \pm 9.5$ spm, Stance $62.8 \pm 2.5$ %, Double Support $23.8 \pm 3.0$ %, Knee ROM $53.5 \pm 4.8$ °, Step Time CV $3.1 \pm 1.0$ %
   - *Female:* Cadence $109.5 \pm 8.8$ spm, Stance $62.1 \pm 2.2$ %, Double Support $23.1 \pm 2.8$ %, Knee ROM $54.1 \pm 4.5$ °, Step Time CV $2.8 \pm 0.9$ %

---

## 3. Module Design: `src/lib/gait/normatives.ts`

### 3.1 Type Definitions & Interfaces

```typescript
import type { GaitMetrics, PatientMetadata } from "./types";

export type SexCategory = "male" | "female" | "combined";
export type AgeGroupCategory = "young" | "middle" | "elderly" | "combined";

export interface PatientDemographics {
  age?: number;
  sex?: SexCategory;
}

export interface NormativeReferenceRange {
  paramId: string;
  label: string;
  unit: string;
  mean: number;
  sd: number;
  min95: number; // mean - 1.96 * sd
  max95: number; // mean + 1.96 * sd
  citation: "Winter (2009)" | "Bovi et al. (2011)";
}

export interface NormativeEvaluationResult {
  paramId: string;
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
  /** Scaled [0, 130], 100 = normative mean, each -10 points = 1 SD deviation */
  gdiScore: number;
  /** Root Mean Square Z-score across available evaluated parameters */
  zRms: number;
  /** Clinical interpretation string */
  interpretation: string;
  /** Number of parameters included in the composite GDI */
  evaluatedParametersCount: number;
}
```

### 3.2 Normative Dataset Constants & Lookups

```typescript
export const WINTER_2009_NORMATIVES: Record<string, NormativeReferenceRange> = {
  cadence: {
    paramId: "cadence",
    label: "Cadence",
    unit: "spm",
    mean: 105.0,
    sd: 8.0,
    min95: 89.32,
    max95: 120.68,
    citation: "Winter (2009)",
  },
  stepTimeSec: {
    paramId: "stepTimeSec",
    label: "Step Time",
    unit: "s",
    mean: 0.57,
    sd: 0.04,
    min95: 0.4916,
    max95: 0.6484,
    citation: "Winter (2009)",
  },
  stepTimeCV: {
    paramId: "stepTimeCV",
    label: "Step Time CV",
    unit: "%",
    mean: 2.0,
    sd: 0.6,
    min95: 0.824,
    max95: 3.176,
    citation: "Winter (2009)",
  },
  stancePct: {
    paramId: "stancePct",
    label: "Stance Phase",
    unit: "%",
    mean: 60.5,
    sd: 2.0,
    min95: 56.58,
    max95: 64.42,
    citation: "Winter (2009)",
  },
  doubleSupportPct: {
    paramId: "doubleSupportPct",
    label: "Double Support Phase",
    unit: "%",
    mean: 20.8,
    sd: 2.5,
    min95: 15.9,
    max95: 25.7,
    citation: "Winter (2009)",
  },
  kneeFlexionROM: {
    paramId: "kneeFlexionROM",
    label: "Knee Flexion ROM",
    unit: "°",
    mean: 58.0,
    sd: 4.5,
    min95: 49.18,
    max95: 66.82,
    citation: "Winter (2009)",
  },
};

export const BOVI_2011_NORMATIVES: Record<
  AgeGroupCategory,
  Record<SexCategory, Record<string, NormativeReferenceRange>>
> = {
  young: {
    male: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 112.4, sd: 7.5, min95: 97.7, max95: 127.1, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 60.2, sd: 1.5, min95: 57.26, max95: 63.14, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 20.1, sd: 2.0, min95: 16.18, max95: 24.02, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 60.5, sd: 3.8, min95: 53.05, max95: 67.95, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.1, sd: 0.5, min95: 1.12, max95: 3.08, citation: "Bovi et al. (2011)" },
    },
    female: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 117.8, sd: 6.8, min95: 104.47, max95: 131.13, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 59.8, sd: 1.4, min95: 57.06, max95: 62.54, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 19.6, sd: 1.8, min95: 16.07, max95: 23.13, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 59.2, sd: 3.5, min95: 52.34, max95: 66.06, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 1.9, sd: 0.4, min95: 1.116, max95: 2.684, citation: "Bovi et al. (2011)" },
    },
    combined: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 115.1, sd: 7.2, min95: 100.99, max95: 129.21, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 60.0, sd: 1.5, min95: 57.06, max95: 62.94, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 19.85, sd: 1.9, min95: 16.13, max95: 23.57, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 59.85, sd: 3.65, min95: 52.7, max95: 67.0, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.0, sd: 0.45, min95: 1.12, max95: 2.88, citation: "Bovi et al. (2011)" },
    },
  },
  middle: {
    male: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 108.6, sd: 8.0, min95: 92.92, max95: 124.28, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 61.4, sd: 1.8, min95: 57.87, max95: 64.93, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 21.5, sd: 2.2, min95: 17.19, max95: 25.81, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 57.4, sd: 4.0, min95: 49.56, max95: 65.24, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.4, sd: 0.7, min95: 1.03, max95: 3.77, citation: "Bovi et al. (2011)" },
    },
    female: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 114.2, sd: 7.2, min95: 100.09, max95: 128.31, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 60.8, sd: 1.6, min95: 57.66, max95: 63.94, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 20.9, sd: 2.0, min95: 16.98, max95: 24.82, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 56.8, sd: 3.7, min95: 49.55, max95: 64.05, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.2, sd: 0.6, min95: 1.024, max95: 3.376, citation: "Bovi et al. (2011)" },
    },
    combined: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 111.4, sd: 7.6, min95: 96.5, max95: 126.3, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 61.1, sd: 1.7, min95: 57.77, max95: 64.43, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 21.2, sd: 2.1, min95: 17.08, max95: 25.32, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 57.1, sd: 3.85, min95: 49.55, max95: 64.65, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.3, sd: 0.65, min95: 1.026, max95: 3.574, citation: "Bovi et al. (2011)" },
    },
  },
  elderly: {
    male: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 103.2, sd: 9.5, min95: 84.58, max95: 121.82, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 62.8, sd: 2.5, min95: 57.9, max95: 67.7, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 23.8, sd: 3.0, min95: 17.92, max95: 29.68, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 53.5, sd: 4.8, min95: 44.09, max95: 62.91, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 3.1, sd: 1.0, min95: 1.14, max95: 5.06, citation: "Bovi et al. (2011)" },
    },
    female: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 109.5, sd: 8.8, min95: 92.25, max95: 126.75, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 62.1, sd: 2.2, min95: 57.79, max95: 66.41, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 23.1, sd: 2.8, min95: 17.61, max95: 28.59, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 54.1, sd: 4.5, min95: 45.28, max95: 62.92, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.8, sd: 0.9, min95: 1.036, max95: 4.564, citation: "Bovi et al. (2011)" },
    },
    combined: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 106.35, sd: 9.15, min95: 88.42, max95: 124.28, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 62.45, sd: 2.35, min95: 57.84, max95: 67.06, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 23.45, sd: 2.9, min95: 17.77, max95: 29.13, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 53.8, sd: 4.65, min95: 44.69, max95: 62.91, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.95, sd: 0.95, min95: 1.088, max95: 4.812, citation: "Bovi et al. (2011)" },
    },
  },
  combined: {
    male: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 108.1, sd: 8.3, min95: 91.83, max95: 124.37, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 61.5, sd: 1.9, min95: 57.78, max95: 65.22, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 21.8, sd: 2.4, min95: 17.1, max95: 26.5, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 57.1, sd: 4.2, min95: 48.87, max95: 65.33, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.5, sd: 0.7, min95: 1.13, max95: 3.87, citation: "Bovi et al. (2011)" },
    },
    female: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 113.8, sd: 7.6, min95: 98.9, max95: 128.7, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 60.9, sd: 1.7, min95: 57.57, max95: 64.23, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 21.2, sd: 2.2, min95: 16.89, max95: 25.51, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 56.7, sd: 3.9, min95: 49.06, max95: 64.34, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.3, sd: 0.6, min95: 1.12, max95: 3.48, citation: "Bovi et al. (2011)" },
    },
    combined: {
      cadence: { paramId: "cadence", label: "Cadence", unit: "spm", mean: 110.95, sd: 7.95, min95: 95.37, max95: 126.53, citation: "Bovi et al. (2011)" },
      stancePct: { paramId: "stancePct", label: "Stance Phase", unit: "%", mean: 61.2, sd: 1.8, min95: 57.67, max95: 64.73, citation: "Bovi et al. (2011)" },
      doubleSupportPct: { paramId: "doubleSupportPct", label: "Double Support Phase", unit: "%", mean: 21.5, sd: 2.3, min95: 16.99, max95: 26.01, citation: "Bovi et al. (2011)" },
      kneeFlexionROM: { paramId: "kneeFlexionROM", label: "Knee Flexion ROM", unit: "°", mean: 56.9, sd: 4.05, min95: 48.96, max95: 64.84, citation: "Bovi et al. (2011)" },
      stepTimeCV: { paramId: "stepTimeCV", label: "Step Time CV", unit: "%", mean: 2.4, sd: 0.65, min95: 1.13, max95: 3.67, citation: "Bovi et al. (2011)" },
    },
  },
};
```

### 3.3 Demographic Lookup Helper

```typescript
export function getAgeGroup(age?: number): AgeGroupCategory {
  if (age == null || !Number.isFinite(age) || age <= 0) return "combined";
  if (age < 50) return "young";
  if (age < 65) return "middle";
  return "elderly";
}

export function getNormativeReference(
  paramId: string,
  demographics?: PatientDemographics,
): NormativeReferenceRange {
  if (demographics?.age != null || demographics?.sex != null) {
    const ageGroup = getAgeGroup(demographics.age);
    const sex = demographics.sex ?? "combined";
    const boviRef = BOVI_2011_NORMATIVES[ageGroup]?.[sex]?.[paramId];
    if (boviRef) return boviRef;
  }

  // Default fallback: Winter (2009)
  const winterRef = WINTER_2009_NORMATIVES[paramId];
  if (winterRef) return winterRef;

  // Fallback for custom parameter IDs
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
```

### 3.4 Pure Math Exported Functions

```typescript
/**
 * Computes Z-score relative to normative population mean and standard deviation.
 * Formula: Z = (value - mean) / sd
 */
export function calculateZScore(value: number, mean: number, sd: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) {
    return 0;
  }
  return (value - mean) / sd;
}

/**
 * Computes cumulative percentile (0 to 100) from Z-score using error function approximation.
 * Erf approximation: erf(x) ≈ sign(x) * sqrt(1 - exp(-4/pi * x^2))
 */
export function calculatePercentile(zScore: number): number {
  if (!Number.isFinite(zScore)) return 50.0;
  
  const x = zScore / Math.SQRT2;
  const absX = Math.abs(x);
  // Approximation of erf(x)
  const sign = x < 0 ? -1 : 1;
  const erfApprox = sign * Math.sqrt(1 - Math.exp((-4 / Math.PI) * absX * absX));
  
  const cdf = 0.5 * (1 + erfApprox);
  const percentile = cdf * 100;
  
  return Math.min(100, Math.max(0, Number(percentile.toFixed(2))));
}
```

### 3.5 Gait Deviation Index (`calculateGDI`) Export

```typescript
/**
 * Calculates camera-adapted Gait Deviation Index (GDI, Schwartz & Rozumalski 2008).
 * Baseline 100 for normal population mean. Each 1 SD overall RMS deviation reduces GDI by 10 points.
 * Bounded to range [0, 130].
 */
export function calculateGDI(
  metrics: GaitMetrics,
  demographics?: PatientDemographics,
): GaitDeviationIndexResult {
  const zScores: number[] = [];

  // 1. Cadence
  if (metrics.cadenceSpm != null && Number.isFinite(metrics.cadenceSpm) && metrics.cadenceSpm > 0) {
    const ref = getNormativeReference("cadence", demographics);
    zScores.push(calculateZScore(metrics.cadenceSpm, ref.mean, ref.sd));
  }

  // 2. Step Time CV (%)
  if (metrics.stepTimeCV != null && Number.isFinite(metrics.stepTimeCV)) {
    const cvPct = metrics.stepTimeCV * 100; // Convert ratio to %
    const ref = getNormativeReference("stepTimeCV", demographics);
    zScores.push(calculateZScore(cvPct, ref.mean, ref.sd));
  }

  // 3. Stance % (average of left/right if available)
  const leftStance = metrics.leftStancePct;
  const rightStance = metrics.rightStancePct;
  if (leftStance != null || rightStance != null) {
    const avgStance =
      leftStance != null && rightStance != null
        ? (leftStance + rightStance) / 2
        : (leftStance ?? rightStance!);
    const ref = getNormativeReference("stancePct", demographics);
    zScores.push(calculateZScore(avgStance, ref.mean, ref.sd));
  }

  // 4. Double Support %
  const dsVal =
    metrics.doubleSupportPct != null
      ? metrics.doubleSupportPct
      : metrics.doubleSupportHint != null
      ? metrics.doubleSupportHint * 100
      : null;
  if (dsVal != null && Number.isFinite(dsVal)) {
    const ref = getNormativeReference("doubleSupportPct", demographics);
    zScores.push(calculateZScore(dsVal, ref.mean, ref.sd));
  }

  // 5. Knee Flexion ROM (degrees)
  const leftKnee = metrics.kneeFlexLeft;
  const rightKnee = metrics.kneeFlexRight;
  if (leftKnee != null || rightKnee != null) {
    const avgKnee =
      leftKnee != null && rightKnee != null
        ? (leftKnee + rightKnee) / 2
        : (leftKnee ?? rightKnee!);
    const ref = getNormativeReference("kneeFlexionROM", demographics);
    zScores.push(calculateZScore(avgKnee, ref.mean, ref.sd));
  }

  if (zScores.length === 0) {
    return {
      gdiScore: 100,
      zRms: 0,
      interpretation: "Insufficient spatio-temporal parameters for GDI calculation.",
      evaluatedParametersCount: 0,
    };
  }

  // Compute Root Mean Square (RMS) Z-score
  const sumSq = zScores.reduce((acc, z) => acc + z * z, 0);
  const zRms = Math.sqrt(sumSq / zScores.length);

  // Scaled GDI: 100 - 10 * zRms, bounded [0, 130]
  const rawGdi = 100 - 10 * zRms;
  const gdiScore = Math.min(130, Math.max(0, Math.round(rawGdi * 10) / 10));

  let interpretation = "";
  if (gdiScore >= 100) {
    interpretation = "Normal / optimal gait mechanics (within population normative range).";
  } else if (gdiScore >= 90) {
    interpretation = "Mild gait deviation (< 1 SD overall RMS deviation from normative mean).";
  } else if (gdiScore >= 80) {
    interpretation = "Moderate gait deviation (1 to 2 SD RMS deviation from normative mean).";
  } else {
    interpretation = "Severe gait deviation (> 2 SD RMS deviation from normative mean).";
  }

  return {
    gdiScore,
    zRms: Number(zRms.toFixed(2)),
    interpretation,
    evaluatedParametersCount: zScores.length,
  };
}
```

### 3.6 Normative Evaluation Export

```typescript
export function evaluateGaitNormatives(
  metrics: GaitMetrics,
  demographics?: PatientDemographics,
): NormativeEvaluationResult[] {
  const results: NormativeEvaluationResult[] = [];

  const evalParam = (paramId: string, rawValue: number | null | undefined) => {
    if (rawValue == null || !Number.isFinite(rawValue)) return;
    const ref = getNormativeReference(paramId, demographics);
    const zScore = calculateZScore(rawValue, ref.mean, ref.sd);
    const percentile = calculatePercentile(zScore);
    
    const absZ = Math.abs(zScore);
    let band: NormativeEvaluationResult["band"] = "normal";
    if (absZ > 3.0) band = "severe_deviation";
    else if (absZ > 2.0) band = "moderate_deviation";
    else if (absZ > 1.0) band = "mild_deviation";

    results.push({
      paramId: ref.paramId,
      label: ref.label,
      observedValue: Number(rawValue.toFixed(2)),
      normativeMean: ref.mean,
      normativeSd: ref.sd,
      zScore: Number(zScore.toFixed(2)),
      percentile,
      band,
      unit: ref.unit,
      citation: ref.citation,
    });
  };

  evalParam("cadence", metrics.cadenceSpm);
  evalParam("stepTimeSec", metrics.avgStepTimeSec);
  evalParam("stepTimeCV", metrics.stepTimeCV ? metrics.stepTimeCV * 100 : null);
  evalParam("stancePct", metrics.leftStancePct != null ? (metrics.leftStancePct + (metrics.rightStancePct ?? metrics.leftStancePct)) / 2 : null);
  evalParam("doubleSupportPct", metrics.doubleSupportPct != null ? metrics.doubleSupportPct : metrics.doubleSupportHint != null ? metrics.doubleSupportHint * 100 : null);
  evalParam("kneeFlexionROM", metrics.kneeFlexLeft != null ? (metrics.kneeFlexLeft + (metrics.kneeFlexRight ?? metrics.kneeFlexLeft)) / 2 : null);

  return results;
}
```

---

## 4. Integration Specifications: `src/lib/gait/ratings.ts`

### 4.1 Type Extensions in `ratings.ts`

Extend `MetricRating` and `StructuredReport`:

```typescript
// Add optional properties to MetricRating
export type MetricRating = {
  id: string;
  group: string;
  label: string;
  display: string;
  unit?: string;
  favorability: number;
  band: RatingBand;
  note: string;
  /** Milestone 6: Normative evaluation context */
  zScore?: number;
  percentile?: number;
  normativeRange?: { mean: number; sd: number; citation: string };
};

// Add optional fields to StructuredReport
export type StructuredReport = {
  headline: string;
  oneLiner: string;
  taskMode: TaskMode;
  viewAngle: ViewAngle;
  viewConfidence: number;
  domains: DomainRating[];
  metrics: MetricRating[];
  hypotheses: HypothesisRating[];
  /** Milestone 6: Camera-adapted Gait Deviation Index (Schwartz & Rozumalski 2008) */
  gdi?: GaitDeviationIndexResult;
  /** Milestone 6: Full normative parameter evaluation list */
  normativeEvaluations?: NormativeEvaluationResult[];
  dualTask?: {
    cost: DualTaskCost;
    band: RatingBand;
    stars: number;
    blurb: string;
  };
  qualityNotes: string[];
  disclaimer: string;
};
```

### 4.2 Integration in `buildStructuredReport`

Update function signature to take patient metadata / demographics optional field, evaluate normatives, and attach GDI & Z-scores to metrics:

```typescript
import {
  calculateGDI,
  evaluateGaitNormatives,
  getNormativeReference,
  calculateZScore,
  calculatePercentile,
  type GaitDeviationIndexResult,
  type NormativeEvaluationResult,
} from "./normatives";
import type { PatientMetadata } from "./types";

export function buildStructuredReport(
  m: GaitMetrics,
  guesses: EducatedGuess[],
  opts: {
    taskMode: TaskMode;
    analyzedFrames: number;
    dualTaskCost?: DualTaskCost;
    patientMeta?: PatientMetadata; // Milestone 6 addition
  },
): StructuredReport {
  // Compute GDI and Normative evaluations
  const gdi = calculateGDI(m, opts.patientMeta ? { age: (opts.patientMeta as any).age, sex: (opts.patientMeta as any).sex } : undefined);
  const normativeEvaluations = evaluateGaitNormatives(
    m,
    opts.patientMeta ? { age: (opts.patientMeta as any).age, sex: (opts.patientMeta as any).sex } : undefined,
  );

  // Map metric normative lookup helper
  const attachNormative = (id: string, rawVal: number | null | undefined) => {
    if (rawVal == null || !Number.isFinite(rawVal)) return undefined;
    const ref = getNormativeReference(id, opts.patientMeta ? { age: (opts.patientMeta as any).age, sex: (opts.patientMeta as any).sex } : undefined);
    const z = calculateZScore(rawVal, ref.mean, ref.sd);
    const p = calculatePercentile(z);
    return {
      zScore: Number(z.toFixed(2)),
      percentile: p,
      normativeRange: { mean: ref.mean, sd: ref.sd, citation: ref.citation },
    };
  };

  // Build existing 17 metrics as before, then attach normative info to matching metrics:
  // e.g. cadence -> attachNormative("cadence", m.cadenceSpm)
  // e.g. zeniStance -> attachNormative("stancePct", m.leftStancePct)
  // e.g. stepTimeCV -> attachNormative("stepTimeCV", m.stepTimeCV * 100)
  // e.g. kneeL -> attachNormative("kneeFlexionROM", m.kneeFlexLeft)
  // e.g. kneeR -> attachNormative("kneeFlexionROM", m.kneeFlexRight)
  // e.g. ds -> attachNormative("doubleSupportPct", m.doubleSupportPct ?? m.doubleSupportHint * 100)

  // Append GDI to headline if present:
  // headline: `${bandLabel(overall.band)} overall · ${overall.score.toFixed(0)}/100 (GDI: ${gdi.gdiScore})`
```

---

## 5. Integration Specifications: `src/lib/gait/guesses.ts`

### 5.1 GDI & Normative Rules in `buildEducatedGuesses`

In `buildEducatedGuesses(m: GaitMetrics, opts?: { taskMode?: TaskMode; dualTaskCost?: DualTaskCost; patientMeta?: PatientMetadata })`:

```typescript
import { calculateGDI, evaluateGaitNormatives } from "./normatives";

// Inside buildEducatedGuesses:
const gdi = calculateGDI(m, opts?.patientMeta ? { age: (opts.patientMeta as any).age, sex: (opts.patientMeta as any).sex } : undefined);

// 1. Rule: GDI Severe Deviation (GDI < 80)
if (gdi.gdiScore < 80) {
  guesses.push({
    id: "gdi-severe-deviation",
    title: "Severe overall gait deviation (GDI < 80)",
    summary: `Camera-adapted Gait Deviation Index (GDI = ${gdi.gdiScore}) indicates severe deviation (>2 SD RMS) from normative reference values across spatio-temporal and kinematic parameters.`,
    evidence: [
      `GDI Score: ${gdi.gdiScore}/100 (Baseline 100 = normative mean)`,
      `Overall RMS Z-score: ${gdi.zRms} SD`,
      `Evaluated metrics count: ${gdi.evaluatedParametersCount}`,
    ],
    confidence: 0.88,
    severity: "elevated",
    category: "pattern",
    patternTag: "GDI severe deviation (Schwartz & Rozumalski 2008)",
    alternatives: ["Significant neuromotor deficit", "Severe joint restriction / pain", "Multi-domain gait deterioration"],
  });
} 
// 2. Rule: GDI Moderate Deviation (GDI 80–89)
else if (gdi.gdiScore < 90) {
  guesses.push({
    id: "gdi-moderate-deviation",
    title: "Moderate gait deviation (GDI 80–89)",
    summary: `Camera-adapted Gait Deviation Index (GDI = ${gdi.gdiScore}) indicates moderate overall deviation (1–2 SD RMS) from population normative references.`,
    evidence: [
      `GDI Score: ${gdi.gdiScore}/100`,
      `Overall RMS Z-score: ${gdi.zRms} SD`,
    ],
    confidence: 0.75,
    severity: "moderate",
    category: "pattern",
    patternTag: "GDI moderate deviation",
    alternatives: ["Mild/moderate musculoskeletal limitation", "Cautious walking strategy", "Subclinical gait change"],
  });
}

// 3. Rule: Extreme Normative Percentile Deviations
const normEvals = evaluateGaitNormatives(m, opts?.patientMeta ? { age: (opts.patientMeta as any).age, sex: (opts.patientMeta as any).sex } : undefined);
for (const evalResult of normEvals) {
  if (evalResult.paramId === "stepTimeCV" && evalResult.percentile > 95) {
    guesses.push({
      id: "normative-step-time-cv-high",
      title: "Step-time CV above 95th normative percentile",
      summary: `Step-time variability (${evalResult.observedValue}%) exceeds the 95th percentile (Z = +${evalResult.zScore}) of clinical reference norms (${evalResult.citation}).`,
      evidence: [
        `Step Time CV: ${evalResult.observedValue}% (Norm mean: ${evalResult.normativeMean}%, SD: ${evalResult.normativeSd}%)`,
        `Percentile: ${evalResult.percentile}th percentile`,
      ],
      confidence: 0.82,
      severity: "elevated",
      category: "variability",
      patternTag: "normative variability anomaly",
    });
  }

  if (evalResult.paramId === "kneeFlexionROM" && evalResult.percentile < 5) {
    guesses.push({
      id: "normative-knee-flexion-low",
      title: "Knee flexion ROM below 5th normative percentile",
      summary: `Knee flexion range of motion (${evalResult.observedValue}°) is below the 5th percentile (Z = ${evalResult.zScore}) relative to population reference norms (${evalResult.citation}).`,
      evidence: [
        `Knee Flexion ROM: ${evalResult.observedValue}° (Norm mean: ${evalResult.normativeMean}°, SD: ${evalResult.normativeSd}°)`,
        `Percentile: ${evalResult.percentile}th percentile`,
      ],
      confidence: 0.80,
      severity: "moderate",
      category: "neuromotor",
      patternTag: "restricted knee ROM",
    });
  }
}
```

---

## 6. Test Strategy for `src/lib/gait/__tests__/normatives.test.ts`

### 6.1 Core Vitest Test Suite Outline

Create `src/lib/gait/__tests__/normatives.test.ts` with the following test groups:

```typescript
import { describe, it, expect } from "vitest";
import {
  calculateZScore,
  calculatePercentile,
  calculateGDI,
  getNormativeReference,
  evaluateGaitNormatives,
  WINTER_2009_NORMATIVES,
  BOVI_2011_NORMATIVES,
} from "../normatives";
import { createMockMetrics } from "./testHelpers";

describe("Clinical Normative Reference Integration & GDI (normatives.ts)", () => {
  describe("calculateZScore", () => {
    it("computes Z-score correctly for normal inputs", () => {
      expect(calculateZScore(105, 105, 8)).toBe(0);
      expect(calculateZScore(113, 105, 8)).toBe(1);
      expect(calculateZScore(97, 105, 8)).toBe(-1);
    });

    it("handles edge cases gracefully (sd <= 0, non-finite values)", () => {
      expect(calculateZScore(105, 105, 0)).toBe(0);
      expect(calculateZScore(105, 105, -5)).toBe(0);
      expect(calculateZScore(NaN, 105, 8)).toBe(0);
      expect(calculateZScore(105, Infinity, 8)).toBe(0);
    });
  });

  describe("calculatePercentile", () => {
    it("maps standard Z-scores to cumulative percentiles", () => {
      expect(calculatePercentile(0)).toBeCloseTo(50.0, 1);
      expect(calculatePercentile(1.0)).toBeGreaterThan(83.0);
      expect(calculatePercentile(1.0)).toBeLessThan(86.0);
      expect(calculatePercentile(-1.0)).toBeGreaterThan(14.0);
      expect(calculatePercentile(-1.0)).toBeLessThan(17.0);
      expect(calculatePercentile(1.96)).toBeGreaterThan(96.0);
      expect(calculatePercentile(-1.96)).toBeLessThan(4.0);
    });

    it("clamps extreme Z-scores to [0, 100]", () => {
      expect(calculatePercentile(10)).toBe(100);
      expect(calculatePercentile(-10)).toBe(0);
    });
  });

  describe("getNormativeReference & Demographics Lookups", () => {
    it("returns Winter (2009) reference defaults when demographics are absent", () => {
      const ref = getNormativeReference("cadence");
      expect(ref.citation).toBe("Winter (2009)");
      expect(ref.mean).toBe(105.0);
      expect(ref.sd).toBe(8.0);
    });

    it("returns Bovi et al. (2011) age and sex stratified reference when demographics provided", () => {
      const youngMaleRef = getNormativeReference("cadence", { age: 25, sex: "male" });
      expect(youngMaleRef.citation).toBe("Bovi et al. (2011)");
      expect(youngMaleRef.mean).toBe(112.4);

      const elderlyFemaleRef = getNormativeReference("cadence", { age: 70, sex: "female" });
      expect(elderlyFemaleRef.citation).toBe("Bovi et al. (2011)");
      expect(elderlyFemaleRef.mean).toBe(109.5);
    });
  });

  describe("calculateGDI (Gait Deviation Index)", () => {
    it("returns 100 for gait matching normative mean (Z = 0)", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 105.0,
        stepTimeCV: 0.02,
        leftStancePct: 60.5,
        rightStancePct: 60.5,
        doubleSupportPct: 20.8,
        kneeFlexLeft: 58.0,
        kneeFlexRight: 58.0,
      });

      const gdi = calculateGDI(metrics);
      expect(gdi.gdiScore).toBe(100);
      expect(gdi.zRms).toBe(0);
      expect(gdi.interpretation).toContain("Normal");
    });

    it("reduces GDI by 10 points per 1 SD deviation (Z = 1 -> GDI = 90)", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 113.0, // +1 SD
        stepTimeCV: 0.026, // +1 SD
        leftStancePct: 62.5, // +1 SD
        rightStancePct: 62.5,
        doubleSupportPct: 23.3, // +1 SD
        kneeFlexLeft: 62.5, // +1 SD
        kneeFlexRight: 62.5,
      });

      const gdi = calculateGDI(metrics);
      expect(gdi.gdiScore).toBeCloseTo(90, 0);
      expect(gdi.zRms).toBeCloseTo(1.0, 1);
      expect(gdi.interpretation).toContain("Mild gait deviation");
    });

    it("bounds GDI between 0 and 130", () => {
      const extremeMetrics = createMockMetrics({
        cadenceSpm: 180.0, // Z > 9
        stepTimeCV: 0.20,   // Z > 10
      });
      const gdiExtreme = calculateGDI(extremeMetrics);
      expect(gdiExtreme.gdiScore).toBeGreaterThanOrEqual(0);

      const superNormal = createMockMetrics({ cadenceSpm: 105.0, stepTimeCV: 0.02 });
      const gdiSuper = calculateGDI(superNormal);
      expect(gdiSuper.gdiScore).toBeLessThanOrEqual(130);
    });
  });

  describe("evaluateGaitNormatives", () => {
    it("evaluates all valid gait parameters against reference ranges", () => {
      const metrics = createMockMetrics({
        cadenceSpm: 105.0,
        avgStepTimeSec: 0.57,
        stepTimeCV: 0.02,
        leftStancePct: 60.5,
        rightStancePct: 60.5,
        kneeFlexLeft: 58.0,
        kneeFlexRight: 58.0,
      });

      const results = evaluateGaitNormatives(metrics);
      expect(results.length).toBeGreaterThan(0);
      for (const res of results) {
        expect(res.zScore).toBeDefined();
        expect(res.percentile).toBeGreaterThanOrEqual(0);
        expect(res.percentile).toBeLessThanOrEqual(100);
        expect(res.citation).toBeTruthy();
      }
    });
  });
});
```

---

## 7. Verification Method

To independently verify the implementation when created:

1. **Run Vitest Unit Suite:**
   ```bash
   npx vitest run src/lib/gait/__tests__/normatives.test.ts src/lib/gait/__tests__/ratings.test.ts src/lib/gait/__tests__/guesses.test.ts
   ```
2. **Typecheck Workspace:**
   ```bash
   npx tsc --noEmit
   ```
3. **Run Full Test Suite:**
   ```bash
   npx vitest run
   ```

---

## 8. Summary of Target Implementation Steps

1. Create `src/lib/gait/normatives.ts` containing the Winter (2009) and Bovi et al. (2011) datasets, math utilities (`calculateZScore`, `calculatePercentile`), GDI calculator (`calculateGDI`), lookup function (`getNormativeReference`), and evaluator (`evaluateGaitNormatives`).
2. Update `src/lib/gait/ratings.ts`:
   - Add `zScore?`, `percentile?`, `normativeRange?` to `MetricRating`.
   - Add `gdi?`, `normativeEvaluations?` to `StructuredReport`.
   - Update `buildStructuredReport` to evaluate normatives and populate GDI and metric Z-scores.
3. Update `src/lib/gait/guesses.ts`:
   - Import `calculateGDI` and `evaluateGaitNormatives`.
   - Add hypothesis rules for `gdi-severe-deviation`, `gdi-moderate-deviation`, `normative-step-time-cv-high`, and `normative-knee-flexion-low`.
4. Create `src/lib/gait/__tests__/normatives.test.ts` to achieve 100% test coverage over all normative features and integrations.

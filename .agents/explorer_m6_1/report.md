# Technical Implementation Blueprint: Milestone 6 — Clinical Normative Reference Integration & GDI

**Agent ID:** `teamwork_preview_explorer` (Explorer 1 for Milestone 6)  
**Date:** 2026-08-10  
**Project Root:** `/Users/damian/GitHub/gait-lab`  
**Target Files:**
- `src/lib/gait/normatives.ts` (New module)
- `src/lib/gait/ratings.ts` (Integration point)
- `src/lib/gait/guesses.ts` (Integration point)
- `src/lib/gait/__tests__/normatives.test.ts` (New unit test suite)

---

## 1. Executive Summary & Scope Overview

Milestone 6 introduces **Clinical Normative Reference Integration & Gait Deviation Index (GDI)** into `gait-lab`. This system elevates computer-vision gait analytics from arbitrary 0–100 heuristic scores to clinically validated, population-normed z-scores, percentiles, and GDI scores derived from canonical biomechanics literature (Winter 2009 and Bovi et al. 2011, Schwartz & Rozumalski 2008).

### Key Architectural Outcomes
1. **`src/lib/gait/normatives.ts`**: Provides normative reference dataset tables stratified by age group (young, middle-aged, elderly) and biological sex (male, female, combined), along with mathematically rigorous functions for Z-score calculation, normal CDF percentile estimation, normative evaluation, and camera-adapted Gait Deviation Index (GDI) computation.
2. **`src/lib/gait/ratings.ts`**: Enriches `MetricRating` and `StructuredReport` with Z-score and normative percentile metadata, giving clinicians and users exact population-relative benchmarks.
3. **`src/lib/gait/guesses.ts`**: Implements educated hypothesis triggers when composite GDI indicates moderate (< 90) or severe (< 80) deviation, or when individual metrics fall into extreme normative percentiles (< 5th or > 95th percentile).
4. **`src/lib/gait/__tests__/normatives.test.ts`**: Comprehensive Vitest test suite ensuring zero regressions and 100% verification coverage across pure math, lookups, GDI calculation, and integration layers.

---

## 2. Codebase & Data Structures Investigation

### 2.1 Existing Metric Types (`src/lib/gait/types.ts`)
- **`GaitMetrics`**: Contains primary spatio-temporal and kinematic metrics:
  - `cadenceSpm`: Cadence in steps per minute.
  - `stepTimeCV`: Step time coefficient of variation (ratio, std/mean).
  - `leftStancePct`, `rightStancePct`: Stance phase % of gait cycle (Zeni kinematic algorithm).
  - `doubleSupportPct`, `doubleSupportHint`: Double support time % of stride.
  - `kneeFlexLeft`, `kneeFlexRight`: Knee flexion range of motion in degrees.
  - `stepTimeAsymmetry`, `symmetryAngle`, `lateralSway`, `verticalBounce`, `armSwingLeft`, `armSwingRight`.
- **`PatientMetadata`**:
  ```typescript
  export type PatientMetadata = {
    patientId: string;
    clinicianNotes: string;
    assessmentDate: string;
    assessmentCondition: string;
    // Extended optional demographics for M6:
    age?: number;
    sex?: "male" | "female" | "other" | "combined";
  };
  ```

### 2.2 Existing Rating & Guess Types (`src/lib/gait/ratings.ts`, `guesses.ts`)
- **`MetricRating`**:
  Currently holds `id`, `group`, `label`, `display`, `unit`, `favorability`, `band`, `note`.
- **`StructuredReport`**:
  Currently holds `headline`, `oneLiner`, `taskMode`, `viewAngle`, `viewConfidence`, `domains`, `metrics`, `hypotheses`, `dualTask`, `qualityNotes`, `disclaimer`.
- **`EducatedGuess`**:
  Holds `id`, `title`, `summary`, `evidence`, `confidence`, `severity`, `category`, `patternTag`, `alternatives`.

---

## 3. Detailed Specification of `src/lib/gait/normatives.ts`

### 3.1 Scientific Normative Datasets

#### Dataset 1: Winter (2009) — *Biomechanics and Motor Control of Human Movement* (4th Ed.)
Adult population baseline (ages 18–60, natural walking cadence):
- **Cadence**: $105.0 \pm 8.0$ spm
- **Step Time CV**: $2.0 \pm 0.6$ % (expressed as ratio: $0.020 \pm 0.006$)
- **Stance Phase**: $60.5 \pm 2.0$ %
- **Double Support Phase**: $20.8 \pm 2.5$ %
- **Knee Flexion ROM**: $58.0 \pm 4.5$ °

#### Dataset 2: Bovi et al. (2011) — Lifespan Stratified Reference Data
Age & sex-stratified normative values:

| Age Group | Sex | Cadence (spm) | Step Time CV (%) | Stance (%) | Double Support (%) | Knee Flexion ROM (°) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Young (18–49)** | Male | $112.4 \pm 7.5$ | $2.1 \pm 0.5$ | $60.2 \pm 1.5$ | $20.1 \pm 2.0$ | $60.5 \pm 3.8$ |
| | Female | $117.8 \pm 6.8$ | $2.0 \pm 0.5$ | $59.8 \pm 1.4$ | $19.6 \pm 1.8$ | $59.2 \pm 3.5$ |
| | Combined | $115.1 \pm 7.2$ | $2.05 \pm 0.5$ | $60.0 \pm 1.5$ | $19.85 \pm 1.9$ | $59.85 \pm 3.65$ |
| **Middle (50–64)** | Male | $108.6 \pm 8.0$ | $2.4 \pm 0.7$ | $61.4 \pm 1.8$ | $21.5 \pm 2.2$ | $57.4 \pm 4.0$ |
| | Female | $114.2 \pm 7.2$ | $2.3 \pm 0.6$ | $60.8 \pm 1.6$ | $20.9 \pm 2.0$ | $56.8 \pm 3.7$ |
| | Combined | $111.4 \pm 7.6$ | $2.35 \pm 0.65$ | $61.1 \pm 1.7$ | $21.2 \pm 2.1$ | $57.1 \pm 3.85$ |
| **Elderly (65+)** | Male | $103.2 \pm 9.5$ | $3.2 \pm 1.1$ | $62.8 \pm 2.5$ | $23.8 \pm 3.0$ | $53.5 \pm 4.8$ |
| | Female | $109.5 \pm 8.8$ | $3.0 \pm 1.0$ | $62.1 \pm 2.2$ | $23.1 \pm 2.8$ | $54.1 \pm 4.5$ |
| | Combined | $106.35 \pm 9.15$ | $3.1 \pm 1.05$ | $62.45 \pm 2.35$ | $23.45 \pm 2.9$ | $53.8 \pm 4.65$ |

---

### 3.2 Types & Interfaces in `normatives.ts`

```typescript
export type SexCategory = "male" | "female" | "combined";
export type AgeGroupCategory = "young" | "middle" | "elderly" | "combined";

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
  gdiScore: number; // 0 to 130, 100 = normative mean, -10 per 1 SD
  zRms: number;     // Root Mean Square Z-score
  evaluatedCount: number;
  interpretation: string;
  paramZScores: Record<string, number>;
}
```

---

### 3.3 Function Specifications for `normatives.ts`

#### 1. `calculateZScore(value: number, mean: number, sd: number): number`
- **Logic**:
  $$\text{Z-Score} = \frac{\text{value} - \text{mean}}{\text{sd}}$$
- **Edge Cases**: If `sd <= 0` or any parameter is `NaN` / non-finite, return `0.0`.
- **Precision**: Round to 2 decimal places or return floating-point value.

#### 2. `calculatePercentile(zScore: number): number`
- **Logic**: Cumulative Distribution Function (CDF) of the standard normal distribution $\Phi(Z)$, converted to a percentage $[0, 100]$.
- **Formula**:
  $$P(Z) = 100 \cdot \frac{1}{2} \left[ 1 + \text{erf}\left( \frac{Z}{\sqrt{2}} \right) \right]$$
  where $\text{erf}(x)$ is computed via the standard high-precision approximation:
  $$\text{erf}(x) \approx \text{sign}(x) \cdot \sqrt{1 - \exp\left( -\frac{4}{\pi} x^2 \cdot \frac{1 + a x^2}{1 + b x^2} \right)}$$
  or the Winitzki / Abramowitz approximation:
  $$\text{erf}(x) \approx \text{sign}(x) \cdot \left( 1 - \frac{1}{(1 + a_1 x + a_2 x^2 + a_3 x^3 + a_4 x^4)^4} \right)$$
- **Clamping**: Clamped to $[0.1, 99.9]$ to prevent overflow at extreme z-scores ($|Z| > 4$).

#### 3. `getNormativeReference(paramId: string, age?: number, sex?: SexCategory): NormativeReferenceRange`
- **Logic**:
  1. Map `age` to `AgeGroupCategory`:
     - `age < 50` $\to$ `"young"`
     - `50 <= age <= 64` $\to$ `"middle"`
     - `age >= 65` $\to$ `"elderly"`
     - `undefined` or null $\to$ `"combined"` (or default Winter 2009).
  2. Map `sex` to `SexCategory`: `"male"`, `"female"`, or `"combined"`.
  3. Look up parameter in Bovi (2011) dataset table. If not found or if default requested, return Winter (2009) baseline.

#### 4. `calculateGDI(metrics: GaitMetrics, age?: number, sex?: SexCategory): number`
- **Logic**:
  Calculates the camera-adapted Gait Deviation Index (Schwartz & Rozumalski 2008).
  1. Extract available key metrics:
     - Cadence: `metrics.cadenceSpm`
     - Step Time CV: `metrics.stepTimeCV * 100` (%)
     - Stance %: Mean of `metrics.leftStancePct` and `metrics.rightStancePct` (if present)
     - Double Support %: `metrics.doubleSupportPct` ?? `(metrics.doubleSupportHint * 100)`
     - Knee Flexion ROM: Mean of `metrics.kneeFlexLeft` and `metrics.kneeFlexRight` (if present)
  2. For each available metric $i$, calculate $Z_i = \frac{x_i - \mu_i}{\sigma_i}$.
  3. Calculate Root Mean Square Z-Score:
     $$\bar{Z}_{\text{rms}} = \sqrt{\frac{1}{K} \sum_{i=1}^{K} Z_i^2}$$
  4. Calculate GDI score:
     $$\text{GDI}_{\text{raw}} = 100 - 10 \cdot \bar{Z}_{\text{rms}}$$
  5. Clamp result to $[0, 130]$:
     $$\text{GDI} = \text{clamp}(\text{GDI}_{\text{raw}}, 0, 130)$$

#### 5. `evaluateGDI(metrics: GaitMetrics, age?: number, sex?: SexCategory): GaitDeviationIndexResult`
- **Logic**:
  Wraps `calculateGDI`, returning the full breakdown including `gdiScore`, `zRms`, `evaluatedCount`, `paramZScores`, and clinical interpretation text:
  - $\text{GDI} \ge 100$: "Normal normative gait alignment (within 0 SD deviation)."
  - $90 \le \text{GDI} < 100$: "Mild gait deviation (within 1 SD of normative mean)."
  - $80 \le \text{GDI} < 90$: "Moderate gait deviation (1–2 SD from normative mean)."
  - $\text{GDI} < 80$: "Severe gait deviation (>2 SD from normative mean)."

#### 6. `evaluateNormatives(metrics: GaitMetrics, age?: number, sex?: SexCategory): NormativeEvaluationResult[]`
- Evaluates all available parameters against normative reference ranges and returns an array of `NormativeEvaluationResult`.

---

## 4. Integration Blueprint for `src/lib/gait/ratings.ts`

### 4.1 Type Extensions
Update `MetricRating` and `StructuredReport` interfaces in `src/lib/gait/ratings.ts`:

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
  /** Added in M6: Normative context */
  zScore?: number;
  percentile?: number;
  normativeRef?: string;
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
  dualTask?: {
    cost: DualTaskCost;
    band: RatingBand;
    stars: number;
    blurb: string;
  };
  qualityNotes: string[];
  disclaimer: string;
  /** Added in M6: Gait Deviation Index breakdown */
  gdi?: GaitDeviationIndexResult;
};
```

### 4.2 Updates to `buildStructuredReport()`
In `buildStructuredReport(m: GaitMetrics, guesses: EducatedGuess[], opts: { taskMode: TaskMode; analyzedFrames: number; dualTaskCost?: DualTaskCost; patientMeta?: PatientMetadata; age?: number; sex?: SexCategory })`:

1. Evaluate GDI via `evaluateGDI(m, opts.age ?? opts.patientMeta?.age, opts.sex ?? (opts.patientMeta?.sex as SexCategory))`.
2. Attach Z-score and percentile to relevant `MetricRating` entries:
   - `cadence`: calculate Z-score and percentile vs normative cadence.
   - `stepTimeCV`: calculate Z-score and percentile vs normative step time CV.
   - `zeniStance`: calculate Z-score and percentile vs stance %.
   - `ds`: calculate Z-score and percentile vs double support %.
   - `kneeL` / `kneeR`: calculate Z-score and percentile vs knee flexion ROM.
3. Update `headline` or `oneLiner` to include GDI summary (e.g. `Headline: Strong overall · 85/100 · GDI 95 (Mild deviation)`).
4. Attach `gdi` object to `StructuredReport`.

---

## 5. Integration Blueprint for `src/lib/gait/guesses.ts`

### 5.1 Function Signature Update
Update `buildEducatedGuesses` to accept optional `age`, `sex`, or `patientMeta`:

```typescript
export function buildEducatedGuesses(
  m: GaitMetrics,
  opts?: {
    taskMode?: TaskMode;
    dualTaskCost?: DualTaskCost;
    patientMeta?: PatientMetadata;
    age?: number;
    sex?: SexCategory;
  },
): EducatedGuess[]
```

### 5.2 New Hypothesis Rules

#### Rule 1: `gdi-severe-deviation` (GDI < 80)
- **Condition**: `gdiResult.gdiScore < 80`
- **Title**: "Severe Gait Deviation Index (GDI < 80)"
- **Summary**: "Overall gait kinematics and temporal metrics deviate significantly (>2 SD) from population normative reference values (Schwartz & Rozumalski 2008)."
- **Evidence**:
  - `GDI Score: ${gdiResult.gdiScore.toFixed(1)} / 130`
  - `Root Mean Square Z-Score: ${gdiResult.zRms.toFixed(2)}`
  - `Evaluated parameters: ${gdiResult.evaluatedCount}`
- **Confidence**: `clamp(0.65 + (80 - gdiResult.gdiScore) * 0.01, 0.65, 0.95)`
- **Severity**: `"elevated"`
- **Category**: `"pattern"`
- **Pattern Tag**: `"GDI Severe Deviation (<80)"`

#### Rule 2: `gdi-moderate-deviation` (80 <= GDI < 90)
- **Condition**: `80 <= gdiResult.gdiScore && gdiResult.gdiScore < 90`
- **Title**: "Moderate Gait Deviation Index (GDI 80–89)"
- **Summary**: "Gait mechanics show moderate deviation (1–2 SD) from normative adult benchmarks."
- **Evidence**:
  - `GDI Score: ${gdiResult.gdiScore.toFixed(1)} / 130`
  - `Root Mean Square Z-Score: ${gdiResult.zRms.toFixed(2)}`
- **Confidence**: `0.60`
- **Severity**: `"moderate"`
- **Category**: `"pattern"`
- **Pattern Tag**: `"GDI Moderate Deviation (80-89)"`

#### Rule 3: `normative-percentile-extreme` (Extreme Metric Percentiles)
- **Condition**: Any metric percentile $< 5.0$ or $> 95.0$ (e.g. Step Time CV percentile $> 95$, Knee Flexion ROM percentile $< 5$, or Double Support % percentile $> 95$).
- **Title**: "Extreme normative metric percentile deviation"
- **Summary**: "One or more gait metrics fall outside the 5th–95th percentile normative population range."
- **Evidence**: List specific metric percentiles (e.g., `Step-time CV: 98.5th percentile`, `Knee flexion ROM: 3.2nd percentile`).
- **Confidence**: `0.70`
- **Severity**: `"moderate"`
- **Category**: `"variability"`

---

## 6. Test Blueprint for `src/lib/gait/__tests__/normatives.test.ts`

The test file `src/lib/gait/__tests__/normatives.test.ts` will test all components of `normatives.ts`, `ratings.ts`, and `guesses.ts`.

### 6.1 Test Suite Structure

```typescript
import { describe, it, expect } from "vitest";
import {
  calculateZScore,
  calculatePercentile,
  calculateGDI,
  evaluateGDI,
  getNormativeReference,
  evaluateNormatives,
} from "../normatives";
import { buildStructuredReport } from "../ratings";
import { buildEducatedGuesses } from "../guesses";
import type { GaitMetrics } from "../types";

describe("normatives.ts", () => {
  describe("calculateZScore", () => {
    it("computes exact z-scores for standard normal inputs", () => {
      expect(calculateZScore(105, 105, 8)).toBe(0);
      expect(calculateZScore(113, 105, 8)).toBe(1.0);
      expect(calculateZScore(89, 105, 8)).toBe(-2.0);
    });

    it("handles zero or negative SD gracefully", () => {
      expect(calculateZScore(100, 100, 0)).toBe(0);
      expect(calculateZScore(100, 100, -5)).toBe(0);
    });

    it("handles non-finite inputs", () => {
      expect(calculateZScore(NaN, 100, 5)).toBe(0);
      expect(calculateZScore(100, NaN, 5)).toBe(0);
      expect(calculateZScore(100, 100, Infinity)).toBe(0);
    });
  });

  describe("calculatePercentile", () => {
    it("maps Z = 0 to 50th percentile", () => {
      expect(calculatePercentile(0)).toBeCloseTo(50.0, 1);
    });

    it("maps Z = +1.96 to ~97.5th percentile", () => {
      expect(calculatePercentile(1.96)).toBeCloseTo(97.5, 1);
    });

    it("maps Z = -1.96 to ~2.5th percentile", () => {
      expect(calculatePercentile(-1.96)).toBeCloseTo(2.5, 1);
    });

    it("clamps extreme z-scores to [0.1, 99.9]", () => {
      expect(calculatePercentile(6.0)).toBeLessThanOrEqual(99.9);
      expect(calculatePercentile(-6.0)).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe("getNormativeReference", () => {
    it("returns Winter (2009) reference when no age/sex is provided", () => {
      const ref = getNormativeReference("cadenceSpm");
      expect(ref.citation).toBe("Winter (2009)");
      expect(ref.mean).toBe(105.0);
      expect(ref.sd).toBe(8.0);
    });

    it("returns age and sex stratified data from Bovi et al. (2011)", () => {
      const youngMaleRef = getNormativeReference("cadenceSpm", 25, "male");
      expect(youngMaleRef.citation).toBe("Bovi et al. (2011)");
      expect(youngMaleRef.mean).toBe(112.4);

      const elderlyFemaleRef = getNormativeReference("cadenceSpm", 70, "female");
      expect(elderlyFemaleRef.citation).toBe("Bovi et al. (2011)");
      expect(elderlyFemaleRef.mean).toBe(109.5);
    });
  });

  describe("calculateGDI & evaluateGDI", () => {
    it("returns GDI = 100 for perfect normative mean metrics", () => {
      const normMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 105.0,
        stepTimeCV: 0.02,
        leftStancePct: 60.5,
        rightStancePct: 60.5,
        doubleSupportPct: 20.8,
        kneeFlexLeft: 58.0,
        kneeFlexRight: 58.0,
      };
      const result = evaluateGDI(normMetrics as GaitMetrics);
      expect(result.gdiScore).toBe(100.0);
      expect(result.zRms).toBe(0.0);
    });

    it("returns GDI = 90 when metrics deviate by 1 SD across parameters", () => {
      const devMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 113.0, // +1 SD (105 + 8)
        stepTimeCV: 0.026, // +1 SD (0.02 + 0.006)
        leftStancePct: 62.5, // +1 SD (60.5 + 2.0)
        rightStancePct: 62.5,
        doubleSupportPct: 23.3, // +1 SD (20.8 + 2.5)
        kneeFlexLeft: 53.5, // -1 SD (58.0 - 4.5)
        kneeFlexRight: 53.5,
      };
      const result = evaluateGDI(devMetrics as GaitMetrics);
      expect(result.gdiScore).toBeCloseTo(90.0, 1);
      expect(result.zRms).toBeCloseTo(1.0, 1);
    });

    it("bounds GDI between 0 and 130", () => {
      const extremeMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 200,
        stepTimeCV: 0.30,
        leftStancePct: 90,
        rightStancePct: 90,
      };
      const result = evaluateGDI(extremeMetrics as GaitMetrics);
      expect(result.gdiScore).toBeGreaterThanOrEqual(0);
      expect(result.gdiScore).toBeLessThanOrEqual(130);
    });
  });

  describe("Integration with ratings.ts & guesses.ts", () => {
    it("attaches GDI and z-scores to StructuredReport", () => {
      const dummyMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 105,
        stepTimeCV: 0.02,
        overallScore: 85,
        stabilityScore: 80,
        symmetryScore: 85,
        rhythmScore: 85,
        mobilityScore: 85,
        automaticityScore: 85,
        viewAngle: "sagittal",
        viewConfidence: 0.9,
        durationSec: 10,
        fpsEffective: 30,
        stepCount: 12,
        verticalBounce: 0.03,
        armSwingLeft: 0.3,
        armSwingRight: 0.3,
        armSwingAsymmetry: 0.05,
        stepTimeAsymmetry: 0.02,
        pathSmoothness: 0.9,
        doubleSupportHint: 0.2,
        stepEvents: [],
      };
      const report = buildStructuredReport(dummyMetrics as GaitMetrics, [], {
        taskMode: "single",
        analyzedFrames: 100,
      });

      expect(report.gdi).toBeDefined();
      expect(report.gdi?.gdiScore).toBe(100);
    });

    it("triggers GDI severe deviation hypothesis when GDI < 80", () => {
      const severeMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 60, // ~ -5.6 SD
        stepTimeCV: 0.15, // ~ +21 SD
        overallScore: 40,
        stabilityScore: 40,
        symmetryScore: 40,
        rhythmScore: 40,
        mobilityScore: 40,
        automaticityScore: 40,
        viewAngle: "sagittal",
        viewConfidence: 0.9,
        durationSec: 10,
        fpsEffective: 30,
        stepCount: 5,
        verticalBounce: 0.03,
        armSwingLeft: 0.1,
        armSwingRight: 0.1,
        armSwingAsymmetry: 0.05,
        stepTimeAsymmetry: 0.02,
        pathSmoothness: 0.5,
        doubleSupportHint: 0.4,
        stepEvents: [],
      };
      const guesses = buildEducatedGuesses(severeMetrics as GaitMetrics);
      const gdiGuess = guesses.find((g) => g.id === "gdi-severe-deviation");
      expect(gdiGuess).toBeDefined();
      expect(gdiGuess?.severity).toBe("elevated");
    });
  });
});
```

---

## 7. Verification & Implementation Plan

1. **New File**: Create `src/lib/gait/normatives.ts` adhering strictly to all mathematical formulas, type definitions, and normative data tables.
2. **Integration in `ratings.ts`**: Update `buildStructuredReport` and `MetricRating` to attach normative evaluation results.
3. **Integration in `guesses.ts`**: Add GDI and extreme percentile hypothesis rules to `buildEducatedGuesses`.
4. **New Test Suite**: Create `src/lib/gait/__tests__/normatives.test.ts` and run `npx vitest run src/lib/gait/__tests__/normatives.test.ts`.
5. **Full Verification**: Run `npx tsc --noEmit` and full Vitest suite `npx vitest run` to ensure zero regressions across all repository tests.

---

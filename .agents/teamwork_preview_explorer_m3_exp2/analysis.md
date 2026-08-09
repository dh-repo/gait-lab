# Scientific Core & Test Coverage Analysis Report

## Executive Summary
This report presents a thorough, end-to-end scientific and software engineering investigation of the core gait analysis modules (`smoothness.ts`, `dte.ts`, `analysis.ts`, `ratings.ts`, `guesses.ts`, `persistence.ts`) and their test suites in `gait-lab`.

### Key Findings
1. **Critical Test Suite Gaps**:
   - **4 assigned test files do NOT exist as dedicated test files**: `analysis.test.ts`, `ratings.test.ts`, `guesses.test.ts`, and `persistence.test.ts` are completely missing from `src/lib/gait/__tests__/`.
   - **Existing test files are minimalist**: `smoothness.test.ts` has only 2 basic tests; `dte.test.ts` has only 3 basic tests.
   - Key algorithms—including multi-person tracking (`matchPeople`), view angle classification (`detectViewAngle`), clinical rating bands (`ratings.ts`), rule-based observation hypotheses (`guesses.ts`), and DB session payload serialization (`persistence.ts`)—have zero dedicated unit tests.
2. **Tooling & Test Script Discrepancy**:
   - `package.json` defines `"test": "node --test 'scripts/**/*.test.mjs'"`, which runs Node's native test runner on scripts and **ignores** all Vitest unit tests in `src/lib/gait/__tests__/`.
   - Running `npx vitest run` without arguments fails because Vitest attempts to parse `scripts/*.test.mjs` which use `node:test` syntax (`import test from "node:test"`). Running `npx vitest run src/lib/gait/__tests__` executes the 9 existing gait test files with 100% pass rate (61 passing tests).

---

## Current Test Inventory & Gap Matrix

| Scientific Module | Primary Responsibilities | Existing Test File | Current Test Count | Coverage Status & Key Gaps |
|---|---|---|---|---|
| `smoothness.ts` | FFT Trunk Harmonic Ratio ($HR_{vert}$, $HR_{lat}$, $HR_{overall}$) | `smoothness.test.ts` | 2 | **Minimal** — Only 1 synthetic sine test + 1 fallback test. Missing dysrhythmic signals, pure single frequencies, vertical vs lateral formula validation, edge cases. |
| `dte.ts` | Standardized Dual-Task Effect ($DTE$) & Plummer & Eskes CMI Classification | `dte.test.ts` | 3 | **Partial** — Missing explicit `cognitive_prioritization` test, exact +/-5.0% threshold boundaries, lower-is-better metric sign inversion, baseline fallback defaults. |
| `analysis.ts` | Spatio-temporal pipeline, Zeni events, $SA$, $HR$, `matchPeople`, `detectViewAngle`, `computeDualTaskCost` | *None (`analysis.test.ts` missing)* | 0 | **Missing** — 0 dedicated tests for `matchPeople`, `detectViewAngle`, `computeGaitMetrics` pipeline, or `trackPriorityScore`. (Some indirect coverage in challenger harness). |
| `ratings.ts` | Domain composite scores (0–100), 5-band rating engine, `dataQualityScore`, 18 metric favorabilities | *None (`ratings.test.ts` missing)* | 0 | **Missing** — 0 dedicated tests for 5-band rating classification, favorability clamping, data quality penalties/drivers, or `buildStructuredReport`. |
| `guesses.ts` | 28 rule-based observational hypotheses, evidence formatting, severity sorting, `DETERMINATION_LADDER` | *None (`guesses.test.ts` missing)* | 0 | **Missing** — 0 dedicated tests for individual rule triggers, evidence formatting strings, confidence score calculations, or severity ranking. |
| `persistence.ts` | DB gait session persistence RPCs (`saveGaitSession`, `listGaitSessions`, etc.), JSON serialization | *None (`persistence.test.ts` missing)* | 0 | **Missing** — 0 dedicated tests for RPC server functions, SQL query payload mapping, JSON payload serialization/deserialization, user isolation. |

---

## Domain-by-Domain Analysis & Missing Test Specifications

### 1. Trunk Smoothness & Rhythmicity (`smoothness.ts`)
#### Algorithmic Mechanism
- Vertical Displacement ($hipY$): 2 cycles per stride (1 cycle per step).
  $$HR_{vertical} = \frac{\sum \text{Even Harmonics (2nd, 4th, 6th...)}}{\sum \text{Odd Harmonics (1st, 3rd, 5th...)}}$$
- Lateral Displacement ($hipX$): 1 cycle per stride (sway left then right).
  $$HR_{lateral} = \frac{\sum \text{Odd Harmonics (1st, 3rd, 5th...)}}{\sum \text{Even Harmonics (2nd, 4th, 6th...)}}$$
- Overall Harmonic Ratio (Geometric Mean):
  $$HR_{overall} = \sqrt{HR_{vertical} \cdot HR_{lateral}}$$
- Clamping & Fallbacks:
  - Input array length < 8 or fps <= 0 -> returns `{ hrVertical: 1.0, hrLateral: 1.0, overallHR: 1.0 }`.
  - $hrVertical = \max(0.1, \text{round}_2(vertHarmonics.harmonicRatio))$
  - $hrLateral = \max(0.1, \text{round}_2(\frac{latHarmonics.oddSum}{latHarmonics.evenSum + 1e-6}))$

#### Missing Test Cases for `smoothness.test.ts`
1. **Vertical vs. Lateral Formula Independence**:
   - Verify that pure 2nd harmonic input in $hipY$ yields $HR_{vertical} > 2.0$ while $hipX$ with pure 1st harmonic yields $HR_{lateral} > 2.0$.
2. **Dysrhythmic / Irregular Signal Power Shift**:
   - Input asymmetrical / dysrhythmic signals (e.g. adding strong odd harmonics to $hipY$) and verify that $HR_{vertical}$ drops below 1.5.
3. **Constant DC / Zero-Phase Signal**:
   - Input constant trajectory array `new Array(32).fill(0.5)` and verify return values equal minimum clamped floor (0.1).
4. **Boundary & Input Guard Tests**:
   - Test inputs with 7 elements (below threshold of 8) -> verify default `{1.0, 1.0, 1.0}`.
   - Test `fps = 0` or negative `fps` -> verify default fallback.
5. **Scale & Performance Test**:
   - Test 10,000+ sample array -> verify execution time < 100ms and finite numerical output.

---

### 2. Dual-Task Effect & CMI Taxonomy (`dte.ts`)
#### Algorithmic Mechanism
- Higher-is-better metrics (Cadence, Symmetry Score):
  $$DTE = \frac{DualTask - Baseline}{Baseline} \times 100\%$$
- Lower-is-better metrics (Step Time CV):
  $$DTE = -\frac{DualTask - Baseline}{Baseline} \times 100\%$$
- Plummer & Eskes (2015) 4-Quadrant Cognitive-Motor Interference (CMI) Taxonomy:
  1. `mutual_interference`: $cadenceDTE < -5.0\%$ **and** $stepTimeCvDTE < -5.0\%$.
  2. `cognitive_prioritization`: $cadenceDTE < -5.0\%$ **or** $stepTimeCvDTE < -5.0\%$ (but not both).
  3. `motor_prioritization`: $cadenceDTE > +5.0\%$.
  4. `no_interference`: All $|DTE| \le 5.0\%$.

#### Missing Test Cases for `dte.test.ts`
1. **Full 4-Quadrant CMI Classification Verification**:
   - Test `no_interference`: $cadenceDTE = -2.0\%$, $stepTimeCvDTE = -3.0\%$.
   - Test `cognitive_prioritization`: $cadenceDTE = -8.0\%$, $stepTimeCvDTE = +2.0\%$ (only cadence degraded).
   - Test `cognitive_prioritization`: $cadenceDTE = 0.0\%$, $stepTimeCvDTE = -10.0\%$ (only CV degraded).
   - Test `motor_prioritization`: $cadenceDTE = +8.0\%$, $stepTimeCvDTE = 0.0\%$.
   - Test `mutual_interference`: $cadenceDTE = -10.0\%$, $stepTimeCvDTE = -25.0\%$.
2. **Exact Boundary Threshold Tests (at +/- 5.0%)**:
   - $cadenceDTE = -5.00\%$ -> `no_interference`.
   - $cadenceDTE = -5.01\%$ -> `cognitive_prioritization`.
   - $cadenceDTE = +5.00\%$ -> `no_interference`.
   - $cadenceDTE = +5.01\%$ -> `motor_prioritization`.
3. **Zero / Near-Zero Baseline Fallbacks**:
   - Baseline $stepTimeCV \le 1e-6$ -> uses fallback $baseCv = 0.05$.
   - Baseline $symmetryScore \le 1e-6$ -> uses fallback $baseSym = 80.0$.
   - Baseline $cadenceSpm \le 1e-6$ -> returns $cadenceDTE = 0.0$.
4. **Symmetry DTE Invariance & Signed Metric Inversion**:
   - Verify $stepTimeCvDTE$ sign inversion: when dual task $stepTimeCV$ doubles from 0.04 to 0.08, $stepTimeCvDTE$ is $-100.0\%$.

---

### 3. Integrated Analysis Engine & Multi-Person Tracking (`analysis.ts`)
#### Algorithmic Mechanism
- **Multi-Person Tracking (`matchPeople`)**:
  - Distance between detection hip center and track `lastHip`: $d = dist(hip, lastHip)$.
  - Matches closest pairs sorted by $d$. Gating threshold: $d > 0.22$ rejects matching and creates new track ID using `nextId.value++`.
  - Updates track stats: `lastHip`, `frames += 1`, `box`, `areaSum += w * h`, `hipYSum += hip.y`.
- **Track Priority Scoring (`trackPriorityScore`)**:
  $$\text{Score} = \text{frames} \times 3 + \text{meanArea} \times 80 + \text{meanHipY} \times 8$$
  *(Prefers persistent, large, lower-in-frame subjects typical of handheld follow shots)*.
- **`tracksToPeople`**:
  - Filters tracks with $\ge 1$ frame, sorts by `trackPriorityScore` descending, assigns colors from `PERSON_COLORS` wrap-around.
- **View Angle Detection (`detectViewAngle`)**:
  - Evaluates shoulder width ratio ($sw = dist(L\_SHOULDER, R\_SHOULDER) / torsoHeight$), hip Z-depth ($hipZ$), lateral movement ($dx$), vertical limb separation.
  - Returns `frontal`, `sagittal`, `oblique`, or `unknown` with confidence clamped to $[0.40, 0.95]$. If $< 4$ frames -> returns `{ angle: "unknown", confidence: 0.2 }`.

#### Missing Test Cases for `analysis.test.ts`
1. **Multi-Person Tracking (`matchPeople`)**:
   - Single detection matching existing track.
   - Distance threshold gating: detection at $d = 0.25 > 0.22$ causes creation of a new track with new ID.
   - Multiple detections competing for tracks: verifies nearest-neighbor assignment.
2. **Track Priority & Person Conversion (`trackPriorityScore` & `tracksToPeople`)**:
   - Verify track priority score favors persistent + larger bounding box + lower hip Y coordinate.
   - Verify `tracksToPeople` sorts tracks correctly and assigns `PERSON_COLORS` sequentially with modulo wrapping.
3. **View Angle Classifier (`detectViewAngle`)**:
   - Frame count $< 4$ -> returns `{ angle: "unknown", confidence: 0.2 }`.
   - Synthetic frontal frames ($sw > 0.55$) -> returns `frontal`.
   - Synthetic sagittal frames ($sw < 0.4$, $hipZ > 0.08$) -> returns `sagittal`.
   - Synthetic oblique frames (score delta $< 0.12$) -> returns `oblique`.
4. **End-to-End Pipeline (`computeGaitMetrics`)**:
   - Empty/short frames ($< 5$ frames) -> returns `emptyMetrics` with default values.
   - Clean synthetic walking clip -> verifies event detection fallback, cadence, $SA$, $HR$, and composite score generation.

---

### 4. Clinical Rating Engine & 5-Band Classifications (`ratings.ts`)
#### Algorithmic Mechanism
- 5 Rating Bands:
  - `strong`: score $\ge 80$
  - `good`: score $65 - 79$
  - `fair`: score $50 - 64$
  - `watch`: score $35 - 49$
  - `elevated`: score $< 35$
- `bandFromBurden(burden01)`: favorability = $\text{clamp}(100 - burden01 \times 100, 0, 100)$, then maps to rating band.
- `starsFromScore(score)`: $\text{clamp}(\text{round}(score / 20), 1, 5)$.
- `dataQualityScore(m, analyzedFrames)`: Base score 70; adjusts based on clip duration ($\ge 8\text{s} \to +8$, $< 4\text{s} \to -12$), step count ($\ge 8 \to +10$, $< 4 \to -15$), frame count, view angle/confidence, sample rate ($< 6\text{ fps} \to -8$). Clamped to $[8, 98]$.
- 18 Metric Ratings: `cadence`, `symmetryAngle`, `harmonicRatio`, `zeniStance`, `stepTimeCV`, `strideTimeCV`, `stepAsym`, `strideAsym`, `sway`, `bounce`, `stepWidth`, `pelvic`, `armL`, `armR`, `kneeL`, `kneeR`, `smooth`, `ds`.

#### Missing Test Cases for `ratings.test.ts`
1. **5-Band Rating Classification (`bandFromScore`)**:
   - Test scores at boundary values: 85 (`strong`), 80 (`strong`), 79 (`good`), 65 (`good`), 64 (`fair`), 50 (`fair`), 49 (`watch`), 35 (`watch`), 34 (`elevated`), 0 (`elevated`).
2. **Burden Rating & Star Calculations (`bandFromBurden` & `starsFromScore`)**:
   - Verify burden inversion (e.g. burden 0.1 -> favorability 90 -> `strong`, burden 0.8 -> favorability 20 -> `elevated`).
   - Verify star ratings: score 100 -> 5 stars, score 80 -> 4 stars, score 60 -> 3 stars, score 40 -> 2 stars, score 10 -> 1 star.
3. **Data Quality Rating (`dataQualityScore`)**:
   - Long clip ($\ge 8$s, $\ge 8$ steps, $\ge 40$ frames, high confidence sagittal) -> score $\ge 85$.
   - Short/noisy clip ($< 4$s, $< 4$ steps, low FPS) -> penalties applied, score $< 50$, quality notes populated.
4. **18 Metric Ratings Favorability & Clamping**:
   - Verify all 18 metric ratings in `buildStructuredReport` produce favorability strictly within $[0, 100]$ and valid `band` labels.
5. **Dual-Task Structured Report Inclusion**:
   - Report generated with `dualTaskCost` -> includes `dualTask` payload with cost, band, stars, and blurb.
   - Report generated without `dualTaskCost` -> `dualTask` field is `undefined`.

---

### 5. Rule-Based Guesses Engine (`guesses.ts`)
#### Algorithmic Mechanism
- Generates array of `EducatedGuess` objects based on non-diagnostic observation rules.
- 28 Rule Identifiers:
  - `view`, `context-shopping`, `bag-load`, `task-dual`, `dual-task-cost`, `zifchock-sa-deviation`, `fft-hr-dysrhythmia`, `zeni-stance-breakdown`, `cmi-classification`, `variability-high`, `variability-ok`, `stability`, `stability-ok`, `wide-base`, `asymmetry`, `symmetry-ok`, `antalgic`, `trendelenburg-ish`, `arm-swing`, `unilateral-arm`, `cautious`, `parkinsonian-soft`, `brisk`, `bounce`, `stiff-knee`, `arrhythmia`, `cognitive-adjacent`, `overall-good`.
- Severity Rank & Sorting:
  - Sorted by `severity` (`elevated` $\to 0$, `moderate` $\to 1$, `low` $\to 2$), then by `confidence` descending.
- Evidence formatting: Strings must never contain `"undefined"`, `"NaN"`, or `"null"`.

#### Missing Test Cases for `guesses.test.ts`
1. **Rule Trigger Verification**:
   - `zifchock-sa-deviation`: Triggers when `symmetryAngle > 5.0%`.
   - `fft-hr-dysrhythmia`: Triggers when `harmonicRatio < 1.8`.
   - `zeni-stance-breakdown`: Triggers when stance diff $> 6.0\%$ or double support $> 26.0\%$.
   - `cmi-classification`: Triggers when `dualTaskCost.cmiClassification != "no_interference"`.
   - `bag-load`: Triggers when `armSwingAsymmetry > 0.35`.
   - `antalgic`: Triggers when `stepTimeAsymmetry > 0.22` and `kneeAsymmetry > 0.2`.
   - `trendelenburg-ish`: Triggers when `pelvicObliquity > 0.08` and view is not sagittal.
   - `parkinsonian-soft`: Triggers on hypokinetic combination (low arm swing, low knee flex, low bounce).
   - `overall-good`: Triggers when overall score $\ge 70$ and $\le 1$ elevated/moderate guess.
2. **Evidence Formatting & Safety**:
   - Assert every generated guess's `evidence` array items contain zero `"undefined"`, `"NaN"`, or `"null"` substrings.
3. **Severity & Confidence Sorting**:
   - Assert returned array is strictly sorted with `elevated` severity first, followed by `moderate`, then `low`.
4. **DETERMINATION_LADDER Structure**:
   - Assert `DETERMINATION_LADDER` has 4 rungs (`measure`, `pattern`, `hypothesis`, `cognition`) with `can` and `cannot` arrays.

---

### 6. Session Persistence & Payload Serialization (`persistence.ts`)
#### Algorithmic Mechanism
- RPC methods built with TanStack Start `createServerFn`:
  - `saveGaitSession`: Inserts or updates (`ON CONFLICT (id) DO UPDATE SET`) session record in `gait_sessions` table. Converts `metrics` to `metrics_json`, `guesses` to `guesses_json`, `dualTaskCost` to `dual_task_json`.
  - `listGaitSessions`: Retrieves all sessions for `context.userId` ordered by `created_at DESC`.
  - `getGaitSession`: Retrieves single session by `id` for `context.userId`.
  - `deleteGaitSession`: Deletes session by `id` for `context.userId`.
- DB Schema (`migrations/0002_gait_sessions.sql`):
  - Primary key `id TEXT`, foreign key `user_id REFERENCES "user"("id") ON DELETE CASCADE`.
  - `task_mode CHECK (task_mode IN ('single', 'dual'))`.
  - Optional fields: `symmetry_angle DOUBLE PRECISION`, `harmonic_ratio DOUBLE PRECISION`, `dual_task_json JSONB`.

#### Missing Test Cases for `persistence.test.ts`
1. **JSON Payload Serialization & Deserialization**:
   - Test serializing full `GaitMetrics` (with and without optional SOTA properties like `symmetryAngle` and `harmonicRatio`) into JSON string and parsing back.
   - Test serializing `EducatedGuess[]` and `DualTaskCost` objects.
2. **RPC Server Function Specifications & Data Contracts**:
   - `saveGaitSession`: Verifies input validator data structure, default ID generation pattern (`gs_${Date.now()}_...`), default session name fallback (`"Gait Session"`), column mapping.
   - `listGaitSessions`: Verifies SQL query structure selects all mapped camelCase fields and filters by `user_id = context.userId`.
   - `getGaitSession`: Verifies single record selection and `null` return when record not found.
   - `deleteGaitSession`: Verifies deletion query targets both `id` and `user_id`.
3. **Database Schema & Constraint Verification**:
   - Verify `task_mode` enum constraint compatibility (`single`, `dual`).
   - Verify cascade delete behavior contract on user reference.

---

## Tooling & Test Runner Fix Proposals

### Current Situation
- `package.json`: `"test": "node --test 'scripts/**/*.test.mjs'"`
- Running `npm test` ignores all Vitest unit tests in `src/lib/gait/__tests__/`.
- Running `npx vitest run` without arguments fails on `scripts/*.test.mjs` files because they use `node:test` syntax.

### Recommended Fix
Update `package.json` scripts to run both test suites or configure Vitest cleanly:
```json
{
  "scripts": {
    "test": "node --test 'scripts/**/*.test.mjs' && vitest run src/lib/gait/__tests__",
    "test:unit": "vitest run src/lib/gait/__tests__",
    "test:scripts": "node --test 'scripts/**/*.test.mjs'"
  }
}
```
Or create a `vitest.config.ts` excluding `scripts/**/*.test.mjs`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/lib/gait/__tests__/**/*.test.ts"],
  },
});
```

---

## Summary of Deliverables for Implementer Agents
When Milestone 3 implementation begins, implementers should create/expand the following test files:
1. `src/lib/gait/__tests__/smoothness.test.ts` (expand from 2 to 7+ tests)
2. `src/lib/gait/__tests__/dte.test.ts` (expand from 3 to 8+ tests)
3. `src/lib/gait/__tests__/analysis.test.ts` (**NEW file**, 10+ tests covering `matchPeople`, `detectViewAngle`, `computeGaitMetrics`)
4. `src/lib/gait/__tests__/ratings.test.ts` (**NEW file**, 8+ tests covering 5 rating bands, favorabilities, data quality)
5. `src/lib/gait/__tests__/guesses.test.ts` (**NEW file**, 10+ tests covering all 28 rules, evidence safety, severity sorting)
6. `src/lib/gait/__tests__/persistence.test.ts` (**NEW file**, 6+ tests covering RPC contracts, JSON payload serialization)
7. Update `package.json` / `vitest.config.ts` so `npm test` runs all unit & integration tests cleanly with 0 failures.

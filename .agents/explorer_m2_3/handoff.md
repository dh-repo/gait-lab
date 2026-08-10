# Handoff Report — Milestone 2 Requirement R9: Gait Profile Score (GPS) & Movement Analysis Profile (MAP)

**Agent:** teamwork_preview_explorer (Explorer 3 for M2)  
**Target Requirement:** Requirement R9 (`src/lib/gait/normatives.ts` and `src/lib/gait/angles.ts`)  
**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/explorer_m2_3/`  
**Date:** 2026-08-10  

---

## 1. Observation

### 1.1 Codebase Analysis & Current State
1. **File `src/lib/gait/normatives.ts` (lines 1-466)**:
   - Currently exports `getNormativeReference`, `calculateZScore`, `erf`, `calculatePercentile`, `calculateGDI`, and `evaluateGaitNormatives`.
   - `WINTER_NORMATIVES` (lines 43-49) contains only 5 parameters: `cadenceSpm`, `stepTimeCV`, `stancePct`, `doubleSupportPct`, `kneeFlexionRom`.
   - `BOVI_NORMATIVES` (lines 56-187) contains the same 5 parameters stratified into 3 age groups: `young` (<50), `middle` (50-64), `elderly` (>=65).
   - Currently lacks Gait Profile Score (GPS) and Movement Analysis Profile (MAP) calculation functions.
   - Lacks expanded parameters: `gaitSpeed` (m/s), `stepLength` (m), `hipRom` (°), and `ankleRom` (°).
   - Lacks pediatric (`<18`) and advanced age (`75-84`, `85+`) stratification categories.

2. **File `src/lib/gait/angles.ts` (lines 1-592)**:
   - Function `computeGaitAngleAnalysis` (lines 299-591) generates 101 normalized gait cycle points (`normalizedPoints`: `JointAnglePoint[]` with `gaitCyclePct: 0..100`).
   - Function `getNormativeGaitCurves` (lines 183-272) generates Perry & Burnfield (2010) 101-point reference curves for `kneeMean`, `hipMean`, and `ankleMean`.
   - Currently does not export pelvic tilt or pelvic obliquity control curves in `NormativeRangePoint`.

3. **Requirement R9 Specification**:
   - Upgrade `src/lib/gait/normatives.ts`:
     - Compute Root Mean Square Error (RMSE) between patient joint angle curves (from `angles.ts`) and Perry & Burnfield normative curves at 101 gait cycle points.
     - **GPS**: Overall RMS angular deviation in degrees ($GPS = \sqrt{\frac{1}{N} \sum MAP_j^2}$).
     - **MAP**: Per-joint RMSE sub-scores in degrees for: pelvic tilt, hip flex/ext, knee flex/ext, ankle dorsi/plantar, pelvic obliquity (if available).
     - Expand normative parameter set to include: `gaitSpeed`, `stepLength`, `hipRom`, `ankleRom`.
     - Add pediatric (`<18`) and advanced age (`75-84`, `85+`) stratification tiers to `AgeGroupCategory` and `BOVI_NORMATIVES`.
     - Reference Baker et al. (2009).

---

## 2. Logic Chain

### 2.1 Mathematical Formulation of MAP & GPS (Baker et al. 2009)
Per Baker et al. (2009) (*The Gait Profile Score and Movement Analysis Profiles*, Gait & Posture 30(3):265-269):

1. **Movement Analysis Profile ($MAP_j$) Sub-Score**:
   For joint variable $j \in \{\text{pelvicTilt}, \text{hipFlexionExtension}, \text{kneeFlexionExtension}, \text{ankleDorsiflexionPlantarflexion}, \text{pelvicObliquity}\}$:
   Let $\theta_{\text{patient}, j}(i)$ be the patient's joint angle at gait cycle point $i \in \{0, \dots, 100\}$, and $\theta_{\text{norm}, j}(i)$ be the Perry & Burnfield normative mean angle at point $i$.
   $$MAP_j = \sqrt{ \frac{1}{101} \sum_{i=0}^{100} \left( \theta_{\text{patient}, j}(i) - \theta_{\text{norm}, j}(i) \right)^2 }$$
   - Unit: Degrees (°).
   - $MAP_j = 0.0^\circ$ indicates perfect alignment with normative mean kinematics.

2. **Gait Profile Score ($GPS$)**:
   The overall Gait Profile Score is the RMS of all available joint $MAP_j$ sub-scores:
   $$GPS = \sqrt{ \frac{1}{N_{\text{joints}}} \sum_{j=1}^{N_{\text{joints}}} (MAP_j)^2 }$$
   - Unit: Degrees (°).
   - Interpretation:
     - $GPS < 3.0^\circ$: Normal kinematic gait profile.
     - $3.0^\circ \le GPS < 5.0^\circ$: Mild kinematic gait deviation.
     - $5.0^\circ \le GPS < 8.0^\circ$: Moderate kinematic gait deviation.
     - $GPS \ge 8.0^\circ$: Severe / pathological kinematic gait deviation.

### 2.2 Stratification Tier Expansion
Update `AgeGroupCategory` from `("young" | "middle" | "elderly" | "combined")` to:
```typescript
export type AgeGroupCategory =
  | "pediatric"        // age < 18
  | "young"            // 18 <= age < 50
  | "middle"           // 50 <= age <= 64
  | "elderly"          // 65 <= age <= 74
  | "advanced_75_84"   // 75 <= age <= 84
  | "advanced_85_plus" // age >= 85
  | "combined";
```

In `getNormativeReference(paramId, age, sex)`:
```typescript
let ageGroup: AgeGroupCategory = "combined";
if (typeof age === "number" && Number.isFinite(age)) {
  if (age < 18) ageGroup = "pediatric";
  else if (age < 50) ageGroup = "young";
  else if (age <= 64) ageGroup = "middle";
  else if (age <= 74) ageGroup = "elderly";
  else if (age <= 84) ageGroup = "advanced_75_84";
  else ageGroup = "advanced_85_plus";
}
```

### 2.3 Normative Parameter Expansion
Expand parameter dictionary with literature data (Winter 2009, Bovi et al. 2011, Hollman et al. 2010):
1. `gaitSpeed`: Gait speed (m/s). Baseline: mean 1.35 m/s, SD 0.15 m/s.
2. `stepLength`: Step length (m). Baseline: mean 0.68 m, SD 0.06 m.
3. `hipRom`: Hip flexion/extension range of motion (°). Baseline: mean 42.0°, SD 4.0°.
4. `ankleRom`: Ankle dorsi/plantarflexion range of motion (°). Baseline: mean 27.0°, SD 3.5°.

---

## 3. Caveats
- **Frontal View Suppression**: When `angleAnalysis.isSuppressed === true` (e.g. frontal view recording where sagittal joint kinematics are unmeasurable), `calculateGPSAndMAP` returns `gpsScore: 0`, all `map` fields set to `null`, and `interpretation: "Unevaluated: Sagittal joint angle kinematics suppressed in frontal camera view."`.
- **Partial Joint Landmark Occlusion**: If a specific joint curve is unavailable, `calculateGPSAndMAP` computes $MAP_j$ for all valid, non-null joint curves and calculates $GPS$ over $N_{\text{joints}}$ valid joints.

---

## 4. Conclusion & Proposed Implementation

The builder agent should implement the following upgrades in `src/lib/gait/normatives.ts` and `src/lib/gait/angles.ts`.

### 4.1 Upgrades for `src/lib/gait/normatives.ts`

```typescript
// --- Add New Interfaces ---
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

// --- Expand AgeGroupCategory ---
export type AgeGroupCategory =
  | "pediatric"
  | "young"
  | "middle"
  | "elderly"
  | "advanced_75_84"
  | "advanced_85_plus"
  | "combined";

// --- Calculate GPS and MAP ---
/**
 * Calculates Gait Profile Score (GPS) & Movement Analysis Profile (MAP) per Baker et al. (2009).
 * Computes RMSE between patient joint angle curves and Perry & Burnfield normative mean curves
 * at 101 gait cycle points (0% to 100%).
 */
export function calculateGPSAndMAP(
  angleAnalysis?: GaitAngleAnalysis,
): GaitProfileScoreResult {
  const defaultResult: GaitProfileScoreResult = {
    gpsScore: 0,
    map: {
      pelvicTilt: null,
      hipFlexionExtension: null,
      kneeFlexionExtension: null,
      ankleDorsiflexionPlantarflexion: null,
      pelvicObliquity: null,
    },
    evaluatedJointCount: 0,
    interpretation: "Unevaluated: No joint angle curve data available.",
    citation: "Baker et al. (2009)",
  };

  if (
    !angleAnalysis ||
    angleAnalysis.isSuppressed ||
    !angleAnalysis.normalizedPoints ||
    angleAnalysis.normalizedPoints.length < 101
  ) {
    return defaultResult;
  }

  const patientPoints = angleAnalysis.normalizedPoints;
  const normCurves = angleAnalysis.normativeData || getNormativeGaitCurves();

  if (normCurves.length < 101) return defaultResult;

  let kneeSumSq = 0;
  let kneeCount = 0;
  let hipSumSq = 0;
  let hipCount = 0;
  let ankleSumSq = 0;
  let ankleCount = 0;
  let tiltSumSq = 0;
  let tiltCount = 0;
  let oblSumSq = 0;
  let oblCount = 0;

  for (let i = 0; i < 101; i++) {
    const pt = patientPoints[i];
    const norm = normCurves[i];

    // Knee
    const kVals: number[] = [];
    if (typeof pt.kneeAngleLeft === "number" && Number.isFinite(pt.kneeAngleLeft)) kVals.push(pt.kneeAngleLeft);
    if (typeof pt.kneeAngleRight === "number" && Number.isFinite(pt.kneeAngleRight)) kVals.push(pt.kneeAngleRight);
    if (kVals.length > 0) {
      const diff = (kVals.reduce((a, b) => a + b, 0) / kVals.length) - norm.kneeMean;
      kneeSumSq += diff * diff;
      kneeCount++;
    }

    // Hip
    const hVals: number[] = [];
    if (typeof pt.hipAngleLeft === "number" && Number.isFinite(pt.hipAngleLeft)) hVals.push(pt.hipAngleLeft);
    if (typeof pt.hipAngleRight === "number" && Number.isFinite(pt.hipAngleRight)) hVals.push(pt.hipAngleRight);
    if (hVals.length > 0) {
      const diff = (hVals.reduce((a, b) => a + b, 0) / hVals.length) - norm.hipMean;
      hipSumSq += diff * diff;
      hipCount++;
    }

    // Ankle
    const aVals: number[] = [];
    if (typeof pt.ankleAngleLeft === "number" && Number.isFinite(pt.ankleAngleLeft)) aVals.push(pt.ankleAngleLeft);
    if (typeof pt.ankleAngleRight === "number" && Number.isFinite(pt.ankleAngleRight)) aVals.push(pt.ankleAngleRight);
    if (aVals.length > 0) {
      const diff = (aVals.reduce((a, b) => a + b, 0) / aVals.length) - norm.ankleMean;
      ankleSumSq += diff * diff;
      ankleCount++;
    }

    // Pelvic Tilt (if present)
    if (typeof (pt as any).pelvicTiltAngle === "number" && Number.isFinite((pt as any).pelvicTiltAngle)) {
      const diff = (pt as any).pelvicTiltAngle - (norm.pelvicTiltMean ?? 10.0);
      tiltSumSq += diff * diff;
      tiltCount++;
    }

    // Pelvic Obliquity (if present)
    if (typeof (pt as any).pelvicObliquityAngle === "number" && Number.isFinite((pt as any).pelvicObliquityAngle)) {
      const diff = (pt as any).pelvicObliquityAngle - (norm.pelvicObliquityMean ?? 0.0);
      oblSumSq += diff * diff;
      oblCount++;
    }
  }

  const mapSubScores: MAPSubScores = {
    kneeFlexionExtension: kneeCount >= 101 ? Number(Math.sqrt(kneeSumSq / 101).toFixed(2)) : null,
    hipFlexionExtension: hipCount >= 101 ? Number(Math.sqrt(hipSumSq / 101).toFixed(2)) : null,
    ankleDorsiflexionPlantarflexion: ankleCount >= 101 ? Number(Math.sqrt(ankleSumSq / 101).toFixed(2)) : null,
    pelvicTilt: tiltCount >= 101 ? Number(Math.sqrt(tiltSumSq / 101).toFixed(2)) : null,
    pelvicObliquity: oblCount >= 101 ? Number(Math.sqrt(oblSumSq / 101).toFixed(2)) : null,
  };

  const validScores: number[] = [];
  if (mapSubScores.kneeFlexionExtension != null) validScores.push(mapSubScores.kneeFlexionExtension);
  if (mapSubScores.hipFlexionExtension != null) validScores.push(mapSubScores.hipFlexionExtension);
  if (mapSubScores.ankleDorsiflexionPlantarflexion != null) validScores.push(mapSubScores.ankleDorsiflexionPlantarflexion);
  if (mapSubScores.pelvicTilt != null) validScores.push(mapSubScores.pelvicTilt);
  if (mapSubScores.pelvicObliquity != null) validScores.push(mapSubScores.pelvicObliquity);

  if (validScores.length === 0) return defaultResult;

  const sumSq = validScores.reduce((s, val) => s + val * val, 0);
  const gpsScore = Number(Math.sqrt(sumSq / validScores.length).toFixed(2));

  let interpretation = "";
  if (gpsScore < 3.0) interpretation = "Normal normative kinematic profile (GPS < 3.0°).";
  else if (gpsScore < 5.0) interpretation = "Mild kinematic gait deviation (GPS 3.0°–5.0°).";
  else if (gpsScore < 8.0) interpretation = "Moderate kinematic gait deviation (GPS 5.0°–8.0°).";
  else interpretation = "Severe / pathological kinematic gait deviation (GPS ≥ 8.0°).";

  return {
    gpsScore,
    map: mapSubScores,
    evaluatedJointCount: validScores.length,
    interpretation,
    citation: "Baker et al. (2009)",
  };
}
```

---

## 5. Verification Method

To verify the implementation of R9, run the following commands and check the assertions:

```bash
# 1. Typecheck
npx tsc --noEmit

# 2. Run vitest test suite
npx vitest run src/lib/gait/__tests__/normatives.test.ts
```

### Verification Assertions to Include in `src/lib/gait/__tests__/normatives.test.ts`:
1. **Exact Normative Match**:
   - Feed normative mean curve into `calculateGPSAndMAP`.
   - Assert `gpsScore === 0.0`.
   - Assert `map.kneeFlexionExtension === 0.0`, `map.hipFlexionExtension === 0.0`, `map.ankleDorsiflexionPlantarflexion === 0.0`.
2. **Pathological Gait Deviation**:
   - Feed synthetic patient curve with +10° knee offset.
   - Assert `gpsScore > 5.0` and `interpretation` contains `"gait deviation"`.
3. **Age Stratification Tiers**:
   - Verify `getNormativeReference("cadenceSpm", 12)` uses `pediatric` tier.
   - Verify `getNormativeReference("cadenceSpm", 80)` uses `advanced_75_84` tier.
   - Verify `getNormativeReference("cadenceSpm", 90)` uses `advanced_85_plus` tier.
4. **Expanded Parameters**:
   - Verify `getNormativeReference("gaitSpeed")`, `getNormativeReference("stepLength")`, `getNormativeReference("hipRom")`, and `getNormativeReference("ankleRom")` return valid mean and SD ranges.

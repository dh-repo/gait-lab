# Milestone 2 Requirement R8 Detailed Investigation & Design Analysis

## Executive Summary
This document provides the complete read-only technical design and implementation blueprint for **Milestone 2 Requirement R8: Compensatory Gait Patterns in `src/lib/gait/guesses.ts`**.

Requirement R8 expands the rule-based hypothesis generation engine with **6 new compensatory gait pattern rules** and integrates **R6 Arm Swing Asymmetry (ASA)** and **R7 Trunk Sway Quantification** into both existing and new hypothesis rules. Each rule references population normative Z-scores from `src/lib/gait/normatives.ts` (Winter 2009 / Bovi et al. 2011).

---

## 1. Existing System Architecture & File Analysis

### 1.1 `src/lib/gait/guesses.ts`
- **Current Role**: Provides non-diagnostic, heuristic educated guesses for observational gait categories.
- **Entry Point**: `export function buildEducatedGuesses(m: GaitMetrics, opts?: { taskMode?: TaskMode; dualTaskCost?: DualTaskCost; patientMeta?: PatientMetaInput; age?: number; sex?: SexCategory | string; angleAnalysis?: GaitAngleAnalysis }): EducatedGuess[]`
- **Output Type**: `EducatedGuess[]` sorted by severity (`elevated` -> `moderate` -> `low`) and confidence.
- **Current Rules (310-715)**:
  - `view`: Camera perspective confidence & warnings.
  - `context-shopping`: Rear-follow indoor walk heuristic.
  - `bag-load`: One-arm swing reduction due to carried load.
  - `zifchock-sa-deviation`: Inter-limb symmetry angle deviation (>5.0%).
  - `zeni-stance-breakdown`: Kinematic stance phase duration asymmetry (>6.0%) or prolonged double support (>26.0%).
  - `cmi-classification`: Cognitive-motor interference taxonomy (Plummer & Eskes 2015).
  - `variability-high` / `variability-ok`: Step-time CV (>0.12).
  - `stability` / `stability-ok` / `wide-base`: Lateral sway index and step width.
  - `asymmetry` / `symmetry-ok` / `antalgic`: Step time, stride, and knee asymmetry.
  - `trendelenburg-ish`: 2D pelvic obliquity proxy.
  - `arm-swing` / `unilateral-arm` / `parkinsonian-soft`: Arm swing amplitude and hypokinetic clusters.
  - `cautious` / `brisk` / `bounce` / `stiff-knee` / `arrhythmia` / `gdi-severe-deviation` / `gdi-moderate-deviation` / `normative-percentile-extreme`.

### 1.2 `src/lib/gait/normatives.ts`
- **Current Role**: Provides Winter (2009) and Bovi et al. (2011) normative lookup, Z-score computation (`calculateZScore`), percentile calculation (`calculatePercentile`), and Gait Deviation Index (`calculateGDI`).
- **Required Expansion for R8**:
  - Add normative reference entries in `normatives.ts` / `normalizeParamId` for parameters:
    - `ankleDorsiflexion`: mean 10.0°, sd 3.0°
    - `stepWidth`: mean 0.16 m, sd 0.03 m
    - `pelvicObliquity`: mean 2.0°, sd 1.0°
    - `trunkLateralSway`: mean 3.0°, sd 1.2°
    - `swingLateralArc`: mean 0.04 m, sd 0.02 m

---

## 2. Detailed Specifications for 6 New Hypothesis Rules

### Rule 1: Steppage Gait (`steppage-gait`)
- **Clinical Phenomenon**: High-stepping compensatory gait secondary to ankle dorsiflexor weakness (foot drop). To clear the toes during swing phase, the patient excessively flexes the hip and knee.
- **Trigger Conditions**:
  1. Swing-phase knee flexion (or peak knee flexion ROM) > 2 SD above normative mean (`kneeFlexZ > +2.0`). Normative knee flexion: 58.0° ± 4.5° (Winter 2009). Threshold: `kneeFlexion > 67.0°`.
  2. Ankle dorsiflexion deficit: `ankleDorsiflexion < 0.0°` (plantarflexed or neutral at swing, failing positive dorsiflexion, or `ankleZ < -2.0`).
- **Data Source**: `m.kneeFlexLeft` / `m.kneeFlexRight` or `opts.angleAnalysis.metrics`, and `opts.angleAnalysis.metrics.anklePeakDorsiflexionLeft` / `Right`.
- **Rule Design**:
  ```typescript
  // --- Rule 1: Steppage Gait (Foot Drop Compensation) ---
  const maxKneeFlex = Math.max(m.kneeFlexLeft ?? 0, m.kneeFlexRight ?? 0);
  const minAnkleDorsi = Math.min(
    opts?.angleAnalysis?.metrics?.anklePeakDorsiflexionLeft ?? 10,
    opts?.angleAnalysis?.metrics?.anklePeakDorsiflexionRight ?? 10
  );
  const kneeRef = getNormativeReference("kneeFlexionRom", patientMeta?.age, patientMeta?.sex);
  const ankleRef = getNormativeReference("ankleDorsiflexion", patientMeta?.age, patientMeta?.sex);
  const kneeFlexZ = calculateZScore(maxKneeFlex, kneeRef.mean, kneeRef.sd);
  const ankleDorsiZ = calculateZScore(minAnkleDorsi, ankleRef.mean, ankleRef.sd);

  if (kneeFlexZ > 2.0 && minAnkleDorsi < 0.0) {
    guesses.push({
      id: "steppage-gait",
      title: "Steppage (High-Stepping) Compensatory Gait",
      summary: "High swing-phase knee flexion (>2 SD above norm) combined with ankle dorsiflexion deficit (foot drop). Indicates compensatory exaggerated knee lifting to enable toe clearance.",
      evidence: [
        `Peak knee flexion: ${maxKneeFlex.toFixed(1)}° (Z-score: +${kneeFlexZ.toFixed(2)} SD above norm ${kneeRef.mean.toFixed(1)}°)`,
        `Ankle dorsiflexion peak: ${minAnkleDorsi.toFixed(1)}° (deficit, Z-score: ${ankleDorsiZ.toFixed(2)} SD below norm ${ankleRef.mean.toFixed(1)}°)`,
      ],
      confidence: clamp(0.55 + (kneeFlexZ - 2.0) * 0.1, 0.55, 0.92),
      severity: kneeFlexZ > 3.0 || minAnkleDorsi < -5.0 ? "elevated" : "moderate",
      category: "pattern",
      patternTag: "steppage gait / foot drop compensation",
      alternatives: [
        "Peroneal nerve neuropathy / L5 radiculopathy",
        "Ankle plantarflexion contracture",
        "Over-compensation for ground clearance",
        "Sensorimotor foot drop",
      ],
    });
  }
  ```

---

### Rule 2: Festinating Gait (`festinating-gait`)
- **Clinical Phenomenon**: Basal ganglia dysfunction (Parkinson's disease) causing involuntary step rate acceleration combined with progressive shortening of step length ("chasing center of mass").
- **Trigger Conditions**:
  1. Positive cadence acceleration trend within walking sequence (`cadenceSlope > 0.5 spm/s`).
  2. Negative step length trend within same sequence (`stepLengthSlope < -0.01 m/s` or >15% step length reduction across sequence).
  3. Minimum step count >= 4 steps.
- **Data Source**: Linear regression over `m.series` step intervals and step distances, combined with `m.cadenceSpm`.
- **Rule Design**:
  ```typescript
  // --- Rule 2: Festinating Gait Pattern ---
  const cadenceRef = getNormativeReference("cadenceSpm", patientMeta?.age, patientMeta?.sex);
  const cadenceZ = calculateZScore(m.cadenceSpm, cadenceRef.mean, cadenceRef.sd);

  // Compute intra-bout trends from series if available
  let cadenceSlope = 0;
  let stepLengthSlope = 0;
  if (m.series && m.series.length >= 10) {
    // Linear regression of step interval delta and hip-to-ankle step distance delta over frame time t
    cadenceSlope = computeCadenceSlope(m.series);
    stepLengthSlope = computeStepLengthSlope(m.series);
  }

  if (cadenceSlope > 0.3 && stepLengthSlope < -0.008 && m.stepCount >= 4) {
    guesses.push({
      id: "festinating-gait",
      title: "Festinating Gait Pattern (Accelerating Cadence & Shortening Steps)",
      summary: "Progressive acceleration of step cadence paired with decreasing step length within the same walk bout. Characteristic of parkinsonian festination (chasing center of gravity).",
      evidence: [
        `Cadence acceleration trend: +${cadenceSlope.toFixed(1)} spm/s (observed cadence: ${m.cadenceSpm.toFixed(0)} spm, Z: +${cadenceZ.toFixed(2)} SD)`,
        `Step length reduction slope: ${stepLengthSlope.toFixed(3)} m/s across bout`,
        `Arm swing asymmetry: ${(m.armSwingAsymmetry * 100).toFixed(0)}% (reduced arm swing cluster)`,
      ],
      confidence: clamp(0.52 + Math.abs(stepLengthSlope) * 20, 0.52, 0.90),
      severity: "elevated",
      category: "neuromotor",
      patternTag: "festinating gait (parkinsonian spectrum)",
      alternatives: [
        "Parkinsonian motor festination",
        "Anxiety / forward momentum hurry",
        "Downhill grade adaptation",
        "Postural control braking loss",
      ],
    });
  }
  ```

---

### Rule 3: Scissoring Gait (`scissoring-gait`)
- **Clinical Phenomenon**: Spasticity/hypertonia of hip adductor muscles causing legs to adduct excessively and cross midline during swing phase.
- **Trigger Conditions**:
  1. Mean step width < threshold (`m.meanStepWidth < 0.08 m` or normalized step width Z-score < -2.0 SD below normative mean step width 0.16m ± 0.03m).
  2. High hip adduction angle (`hipAdduction > 6.0°` or step width crossing).
  3. View angle is not sagittal (`m.viewAngle !== "sagittal"`).
- **Data Source**: `m.meanStepWidth` and `opts.angleAnalysis.metrics.hipAdduction` or `m.hipAdduction`.
- **Rule Design**:
  ```typescript
  // --- Rule 3: Scissoring Gait Pattern ---
  if (m.meanStepWidth != null && m.viewAngle !== "sagittal") {
    const stepWidthRef = getNormativeReference("stepWidth", patientMeta?.age, patientMeta?.sex);
    const stepWidthZ = calculateZScore(m.meanStepWidth, stepWidthRef.mean, stepWidthRef.sd);

    if (stepWidthZ < -2.0 || m.meanStepWidth < 0.08) {
      guesses.push({
        id: "scissoring-gait",
        title: "Scissoring Gait Pattern (Adductor Spasticity / Midline Crossing)",
        summary: "Extremely narrow or crossing step width (>2 SD below norm) combined with elevated hip adduction. Suggests hip adductor hypertonia or spastic diplegic pattern.",
        evidence: [
          `Mean step width: ${m.meanStepWidth.toFixed(3)} m (Z-score: ${stepWidthZ.toFixed(2)} SD below norm ${stepWidthRef.mean.toFixed(2)} m)`,
          `Detected view: ${m.viewAngle}`,
        ],
        confidence: clamp(0.55 + Math.abs(stepWidthZ) * 0.1, 0.55, 0.90),
        severity: m.meanStepWidth < 0.04 ? "elevated" : "moderate",
        category: "pattern",
        patternTag: "scissoring gait / adductor spasticity",
        alternatives: [
          "Spastic diplegia / paraparesis",
          "Severe hip adductor hypertonia",
          "Tightrope walking balance habit",
          "Camera foreshortening perspective",
        ],
      });
    }
  }
  ```

---

### Rule 4: Waddling Gait (`waddling-gait`)
- **Clinical Phenomenon**: Bilateral weakness of proximal pelvic girdle muscles (myopathic gait) causing marked pelvic obliquity (>8°) and excessive lateral trunk sway (>2 SD).
- **Trigger Conditions**:
  1. Pelvic obliquity excursion > 8.0° (`m.pelvicObliquity > 0.14 rad` or `pelvicObliquityDeg > 8.0°`).
  2. Trunk lateral sway excursion > 2 SD above normative mean (`trunkSwayZ > +2.0`). Normative trunk sway: 3.0° ± 1.2°. Threshold: `trunkSwayDeg > 5.4°`.
  3. View angle is non-sagittal (`m.viewAngle !== "sagittal"`).
- **Data Source**: `m.pelvicObliquity` and `m.trunkSwayLateralDeg` (R7).
- **Rule Design**:
  ```typescript
  // --- Rule 4: Waddling Gait Pattern ---
  if (m.pelvicObliquity != null && m.viewAngle !== "sagittal") {
    const pelvicObliquityDeg = m.pelvicObliquity * 57.2958;
    const trunkSwayDeg = m.trunkSwayLateralDeg ?? (m.lateralSway ? m.lateralSway * 60 : 3.0);
    const trunkSwayRef = getNormativeReference("trunkLateralSway", patientMeta?.age, patientMeta?.sex);
    const trunkSwayZ = calculateZScore(trunkSwayDeg, trunkSwayRef.mean, trunkSwayRef.sd);

    if (pelvicObliquityDeg > 8.0 && trunkSwayZ > 2.0) {
      guesses.push({
        id: "waddling-gait",
        title: "Waddling Gait Pattern (Bilateral Pelvic & Trunk Sway)",
        summary: "Marked pelvic obliquity (>8°) combined with excessive lateral trunk sway (>2 SD). Indicates proximal pelvic girdle muscle weakness (myopathic pattern).",
        evidence: [
          `Pelvic obliquity excursion: ${pelvicObliquityDeg.toFixed(1)}° (threshold: >8.0°)`,
          `Trunk lateral sway excursion: ${trunkSwayDeg.toFixed(1)}° (Z-score: +${trunkSwayZ.toFixed(2)} SD above norm ${trunkSwayRef.mean.toFixed(1)}°)`,
          ...(m.trunkHarmonicRatio != null ? [`Trunk Harmonic Ratio: ${m.trunkHarmonicRatio.toFixed(2)}`] : []),
        ],
        confidence: clamp(0.60 + (pelvicObliquityDeg - 8.0) * 0.03, 0.60, 0.92),
        severity: "elevated",
        category: "pattern",
        patternTag: "waddling gait (myopathic spectrum)",
        alternatives: [
          "Bilateral gluteal weakness / myopathy",
          "Pregnancy pelvic mobility change",
          "Obesity / wide body habitus sway",
          "Symmetric trunk balance compensation",
        ],
      });
    }
  }
  ```

---

### Rule 5: Trendelenburg Sign (`trendelenburg-sign`)
- **Clinical Phenomenon**: Gluteus medius weakness on stance limb causes contralateral pelvic drop > 5° during single-leg stance phase.
- **Trigger Conditions**:
  1. Contralateral pelvic drop > 5.0° during single-leg stance phase (`pelvicDropDeg > 5.0°`).
  2. Pelvic drop Z-score > 2.0 SD above normative baseline (normative drop < 2.0°).
  3. View angle is non-sagittal (`m.viewAngle !== "sagittal"`).
- **Data Source**: Stance-segmented pelvic obliquity in `m.pelvicObliquity` or `m.series`.
- **Rule Design**:
  ```typescript
  // --- Rule 5: Trendelenburg Sign ---
  if (m.pelvicObliquity != null && m.viewAngle !== "sagittal") {
    const stancePelvicDropDeg = m.pelvicObliquity * 57.2958;
    const pelvicRef = getNormativeReference("pelvicObliquity", patientMeta?.age, patientMeta?.sex);
    const dropZ = calculateZScore(stancePelvicDropDeg, pelvicRef.mean, pelvicRef.sd);

    if (stancePelvicDropDeg > 5.0 && dropZ > 2.0) {
      guesses.push({
        id: "trendelenburg-sign",
        title: "Trendelenburg Sign (Contralateral Pelvic Drop)",
        summary: "Unilateral contralateral pelvic drop >5° during single-leg stance phase. Indicates gluteus medius weakness or hip abductor insufficiency on the stance limb.",
        evidence: [
          `Contralateral pelvic drop: ${stancePelvicDropDeg.toFixed(1)}° (threshold: >5.0° during stance)`,
          `Pelvic drop Z-score: +${dropZ.toFixed(2)} SD above norm ${pelvicRef.mean.toFixed(1)}° ± ${pelvicRef.sd.toFixed(1)}°`,
          ...(m.trunkSwayLateralDeg != null ? [`Compensatory trunk tilt: ${m.trunkSwayLateralDeg.toFixed(1)}° (Duchenne sway)`] : []),
        ],
        confidence: clamp(0.58 + (stancePelvicDropDeg - 5.0) * 0.04, 0.58, 0.88),
        severity: stancePelvicDropDeg > 8.0 ? "elevated" : "moderate",
        category: "pattern",
        patternTag: "Trendelenburg sign / hip abductor weakness",
        alternatives: [
          "Gluteus medius muscle weakness",
          "L5 radiculopathy",
          "Superior gluteal nerve lesion",
          "Coxa vara / hip joint instability",
        ],
      });
    }
  }
  ```

---

### Rule 6: Circumduction Gait (`circumduction-gait`)
- **Clinical Phenomenon**: Leg arcs outward in a lateral trajectory during swing phase to advance the foot, compensating for loss of knee flexion, hip flexion, or ankle dorsiflexion.
- **Trigger Conditions**:
  1. Swing phase lateral foot arc > threshold (`swingLateralArc > 0.12 m` or `arcZ > +2.5 SD` above straight swing trajectory).
- **Data Source**: Ankle lateral excursion relative to hip trajectory in `m.series` during swing frames.
- **Rule Design**:
  ```typescript
  // --- Rule 6: Circumduction Gait Pattern ---
  let maxSwingArcM = 0;
  if (m.series && m.series.length >= 6) {
    maxSwingArcM = computeSwingLateralArc(m.series);
  }
  const arcRef = getNormativeReference("swingLateralArc", patientMeta?.age, patientMeta?.sex);
  const arcZ = calculateZScore(maxSwingArcM, arcRef.mean, arcRef.sd);

  if (maxSwingArcM > 0.12 || arcZ > 2.5) {
    guesses.push({
      id: "circumduction-gait",
      title: "Circumduction Compensatory Gait (Swing Lateral Arc)",
      summary: "Excessive lateral foot trajectory arc during swing phase exceeding threshold (>2.5 SD). Compensatory mechanism for stiff knee, hip flexor weakness, or foot drop.",
      evidence: [
        `Swing lateral arc excursion: ${maxSwingArcM.toFixed(3)} m (threshold: >0.12 m, Z-score: +${arcZ.toFixed(2)} SD)`,
        `Arm swing asymmetry: ${(m.armSwingAsymmetry * 100).toFixed(0)}%`,
      ],
      confidence: clamp(0.55 + (maxSwingArcM - 0.12) * 2.5, 0.55, 0.90),
      severity: maxSwingArcM > 0.18 ? "elevated" : "moderate",
      category: "pattern",
      patternTag: "circumduction gait / swing lateral compensation",
      alternatives: [
        "Hemiplegic post-stroke gait",
        "Stiff knee gait",
        "Hip hiker / pelvic elevation compensation",
        "Foot drop clearance",
      ],
    });
  }
  ```

---

## 3. Integration of R6 Arm Swing Asymmetry & R7 Trunk Sway

### 3.1 Existing Rule Upgrades in `src/lib/gait/guesses.ts`

1. **`arm-swing` / `unilateral-arm` / `bag-load` / `parkinsonian-soft`**:
   - Incorporate `armSwingAsymmetry` (ASA %), arm swing peak-to-peak amplitudes, and phase correlation between arm swing and contralateral leg.
   - Upgrade evidence lines to cite exact ASA % and phase correlation.

2. **`stability` / `wide-base`**:
   - Replace/augment crude `lateralSway` proxy with R7 `trunkSwayLateralDeg`, `trunkSwaySagittalDeg`, and `trunkHarmonicRatio`.
   - Evidence line: `Trunk lateral excursion: ${trunkSwayLateralDeg.toFixed(1)}° (Z-score: +${swayZ.toFixed(2)}), Harmonic Ratio: ${harmonicRatio.toFixed(2)}`.

3. **`antalgic`**:
   - Incorporate trunk lateral tilt toward stance leg.

---

## 4. Test Specifications & Verification Plan

### 4.1 Unit Test Expansion in `src/lib/gait/__tests__/guesses.test.ts`
Add dedicated test cases for each of the 6 new compensatory hypothesis rules:
1. `it("triggers steppage-gait when knee flexion Z > 2 SD and ankle dorsiflexion deficit < 0°")`
2. `it("triggers festinating-gait when cadence accelerates and step length decreases within bout")`
3. `it("triggers scissoring-gait when step width Z < -2 SD and hip adduction is high in frontal view")`
4. `it("triggers waddling-gait when pelvic obliquity > 8° and trunk lateral sway Z > 2 SD")`
5. `it("triggers trendelenburg-sign when contralateral pelvic drop > 5° during single-leg stance")`
6. `it("triggers circumduction-gait when swing foot lateral arc > 0.12m (Z > 2.5 SD)")`
7. `it("integrates arm swing ASA (R6) and trunk sway (R7) into existing and new hypothesis rules without NaN/undefined")`

### 4.2 Verification Commands
- `npx vitest run` (100% pass rate across all tests)
- `npx tsc --noEmit` (0 TypeScript errors)


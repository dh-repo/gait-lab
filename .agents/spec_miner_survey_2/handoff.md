# Handoff Report: Spec Miner Survey 2 — Dual Fall Risk & Acute Weakness Engine

- **Sender**: Spec Miner Survey 2
- **Recipient**: Parent Orchestrator (`b181ee99-96ae-46a9-b7f3-e111c8eac369`)
- **Date**: 2026-08-09
- **Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/spec_miner_survey_2`
- **Primary Deliverable**: `/Users/damian/GitHub/gait-lab/.agents/spec_miner_survey_2/analysis.md`

---

## 1. Observation

1. **Original Request & Requirements**:
   - `ORIGINAL_REQUEST.md` (lines 154-167):
     > "1. R1: Dual Fall Risk Predictive Modeling Engine
     > - Model A (CDC STEADI / Tinetti Clinical Cutoffs): Gait speed <0.8 m/s, step time CV >6%, double support time >35%, Zifchock symmetry angle thresholds.
     > - Model B (Dynamic Multi-Factor Composite Index): 0–100 weighted score combining joint kinematic trajectories, trunk sway amplitude, dual-task cost (DTE), spatio-temporal variability.
     > - Model comparison toggles & predictive agreement metrics for clinicians.
     > 2. R2: Acute Neuromuscular & Metabolic Weakness Anomaly Detector
     > - Longitudinal baseline tracking to detect sudden motor weakness.
     > - Automatically compare current session gait parameters against historical patient baselines.
     > - Flag acute deterioration spikes (>20% drop in gait speed, sudden increase in lateral trunk sway, step irregularity) characteristic of acute systemic conditions (UTI, dehydration, sepsis, metabolic disturbance).
     > - Diagnostic clinical warning cards with differential flags & provider recommendations."

2. **Existing Codebase Architecture**:
   - `src/lib/gait/types.ts`: Defines `GaitMetrics` (lines 48-111), `EducatedGuess` (lines 126-137), `DualTaskCost` (lines 139-150), `AnalysisResult` (lines 152-162).
   - `src/lib/gait/persistence.ts`: Defines `GaitSessionRecord` (lines 7-36), `listGaitSessions` (lines 104-124), `getGaitSession` (lines 127-147).
   - `scientific_justifications.md`: Documents validated signal processing pipeline ($f_c=6\text{ Hz}$ Butterworth LPF, Zeni AP foot displacement event detection, Zifchock $SA$, Plummer & Eskes CMI taxonomy, Bland-Altman split-half bounds).

---

## 2. Logic Chain

1. **Observation 1** establishes the user requirements for R1 (Dual Fall Risk Engine) and R2 (Acute Weakness Detector).
2. **Observation 2** establishes that `gait-lab` already computes fundamental spatio-temporal gait metrics (`gaitSpeed`, `stepTimeCV`, `doubleSupportPct`, `symmetryAngle`, `lateralSway`, `kneeFlexLeft`, etc.) and persists historical sessions in PostgreSQL via `persistence.ts`.
3. Connecting **Observation 1** and **Observation 2**, R1 can be modeled by constructing two complementary fall risk sub-engines:
   - **Model A**: A rule-based assessment that evaluates CDC STEADI / Tinetti clinical cutoffs ($V_{\text{gait}} < 0.80\text{ m/s}$, $\text{CV}_{\text{step}} > 6.0\%$, $\text{DST}\% > 35.0\%$, $SA > 5.0\%$) and maps them to a STEADI risk category (`low`, `moderate`, `high`).
   - **Model B**: A 0–100 weighted multi-domain index ($0.30 S_{\text{Kinematics}} + 0.25 S_{\text{TrunkSway}} + 0.25 S_{\text{DTE}} + 0.20 S_{\text{Variability}}$) providing continuous, multi-factorial risk quantification.
   - **Predictive Agreement**: Cohen's Kappa ($\kappa = \frac{P_o - P_e}{1 - P_e}$) and percentage agreement ($P_a$) evaluate inter-model reliability and flag model divergence (`concordant`, `mild_divergence`, `stark_divergence`).
4. Connecting **Observation 1** and **Observation 2** for R2, acute weakness detection requires:
   - Calculating historical baseline statistics ($\mu_{\text{base}}, \sigma_{\text{base}}$) across a patient's prior sessions ($K \ge 2$).
   - Evaluating 5 acute deterioration spike rules:
     - `SPEED_DROP_ACUTE`: $>20.0\%$ speed collapse
     - `SWAY_SPIKE_ACUTE`: $>30.0\%$ lateral trunk sway increase
     - `IRREGULARITY_BURST_ACUTE`: $>50.0\%$ step time CV jump (absolute $\text{CV} > 7.0\%$)
     - `DOUBLE_SUPPORT_ESCALATION`: $>25.0\%$ double support escalation (absolute $\text{DST} > 35.0\%$)
     - `ASYMMETRY_SPIKE_ACUTE`: $>4.0\%$ percentage point asymmetry jump
   - Generating provider-facing **Clinical Warning Cards** with differential diagnosis flags (UTI, dehydration, sepsis, metabolic disturbance, medication toxicity, acute stroke/TIA) and actionable clinical recommendations.
5. Synthesizing these logical inferences produces the complete specification documented in `analysis.md` and the TypeScript type definitions for implementers.

---

## 3. Caveats

1. **Single-Task Mode Weight Re-normalization**: When recordings are made in single-task mode (where no dual-task cognitive challenge is performed), the DTE component $S_{\text{DTE}}$ cannot be computed. The specification re-normalizes the remaining three domain weights ($0.40 S_{\text{Kinematics}} + 0.33 S_{\text{TrunkSway}} + 0.27 S_{\text{Variability}}$) so Model B remains valid.
2. **Camera View Metric Suppression**: Frontal camera view suppresses knee and hip flexion joint angles to prevent 2D projection foreshortening artifacts. The specification defines fallbacks for $S_{\text{Kinematics}}$ using pelvic obliquity variance and vertical bounce amplitude.
3. **Initial Patient Baseline Confidence**: Patients with only 1 prior recorded session ($K=1$) have low baseline statistical power. The baseline engine flags `isLowConfidenceBaseline = true` and blends the patient's baseline variance with population normative standard deviations until $K \ge 3$ sessions are acquired.

---

## 4. Conclusion

The specification mining for R1 (Dual Fall Risk Engine) and R2 (Acute Weakness Detector) is **100% complete**. All mathematical formulas, clinical cutoff thresholds, score weighting structures, anomaly detection rules, Cohen's Kappa formulas, clinical warning card schemas, literature citations, and TypeScript type signatures have been derived and written to `/Users/damian/GitHub/gait-lab/.agents/spec_miner_survey_2/analysis.md`.

---

## 5. Verification Method

To independently verify the outputs of this mining survey:
1. **Inspect Analysis Report**: View `/Users/damian/GitHub/gait-lab/.agents/spec_miner_survey_2/analysis.md` to confirm all equations, clinical cutoffs, weights, anomaly rules, Cohen's Kappa, and TypeScript signatures match `ORIGINAL_REQUEST.md`.
2. **Type Safety & Build Verification**:
   - Run `npm run typecheck` to confirm zero TypeScript compilation errors.
   - Run `npm test` to verify all existing unit and integration test suites pass 100%.
   - Run `npm run lint` to verify zero ESLint errors or warnings.
   - Run `npm run build` to confirm production build succeeds cleanly.

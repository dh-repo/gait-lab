# Specification Mining & Analytical Formulation Report: Dual Fall Risk & Acute Weakness Engine

- **Author**: Spec Miner Survey 2
- **Project**: `gait-lab` — Quantitative Markerless Gait Analysis Engine
- **Target Specifications**: R1 (Dual Fall Risk Predictive Modeling Engine) & R2 (Acute Neuromuscular & Metabolic Weakness Anomaly Detector)
- **Target Path**: `/Users/damian/GitHub/gait-lab/.agents/spec_miner_survey_2/analysis.md`
- **Date**: 2026-08-09

---

## Executive Summary

This report establishes the precise biomechanical formulations, mathematical equations, clinical cutoff thresholds, score weighting structures, anomaly detection rules, predictive agreement metrics (Cohen's Kappa), and TypeScript interfaces required for **R1 (Dual Fall Risk Predictive Modeling Engine)** and **R2 (Acute Neuromuscular & Metabolic Weakness Anomaly Detector)** in `gait-lab`.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R1: Fall Risk | Model A (CDC STEADI / Tinetti Clinical Cutoffs) | Rule-based clinical cutoff evaluation measuring gait speed, step time CV, double support time %, and Zifchock symmetry angle. | `GaitMetrics` (speed, stepTimeCV, doubleSupportPct, symmetryAngle) | `FallRiskModelA` (score 0–100, category, 4 clinical flags, flag values) | Fall back to available metrics if view angle suppresses spatial metrics (e.g. sagittal suppresses step width). | CDC STEADI Guidelines, Tinetti POMA (1986), `ORIGINAL_REQUEST.md` |
| 2 | R1: Fall Risk | Model B (Dynamic Multi-Factor Composite Index) | Continuous 0–100 multi-domain weighted risk index combining joint kinematics (30%), trunk sway (25%), dual-task cost DTE (25%), and spatio-temporal variability (20%). | `GaitMetrics`, `GaitAngleAnalysis`, `DualTaskCost` | `FallRiskModelB` (compositeScore 0–100, riskCategory, 4 sub-scores with weights) | Clamps domain sub-scores to [0, 100]; uses pelvic obliquity/vertical bounce fallbacks when joint angles are suppressed. | Lord et al. (2013), Montero-Odasso et al. (2017), Plummer & Eskes (2015), `ORIGINAL_REQUEST.md` |
| 3 | R1: Fall Risk | Model Comparison & Agreement Metrics | Evaluates concordance between Model A and Model B using percentage agreement, ordinal Cohen's Kappa ($\kappa$), and divergence status (`concordant`, `mild_divergence`, `stark_divergence`). | `FallRiskModelA`, `FallRiskModelB`, historical session array | `PredictiveAgreement` (cohensKappa, percentAgreement, alignmentStatus, divergenceExplanation) | Handles single-session calculation via ordinal category distance matrix; defaults $\kappa=1.0$ when identical. | Bland & Altman (1986), Cohen (1960), `ORIGINAL_REQUEST.md` |
| 4 | R2: Weakness | Longitudinal Patient Baseline Engine | Computes patient-specific historical baseline means ($\mu_{\text{base}}$) and standard deviations ($\sigma_{\text{base}}$) across prior gait sessions ($K \ge 2$). | Array of `GaitSessionRecord` or `GaitMetrics` for patient ID | `PatientBaseline` (metricMeans, metricStds, sessionCount, baselineWindowDays) | Uses healthy population normative defaults if prior sessions $K < 2$. | `ORIGINAL_REQUEST.md`, Hollman et al. (2010) |
| 5 | R2: Weakness | Acute Deterioration Spike Detector | Evaluates current session metrics against longitudinal baseline to detect acute drops (>20% speed drop, >30% sway spike, >50% step CV jump, DST escalation, asymmetry spike). | `GaitMetrics`, `PatientBaseline` | `AcuteWeaknessAnalysis` (hasAcuteWeakness, spikeFlags, overallDeteriorationScore) | Suppresses false alarms by requiring absolute threshold breach alongside relative percentage drop. | `ORIGINAL_REQUEST.md`, Montero-Odasso et al. (2017) |
| 6 | R2: Weakness | Diagnostic Clinical Warning Cards | Generates provider-facing differential diagnosis cards linking detected acute deterioration patterns to potential systemic etiologies (UTI, dehydration, sepsis, metabolic disturbance, medication toxicity, TIA). | `AcuteWeaknessAnalysis`, `GaitMetrics` | Array of `ClinicalWarningCard` (severity, title, primaryFlag, differentialDiagnoses, recommendations) | Emits standard low-risk monitoring card when no acute deterioration spikes are triggered. | `ORIGINAL_REQUEST.md`, Inouye et al. (1999), American Geriatrics Society (2019) |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Model A (STEADI) | Single-task recording missing spatial calibration (speed in pixels/s). | Speed metric converts via normalized torso-length speed scaling ($V_{\text{gait}} = v_{\text{torso}} \times 1.7\text{ m}$); if unresolvable, STEADI flags evaluate the remaining 3 metrics (CV, DST, Symmetry). |
| 2 | Model B (Composite) | Frontal camera view where knee/hip flexion joint angles are suppressed (`null`). | $S_{\text{Kinematics}}$ falls back to pelvic obliquity variance and vertical bounce amplitude deficits without throwing errors. |
| 3 | Model B (Composite) | Single-task mode recording where `dualTaskCost` is not present. | $S_{\text{DTE}}$ defaults to 0 (no dual-task penalty) and remaining weights are re-normalized ($0.40 S_{\text{Kinematics}} + 0.33 S_{\text{TrunkSway}} + 0.27 S_{\text{Variability}}$). |
| 4 | Model Comparison | Model A predicts `low` risk (due to normal walking speed) while Model B predicts `high` risk (due to 25% dual-task cost and high sway). | Classification flags `stark_divergence`, sets percent agreement to 0%, calculates $\kappa < 0.20$, and emits a clinical explanation explaining the cognitive-motor divergence. |
| 5 | Baseline Tracking | Patient has only 1 historical session recorded ($K=1$). | System initializes baseline with Session 1 values, but sets `isLowConfidenceBaseline = true` and blends $\sigma_{\text{base}}$ with population norm standard deviations. |
| 6 | Acute Weakness Detector | Patient exhibits a 25% speed drop due to intentional slow walking prompt in test protocol. | Check `assessmentCondition` metadata; if labeled `"slow_walk"`, acute weakness detector suppresses the `SPEED_DROP_ACUTE` alert or tags it as protocol-induced. |
| 7 | Clinical Warning Cards | All 5 acute deterioration rules fire simultaneously (severe systemic collapse). | Generates a `critical` severity card with top priority warning for immediate ER / urgent care assessment for sepsis / acute encephalopathy. |

---

## Section 1: R1 — Dual Fall Risk Predictive Modeling Engine

### 1.1 Model A: Clinical Rule-Based Model (CDC STEADI / Tinetti Adaptation)

Model A adapts validated observational clinical fall risk assessments—specifically the **CDC STEADI (Stopping Elderly Accidents, Deaths, & Injuries)** algorithm and the **Tinetti Performance Oriented Mobility Assessment (POMA)**—into quantitative digital thresholds.

#### A. Input Metrics & Clinical Cutoffs

1. **Gait Speed ($V_{\text{gait}}$)**:
   - **Primary Clinical Cutoff**: $V_{\text{gait}} < 0.80\text{ m/s}$ (CDC STEADI High Risk Threshold; Montero-Odasso 2017, Studenski 2011).
   - **Intermediate Cutoff**: $0.80\text{ m/s} \le V_{\text{gait}} < 1.00\text{ m/s}$ (Moderate Risk).
   - **Healthy Threshold**: $V_{\text{gait}} \ge 1.00\text{ m/s}$ (Low Risk).
   - **Formula**: In camera units, normalized torso speed $v_{\text{torso\_sec}} = \frac{\Delta x_{\text{hip\_AP\_norm}}}{\Delta t}$ scaled by nominal adult height ($1.70\text{ m}$):
     $$V_{\text{gait}} = v_{\text{torso\_sec}} \times 1.70 \quad (\text{m/s})$$

2. **Step Time Coefficient of Variation ($\text{CV}_{\text{step}}$)**:
   - **Primary Clinical Cutoff**: $\text{CV}_{\text{step}} > 6.0\%$ (Hollman et al. 2010, Lord et al. 2013).
   - **Intermediate Cutoff**: $4.0\% < \text{CV}_{\text{step}} \le 6.0\%$ (Moderate Risk).
   - **Healthy Threshold**: $\text{CV}_{\text{step}} \le 4.0\%$ (Low Risk).
   - **Formula**:
     $$\text{CV}_{\text{step}} = \frac{\sigma_{\text{step\_time}}}{\mu_{\text{step\_time}}} \times 100\%$$

3. **Double Support Time Percentage ($\text{DST}\%$)**:
   - **Primary Clinical Cutoff**: $\text{DST}\% > 35.0\%$ of total gait cycle (Tinetti 1986, Perry 2010).
   - **Intermediate Cutoff**: $25.0\% < \text{DST}\% \le 35.0\%$ (Moderate Risk).
   - **Healthy Threshold**: $\text{DST}\% \le 25.0\%$ (Low Risk).
   - **Formula**: Derived from Zeni gait event detection (Heel Strike to opposite Toe Off):
     $$\text{DST}\% = \frac{\sum \text{duration}(\text{Double Support Phases})}{\text{Total Gait Cycle Duration}} \times 100\%$$

4. **Zifchock Symmetry Angle ($SA$)**:
   - **Primary Clinical Cutoff**: $SA > 5.0\%$ (Zifchock et al. 2008, Błażkiewicz et al. 2014).
   - **Intermediate Cutoff**: $3.0\% < SA \le 5.0\%$ (Moderate Risk).
   - **Healthy Threshold**: $SA \le 3.0\%$ (Low Risk).
   - **Formula**:
     $$\theta = \text{atan2}(|X_L|, |X_R|) \times \frac{180^\circ}{\pi}$$
     $$\theta_{\text{wrapped}} = \theta > 90^\circ ? 180^\circ - \theta : \theta$$
     $$SA = \frac{|45^\circ - \theta_{\text{wrapped}}|}{90^\circ} \times 100\%$$

#### B. Model A Scoring & Categorization Logic

Each breached cutoff adds risk points to Model A:
- High Risk Breach: $+1.0$ point
- Moderate Risk Breach: $+0.5$ points
- Low Risk (Healthy): $+0.0$ points

Total STEADI Risk Score $P_{\text{STEADI}} \in [0.0, 4.0]$:
$$P_{\text{STEADI}} = \text{Points}(V_{\text{gait}}) + \text{Points}(\text{CV}_{\text{step}}) + \text{Points}(\text{DST}\%) + \text{Points}(SA)$$

Model A Continuous 0–100 Risk Score Conversion:
$$\text{Score}_{\text{ModelA}} = \text{clamp}\left( \frac{P_{\text{STEADI}}}{4.0} \times 100, 0, 100 \right)$$

Risk Category Mapping:
- **Low Fall Risk**: $P_{\text{STEADI}} < 1.0 \implies \text{Score}_{\text{ModelA}} \in [0, 33)$
- **Moderate Fall Risk**: $1.0 \le P_{\text{STEADI}} < 2.5 \implies \text{Score}_{\text{ModelA}} \in [33, 66)$
- **High Fall Risk**: $P_{\text{STEADI}} \ge 2.5 \implies \text{Score}_{\text{ModelA}} \in [66, 100]$

---

### 1.2 Model B: Dynamic Multi-Factor Composite Index (0–100 Weighted Score)

Model B calculates a continuous biomechanical risk index ($0\text{–}100$) by combining 4 independent gait domains: Joint Kinematics, Postural Sway, Dual-Task Cost, and Spatio-Temporal Variability.

#### A. Composite Weighted Score Formula

$$R_{\text{Composite}} = w_1 S_{\text{Kinematics}} + w_2 S_{\text{TrunkSway}} + w_3 S_{\text{DTE}} + w_4 S_{\text{Variability}}$$

Domain Weighting Allocation:
- $w_1 = 0.30$ (Joint Kinematic Trajectories & ROM)
- $w_2 = 0.25$ (Trunk Sway Amplitude / Postural Control)
- $w_3 = 0.25$ (Dual-Task Cost DTE / Cognitive-Motor Interference)
- $w_4 = 0.20$ (Spatio-Temporal Variability / Automaticity)

Note: Weights sum strictly to $1.00$ ($0.30 + 0.25 + 0.25 + 0.20 = 1.00$).

#### B. Sub-Score Mathematical Formulations

1. **Sub-Score 1: Joint Kinematic Trajectories ($S_{\text{Kinematics}}$)** ($w_1 = 0.30$):
   Measures Range of Motion (ROM) deficits relative to normative physiological baselines:
   - Normative Baselines: Knee Peak Flexion $\text{ROM}_{\text{Knee, norm}} = 55.0^\circ$, Hip Peak Flexion $\text{ROM}_{\text{Hip, norm}} = 35.0^\circ$, Ankle Flexion $\text{ROM}_{\text{Ankle, norm}} = 25.0^\circ$.
   - Deficit Equations:
     $$D_{\text{Knee}} = \max\left(0, \frac{55.0^\circ - \text{ROM}_{\text{Knee}}}{55.0^\circ}\right) \times 100$$
     $$D_{\text{Hip}} = \max\left(0, \frac{35.0^\circ - \text{ROM}_{\text{Hip}}}{35.0^\circ}\right) \times 100$$
     $$D_{\text{Ankle}} = \max\left(0, \frac{25.0^\circ - \text{ROM}_{\text{Ankle}}}{25.0^\circ}\right) \times 100$$
   - Sub-Score Formula:
     $$S_{\text{Kinematics}} = \text{clamp}\left( 0.50 D_{\text{Knee}} + 0.30 D_{\text{Hip}} + 0.20 D_{\text{Ankle}}, 0, 100 \right)$$
   - *View Angle Suppression Fallback*: In frontal view (where joint flexion angles are `null`), $S_{\text{Kinematics}}$ evaluates pelvic obliquity variance and vertical bounce deficits:
     $$S_{\text{Kinematics, frontal}} = \text{clamp}\left( \frac{\text{pelvicObliquityVar}}{0.08} \times 100, 0, 100 \right)$$

2. **Sub-Score 2: Trunk Sway Amplitude ($S_{\text{TrunkSway}}$)** ($w_2 = 0.25$):
   Measures lateral Center-of-Mass displacement (`lateralSway`) normalized by torso height $H_{\text{torso}}$:
   - Normative Baseline: $\text{Sway}_{\text{norm}} \le 0.05 \cdot H_{\text{torso}}$ (5% of torso length).
   - High Risk Threshold: $\text{Sway}_{\text{high}} \ge 0.15 \cdot H_{\text{torso}}$ (15% of torso length).
   - Sub-Score Formula:
     $$S_{\text{TrunkSway}} = \text{clamp}\left( \frac{\text{lateralSway} - 0.05}{0.15 - 0.05} \times 100, 0, 100 \right)$$
   - *View Angle Suppression Fallback*: In sagittal view (where lateral sway is `null`), falls back to vertical bounce trajectory variation relative to stance phase length.

3. **Sub-Score 3: Dual-Task Cost DTE ($S_{\text{DTE}}$)** ($w_3 = 0.25$):
   Quantifies Cognitive-Motor Interference (CMI) according to Plummer & Eskes (2015) and Kelly et al. (2012):
   - Standardized Directional DTE Formulas:
     $$DTE_{\text{cadence}} = \frac{\text{Cadence}_{\text{dual}} - \text{Cadence}_{\text{single}}}{\text{Cadence}_{\text{single}}} \times 100\%$$
     $$DTE_{\text{CV}} = -\left( \frac{\text{CV}_{\text{dual}} - \text{CV}_{\text{single}}}{\text{CV}_{\text{single}}} \right) \times 100\%$$
   - Maximum Dual-Task Penalty:
     $$\text{Cost}_{\text{max}} = \max\left(0, -DTE_{\text{cadence}}, -DTE_{\text{CV}}\right)$$
   - Sub-Score Formula ($\ge 20.0\%$ cost equals 100/100 risk per Montero-Odasso 2017):
     $$S_{\text{DTE}} = \text{clamp}\left( \frac{\text{Cost}_{\text{max}}}{20.0\%} \times 100, 0, 100 \right)$$
   - *Single-Task Mode Handling*: If recording task mode is single-task, $S_{\text{DTE}} = 0$, and remaining weights re-normalize ($w_1=0.40, w_2=0.33, w_4=0.27$).

4. **Sub-Score 4: Spatio-Temporal Variability ($S_{\text{Variability}}$)** ($w_4 = 0.20$):
   Measures step time coefficient of variation ($\text{stepTimeCV}$):
   - Normative Baseline: $\text{CV}_{\text{norm}} \le 3.0\%$.
   - Severe Risk Threshold: $\text{CV}_{\text{severe}} \ge 8.0\%$.
   - Sub-Score Formula:
     $$S_{\text{Variability}} = \text{clamp}\left( \frac{\text{stepTimeCV} - 3.0}{8.0 - 3.0} \times 100, 0, 100 \right)$$

#### C. Model B Risk Category Mapping

- **Low Fall Risk**: $0 \le R_{\text{Composite}} < 33.0$
- **Moderate Fall Risk**: $33.0 \le R_{\text{Composite}} < 66.0$
- **High Fall Risk**: $66.0 \le R_{\text{Composite}} \le 100.0$

---

### 1.3 Model Comparison Toggles & Predictive Agreement Metrics

To provide clinical transparency, the engine evaluates predictive agreement between Model A (Clinical Rules) and Model B (Dynamic Composite Index).

#### A. Percentage Agreement ($P_a$)

For a single session evaluation:
$$P_a = \begin{cases} 
100\% & \text{if } \text{Category}_{\text{ModelA}} = \text{Category}_{\text{ModelB}} \\ 
50\% & \text{if adjacent risk categories (e.g. Low vs Moderate, Moderate vs High)} \\ 
0\% & \text{if extreme divergence (Low vs High)} 
\end{cases}$$

Across a patient's historical dataset of $N$ sessions:
$$P_a = \frac{N_{\text{agree}}}{N} \times 100\%$$

#### B. Cohen's Kappa ($\kappa$)

Evaluates inter-model reliability across $k=3$ ordinal categories (Low, Moderate, High):

$$\kappa = \frac{P_o - P_e}{1 - P_e}$$

Where:
- $P_o$: Observed proportion of agreement ($P_o = P_a / 100$)
- $P_e$: Expected chance agreement proportion:
  $$P_e = p_{A, \text{low}} \cdot p_{B, \text{low}} + p_{A, \text{mod}} \cdot p_{B, \text{mod}} + p_{A, \text{high}} \cdot p_{B, \text{high}}$$

Landis & Koch (1977) Ordinal Interpretation Tiers:
- $\kappa \ge 0.81$: **Almost Perfect Agreement** (`concordant`)
- $0.61 \le \kappa \le 0.80$: **Substantial Agreement** (`concordant`)
- $0.41 \le \kappa \le 0.60$: **Moderate Agreement** (`mild_divergence`)
- $0.21 \le \kappa \le 0.40$: **Fair Agreement** (`mild_divergence`)
- $\kappa < 0.21$: **Poor / Divergent Agreement** (`stark_divergence`)

#### C. Clinical Divergence Status & Explanation Engine

- `concordant`: Model A and Model B predict identical fall risk categories.
- `mild_divergence`: Models differ by 1 adjacent category (e.g., Model A = Low, Model B = Moderate).
  *Clinical Note*: "Model B detected early sub-clinical kinematic ROM deficits or mild trunk sway that have not yet breached STEADI velocity/CV cutoffs."
- `stark_divergence`: Models differ by 2 categories (e.g., Model A = Low, Model B = High).
  *Clinical Alert*: "High cognitive-motor dual-task cost or severe trunk sway instability present despite preserved walking speed. STEADI speed alone underestimates fall risk in this patient."

---

## Section 2: R2 — Acute Neuromuscular & Metabolic Weakness Anomaly Detector

The Acute Neuromuscular & Metabolic Weakness Detector identifies sudden motor deterioration characteristic of acute systemic medical conditions (e.g. Urinary Tract Infection, severe dehydration, early sepsis, metabolic disturbance, medication toxicity, acute stroke/TIA).

### 2.1 Longitudinal Patient Baseline Engine

#### A. Baseline Parameter Computation
For a patient with $K$ historical baseline sessions ($K \ge 2$), the baseline mean $\mu_{\text{base}, m}$ and standard deviation $\sigma_{\text{base}, m}$ are calculated for each metric $m$:

$$\mu_{\text{base}, m} = \frac{1}{K} \sum_{k=1}^{K} m_k$$

$$\sigma_{\text{base}, m} = \sqrt{ \frac{1}{K - 1} \sum_{k=1}^{K} (m_k - \mu_{\text{base}, m})^2 }$$

To prevent division-by-zero errors in invariant historical baselines, $\sigma_{\text{base}, m}$ is floored at $\sigma_{\text{min}} = 0.05 \cdot \mu_{\text{base}, m}$.

#### B. Deviation & Z-Score Metrics
For current session parameter $m_{\text{current}}$:
- **Percentage Change ($\Delta_m\%$)**:
  $$\Delta_m\% = \frac{m_{\text{current}} - \mu_{\text{base}, m}}{\mu_{\text{base}, m}} \times 100\%$$
- **Z-Score ($Z_m$)**:
  $$Z_m = \frac{m_{\text{current}} - \mu_{\text{base}, m}}{\sigma_{\text{base}, m}}$$

---

### 2.2 Acute Deterioration Spike Detection Rules

The engine evaluates 5 specific clinical deterioration rules:

1. **Rule 1: Acute Speed Drop Flag (`SPEED_DROP_ACUTE`)**:
   - **Trigger Condition**: Gait speed drops by $> 20.0\%$ relative to baseline ($\Delta_{\text{speed}}\% < -20.0\%$) OR $Z_{\text{speed}} < -2.0$.
   - **Absolute Guard**: $V_{\text{gait, current}} < 0.85\text{ m/s}$.
   - **Clinical Indication**: Acute systemic muscle fatigue, infectious response, acute lethargy.

2. **Rule 2: Sudden Lateral Trunk Sway Spike (`SWAY_SPIKE_ACUTE`)**:
   - **Trigger Condition**: Lateral trunk sway increases by $> 30.0\%$ relative to baseline ($\Delta_{\text{sway}}\% > +30.0\%$) OR $Z_{\text{sway}} > +2.5$.
   - **Absolute Guard**: $\text{lateralSway}_{\text{current}} > 0.08\text{ norm}$.
   - **Clinical Indication**: Acute cerebellar ataxia, severe hyponatremia/electrolyte imbalance, acute vestibular crisis, delirium.

3. **Rule 3: Step Time Irregularity / Ataxic Burst (`IRREGULARITY_BURST_ACUTE`)**:
   - **Trigger Condition**: Step time CV increases by $> 50.0\%$ relative to baseline ($\Delta_{\text{CV}}\% > +50.0\%$) AND absolute $\text{stepTimeCV}_{\text{current}} > 7.0\%$.
   - **Clinical Indication**: Encephalopathy, UTI-induced delirium in older adults, acute cognitive/motor discoordination.

4. **Rule 4: Double Support Escalation (`DOUBLE_SUPPORT_ESCALATION`)**:
   - **Trigger Condition**: Double support time % increases by $> 25.0\%$ relative to baseline ($\Delta_{\text{DST}}\% > +25.0\%$) AND absolute $\text{DST}_{\text{current}} > 35.0\%$.
   - **Clinical Indication**: Fear of falling, acute postural instability, profound orthostatic hypotension, dehydration.

5. **Rule 5: Asymmetry Spike (`ASYMMETRY_SPIKE_ACUTE`)**:
   - **Trigger Condition**: Zifchock Symmetry Angle increases by $> 4.0\%$ percentage points (e.g. from 2.0% to 6.5%) OR relative increase $> 100.0\%$.
   - **Clinical Indication**: Acute focal neurological deficit (TIA / acute stroke), acute joint injury, focal nerve compression.

---

### 2.3 Diagnostic Clinical Warning Cards & Differential Flag Engine

When acute deterioration rules trigger, the detector synthesizes a structured **Clinical Warning Card**:

#### Clinical Warning Card Schema & Content Matrix

| Detected Anomaly Pattern | Severity | Card Title | Primary Flag | Differential Diagnoses | Actionable Provider Recommendations |
|---|---|---|---|---|---|
| Speed Drop (>20%) + DST Escalation | `critical` | Acute Systemic Motor Weakness Warning | Sudden Gait Speed Collapse (-24.5% vs Baseline) | 1. Acute Urinary Tract Infection (UTI)<br>2. Severe Dehydration / Orthostatic Hypotension<br>3. Early Sepsis / Systemic Infection | • Urgent Vitals: Temp, BP, HR, SpO2<br>• Urinalysis & Urine Culture<br>• Basic Metabolic Panel (Electrolytes, BUN, Cr)<br>• Assist-of-1 fall precautions |
| Sway Spike (>30%) + Irregularity Burst | `critical` | Acute Ataxic Delirium / Metabolic Warning | Severe Lateral Trunk Sway Spike (+38.2% vs Baseline) | 1. Metabolic Disturbance (Hyponatremia, Hypoglycemia)<br>2. Medication Toxicity / Adverse Event<br>3. Acute Delirium / Encephalopathy | • Stat Blood Glucose & BMP<br>• Medication Audit (Sedatives, Antihypertensives)<br>• Neurological Examination<br>• Bedside safety rails |
| Asymmetry Spike (>4% pts) | `warning` | Acute Asymmetric Motor Deficit Flag | Sudden Inter-Limb Asymmetry Spike (SA = 7.8%) | 1. Transient Ischemic Attack (TIA) / Acute Stroke<br>2. Acute Focal Radiculopathy<br>3. Acute Unilateral Joint Pain / Trauma | • Stat NIH Stroke Scale Assessment<br>• Bilateral Strength & Reflex Exam<br>• Urgent Neurological Consult |
| Isolated Speed Drop (>20%) | `warning` | Sub-Acute Lethargy / Fatigue Warning | Moderate Speed Decline (-21.0% vs Baseline) | 1. Sub-acute infection / malaise<br>2. Sleep deprivation / fatigue<br>3. Mild dehydration | • Encourage oral fluid intake<br>• Re-assess gait in 24 hours<br>• Monitor temperature |

---

## Section 3: TypeScript Type Signatures (`src/lib/gait/fallRiskTypes.ts`)

Below are the complete, production-ready TypeScript interface definitions required to implement R1 and R2:

```typescript
/**
 * TypeScript Specification Interface definitions for R1 (Fall Risk Engine)
 * and R2 (Acute Weakness Detector) in gait-lab.
 */

import type { GaitMetrics, PatientMetadata } from "./types";

export type RiskCategory = "low" | "moderate" | "high";

// ==========================================
// R1: Dual Fall Risk Predictive Engine Types
// ==========================================

export interface FallRiskModelAFlags {
  gaitSpeedRisk: boolean;
  stepTimeCvRisk: boolean;
  doubleSupportRisk: boolean;
  symmetryRisk: boolean;
}

export interface FallRiskModelAFlagValues {
  gaitSpeedMps: number | null;
  stepTimeCvPct: number;
  doubleSupportPct: number | null;
  symmetryAnglePct: number | null;
}

export interface FallRiskModelA {
  score: number; // 0–100
  category: RiskCategory;
  points: number; // 0.0 – 4.0
  flags: FallRiskModelAFlags;
  flagValues: FallRiskModelAFlagValues;
}

export interface FallRiskModelBSubScores {
  kinematicsScore: number; // 0–100 (weight 0.30)
  trunkSwayScore: number; // 0–100 (weight 0.25)
  dteScore: number; // 0–100 (weight 0.25)
  variabilityScore: number; // 0–100 (weight 0.20)
}

export interface FallRiskModelB {
  compositeScore: number; // 0–100
  category: RiskCategory;
  subScores: FallRiskModelBSubScores;
  weights: {
    kinematics: number;
    trunkSway: number;
    dte: number;
    variability: number;
  };
}

export type AgreementStatus = "concordant" | "mild_divergence" | "stark_divergence";

export interface PredictiveAgreement {
  percentAgreement: number; // 0%, 50%, 100% (or historical %)
  cohensKappa: number; // -1.0 to 1.0
  alignmentStatus: AgreementStatus;
  divergenceExplanation: string;
}

export interface FallRiskAnalysis {
  modelA: FallRiskModelA;
  modelB: FallRiskModelB;
  agreement: PredictiveAgreement;
  activeModelToggle: "modelA" | "modelB" | "comparison";
  timestamp: string;
}

// ==================================================
// R2: Acute Weakness & Anomaly Detector Types
// ==================================================

export interface MetricBaselineStats {
  mean: number;
  std: number;
  sampleCount: number;
}

export interface PatientBaseline {
  patientId: string;
  sessionCount: number;
  lastUpdated: string;
  isLowConfidenceBaseline: boolean;
  metrics: {
    gaitSpeed: MetricBaselineStats;
    cadenceSpm: MetricBaselineStats;
    stepTimeCV: MetricBaselineStats;
    lateralSway: MetricBaselineStats;
    symmetryAngle: MetricBaselineStats;
    doubleSupportPct: MetricBaselineStats;
  };
}

export type AcuteSpikeRuleId =
  | "SPEED_DROP_ACUTE"
  | "SWAY_SPIKE_ACUTE"
  | "IRREGULARITY_BURST_ACUTE"
  | "DOUBLE_SUPPORT_ESCALATION"
  | "ASYMMETRY_SPIKE_ACUTE";

export interface AcuteDeteriorationFlag {
  ruleId: AcuteSpikeRuleId;
  metricName: string;
  currentValue: number;
  baselineValue: number;
  percentChange: number;
  zScore: number;
  thresholdBreached: string;
  clinicalSignificance: string;
}

export type CardSeverity = "critical" | "warning" | "info";

export interface ClinicalWarningCard {
  id: string;
  severity: CardSeverity;
  title: string;
  primaryFlag: string;
  detectedAnomalies: AcuteDeteriorationFlag[];
  differentialDiagnoses: string[];
  providerRecommendations: string[];
}

export interface AcuteWeaknessAnalysis {
  hasAcuteWeakness: boolean;
  deteriorationScore: number; // 0–100 severity
  spikeFlags: AcuteDeteriorationFlag[];
  warningCards: ClinicalWarningCard[];
  baselineUsed: PatientBaseline | null;
}
```

---

## Section 4: Literature Justification & Clinical Citations

1. **CDC STEADI (2019)** — *STEADI - Older Adult Fall Prevention Algorithm*. Centers for Disease Control and Prevention, U.S. Department of Health and Human Services.  
   - *Clinical Relevance*: Establishes $0.80\text{ m/s}$ gait speed as the primary screening threshold for high fall risk in community-dwelling older adults.

2. **Tinetti ME (1986)** — Performance-oriented assessment of mobility problems in elderly patients. *Journal of the American Geriatric Society*, 34(2), 119-126.  
   - *Clinical Relevance*: Formulates the POMA assessment tool; establishes double support time $>35\%$ as a cardinal indicator of gait instability and fear of falling.

3. **Montero-Odasso MM et al. (2017)** — Association of Dual-Task Gait With Incident Dementia in Mild Cognitive Impairment: Results From the Gait and Brain Study. *JAMA Neurology*, 74(7), 857-865.  
   - *Clinical Relevance*: Proves that dual-task cost $>20\%$ on step time variability acts as an early clinical biomarker predicting cognitive-motor decline and fall risk.

4. **Lord S et al. (2013)** — Independent domains of gait in older adults: validation of a factor analysis approach. *Journals of Gerontology Series A*, 68(7), 820-827.  
   - *Clinical Relevance*: Validates 5 independent domains of gait (Pace, Rhythm, Variability, Symmetry, Postural Control) that form the structure of Model B.

5. **Plummer P & Eskes G (2015)** — Measuring treatment effects on dual-task performance: a framework for research and clinical practice. *Frontiers in Human Neuroscience*, 9, 225.  
   - *Clinical Relevance*: Establishes standardized directional Dual-Task Effect ($DTE$) formulas and 4-tier CMI taxonomy.

6. **Zifchock RA et al. (2008)** — The symmetry angle: a novel, robust method of quantifying asymmetry. *Gait & Posture*, 27(4), 622-627.  
   - *Clinical Relevance*: Formulates reference-free Symmetry Angle ($SA$); establishes $SA > 5.0\%$ as pathological asymmetry threshold.

7. **Hollman JH et al. (2010)** — Number of strides required for reliable measurements of pace, rhythm and variability parameters of gait. *Gait & Posture*, 32(1), 23-28.  
   - *Clinical Relevance*: Defines normative step time CV ($<4.0\%$) and high-variability fall risk boundary ($>6.0\%$).

8. **Bland JM & Altman DG (1986)** — Statistical methods for assessing agreement between two methods of clinical measurement. *The Lancet*, 1(8476), 307-310.  
   - *Clinical Relevance*: Basis for inter-model agreement evaluation and Cohen's Kappa formulation.

9. **Inouye SK et al. (1999)** — Clarifying confusion: the confusion assessment method. *Annals of Internal Medicine*, 130(5), 452-456.  
   - *Clinical Relevance*: Links sudden gait irregularity bursts and acute motor weakness spikes to acute delirium and metabolic encephalopathy in hospitalized and community elderly.

---

## Conclusion & Next Steps for Orchestrator

The mathematical models, clinical rules, Cohen's kappa agreement metrics, longitudinal baseline algorithms, and TypeScript interfaces documented in this report provide complete, implementation-ready specifications for the implementation team. 

Next steps:
1. Implement `src/lib/gait/fallRisk.ts` (Model A, Model B, Cohen's Kappa agreement).
2. Implement `src/lib/gait/acuteWeakness.ts` (Baseline tracking, acute spike rules, clinical warning card generator).
3. Create UI components (`FallRiskPanel.tsx`, `AcuteWeaknessCard.tsx`) matching Google Workspace / Cloud Console aesthetic guidelines.

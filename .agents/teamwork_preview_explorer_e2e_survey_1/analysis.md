# E2E Fall Risk Test Suite Architecture & Survey Analysis

## Executive Summary
This analysis outlines the comprehensive, 4-tier requirement-driven E2E test suite for the `gait-lab` Fall Risk Analysis and Clinical Decision Support engine. The suite covers all 10 features specified in `PROJECT.md`, spanning unit engine logic (`src/lib/gait/fallrisk.ts`), historical session persistence (`src/lib/gait/persistence.ts`), and high-density Google Workspace UI components (`FallRiskPanel.tsx`, `FallRiskGaugeDial.tsx`, `AcuteWeaknessCard.tsx`, `BaselineSparkline.tsx`, `ClinicalReportView.tsx`).

---

## 1. Environment & Codebase Survey

### 1.1 Test Runner & Environment
- **Framework**: Vitest v4.1.10 (`vitest.config.ts`), with standard `node` environment default and `@vitest-environment jsdom` docblocks for UI components.
- **Current Test Status**: 55 test files, 531 tests — 100% passing (`npx vitest run`).
- **Dependencies Available**: `@testing-library/react` (v16.3.2), `@testing-library/dom` (v10.4.1), `jsdom` (v30.0.1), Recharts (v2.13.0), Lucide React (v0.510.0), Tailwind CSS v4.

### 1.2 Target Engine & Persistence Interface Contracts (`src/lib/gait/`)
1. `computeFallRiskModelA(metrics: GaitMetrics): FallRiskModelAResult`
   - Rule-based CDC STEADI / Tinetti cutoffs:
     - Gait speed < 0.8 m/s
     - Step time CV > 6% (0.06)
     - Double support time (DST) > 35% (0.35)
     - Zifchock Symmetry Angle (SA) > 10% (10.0)
   - Outputs ordinal risk bands: `"low" | "moderate" | "high"`, breached rule count, and clinical audit trail.

2. `computeFallRiskModelB(metrics: GaitMetrics, dualTaskCost?: DualTaskCost, angleAnalysis?: GaitAngleAnalysis, cameraView?: ViewAngle): FallRiskModelBResult`
   - 0–100 weighted dynamic composite score:
     - Kinematics (flexion ROM, asymmetry)
     - Trunk sway & stability
     - Spatio-temporal variability (step time CV, stride time CV)
     - Dual-Task Cost (DTE)
   - Automatic re-normalization:
     - Single-task mode: DTE omitted, remaining weight sum re-normalized to 1.0.
     - Frontal view mode: Side stance/swing/DST omitted, remaining frontal weights re-normalized to 1.0.
     - Sagittal view mode: Step width/pelvic obliquity omitted, remaining sagittal weights re-normalized to 1.0.

3. `evaluatePredictiveAgreement(modelA: FallRiskModelAResult, modelB: FallRiskModelBResult): PredictiveAgreementResult`
   - Cohen's Kappa ($\kappa$) ordinal agreement calculation across 3 bands (Low = 0, Moderate = 1, High = 2).
   - Percentage agreement ($P_a$).
   - Concordance classification (`"strong_concordance" | "moderate_concordance" | "divergent_models"`).
   - Divergence alert flag triggered when $|\text{RiskBand}_A - \text{RiskBand}_B| \ge 2$.

4. `computePatientBaseline(historicalSessions: GaitSessionRecord[]): PatientBaseline`
   - Statistical mean ($\mu$) and standard deviation ($\sigma$) calculation across historical sessions ($K \ge 2$).
   - Population fallback baseline for $K = 1$ session with `lowConfidence: true`.
   - `hasBaseline: false` for $K = 0$ sessions.

5. `detectAcuteWeaknessAnomalies(currentMetrics: GaitMetrics, baseline: PatientBaseline): AcuteWeaknessAnomalyResult`
   - 5 acute deterioration spike rules:
     - Rule 1: Gait speed drop > 20% below baseline $\mu_{speed}$.
     - Rule 2: Lateral trunk sway spike > 30% above baseline $\mu_{sway}$.
     - Rule 3: Step time CV jump > 50% increase over baseline $\mu_{CV}$.
     - Rule 4: Double support time escalation > 25% increase over baseline $\mu_{DST}$.
     - Rule 5: Symmetry angle asymmetry jump > 40% increase over baseline $\mu_{SA}$.
   - Evaluates composite anomaly severity (`"none" | "moderate" | "severe"`).

6. `listPatientSessions(patientId: string, userId?: string): Promise<GaitSessionRecord[]>`
   - Database query in `src/lib/gait/persistence.ts` returning patient historical sessions ordered by `created_at DESC`.

### 1.3 Target UI Component Contracts (`src/components/gait/`)
1. `FallRiskPanel.tsx`: Main Google Workspace tab rendering Model A/B scores, agreement dial, acute weakness alert cards, and baseline sparklines.
2. `FallRiskGaugeDial.tsx`: Recharts/SVG gauge dial rendering 0–100 score and risk color arcs.
3. `AcuteWeaknessCard.tsx`: Diagnostic warning cards for UTI, dehydration/sepsis, metabolic disturbance/delirium, TIA/stroke with provider recommendations.
4. `BaselineSparkline.tsx`: Longitudinal metric trend line with baseline standard deviation band.
5. `ClinicalReportView.tsx`: Integrated A4 PDF export view containing Model A/B findings, Kappa agreement, acute weakness cards, and baseline deltas.

---

## 2. 4-Tier Test Suite Specification

### Tier 1: Feature Coverage (≥5 Tests per Feature, Features 1–10)

| Feature # | Feature Name | Test Case ID | Description & Expected Outcome |
|-----------|--------------|--------------|--------------------------------|
| **F1** | Fall Risk Model A (STEADI) | `T1.F1.1` | All metrics normal (speed 1.1m/s, CV 3.5%, DST 20%, SA 2%) -> Low Risk. |
| | | `T1.F1.2` | 1 threshold breached (speed 0.75m/s) -> Moderate Risk, lists speed rule breach. |
| | | `T1.F1.3` | 2 thresholds breached (speed 0.65m/s, step CV 8.0%) -> High Risk. |
| | | `T1.F1.4` | Symmetry Angle breach (SA 12.5% > 10.0%) -> Triggers asymmetry risk flag. |
| | | `T1.F1.5` | Double Support Time breach (DST 38.0% > 35.0%) -> Triggers DST risk flag. |
| | | `T1.F1.6` | Audit evidence payload contains exact metric values and cutoff thresholds. |
| **F2** | Fall Risk Model B (Composite) | `T1.F2.1` | Computes 0-100 composite score from kinematics, sway, variability, DTE. |
| | | `T1.F2.2` | Single-Task mode: Omits DTE, re-normalizes weight sum to 1.0. |
| | | `T1.F2.3` | Frontal View fallback: Omits stance/swing/DST, re-weights frontal metrics. |
| | | `T1.F2.4` | Dual-Task mode: Includes DTE penalty in composite score. |
| | | `T1.F2.5` | Maps composite score to ordinal bands (85 -> Low, 65 -> Moderate, 35 -> High). |
| | | `T1.F2.6` | Sub-domain breakdown scores (kinematic, sway, variability) sum accurately. |
| **F3** | Predictive Agreement | `T1.F3.1` | Identical risk bands -> $\kappa = 1.0, P_a = 100\%$, `strong_concordance`. |
| | | `T1.F3.2` | 1-step band difference (Low vs Moderate) -> $0.4 \le \kappa < 0.7$, `moderate_concordance`. |
| | | `T1.F3.3` | 2-step band difference (High vs Low) -> $\kappa < 0.2$, `divergent_models`. |
| | | `T1.F3.4` | Divergence alert flag set to `true` when $|\text{Band}_A - \text{Band}_B| = 2$. |
| | | `T1.F3.5` | Agreement summary text generates accurate clinical narrative. |
| **F4** | Longitudinal Baseline Engine | `T1.F4.1` | $K \ge 2$ sessions -> Computes sample mean $\mu$ and standard deviation $\sigma$. |
| | | `T1.F4.2` | $K = 1$ session -> Uses session mean with population fallback $\sigma$, sets `lowConfidence: true`. |
| | | `T1.F4.3` | $K = 0$ sessions -> Returns `hasBaseline: false` gracefully without throwing. |
| | | `T1.F4.4` | Per-metric Z-score ($Z = (x - \mu)/\sigma$) and percentage delta ($\Delta\%$). |
| | | `T1.F4.5` | Incremental baseline update upon adding a new session record. |
| **F5** | Acute Weakness Detector | `T1.F5.1` | Spike Rule 1: Speed drop > 20% below baseline $\mu_{speed}$ -> Flags acute speed drop. |
| | | `T1.F5.2` | Spike Rule 2: Sway spike > 30% above baseline $\mu_{sway}$ -> Flags sway spike. |
| | | `T1.F5.3` | Spike Rule 3: Step CV jump > 50% increase over baseline $\mu_{CV}$ -> Flags CV jump. |
| | | `T1.F5.4` | Spike Rule 4: DST escalation > 25% increase over baseline $\mu_{DST}$ -> Flags DST spike. |
| | | `T1.F5.5` | Spike Rule 5: Asymmetry jump > 40% increase over baseline $\mu_{SA}$ -> Flags asymmetry spike. |
| | | `T1.F5.6` | Multiple concurrent spikes escalate overall anomaly severity to `severe`. |
| **F6** | Clinical Warning Cards | `T1.F6.1` | Speed drop + CV jump + Sway spike -> Generates UTI differential card. |
| | | `T1.F6.2` | Cadence drop + Sway spike + DST escalation -> Generates Dehydration / Sepsis card. |
| | | `T1.F6.3` | CV > 8% + Smoothness drop -> Generates Metabolic / Delirium card. |
| | | `T1.F6.4` | Unilateral asymmetry jump > 40% -> Generates TIA / Stroke card. |
| | | `T1.F6.5` | Actionable provider recommendations included in card details. |
| **F7** | Patient Persistence API | `T1.F7.1` | `listPatientSessions` queries DB ordered by `created_at DESC` for given `patientId`. |
| | | `T1.F7.2` | Returns `[]` when no sessions exist for `patientId`. |
| | | `T1.F7.3` | Deserializes `metrics_json`, `dual_task_json`, `patient_meta_json` correctly. |
| | | `T1.F7.4` | Enforces user isolation (`user_id = context.userId`). |
| | | `T1.F7.5` | Historical session records integrate directly into `computePatientBaseline`. |
| **F8** | Workspace UI Panel | `T1.F8.1` | `FallRiskPanel.tsx` renders with Google Workspace design tokens and container cards. |
| | | `T1.F8.2` | Renders Model A and Model B risk summary cards side-by-side. |
| | | `T1.F8.3` | Displays predictive agreement Kappa badge and concordance status. |
| | | `T1.F8.4` | Displays acute weakness alert banner when active anomaly detected. |
| | | `T1.F8.5` | Tab/toggle switching between Model A, Model B, and Baseline trends. |
| **F9** | Gauges, Cards & Sparklines | `T1.F9.1` | `FallRiskGaugeDial.tsx` renders SVG/Recharts 0-100 gauge with risk color arc. |
| | | `T1.F9.2` | `AcuteWeaknessCard.tsx` renders warning icons, differential titles, and advice. |
| | | `T1.F9.3` | `BaselineSparkline.tsx` renders trend line and $\pm 1\sigma$ baseline band. |
| | | `T1.F9.4` | Model comparison toggle updates view focus between models. |
| | | `T1.F9.5` | Displays "Insufficient baseline data" placeholder when $K=0$. |
| **F10** | Clinical PDF Integration | `T1.F10.1` | `ClinicalReportView.tsx` includes Fall Risk Model A/B summary section. |
| | | `T1.F10.2` | Includes Predictive Agreement Kappa score in printable layout. |
| | | `T1.F10.3` | Includes Acute Weakness Warning Cards when active. |
| | | `T1.F10.4` | Renders baseline metric delta table ($\Delta\%$). |
| | | `T1.F10.5` | Preserves `@media print` styling without component clipping. |

---

### Tier 2: Boundary & Corner Cases (≥5 Tests per Feature Category)

1. **Model A Boundary Cutoffs** (`T2.CUTOFF.*`):
   - Speed = 0.79 m/s (Breached) vs Speed = 0.80 m/s (Normal).
   - Step CV = 5.9% (Normal) vs Step CV = 6.0% (Breached).
   - DST = 34.9% (Normal) vs DST = 35.0% (Breached).
   - Symmetry Angle = 9.9% (Normal) vs Symmetry Angle = 10.0% (Breached).
   - Zero Speed (0.0 m/s) -> Handles division by zero safely without throwing NaN.

2. **Model B View & Mode Fallbacks** (`T2.FALLBACK.*`):
   - Frontal view (`leftStancePct = null`, `doubleSupportPct = null`) -> Re-weights available frontal metrics.
   - Sagittal view (`meanStepWidth = null`, `pelvicObliquity = null`) -> Re-weights available sagittal metrics.
   - Single-task mode (`dualTaskCost = undefined`) -> Re-allocates 20% DTE weight across physical domains.
   - Unknown view angle -> Applies default confidence penalty.
   - All input metrics null/corrupted -> Returns safe default low-confidence result.

3. **Baseline Tracker Boundary Conditions** (`T2.BASELINE.*`):
   - $K=0$ sessions -> Returns `hasBaseline: false`, Z-scores = `null`.
   - $K=1$ session -> Sets `lowConfidence: true`, uses population fallback $\sigma$.
   - $K=2$ sessions -> Calculates exact sample mean $\mu$ and standard deviation $\sigma$.
   - Identical historical sessions ($\sigma = 0$) -> Fallback prevents $Z = (x - \mu)/0$ division error.
   - Extreme outlier session (e.g. speed 0.05 m/s) -> Robust standard deviation calculation.

4. **Anomaly Detector Threshold Boundaries** (`T2.ANOMALY.*`):
   - Speed drop = 19.9% (No spike) vs Speed drop = 20.0% (Spike 1 triggered).
   - Sway spike = 29.9% (No spike) vs Sway spike = 30.0% (Spike 2 triggered).
   - Step CV jump = 49.9% (No spike) vs Step CV jump = 50.0% (Spike 3 triggered).
   - DST escalation = 24.9% (No spike) vs DST escalation = 25.0% (Spike 4 triggered).
   - Asymmetry jump = 39.9% (No spike) vs Asymmetry jump = 40.0% (Spike 5 triggered).

5. **UI Rendering Edge Cases** (`T2.UI.*`):
   - Gauge dial score = 0 -> Renders zero point without SVG coordinate errors.
   - Gauge dial score = 100 -> Renders full arc without layout overflow.
   - Extremely long patient ID string -> Truncates gracefully in Workspace card headers.
   - Zero active anomalies -> `AcuteWeaknessCard` displays reassuring green "No Acute Deterioration" status.
   - Recharts container rendered with 0 width/height in jsdom -> Handles resize observers cleanly.

---

### Tier 3: Cross-Feature Combinations (Pairwise Feature Interaction Tests)

1. **Model Divergence & Kappa Concordance (`T3.PAIR.1`)**:
   - Model A High Risk (rule breaches in speed & CV) vs Model B Low Risk (high stability score) -> Produces Low Cohen's Kappa ($\kappa < 0.2$) and triggers "Model Divergence Alert" badge in UI.

2. **Acute UTI Anomaly + Severe Fall Risk Escalation (`T3.PAIR.2`)**:
   - Baseline speed = 1.1 m/s. Current session speed = 0.75 m/s (27% drop), Sway spike = 45%, CV jump = 70%.
   - Anomaly Detector triggers UTI Card, while Fall Risk Model A escalates to High Risk and Model B drops from 85 -> 35.

3. **Frontal View + Dual-Task Mode Combined Fallback (`T3.PAIR.3`)**:
   - Session recorded in Frontal View during Dual-Task protocol.
   - Model B suppresses side-stance metrics (Frontal view fallback) while simultaneously evaluating Cadence DTE (Dual-task mode), ensuring both fallbacks operate in tandem without metric collision.

4. **Persistence API -> Baseline Engine -> Anomaly UI Pipeline (`T3.PAIR.4`)**:
   - `listPatientSessions("PT-8492")` returns historical DB sessions.
   - `computePatientBaseline` builds statistical baseline.
   - Current session evaluated against baseline, triggering acute weakness card.
   - `FallRiskPanel.tsx` receives pipeline output and updates sparklines, gauge, and alert banners end-to-end.

5. **Clinical PDF Export with Active Acute Warning Cards & Baseline Deltas (`T3.PAIR.5`)**:
   - Render `ClinicalReportView.tsx` with active Model A/B scores, low Kappa agreement, and 2 active Acute Weakness cards.
   - Verifies PDF layout includes Fall Risk section, Acute Weakness warning section, and Baseline delta table without layout overlap in `@media print`.

---

### Tier 4: Real-World Application Scenarios

1. **Scenario 1: Longitudinal Multi-Session Patient Tracking (5 Sessions over 6 Months) (`T4.SCENARIO.1`)**
   - Session 1 (Month 0): Healthy baseline (Speed 1.1 m/s, Low Fall Risk).
   - Session 2 (Month 1): Stable baseline update (Speed 1.12 m/s, Low Fall Risk).
   - Session 3 (Month 3): Gradual age-related decline (Speed 1.02 m/s, Low Fall Risk).
   - Session 4 (Month 5): Acute UTI episode (Speed 0.72 m/s, Sway spike, High Fall Risk, UTI warning triggered).
   - Session 5 (Month 6): Post-treatment recovery (Speed 1.05 m/s, Moderate/Low Fall Risk, Anomaly cleared).
   - Verifies baseline adaptation, anomaly triggering during Session 4, and resolution during Session 5.

2. **Scenario 2: Acute Systemic Deterioration Episode Simulation (`T4.SCENARIO.2`)**
   - Patient with established 4-session baseline experiences sudden systemic deterioration (sepsis/dehydration).
   - Current gait assessment shows dramatic drops across speed (-35%), sway (+80%), step CV (+120%), and double support time (+50%).
   - System outputs: Anomaly Detector Severe Alert, 3 differential diagnosis cards (UTI, Sepsis, Metabolic), Model A High Risk, Model B Score 22/100, UI Red Banner Alert.

3. **Scenario 3: Complete Clinical Workflow E2E (`T4.SCENARIO.3`)**
   - Simulated full clinical user journey:
     1. Ingest patient pose frames for current session.
     2. Query patient session history via `listPatientSessions`.
     3. Compute `PatientBaseline` from history.
     4. Calculate `FallRiskModelA`, `FallRiskModelB`, and `PredictiveAgreement`.
     5. Run `detectAcuteWeaknessAnomalies`.
     6. Render `FallRiskPanel` workstation tab and verify all UI components (Gauges, Sparklines, Cards, Agreement Chips).
     7. Open `ClinicalReportView` PDF export, populate clinician notes, and verify complete print payload ready for export.

---

## 3. Test Suite Implementation Structure

### 3.1 `src/lib/gait/__tests__/e2e_fallrisk_engine.test.ts`
- **Environment**: `node`
- **Focus**: Pure engine & math verification, persistence API integration, boundary logic, and scenario state machine.

### 3.2 `src/components/gait/__tests__/e2e_fallrisk_ui.test.tsx`
- **Environment**: `jsdom` (`// @vitest-environment jsdom`)
- **Focus**: React rendering, testing-library interactions, Google Workspace design tokens, Recharts gauge/sparkline DOM structure, and Clinical PDF export view integration.


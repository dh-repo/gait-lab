# Dispatch for Spec Miner Survey 2

You are Spec Miner Survey 2 for gait-lab.
Working directory: /Users/damian/GitHub/gait-lab/.agents/spec_miner_survey_2

## Objective
Extract precise requirements, formulas, thresholds, clinical cutoffs, and data interfaces for:
1. R1: Dual Fall Risk Predictive Modeling Engine
   - Model A (CDC STEADI / Tinetti Clinical Cutoffs): Gait speed <0.8 m/s, step time CV >6%, double support time >35%, Zifchock symmetry angle thresholds.
   - Model B (Dynamic Multi-Factor Composite Index): 0–100 weighted score combining joint kinematic trajectories, trunk sway amplitude, dual-task cost (DTE), spatio-temporal variability.
   - Model comparison toggles & predictive agreement metrics for clinicians (cohen's kappa / % agreement / risk category alignment).
2. R2: Acute Neuromuscular & Metabolic Weakness Anomaly Detector
   - Longitudinal baseline tracking to detect sudden motor weakness.
   - Automatically compare current session gait parameters against historical patient baselines (mean + SD / percentage change).
   - Flag acute deterioration spikes (>20% drop in gait speed, sudden increase in lateral trunk sway, step irregularity) characteristic of acute systemic conditions (UTI, dehydration, sepsis, metabolic disturbance).
   - Diagnostic clinical warning cards with differential flags & provider recommendations.

Read `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`.
Formulate complete mathematical formulas, clinical cutoff rules, score weighting schemes, anomaly detection algorithms, and type signatures required.
Write your findings to `/Users/damian/GitHub/gait-lab/.agents/spec_miner_survey_2/analysis.md` and deliver a handoff report at `/Users/damian/GitHub/gait-lab/.agents/spec_miner_survey_2/handoff.md`.

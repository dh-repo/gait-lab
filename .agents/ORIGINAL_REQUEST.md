# Original User Request

## 2026-08-10T14:01:41Z

Execute Phase 3 deep dive on the gait-lab engine at /Users/damian/GitHub/gait-lab. This phase targets critical bug fixes, clinical metric expansion, and SOTA integration. Current state: 1224/1224 tests passing, 90 test files, 0 TypeScript errors, 0 ESLint errors, 22 reference videos in public/samples/.

Integrity mode: development. Work directly in the repo.

## CRITICAL BUG FIXES (Must ship first)

### R1. Zifchock Symmetry Angle Equation Scaling Error
**File:** `src/lib/gait/symmetry.ts` line 37
**Bug:** `rawSA = (Math.abs(45 - thetaDeg) / 90) * 100` — divides by 90 instead of 45.
Per Zifchock et al. (2008): SA = |45° - θ| / 45° × 100%. Current code caps max SA at 50% instead of 100%, underestimating all asymmetry scores by exactly half.
**Fix:** Change denominator from 90 to 45. Update all dependent tests that check symmetry angle values (they'll all need to roughly double).

### R2. Contralateral Step Distance Mislabeled as "Stride Length"
**File:** `src/lib/gait/analysis.ts` lines 402-414
**Bug:** Computes travel between contralateral heel strikes (L→R) and labels it `leftStride`/`rightStride`. True stride length is ipsilateral (L→L or R→R).
**Fix:** Compute ipsilateral distances for stride length. Keep contralateral as `stepLength`.

### R3. Hardcoded Cadence Penalty Kills Parkinsonian Gait
**File:** `src/lib/gait/analysis.ts` lines 328-332
**Bug:** `walkFit(c) = -Math.abs(c - 108) - (c < 70 ? 40 : 0)`. The -40 penalty for cadence < 70 spm forces fallback to inaccurate oscillation peaks for Parkinsonian patients.
**Fix:** Remove the `c < 70` penalty. Accept clinical range 40-140 spm.

### R4. Stride Duration Ceiling & Double Support Search Limits
**File:** `events.ts` lines 679, 749; `analysis.ts` line 584
**Bug:** `strideDur < 2.5` rejects valid slow strides (walker-assisted: 2.5-4.0s). Double support search capped at 0.5s (slow patients: 0.4-0.6s).
**Fix:** Raise stride ceiling from 2.5s to 4.0s. Scale double support search to `min(0.75 * meanStepTime, 1.0)` instead of fixed 0.5s.

### R5. DTE Unbounded Percentage Spikes
**File:** `src/lib/gait/dte.ts` lines 57-58
**Bug:** When baseline CV is small (0.02), DTE formula produces -300% spikes.
**Fix:** Clamp `stepTimeCvDTE` to [-100%, +100%].

## CLINICAL METRIC EXPANSION

### R6. Arm Swing Asymmetry Index (ASA)
Add to `src/lib/gait/angles.ts`:
```typescript
export function calculateArmSwingAsymmetry(
  landmarks: Landmark[][],
  events: { heelStrikes: GaitEvent[] }
): { leftAmplitude: number; rightAmplitude: number; asymmetryIndex: number; phaseCorrelation: number }
```
- Track shoulder-wrist (keypoints 11→15, 12→16) vectors per side
- Compute peak-to-peak swing amplitude per arm across gait cycles
- ASA = |Amp_L - Amp_R| / max(Amp_L, Amp_R) × 100
- Compute phase correlation between arm swing and contralateral leg
- Add to GaitAngleAnalysis result type
- Clinical: earliest motor biomarker of Parkinson's disease

### R7. Trunk Sway Quantification
Add to `src/lib/gait/angles.ts`:
```typescript
export function calculateTrunkSway(
  landmarks: Landmark[][]
): { lateralExcursionDeg: number; sagittalExcursionDeg: number; harmonicRatio: number }
```
- Compute C7/mid-shoulder to mid-hip vector tilt angle per frame
- Peak-to-peak frontal (lateral) and sagittal angular excursion
- FFT-based Harmonic Ratio (power of even harmonics / odd harmonics for lateral, odd/even for AP)
- Replace the crude `lateralSway` proxy in `fallrisk.ts` with real trunk sway
- Clinical: superior fall risk predictor, cerebellar ataxia marker

### R8. Compensatory Gait Patterns in guesses.ts
Add new hypothesis rules:
1. **Steppage gait**: knee flexion > 2 SD during swing + ankle dorsiflexion deficit
2. **Festinating gait**: cadence increasing + step length decreasing within same walk
3. **Scissoring gait**: narrow/crossing step width + high hip adduction
4. **Waddling gait**: pelvic obliquity > 8° + trunk lateral sway > 2 SD
5. **Trendelenburg sign**: contralateral pelvic drop > 5° during single-leg stance phase
6. **Circumduction**: lateral foot trajectory arc > threshold during swing

Each must reference normative Z-scores where available. Integrate arm swing asymmetry and trunk sway into existing and new hypothesis rules.

### R9. Gait Profile Score (GPS) & Movement Analysis Profile (MAP)
Upgrade `src/lib/gait/normatives.ts`:
- Compute RMSE between patient joint angle curves (from angles.ts `analyzeGaitAngles`) and Perry & Burnfield normative curves at 101 gait cycle points
- GPS = overall RMS angular deviation in degrees
- MAP = per-joint sub-scores: pelvic tilt, hip flex/ext, knee flex/ext, ankle dorsi/plantar, pelvic obliquity (if available)
- Expand normative parameter set to include: gait speed, step length, hip ROM, ankle ROM
- Add pediatric (<18) and advanced age (75-84, 85+) stratification tiers
- Baker et al. (2009) reference

## FALL RISK HARDENING

### R10. Fall Risk Model Robustness
Fix in `src/lib/gait/fallrisk.ts`:
1. Gait speed proxy: Replace `cadence * 0.012` with height-adjusted formula when height available, or `cadence * stepLength * 2 / 60` when step length available
2. Model A frontal view: Adjust STEADI thresholds dynamically by `evaluatedCount` — `breachedCount >= Math.ceil(0.6 * evaluatedCount)` for High Risk
3. Model B frontal fallback: Exclude missing metrics from sub-score calculation and re-normalize weights
4. Don't substitute vertical bounce for lateral sway (orthogonal planes) — mark as unevaluated

## TEST COVERAGE

### R11. Tests for Untested & New Functions
- **OneEuroFilter** (signal.ts): Static input→output equals input, step response→smooth transition, sinusoidal→amplitude preserved, VFR timestamps, reset
- **Acute weakness rules** (fallrisk.ts): Each of 5 rules + clinical warning cards
- **Hungarian edge cases**: Non-square matrices, empty input, large sentinel costs
- **Kalman 2-state edge cases**: All-NaN signal, initial occlusion, velocity sign reversal
- **Adaptive SG at 24/50/90/144/240 FPS** and short signals (N < window)
- **Arm swing asymmetry**: Symmetric input→ASA≈0, one-arm frozen→ASA≈100, phase correlation
- **Trunk sway**: Upright still→excursion≈0, periodic sway→correct amplitude, HR computation
- **Compensatory patterns**: Synthetic landmark sequences for each pattern
- **GPS/MAP**: Normative match→GPS≈0, pathological→GPS>5°
- **Zifchock SA fix**: Verify SA now doubles for same input
- **Stride vs step length**: Known geometry produces correct ipsilateral distance

## DOCUMENTATION

### R12. Scientific Justifications Update
Add to `scientific_justifications.md`:
- Hungarian Algorithm: Kuhn (1955), Munkres (1957)
- One Euro Filter: Casiez, Roussel & Vogel (2012)
- GDI: Schwartz & Rozumalski (2008)
- GPS/MAP: Baker et al. (2009)
- Normatives: Winter (2009), Bovi et al. (2011), Hollman et al. (2010)
- Arm Swing ASA: Mirelman et al. (2020)
- Trunk Harmonic Ratio: Castelli et al. (2023)
- Compensatory patterns: Roemmich/Stenum et al. (2024)
- Zifchock SA: Zifchock et al. (2008) — note the denominator fix
- Update Kalman description from "1D scalar" to "2-state constant-velocity"
- Update all Section 4 line-range mappings

## ACCEPTANCE CRITERIA
- [ ] 100% test pass rate (npx vitest run) — 0 failures
- [ ] 0 TypeScript errors (npx tsc --noEmit)
- [ ] 0 ESLint errors  
- [ ] Total test count >= 1350
- [ ] Zifchock SA scores double relative to Phase 2
- [ ] Stride length computes ipsilateral (L→L, R→R)
- [ ] Cadence 50 spm gait produces valid analysis
- [ ] Stride duration 3.5s accepted without rejection
- [ ] DTE clamped to [-100%, +100%]
- [ ] Arm swing ASA computed for sagittal views
- [ ] Trunk sway lateral/sagittal excursion computed
- [ ] GPS produces angular deviation in degrees
- [ ] 5+ compensatory patterns detected
- [ ] Fall risk Model A triggers High Risk in frontal views

## FINAL STEP
After all acceptance criteria pass:
1. `git add -A`
2. Commit with comprehensive message covering Phase 3 changes
3. `git push`

# Handoff Report: Milestone 2 Requirements R6 & R7 Investigation

**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/explorer_m2_1/`  
**Target Files:** `src/lib/gait/angles.ts`, `src/lib/gait/fallrisk.ts`, `src/lib/gait/types.ts`  
**Author:** teamwork_preview_explorer (Explorer 1 for M2)  
**Date:** 2026-08-10  

---

## 1. Observation

### 1.1 Existing Code Structure & Signatures

1. **`src/lib/gait/angles.ts`**:
   - `GaitAngleAnalysis` interface (lines 63–71):
     ```typescript
     export interface GaitAngleAnalysis {
       isSuppressed: boolean;
       suppressionReason?: string;
       normalizedPoints: JointAnglePoint[];
       leftStrides: NormalizedGaitCycle[];
       rightStrides: NormalizedGaitCycle[];
       metrics: JointAngleMetrics;
       normativeData: NormativeRangePoint[];
     }
     ```
   - Imports (lines 1–4):
     ```typescript
     import type { Landmark, PoseFrame, ViewAngle } from "./types";
     import type { GaitEvent } from "./events";
     import { LM, angleDeg, mean } from "./landmarks";
     import { zeroPhaseButterworth } from "./signal";
     ```
   - Master analysis function `computeGaitAngleAnalysis` (lines 299–591) processes continuous pose frames, segments strides, and calculates sagittal joint angle metrics (knee, hip, ankle).
   - Currently, `angles.ts` does NOT contain functions for Arm Swing Asymmetry (R6) or Trunk Sway Quantification (R7).

2. **`src/lib/gait/fallrisk.ts`**:
   - `computeFallRiskModelB` (lines 336–483) computes Sub-Score 2 (Trunk Sway) using a crude proxy based on `metrics.lateralSway` (hip X trajectory residual standard deviation):
     ```typescript
     // Sub-Score 2: Trunk Sway (0–100)
     const sway = metrics.lateralSway ?? (metrics.verticalBounce ? metrics.verticalBounce * 0.5 : 0.04);
     const trunkSwayScore = clamp(((sway - 0.05) / (0.15 - 0.05)) * 100, 0, 100);
     ```
   - `computeFallRiskModelB` accepts parameter `angleAnalysis?: GaitAngleAnalysis` (line 339), but currently only reads `angleAnalysis.isSuppressed` and `angleAnalysis.metrics` for Sub-Score 1 (kinematics). It does not read real trunk sway excursion.

3. **`src/lib/gait/landmarks.ts`**:
   - Landmark constants (`LM` object, lines 28–46):
     - `L_SHOULDER: 11`, `R_SHOULDER: 12`
     - `L_WRIST: 15`, `R_WRIST: 16`
     - `L_HIP: 23`, `R_HIP: 24`
     - `L_KNEE: 25`, `R_KNEE: 26`
   - Utility functions: `mid(a, b)` (lines 57–72), `mean(xs)` (lines 151–163), `std(xs)` (lines 165–186).

4. **`src/lib/gait/signal.ts`**:
   - `zeroPhaseButterworth(data, fps, cutoffHz)` (lines 192–283): zero-phase 4th order low-pass Butterworth filter.
   - `olsDetrend(data)` (lines 77–100): Ordinary Least Squares linear detrending.

---

## 2. Logic Chain

### 2.1 Design for Requirement 6: Arm Swing Asymmetry Index (ASA)

1. **Function Signature**:
   ```typescript
   export function calculateArmSwingAsymmetry(
     landmarks: Landmark[][],
     events: { heelStrikes: GaitEvent[] } | GaitEvent[]
   ): {
     leftAmplitude: number;
     rightAmplitude: number;
     asymmetryIndex: number;
     phaseCorrelation: number;
   }
   ```
2. **Arm Vector & Sagittal Angle Computation**:
   - Per frame $t$, extract Left Shoulder (`LM.L_SHOULDER` = 11) to Left Wrist (`LM.L_WRIST` = 15), and Right Shoulder (`LM.R_SHOULDER` = 12) to Right Wrist (`LM.R_WRIST` = 16).
   - Angle relative to vertical:
     $$\theta_{\text{arm}, L}(t) = \text{atan2}(x_{w,L} - x_{s,L}, y_{w,L} - y_{s,L}) \times \frac{180}{\pi}$$
     $$\theta_{\text{arm}, R}(t) = \text{atan2}(x_{w,R} - x_{s,R}, y_{w,R} - y_{s,R}) \times \frac{180}{\pi}$$
   - Apply `zeroPhaseButterworth(angleSeries, 30, 6.0)` when frame count $\ge 10$.
3. **Peak-to-Peak Swing Amplitude**:
   - Compute range over gait cycles / clip: $\text{Amp}_L = \max(\theta_{\text{arm}, L}) - \min(\theta_{\text{arm}, L})$, $\text{Amp}_R = \max(\theta_{\text{arm}, R}) - \min(\theta_{\text{arm}, R})$.
4. **Arm Swing Asymmetry Index (ASA)**:
   $$\text{ASA} = \frac{|\text{Amp}_L - \text{Amp}_R|}{\max(\text{Amp}_L, \text{Amp}_R)} \times 100$$
   Guard: if $\max(\text{Amp}_L, \text{Amp}_R) == 0$, $\text{ASA} = 0$.
5. **Phase Correlation with Contralateral Leg**:
   - Left arm pairs with right leg vector angle (Hip 24 $\rightarrow$ Knee 26). Right arm pairs with left leg vector angle (Hip 23 $\rightarrow$ Knee 25).
   - Compute Pearson correlation $r(\theta_{\text{arm}, L}, \theta_{\text{leg}, R})$ and $r(\theta_{\text{arm}, R}, \theta_{\text{leg}, L})$.
   - $\text{phaseCorrelation} = \frac{r_{L,R} + r_{R,L}}{2}$.

---

### 2.2 Design for Requirement 7: Trunk Sway Quantification

1. **Function Signature**:
   ```typescript
   export function calculateTrunkSway(
     landmarks: Landmark[][]
   ): {
     lateralExcursionDeg: number;
     sagittalExcursionDeg: number;
     harmonicRatio: number;
   }
   ```
2. **C7 / Mid-Shoulder to Mid-Hip Tilt Vector**:
   - Mid-shoulder point: $\mathbf{P}_{\text{sh}}(t) = \text{mid}(\text{LM}_{11}, \text{LM}_{12})$.
   - Mid-hip point: $\mathbf{P}_{\text{hip}}(t) = \text{mid}(\text{LM}_{23}, \text{LM}_{24})$.
   - Trunk vector: $\vec{V}_{\text{trunk}}(t) = (dx, dy, dz) = \mathbf{P}_{\text{sh}}(t) - \mathbf{P}_{\text{hip}}(t)$. Note $dy < 0$ in image coords.
   - Frontal (lateral ML) tilt angle: $\theta_{\text{lat}}(t) = \text{atan2}(dx, -dy) \times \frac{180}{\pi}$.
   - Sagittal (pitch AP) tilt angle: $\theta_{\text{sag}}(t) = \text{atan2}(dz \neq 0 ? dz : dx, -dy) \times \frac{180}{\pi}$.
   - Low-pass filter with `zeroPhaseButterworth(..., 30, 6.0)` for length $\ge 10$.
3. **Peak-to-Peak Angular Excursions**:
   - $\text{lateralExcursionDeg} = \max(\theta_{\text{lat}}) - \min(\theta_{\text{lat}})$.
   - $\text{sagittalExcursionDeg} = \max(\theta_{\text{sag}}) - \min(\theta_{\text{sag}})$.
4. **FFT-based Harmonic Ratio (HR)**:
   - Detrend lateral tilt signal using `olsDetrend(filteredLat)`.
   - Compute Discrete Fourier Transform (DFT) for harmonics $k = 1 \dots 10$:
     $$X(k) = \sum_{n=0}^{M-1} x[n] e^{-i 2\pi k n / M}, \quad \text{Amp}(k) = |X(k)|$$
   - Even harmonics sum ($k = 2, 4, 6, 8, 10$): $P_{\text{even}} = \sum_{m=1}^5 \text{Amp}(2m)$.
   - Odd harmonics sum ($k = 1, 3, 5, 7, 9$): $P_{\text{odd}} = \sum_{m=1}^5 \text{Amp}(2m-1)$.
   - $\text{HarmonicRatio}_{\text{lateral}} = \frac{P_{\text{even}}}{P_{\text{odd}} + 1e-6}$.
5. **Replacing `lateralSway` Proxy in `fallrisk.ts`**:
   - In `computeFallRiskModelB`:
     ```typescript
     let trunkSwayScore = 0;
     if (angleAnalysis?.trunkSway) {
       const latDeg = angleAnalysis.trunkSway.lateralExcursionDeg;
       trunkSwayScore = clamp(((latDeg - 3.0) / (12.0 - 3.0)) * 100, 0, 100);
     } else {
       const sway = metrics.lateralSway ?? (metrics.verticalBounce ? metrics.verticalBounce * 0.5 : 0.04);
       trunkSwayScore = clamp(((sway - 0.05) / (0.15 - 0.05)) * 100, 0, 100);
     }
     ```

---

## 3. Caveats

1. **Short & Stationary Clips ($N < 10$ or zero movement)**:
   - For signals under 10 frames, Butterworth filtering must be bypassed to avoid edge boundary artifacts.
   - Amplitudes should default to `0.0`, asymmetry to `0.0`, and harmonic ratio to `1.0` (healthy baseline).
2. **Missing Keypoint Visibility ($< 0.3$)**:
   - Individual frame angles should fall back to `0` when shoulder, wrist, or hip visibility is $< 0.3$.
3. **Flat Signal / Zero Denominator Guards**:
   - ASA calculation must guard against $\max(\text{Amp}_L, \text{Amp}_R) == 0$.
   - Harmonic Ratio must guard against $P_{\text{odd}} < 1e-6$.
   - Pearson correlation must guard against zero variance ($\text{std} < 1e-8$).

---

## 4. Conclusion

The design for Milestone 2 Requirements R6 and R7 is fully specified, mathematically robust, and zero-dependency.

### 4.1 Proposed Code Additions for `src/lib/gait/angles.ts`

```typescript
export interface ArmSwingAsymmetryResult {
  leftAmplitude: number;
  rightAmplitude: number;
  asymmetryIndex: number;
  phaseCorrelation: number;
}

export interface TrunkSwayResult {
  lateralExcursionDeg: number;
  sagittalExcursionDeg: number;
  harmonicRatio: number;
}

// Updated GaitAngleAnalysis
export interface GaitAngleAnalysis {
  isSuppressed: boolean;
  suppressionReason?: string;
  normalizedPoints: JointAnglePoint[];
  leftStrides: NormalizedGaitCycle[];
  rightStrides: NormalizedGaitCycle[];
  metrics: JointAngleMetrics;
  normativeData: NormativeRangePoint[];
  armSwingAsymmetry?: ArmSwingAsymmetryResult;
  trunkSway?: TrunkSwayResult;
}

export function calculateArmSwingAsymmetry(
  landmarks: Landmark[][],
  events: { heelStrikes: GaitEvent[] } | GaitEvent[],
): ArmSwingAsymmetryResult {
  if (!landmarks || landmarks.length === 0) {
    return { leftAmplitude: 0, rightAmplitude: 0, asymmetryIndex: 0, phaseCorrelation: 0 };
  }

  const n = landmarks.length;
  const leftArmAngles: number[] = new Array(n);
  const rightArmAngles: number[] = new Array(n);
  const leftLegAngles: number[] = new Array(n);
  const rightLegAngles: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const frame = landmarks[i];
    if (!frame || frame.length < 27) {
      leftArmAngles[i] = 0;
      rightArmAngles[i] = 0;
      leftLegAngles[i] = 0;
      rightLegAngles[i] = 0;
      continue;
    }

    const lShoulder = frame[LM.L_SHOULDER];
    const rShoulder = frame[LM.R_SHOULDER];
    const lWrist = frame[LM.L_WRIST];
    const rWrist = frame[LM.R_WRIST];
    const lHip = frame[LM.L_HIP];
    const rHip = frame[LM.R_HIP];
    const lKnee = frame[LM.L_KNEE];
    const rKnee = frame[LM.R_KNEE];

    leftArmAngles[i] =
      lShoulder && lWrist && (lShoulder.visibility ?? 1) >= 0.3 && (lWrist.visibility ?? 1) >= 0.3
        ? (Math.atan2(lWrist.x - lShoulder.x, lWrist.y - lShoulder.y) * 180) / Math.PI
        : 0;

    rightArmAngles[i] =
      rShoulder && rWrist && (rShoulder.visibility ?? 1) >= 0.3 && (rWrist.visibility ?? 1) >= 0.3
        ? (Math.atan2(rWrist.x - rShoulder.x, rWrist.y - rShoulder.y) * 180) / Math.PI
        : 0;

    leftLegAngles[i] =
      lHip && lKnee && (lHip.visibility ?? 1) >= 0.3 && (lKnee.visibility ?? 1) >= 0.3
        ? (Math.atan2(lKnee.x - lHip.x, lKnee.y - lHip.y) * 180) / Math.PI
        : 0;

    rightLegAngles[i] =
      rHip && rKnee && (rHip.visibility ?? 1) >= 0.3 && (rKnee.visibility ?? 1) >= 0.3
        ? (Math.atan2(rKnee.x - rHip.x, rKnee.y - rHip.y) * 180) / Math.PI
        : 0;
  }

  const fps = 30;
  const filteredArmL = n >= 10 ? zeroPhaseButterworth(leftArmAngles, fps, 6.0) : leftArmAngles;
  const filteredArmR = n >= 10 ? zeroPhaseButterworth(rightArmAngles, fps, 6.0) : rightArmAngles;
  const filteredLegL = n >= 10 ? zeroPhaseButterworth(leftLegAngles, fps, 6.0) : leftLegAngles;
  const filteredLegR = n >= 10 ? zeroPhaseButterworth(rightLegAngles, fps, 6.0) : rightLegAngles;

  const leftAmplitude = Number(Math.max(0, Math.max(...filteredArmL) - Math.min(...filteredArmL)).toFixed(2));
  const rightAmplitude = Number(Math.max(0, Math.max(...filteredArmR) - Math.min(...filteredArmR)).toFixed(2));

  const maxAmp = Math.max(leftAmplitude, rightAmplitude);
  const asymmetryIndex = maxAmp > 0
    ? Number(((Math.abs(leftAmplitude - rightAmplitude) / maxAmp) * 100).toFixed(2))
    : 0;

  const corrL = pearsonCorrelation(filteredArmL, filteredLegR);
  const corrR = pearsonCorrelation(filteredArmR, filteredLegL);
  const phaseCorrelation = Number(((corrL + corrR) / 2).toFixed(3));

  return { leftAmplitude, rightAmplitude, asymmetryIndex, phaseCorrelation };
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (!xs || !ys || xs.length !== ys.length || xs.length === 0) return 0;
  const n = xs.length;
  const meanX = mean(xs);
  const meanY = mean(ys);
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den < 1e-8 ? 0 : Math.max(-1, Math.min(1, num / den));
}

export function calculateTrunkSway(landmarks: Landmark[][]): TrunkSwayResult {
  if (!landmarks || landmarks.length === 0) {
    return { lateralExcursionDeg: 0, sagittalExcursionDeg: 0, harmonicRatio: 1.0 };
  }

  const n = landmarks.length;
  const lateralTilt: number[] = new Array(n);
  const sagittalTilt: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const frame = landmarks[i];
    if (!frame || frame.length < 25) {
      lateralTilt[i] = 0;
      sagittalTilt[i] = 0;
      continue;
    }

    const midShoulder = mid(frame[LM.L_SHOULDER], frame[LM.R_SHOULDER]);
    const midHip = mid(frame[LM.L_HIP], frame[LM.R_HIP]);

    const dx = midShoulder.x - midHip.x;
    const dy = midShoulder.y - midHip.y;
    const dz = (midShoulder.z ?? 0) - (midHip.z ?? 0);

    lateralTilt[i] = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const sagittalDisp = Math.abs(dz) > 1e-4 ? dz : dx;
    sagittalTilt[i] = (Math.atan2(sagittalDisp, -dy) * 180) / Math.PI;
  }

  const fps = 30;
  const filteredLat = n >= 10 ? zeroPhaseButterworth(lateralTilt, fps, 6.0) : lateralTilt;
  const filteredSag = n >= 10 ? zeroPhaseButterworth(sagittalTilt, fps, 6.0) : sagittalTilt;

  const lateralExcursionDeg = Number(Math.max(0, Math.max(...filteredLat) - Math.min(...filteredLat)).toFixed(2));
  const sagittalExcursionDeg = Number(Math.max(0, Math.max(...filteredSag) - Math.min(...filteredSag)).toFixed(2));
  const harmonicRatio = computeHarmonicRatio(filteredLat);

  return { lateralExcursionDeg, sagittalExcursionDeg, harmonicRatio };
}

function computeHarmonicRatio(signal: number[]): number {
  if (!signal || signal.length < 8) return 1.0;
  const detrended = olsDetrend(signal);
  const M = detrended.length;
  let evenSum = 0, oddSum = 0;

  for (let k = 1; k <= 10; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < M; n++) {
      const angle = (2 * Math.PI * k * n) / M;
      re += detrended[n] * Math.cos(angle);
      im -= detrended[n] * Math.sin(angle);
    }
    const amp = Math.sqrt(re * re + im * im);
    if (k % 2 === 0) evenSum += amp;
    else oddSum += amp;
  }

  if (oddSum < 1e-6) return 1.0;
  return Number((evenSum / oddSum).toFixed(2));
}
```

---

## 5. Verification Method

To independently verify R6 and R7 after implementation:

1. **Type Checking & Compilation**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected outcome:* 0 TypeScript errors.

2. **Existing Test Suite Regression**:
   ```bash
   npx vitest run src/lib/gait/__tests__/angles.test.ts
   npx vitest run src/lib/gait/__tests__/fallrisk.test.ts
   ```
   *Expected outcome:* 100% pass rate.

3. **New Function Unit Verification**:
   - Test symmetric arm swing ($\text{ASA} \approx 0$).
   - Test frozen one-arm swing ($\text{ASA} \approx 100$).
   - Test phase correlation ($r \approx 1.0$ for opposing arm/leg motion).
   - Test stationary trunk ($\text{excursion} \approx 0$).
   - Test periodic lateral sway ($\text{HR} > 1.5$).

/**
 * Scientific Signal Processing Module for Gait Analysis
 *
 * Implements:
 * 1. 4th-Order Zero-Phase Low-Pass Butterworth Filter (fc = 6.0 Hz default) with Uniform Resampling Guard
 * 2. Adaptive Savitzky-Golay 1D Temporal Smoothing Filter with boundary reflection padding
 * 3. 2-State Constant-Velocity Kalman Filter with Occlusion Coasting & Visibility Gating
 */

import type { Landmark, PoseFrame } from "./types";

export type LandmarkFrame = PoseFrame;

/**
 * 2nd-order Biquad Filter Section (Direct Form I / II Transposed)
 */
interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * Compute Biquad Coefficients for a low-pass filter stage.
 */
function computeBiquadLowPass(fps: number, cutoffHz: number, Q: number): BiquadCoeffs {
  // Cap cutoff frequency below Nyquist limit
  const nyquist = fps / 2;
  const fc = Math.min(cutoffHz, nyquist * 0.95);
  const K = Math.tan((Math.PI * fc) / fps);
  const norm = 1 + K / Q + K * K;

  const b0 = (K * K) / norm;
  const b1 = (2 * K * K) / norm;
  const b2 = (K * K) / norm;
  const a1 = (2 * (K * K - 1)) / norm;
  const a2 = (1 - K / Q + K * K) / norm;

  return { b0, b1, b2, a1, a2 };
}

/**
 * Apply a single Biquad filter stage to a data array.
 */
function applyBiquad(data: number[], coeffs: BiquadCoeffs): number[] {
  const n = data.length;
  if (n === 0) return [];
  const out = new Array<number>(n);
  const { b0, b1, b2, a1, a2 } = coeffs;

  const initVal = Number.isFinite(data[0]) ? data[0] : 0;
  let x1 = initVal;
  let x2 = initVal;
  let y1 = initVal;
  let y2 = initVal;

  for (let i = 0; i < n; i++) {
    const x = Number.isFinite(data[i]) ? data[i] : 0;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;

    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }

  return out;
}

/**
 * Ordinary Least Squares (OLS) Linear Detrending.
 * Removes linear trend from input data array.
 */
export function olsDetrend(data: number[]): number[] {
  if (!data || data.length < 2) return data ? data.slice() : [];
  const n = data.length;
  const xMean = (n - 1) / 2;
  let ySum = 0;
  for (let i = 0; i < n; i++) {
    ySum += Number.isFinite(data[i]) ? data[i] : 0;
  }
  const yMean = ySum / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const yVal = Number.isFinite(data[i]) ? data[i] : 0;
    const xDiff = i - xMean;
    num += xDiff * (yVal - yMean);
    den += xDiff * xDiff;
  }
  const slope = den !== 0 ? num / den : 0;
  return data.map((y, i) => {
    const yVal = Number.isFinite(y) ? y : 0;
    return yVal - (yMean + slope * (i - xMean));
  });
}

/**
 * Causal 4th-Order Low-Pass Butterworth Digital Filter.
 * Formed by cascading two 2nd-order biquad stages with Butterworth pole Q values:
 * Q1 = 1 / (2 * cos(pi / 8)) ≈ 0.5411961
 * Q2 = 1 / (2 * cos(3 * pi / 8)) ≈ 1.3065630
 */
export function butterworthLowPass(
  data: number[],
  fps: number,
  cutoffHz = 6.0,
): number[] {
  if (!data || data.length < 5 || fps <= 0) {
    return data ? [...data.map((v) => (Number.isFinite(v) ? v : 0))] : [];
  }

  // Sanitize non-finite values
  const cleanData = data.map((v) => (Number.isFinite(v) ? v : 0));

  const Q1 = 1 / (2 * Math.cos(Math.PI / 8));
  const Q2 = 1 / (2 * Math.cos((3 * Math.PI) / 8));

  const coeffs1 = computeBiquadLowPass(fps, cutoffHz, Q1);
  const coeffs2 = computeBiquadLowPass(fps, cutoffHz, Q2);

  const stage1 = applyBiquad(cleanData, coeffs1);
  const stage2 = applyBiquad(stage1, coeffs2);
  return stage2.map((v) => (Number.isFinite(v) ? v : 0));
}

/**
 * 1D Linear Interpolation Helper.
 * Interpolates (xOrig, yOrig) dataset at target x-coordinates xTarget with boundary clamping.
 */
export function linearInterpolate(
  xOrig: number[],
  yOrig: number[],
  xTarget: number[],
): number[] {
  if (!xOrig || !yOrig || !xTarget || xOrig.length === 0 || yOrig.length === 0 || xTarget.length === 0) {
    return xTarget ? xTarget.map(() => 0) : [];
  }
  const n = Math.min(xOrig.length, yOrig.length);
  if (n === 1) {
    return xTarget.map(() => yOrig[0]);
  }

  const out = new Array<number>(xTarget.length);
  const x0 = xOrig[0];
  const xN = xOrig[n - 1];

  for (let i = 0; i < xTarget.length; i++) {
    const xt = xTarget[i];
    if (xt <= x0) {
      out[i] = yOrig[0];
    } else if (xt >= xN) {
      out[i] = yOrig[n - 1];
    } else {
      let j = 0;
      let low = 0;
      let high = n - 2;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (xOrig[mid] <= xt) {
          j = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      const xA = xOrig[j];
      const xB = xOrig[j + 1];
      const yA = yOrig[j];
      const yB = yOrig[j + 1];
      const dx = xB - xA;
      if (dx === 0) {
        out[i] = yA;
      } else {
        out[i] = yA + (yB - yA) * ((xt - xA) / dx);
      }
    }
  }

  return out;
}

/**
 * Zero-Phase 4th-Order Low-Pass Butterworth Digital Filter (filtfilt equivalent).
 * Applies forward filtering, array reversal, backward filtering, and boundary padding.
 * Includes Uniform Resampling Guard when timestamps exhibit non-uniformity (CV > 0.10 or var/mean > 0.10).
 */
export function zeroPhaseButterworth(
  data: number[],
  fps: number,
  cutoffHz = 6.0,
  options?: { timestamps?: number[]; dt?: number } | number[],
): number[] {
  if (!data || data.length < 5 || fps <= 0) {
    return data ? [...data.map((v) => (Number.isFinite(v) ? v : 0))] : [];
  }

  // Parse timestamps option
  let timestamps: number[] | undefined;
  if (Array.isArray(options)) {
    timestamps = options;
  } else if (options && Array.isArray(options.timestamps)) {
    timestamps = options.timestamps;
  }

  // Check uniform resampling guard
  if (timestamps && timestamps.length === data.length && timestamps.length >= 2) {
    const n = timestamps.length;
    let sumDt = 0;
    const dtArr = new Array<number>(n - 1);
    for (let k = 0; k < n - 1; k++) {
      const dtVal = timestamps[k + 1] - timestamps[k];
      dtArr[k] = dtVal;
      sumDt += dtVal;
    }
    const meanDt = sumDt / (n - 1);
    if (meanDt > 0) {
      let varSum = 0;
      for (let k = 0; k < n - 1; k++) {
        const diff = dtArr[k] - meanDt;
        varSum += diff * diff;
      }
      const varDt = varSum / (n - 1);
      const stdDt = Math.sqrt(varDt);
      const cv = stdDt / meanDt;
      const varRatio = varDt / meanDt;

      if (cv > 0.10 || varRatio > 0.10) {
        // Resample data to uniform grid
        const t0 = timestamps[0];
        const tGrid = new Array<number>(n);
        for (let k = 0; k < n; k++) {
          tGrid[k] = t0 + k * meanDt;
        }
        const effectiveFps = 1 / meanDt;
        const dataUniform = linearInterpolate(timestamps, data, tGrid);
        const filteredUniform = zeroPhaseButterworth(dataUniform, effectiveFps, cutoffHz);
        return linearInterpolate(tGrid, filteredUniform, timestamps);
      }
    }
  }

  const cleanData = data.map((v) => (Number.isFinite(v) ? v : 0));
  const n = cleanData.length;
  const padLen = Math.min(24, n - 1);

  // Boundary reflection padding
  const padded = new Array<number>(n + 2 * padLen);

  // Left padding: reflection around data[0]
  for (let i = 0; i < padLen; i++) {
    padded[i] = 2 * cleanData[0] - cleanData[padLen - i];
  }

  // Original data
  for (let i = 0; i < n; i++) {
    padded[padLen + i] = cleanData[i];
  }

  // Right padding: reflection around data[n - 1]
  for (let i = 0; i < padLen; i++) {
    padded[padLen + n + i] = 2 * cleanData[n - 1] - cleanData[n - 2 - i];
  }

  // Forward pass
  const forwardFiltered = butterworthLowPass(padded, fps, cutoffHz);

  // Reverse array
  const reversed = forwardFiltered.reverse();

  // Backward pass
  const backwardFiltered = butterworthLowPass(reversed, fps, cutoffHz);

  // Re-reverse array
  const finalFiltered = backwardFiltered.reverse();

  // Extract unpadded slice
  return finalFiltered.slice(padLen, padLen + n).map((v) => (Number.isFinite(v) ? v : 0));
}

/**
 * Computes optimal odd Savitzky-Golay window size for a given FPS.
 * Formula: raw = Math.round(fps * 0.17), odd = raw % 2 === 0 ? raw + 1 : raw, clamped to [5, 15].
 */
export function computeSgWindowSize(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return 5;
  const raw = Math.round(fps * 0.17);
  const odd = raw % 2 === 0 ? raw + 1 : raw;
  return Math.max(5, Math.min(15, odd));
}

/**
 * General Savitzky-Golay 1D Temporal Smoothing Filter with Gram Matrix Polynomial Kernel Weights.
 * Supports odd window size M in [5, 15] and reflection boundary padding.
 */
export function savitzkyGolay(signal: number[], windowSize = 5): number[] {
  if (!signal || signal.length === 0) return [];

  let M = Math.round(windowSize);
  if (M % 2 === 0) M += 1;
  M = Math.max(5, Math.min(15, M));

  const n = signal.length;
  if (n < M) {
    return signal.map((v) => (Number.isFinite(v) ? v : 0));
  }

  const m = (M - 1) / 2; // half-width

  // Gram matrix weights c_k = (S_4 - S_2 * k^2) / D
  const S0 = M;
  let S2 = 0;
  let S4 = 0;

  for (let k = -m; k <= m; k++) {
    const k2 = k * k;
    S2 += k2;
    S4 += k2 * k2;
  }

  const D = S0 * S4 - S2 * S2;
  const c = new Float64Array(M);
  for (let k = -m; k <= m; k++) {
    c[k + m] = (S4 - S2 * k * k) / D;
  }

  const cleanData = signal.map((v) => (Number.isFinite(v) ? v : 0));
  const padded = new Array<number>(n + 2 * m);

  // Left padding: reflection around cleanData[0]
  for (let j = 1; j <= m; j++) {
    padded[m - j] = 2 * cleanData[0] - cleanData[j];
  }

  // Copy original data
  for (let i = 0; i < n; i++) {
    padded[m + i] = cleanData[i];
  }

  // Right padding: reflection around cleanData[n - 1]
  for (let j = 1; j <= m; j++) {
    padded[m + n - 1 + j] = 2 * cleanData[n - 1] - cleanData[n - 1 - j];
  }

  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const centerIdx = m + i;
    for (let k = -m; k <= m; k++) {
      sum += c[k + m] * padded[centerIdx + k];
    }
    out[i] = Number.isFinite(sum) ? sum : 0;
  }

  return out;
}

/**
 * Adaptive Savitzky-Golay 1D Temporal Smoothing Filter.
 * Dynamically scales window size based on sampling rate FPS.
 */
export function savitzkyGolayAdaptive(signal: number[], fps = 30): number[] {
  const windowSize = computeSgWindowSize(fps);
  return savitzkyGolay(signal, windowSize);
}

/**
 * 5-Point Savitzky-Golay 1D Temporal Smoothing Filter.
 * Retained for 100% backward compatibility.
 */
export function savitzkyGolay5(signal: number[]): number[] {
  return savitzkyGolay(signal, 5);
}

/**
 * Configuration options for Kalman Filter
 */
export interface KalmanOptions {
  processNoise?: number;
  measurementNoise?: number;
  dt?: number;
  visibility?: number | number[];
}

/**
 * Result structure containing position and velocity estimates
 */
export interface KalmanResult2D {
  position: number[];
  velocity: number[];
}

/**
 * 2-State Constant-Velocity Kalman Filter with Occlusion Coasting & Visibility Gating.
 *
 * State vector: x = [pos, vel]^T
 * State transition: F = [[1, dt], [0, 1]]
 * Process noise: Q(dt) continuous white-noise acceleration model: q * [[dt^3/3, dt^2/2], [dt^2/2, dt]]
 * Measurement matrix: H = [1, 0], measurement noise R
 *
 * Handles occlusion (NaN / Infinity) and low keypoint visibility (< 0.4) by coasting velocity prediction
 * with velocity damping (0.98 factor) and covariance inflation (Q * 2.0).
 */
export function kalmanFilter1D(
  signal: number[],
  processNoiseOrOptions?: number | KalmanOptions,
  measurementNoiseArg?: number,
  dtArg?: number,
): number[] & KalmanResult2D {
  if (!signal || signal.length === 0) {
    const empty: number[] = [];
    Object.defineProperties(empty, {
      position: { value: [], enumerable: false, writable: true, configurable: true },
      velocity: { value: [], enumerable: false, writable: true, configurable: true },
    });
    return empty as number[] & KalmanResult2D;
  }

  let processNoise = 1e-4;
  let measurementNoise = 1e-2;
  let dt = 1 / 30;
  let visibility: number | number[] | undefined;

  if (typeof processNoiseOrOptions === "object" && processNoiseOrOptions !== null) {
    if (typeof processNoiseOrOptions.processNoise === "number") processNoise = processNoiseOrOptions.processNoise;
    if (typeof processNoiseOrOptions.measurementNoise === "number") measurementNoise = processNoiseOrOptions.measurementNoise;
    if (typeof processNoiseOrOptions.dt === "number") dt = processNoiseOrOptions.dt;
    if (processNoiseOrOptions.visibility !== undefined) visibility = processNoiseOrOptions.visibility;
  } else {
    if (typeof processNoiseOrOptions === "number") processNoise = processNoiseOrOptions;
    if (typeof measurementNoiseArg === "number") measurementNoise = measurementNoiseArg;
    if (typeof dtArg === "number") dt = dtArg;
  }

  const q = Math.max(1e-9, processNoise);
  const R = Math.max(1e-9, measurementNoise);
  const validDt = Math.max(1e-6, dt);

  // Q matrix elements
  const Q00 = q * ((validDt * validDt * validDt) / 3);
  const Q01 = q * ((validDt * validDt) / 2);
  const Q10 = Q01;
  const Q11 = q * validDt;

  const n = signal.length;
  const posOut = new Array<number>(n);
  const velOut = new Array<number>(n);

  let firstFiniteIdx = -1;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(signal[i])) {
      firstFiniteIdx = i;
      break;
    }
  }

  if (firstFiniteIdx === -1) {
    posOut.fill(0);
    velOut.fill(0);
    Object.defineProperties(posOut, {
      position: { value: posOut, enumerable: false, writable: true, configurable: true },
      velocity: { value: velOut, enumerable: false, writable: true, configurable: true },
    });
    return posOut as number[] & KalmanResult2D;
  }

  // Initial state vector x = [pos, vel]^T and error covariance P
  let x0 = signal[firstFiniteIdx];
  let x1 = 0;

  let P00 = 1.0;
  let P01 = 0.0;
  let P10 = 0.0;
  let P11 = 1.0;

  for (let i = 0; i < n; i++) {
    if (i < firstFiniteIdx) {
      posOut[i] = 0;
      velOut[i] = 0;
      continue;
    }

    if (i === firstFiniteIdx) {
      x0 = signal[firstFiniteIdx];
      x1 = 0;
      posOut[i] = x0;
      velOut[i] = x1;
      continue;
    }

    const z = signal[i];
    const vis = Array.isArray(visibility) ? visibility[i] : visibility;

    // Time update (predict)
    const xPred0 = x0 + x1 * validDt;
    const xPred1 = x1;

    const PPred00 = P00 + validDt * (P01 + P10) + validDt * validDt * P11 + Q00;
    const PPred01 = P01 + validDt * P11 + Q01;
    const PPred10 = P10 + validDt * P11 + Q10;
    const PPred11 = P11 + Q11;

    const isValid = Number.isFinite(z) && (vis === undefined || vis >= 0.4);

    if (isValid) {
      // Measurement update (correct)
      const y = z - xPred0;
      const S = PPred00 + R;
      const K0 = PPred00 / S;
      const K1 = PPred10 / S;

      x0 = xPred0 + K0 * y;
      x1 = xPred1 + K1 * y;

      const PNew00 = (1 - K0) * PPred00;
      const PNew01 = (1 - K0) * PPred01;
      const PNew10 = PPred10 - K1 * PPred00;
      const PNew11 = PPred11 - K1 * PPred01;

      // Symmetry averaging
      const avg01 = (PNew01 + PNew10) / 2;
      P00 = PNew00;
      P01 = avg01;
      P10 = avg01;
      P11 = PNew11;
    } else {
      // Occlusion coasting & visibility gating: decay velocity & inflate covariance
      x0 = xPred0;
      x1 = xPred1 * 0.98;

      P00 = PPred00 + Q00 * 2.0;
      P01 = PPred01 + Q01 * 2.0;
      P10 = PPred10 + Q10 * 2.0;
      P11 = PPred11 + Q11 * 2.0;
    }

    posOut[i] = Number.isFinite(x0) ? x0 : 0;
    velOut[i] = Number.isFinite(x1) ? x1 : 0;
  }

  Object.defineProperties(posOut, {
    position: { value: posOut, enumerable: false, writable: true, configurable: true },
    velocity: { value: velOut, enumerable: false, writable: true, configurable: true },
  });
  return posOut as number[] & KalmanResult2D;
}

/**
 * Explicit 2D Kalman Filter returning position and velocity arrays.
 */
export function kalmanFilter2D(
  signal: number[],
  processNoiseOrOptions?: number | KalmanOptions,
  measurementNoiseArg?: number,
  dtArg?: number,
): KalmanResult2D {
  const result = kalmanFilter1D(signal, processNoiseOrOptions, measurementNoiseArg, dtArg);
  return {
    position: result.position,
    velocity: result.velocity,
  };
}

/**
 * Applies 1D temporal coordinate smoothing across all keypoints'
 * (x, y, z) spatial coordinates across pose frames.
 *
 * Supports 'savitzky-golay' (default), 'kalman', and 'none' filter methods.
 * Handles landmark visibility, presence, and timestamp metadata untouched.
 * Returns input frames unaltered when N < 5 or method is 'none'.
 */
export function smoothPoseFrames<T extends PoseFrame>(
  frames: T[],
  method: "savitzky-golay" | "kalman" | "none" = "savitzky-golay",
  options?: { processNoise?: number; measurementNoise?: number; fps?: number; dt?: number },
): T[] {
  if (!frames || frames.length < 5 || method === "none") {
    return frames ? frames.slice() : [];
  }

  const n = frames.length;
  const firstFrame = frames[0];
  const numLandmarks = firstFrame?.landmarks?.length ?? 0;
  if (numLandmarks === 0) {
    return frames.slice();
  }

  const isKalman = method === "kalman";
  const pNoise = options?.processNoise;
  const mNoise = options?.measurementNoise;

  const filter1D = (sig: number[], visSig?: number[]): number[] => {
    if (isKalman) {
      return kalmanFilter1D(sig, {
        processNoise: pNoise,
        measurementNoise: mNoise,
        dt: options?.dt,
        visibility: visSig,
      });
    }
    if (options?.fps) {
      return savitzkyGolayAdaptive(sig, options.fps);
    }
    return savitzkyGolay5(sig);
  };

  const smoothedX: number[][] = new Array(numLandmarks);
  const smoothedY: number[][] = new Array(numLandmarks);
  const smoothedZ: number[][] = new Array(numLandmarks);

  const xSig = new Array<number>(n);
  const ySig = new Array<number>(n);
  const zSig = new Array<number>(n);
  const visSig = new Array<number>(n);

  for (let j = 0; j < numLandmarks; j++) {
    for (let i = 0; i < n; i++) {
      const lm = frames[i].landmarks[j];
      xSig[i] = lm?.x ?? 0;
      ySig[i] = lm?.y ?? 0;
      zSig[i] = lm?.z ?? 0;
      visSig[i] = lm?.visibility ?? 1.0;
    }
    smoothedX[j] = filter1D(xSig, visSig);
    smoothedY[j] = filter1D(ySig, visSig);
    smoothedZ[j] = filter1D(zSig, visSig);
  }

  const hasWorld = Boolean(firstFrame.worldLandmarks && firstFrame.worldLandmarks.length > 0);
  const numWorld = hasWorld ? firstFrame.worldLandmarks!.length : 0;
  const smoothedWX: number[][] = hasWorld ? new Array(numWorld) : [];
  const smoothedWY: number[][] = hasWorld ? new Array(numWorld) : [];
  const smoothedWZ: number[][] = hasWorld ? new Array(numWorld) : [];

  if (hasWorld) {
    const wxSig = new Array<number>(n);
    const wySig = new Array<number>(n);
    const wzSig = new Array<number>(n);
    const wvisSig = new Array<number>(n);

    for (let j = 0; j < numWorld; j++) {
      for (let i = 0; i < n; i++) {
        const wlm = frames[i].worldLandmarks?.[j];
        wxSig[i] = wlm?.x ?? 0;
        wySig[i] = wlm?.y ?? 0;
        wzSig[i] = wlm?.z ?? 0;
        wvisSig[i] = wlm?.visibility ?? 1.0;
      }
      smoothedWX[j] = filter1D(wxSig, wvisSig);
      smoothedWY[j] = filter1D(wySig, wvisSig);
      smoothedWZ[j] = filter1D(wzSig, wvisSig);
    }
  }

  const out = new Array<T>(n);
  for (let i = 0; i < n; i++) {
    const origFrame = frames[i];
    const origLms = origFrame.landmarks;
    const rawNumLms = origLms.length;
    const clampedLms = Math.min(rawNumLms, numLandmarks);
    const newLandmarks: Landmark[] = new Array(rawNumLms);

    for (let j = 0; j < clampedLms; j++) {
      const origLm = origLms[j];
      const lm: Landmark = {
        x: smoothedX[j][i],
        y: smoothedY[j][i],
        z: smoothedZ[j][i],
      };
      if (origLm) {
        if (origLm.visibility !== undefined) lm.visibility = origLm.visibility;
        if (origLm.presence !== undefined) lm.presence = origLm.presence;
      }
      newLandmarks[j] = lm;
    }
    for (let j = clampedLms; j < rawNumLms; j++) {
      const origLm = origLms[j];
      newLandmarks[j] = origLm ? { ...origLm } : { x: 0, y: 0, z: 0 };
    }

    let newWlms: Landmark[] | undefined;
    if (hasWorld && origFrame.worldLandmarks) {
      const origWlms = origFrame.worldLandmarks;
      const numW = origWlms.length;
      newWlms = new Array(numW);
      for (let j = 0; j < numW; j++) {
        const origWlm = origWlms[j];
        const wlm: Landmark = {
          x: smoothedWX[j][i],
          y: smoothedWY[j][i],
          z: smoothedWZ[j][i],
        };
        if (origWlm) {
          if (origWlm.visibility !== undefined) wlm.visibility = origWlm.visibility;
          if (origWlm.presence !== undefined) wlm.presence = origWlm.presence;
        }
        newWlms[j] = wlm;
      }
    }

    out[i] = {
      ...origFrame,
      landmarks: newLandmarks,
      ...(newWlms ? { worldLandmarks: newWlms } : {}),
    };
  }

  return out;
}

/**
 * One Euro Filter — Speed-based Adaptive Low-Pass Filter for Interactive Systems.
 *
 * Casiez, G., Roussel, N., & Vogel, D. (2012). 1€ Filter: A Simple Speed-based
 * Low-pass Filter for Noisy Input in Interactive Systems. CHI 2012.
 *
 * Key idea: adaptive cutoff frequency = minCutoff + beta * |dx/dt|.
 * - At rest (low speed): cutoff ≈ minCutoff → strong smoothing
 * - During fast motion (high speed): cutoff increases → minimal lag
 *
 * Parameters:
 * - freq: sampling rate in Hz
 * - minCutoff: minimum cutoff frequency (lower = more smoothing at rest)
 * - beta: speed coefficient (higher = less lag during fast motion)
 * - dCutoff: cutoff frequency for the derivative filter
 */
export class OneEuroFilter {
  private freq: number;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxFiltered: number = 0;
  private tPrev: number | null = null;

  constructor(
    freq: number = 30,
    minCutoff: number = 1.0,
    beta: number = 0.007,
    dCutoff: number = 1.0,
  ) {
    this.freq = Math.max(1, freq);
    this.minCutoff = Math.max(0.001, minCutoff);
    this.beta = Math.max(0, beta);
    this.dCutoff = Math.max(0.001, dCutoff);
  }

  private smoothingFactor(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return Math.min(1.0, Math.max(0.0, dt / (dt + tau)));
  }

  /** Filter a single sample. Optionally provide a timestamp (seconds) for VFR support. */
  filter(x: number, timestamp?: number): number {
    if (!Number.isFinite(x)) return this.xPrev ?? x;

    let dt = 1.0 / this.freq;
    if (timestamp !== undefined && this.tPrev !== null) {
      const elapsed = timestamp - this.tPrev;
      if (elapsed > 0 && elapsed < 2.0) dt = elapsed;
    }
    if (timestamp !== undefined) this.tPrev = timestamp;

    if (this.xPrev === null) {
      this.xPrev = x;
      this.dxFiltered = 0;
      return x;
    }

    // Compute raw derivative
    const dx = (x - this.xPrev) / dt;

    // Filter the derivative with dCutoff
    const alphaD = this.smoothingFactor(this.dCutoff, dt);
    this.dxFiltered = alphaD * dx + (1 - alphaD) * this.dxFiltered;

    // Adaptive cutoff based on filtered derivative speed
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxFiltered);

    // Filter the signal with adaptive cutoff
    const alpha = this.smoothingFactor(cutoff, dt);
    const filtered = alpha * x + (1 - alpha) * this.xPrev;

    this.xPrev = filtered;
    return filtered;
  }

  /** Reset filter state — call when target identity changes. */
  reset(): void {
    this.xPrev = null;
    this.dxFiltered = 0;
    this.tPrev = null;
  }
}

/**
 * Scientific Signal Processing Module for Gait Analysis
 *
 * Implements:
 * 1. 4th-Order Zero-Phase Low-Pass Butterworth Filter (fc = 6.0 Hz default)
 * 2. 5-Point Savitzky-Golay 1D Temporal Smoothing Filter with boundary reflection padding
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
 * Zero-Phase 4th-Order Low-Pass Butterworth Digital Filter (filtfilt equivalent).
 * Applies forward filtering, array reversal, backward filtering, and boundary padding
 * to eliminate phase delay/distortion.
 */
export function zeroPhaseButterworth(
  data: number[],
  fps: number,
  cutoffHz = 6.0,
): number[] {
  if (!data || data.length < 5 || fps <= 0) {
    return data ? [...data.map((v) => (Number.isFinite(v) ? v : 0))] : [];
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
 * 5-Point Savitzky-Golay 1D Temporal Smoothing Filter.
 * Fits a local 2nd/3rd degree polynomial to a moving window of 5 points using kernel 1/35 * [-3, 12, 17, 12, -3].
 * Uses linear boundary reflection padding for N >= 5 frames:
 *   x_{-1} = 2*x_0 - x_1,   x_{-2} = 2*x_0 - x_2
 *   x_N = 2*x_{N-1} - x_{N-2}, x_{N+1} = 2*x_{N-1} - x_{N-3}
 * Gracefully returns input unaltered for N < 5 frames.
 */
export function savitzkyGolay5(signal: number[]): number[] {
  if (!signal || signal.length < 5) {
    return signal ? signal.map((v) => (Number.isFinite(v) ? v : 0)) : [];
  }

  const n = signal.length;
  const padded = new Array<number>(n + 4);

  const s0 = Number.isFinite(signal[0]) ? signal[0] : 0;
  const s1 = Number.isFinite(signal[1]) ? signal[1] : 0;
  const s2 = Number.isFinite(signal[2]) ? signal[2] : 0;

  padded[0] = 2 * s0 - s2;
  padded[1] = 2 * s0 - s1;

  for (let i = 0; i < n; i++) {
    const v = signal[i];
    padded[i + 2] = Number.isFinite(v) ? v : 0;
  }

  const sn1 = padded[n + 1];
  const sn2 = padded[n];
  const sn3 = padded[n - 1];

  padded[n + 2] = 2 * sn1 - sn2;
  padded[n + 3] = 2 * sn1 - sn3;

  const out = new Array<number>(n);
  const inv35 = 1 / 35;

  for (let i = 0; i < n; i++) {
    const idx = i + 2;
    out[i] = inv35 * (
      -3 * padded[idx - 2] +
      12 * padded[idx - 1] +
      17 * padded[idx] +
      12 * padded[idx + 1] -
       3 * padded[idx + 2]
    );
  }

  return out;
}

/**
 * 1D Scalar Kalman Filter with Occlusion Coasting.
 *
 * State model:
 *   x_k = x_{k-1} + w_k,  w_k ~ N(0, Q)  (Process noise Q = 1e-4 default)
 *   z_k = x_k + v_k,      v_k ~ N(0, R)  (Measurement noise R = 1e-2 default)
 *
 * If measurement z_k is NaN or Infinity (occlusion), skip prediction-update step and coast forward
 * maintaining previous state x_{k-1} and updating error covariance P_k = P_{k-1} + Q.
 */
export function kalmanFilter1D(
  signal: number[],
  processNoise = 1e-4,
  measurementNoise = 1e-2,
): number[] {
  if (!signal || signal.length === 0) return [];
  const n = signal.length;
  const out = new Array<number>(n);

  const Q = Math.max(1e-9, processNoise);
  const R = Math.max(1e-9, measurementNoise);

  // Find first finite measurement to initialize state
  let firstFiniteIdx = -1;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(signal[i])) {
      firstFiniteIdx = i;
      break;
    }
  }

  let x = firstFiniteIdx >= 0 ? signal[firstFiniteIdx] : 0;
  let P = 1.0;

  for (let i = 0; i < n; i++) {
    const z = signal[i];
    // Time update (predict)
    const xPrior = x;
    const PPrior = P + Q;

    if (Number.isFinite(z)) {
      // Measurement update (correct)
      const K = PPrior / (PPrior + R);
      x = xPrior + K * (z - xPrior);
      P = (1 - K) * PPrior;
    } else {
      // Occlusion coasting: hold prior prediction, accumulate error covariance
      x = xPrior;
      P = PPrior;
    }

    out[i] = Number.isFinite(x) ? x : 0;
  }

  return out;
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
  options?: { processNoise?: number; measurementNoise?: number },
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

  const filter1D = (sig: number[]): number[] => {
    if (isKalman) {
      return kalmanFilter1D(sig, pNoise, mNoise);
    }
    return savitzkyGolay5(sig);
  };

  const smoothedX: number[][] = new Array(numLandmarks);
  const smoothedY: number[][] = new Array(numLandmarks);
  const smoothedZ: number[][] = new Array(numLandmarks);

  const xSig = new Array<number>(n);
  const ySig = new Array<number>(n);
  const zSig = new Array<number>(n);

  for (let j = 0; j < numLandmarks; j++) {
    for (let i = 0; i < n; i++) {
      const lm = frames[i].landmarks[j];
      xSig[i] = lm?.x ?? 0;
      ySig[i] = lm?.y ?? 0;
      zSig[i] = lm?.z ?? 0;
    }
    smoothedX[j] = filter1D(xSig);
    smoothedY[j] = filter1D(ySig);
    smoothedZ[j] = filter1D(zSig);
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

    for (let j = 0; j < numWorld; j++) {
      for (let i = 0; i < n; i++) {
        const wlm = frames[i].worldLandmarks?.[j];
        wxSig[i] = wlm?.x ?? 0;
        wySig[i] = wlm?.y ?? 0;
        wzSig[i] = wlm?.z ?? 0;
      }
      smoothedWX[j] = filter1D(wxSig);
      smoothedWY[j] = filter1D(wySig);
      smoothedWZ[j] = filter1D(wzSig);
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
    // Copy any landmarks beyond the smoothed range directly from original
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

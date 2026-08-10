import { describe, it, expect } from "vitest";
import {
  kalmanFilter1D,
  computeSgWindowSize,
  savitzkyGolayAdaptive,
  zeroPhaseButterworth,
} from "../signal";

describe("Milestone 2 Empirical Stress Tests (signal_m2_stress.test.ts)", () => {
  describe("1. 2-State Kalman Filter Stress Tests", () => {
    it("1.1 Coasting trajectory prediction & re-lock accuracy during 10-frame NaN occlusion gap", () => {
      const fps = 30;
      const dt = 1 / fps;
      const velocity = 150.0; // mm/s
      const initialPos = 100.0; // mm
      const totalFrames = 50;
      const gapStart = 20;
      const gapEnd = 29; // 10 frames of NaN

      const truePos: number[] = [];
      const trueVel: number[] = [];
      const noisySignal: number[] = [];

      for (let i = 0; i < totalFrames; i++) {
        const t = i * dt;
        const pos = initialPos + velocity * t;
        truePos.push(pos);
        trueVel.push(velocity);

        if (i >= gapStart && i <= gapEnd) {
          noisySignal.push(NaN);
        } else {
          const noise = (Math.sin(i * 1.7) - Math.cos(i * 0.9)) * 0.5;
          noisySignal.push(pos + noise);
        }
      }

      const res = kalmanFilter1D(noisySignal, {
        processNoise: 1e-3,
        measurementNoise: 1e-2,
        dt,
      });

      expect(res.position.length).toBe(totalFrames);
      expect(res.velocity.length).toBe(totalFrames);

      for (let i = 0; i < totalFrames; i++) {
        expect(Number.isFinite(res.position[i])).toBe(true);
        expect(Number.isFinite(res.velocity[i])).toBe(true);
      }

      for (let i = gapStart; i <= gapEnd; i++) {
        expect(res.position[i]).toBeGreaterThan(res.position[i - 1]);
        expect(res.velocity[i]).toBeLessThan(res.velocity[i - 1]);
        expect(res.velocity[i]).toBeGreaterThan(0.5 * velocity);
      }

      const expectedEndPos = truePos[gapEnd];
      const actualEndPos = res.position[gapEnd];
      const gapDisplacement = velocity * 10 * dt;
      const coastingError = Math.abs(actualEndPos - expectedEndPos);

      expect(coastingError).toBeLessThan(gapDisplacement * 0.15);

      const relockError = Math.abs(res.position[32] - truePos[32]);
      expect(relockError).toBeLessThan(3.0);
      expect(res.velocity[32]).toBeGreaterThan(0.85 * velocity);
    });

    it("1.2 Covariance tuning analysis (Noise attenuation vs Tracking Lag under R >> Q vs Q >> R)", () => {
      const fps = 30;
      const dt = 1 / fps;
      const n = 90;

      const cleanSignal: number[] = [];
      const noisySignal: number[] = [];

      for (let i = 0; i < n; i++) {
        const t = i * dt;
        const clean = 10.0 * Math.sin(2 * Math.PI * 0.5 * t);
        cleanSignal.push(clean);
        const noise = (Math.sin(i * 3.1) + Math.cos(i * 5.3)) * 1.414;
        noisySignal.push(clean + noise);
      }

      const filterA = kalmanFilter1D(noisySignal, {
        processNoise: 1e-2,
        measurementNoise: 0.5,
        dt,
      });

      const filterB = kalmanFilter1D(noisySignal, {
        processNoise: 10.0,
        measurementNoise: 1e-4,
        dt,
      });

      let varNoisyDiffA = 0;
      let varNoisyDiffB = 0;
      for (let i = 10; i < n; i++) {
        varNoisyDiffA += Math.pow(filterA.position[i] - noisySignal[i], 2);
        varNoisyDiffB += Math.pow(filterB.position[i] - noisySignal[i], 2);
      }
      varNoisyDiffA /= (n - 10);
      varNoisyDiffB /= (n - 10);

      expect(varNoisyDiffA).toBeGreaterThan(varNoisyDiffB);

      const filterExtremeLowQ = kalmanFilter1D(noisySignal, {
        processNoise: 1e-6,
        measurementNoise: 10.0,
        dt,
      });
      let varErrExtreme = 0;
      for (let i = 10; i < n; i++) {
        varErrExtreme += Math.pow(filterExtremeLowQ.position[i] - cleanSignal[i], 2);
      }
      varErrExtreme /= (n - 10);
      expect(varErrExtreme).toBeGreaterThan(10.0);
    });

    it("1.3 Rapid keypoint visibility drops (visibility < 0.4 for 5 frames) with outlier spikes", () => {
      const fps = 30;
      const dt = 1 / fps;
      const n = 40;

      const signal: number[] = [];
      const visibility: number[] = [];
      const truePos: number[] = [];

      for (let i = 0; i < n; i++) {
        const pos = 50.0 + i * 2.0;
        truePos.push(pos);

        if (i >= 15 && i <= 19) {
          signal.push(9999.0);
          visibility.push(0.1);
        } else {
          signal.push(pos);
          visibility.push(0.95);
        }
      }

      const res = kalmanFilter1D(signal, {
        processNoise: 1e-3,
        measurementNoise: 1e-2,
        dt,
        visibility,
      });

      for (let i = 15; i <= 19; i++) {
        expect(res.position[i]).toBeLessThan(150.0);
        expect(Math.abs(res.position[i] - truePos[i])).toBeLessThan(15.0);
      }

      expect(Math.abs(res.position[22] - truePos[22])).toBeLessThan(3.0);
    });
  });

  describe("2. Adaptive SG Window Stress Tests", () => {
    it("2.1 Window size scaling across 15, 30, 60, 120 FPS and zero phase distortion", () => {
      const fpsList = [15, 30, 60, 120];
      const expectedWindows = [5, 5, 11, 15];

      fpsList.forEach((fps, idx) => {
        const windowSize = computeSgWindowSize(fps);
        expect(windowSize).toBe(expectedWindows[idx]);

        const duration = 2.0;
        const n = Math.round(fps * duration);
        const signal: number[] = [];
        const cleanSignal: number[] = [];

        const noiseFreq = Math.min(4.0, (fps / 2) * 0.6);

        for (let i = 0; i < n; i++) {
          const t = i / fps;
          const clean = Math.sin(2 * Math.PI * 0.8 * t); // 0.8 Hz fundamental motion
          const noise = 0.3 * Math.sin(2 * Math.PI * noiseFreq * t);
          cleanSignal.push(clean);
          signal.push(clean + noise);
        }

        const smoothed = savitzkyGolayAdaptive(signal, fps);
        expect(smoothed.length).toBe(n);

        const cleanSmoothed = savitzkyGolayAdaptive(cleanSignal, fps);
        const startIdx = Math.floor(n * 0.2);
        const endIdx = Math.floor(n * 0.8);

        let maxValClean = -Infinity;
        let peakIdxClean = -1;
        let maxValSmoothed = -Infinity;
        let peakIdxSmoothed = -1;

        for (let i = startIdx; i < endIdx; i++) {
          if (cleanSignal[i] > maxValClean) {
            maxValClean = cleanSignal[i];
            peakIdxClean = i;
          }
          if (cleanSmoothed[i] > maxValSmoothed) {
            maxValSmoothed = cleanSmoothed[i];
            peakIdxSmoothed = i;
          }
        }

        expect(peakIdxSmoothed).toBe(peakIdxClean);

        let rawNoiseVar = 0;
        let smoothNoiseVar = 0;
        for (let i = 10; i < n - 10; i++) {
          rawNoiseVar += Math.pow(signal[i] - cleanSignal[i], 2);
          smoothNoiseVar += Math.pow(smoothed[i] - cleanSignal[i], 2);
        }
        expect(rawNoiseVar).toBeGreaterThan(1e-4);
        expect(smoothNoiseVar).toBeLessThan(rawNoiseVar);
      });
    });
  });

  describe("3. Butterworth Resampling Guard Stress Tests", () => {
    it("3.1 Non-uniform timestamp grid with 20% dt jitter, guard activation & fidelity", () => {
      const nominalFps = 30;
      const nominalDt = 1 / nominalFps;
      const duration = 3.0;
      const approxN = Math.round(nominalFps * duration);

      const timestamps: number[] = [0];
      let currentT = 0;
      for (let i = 1; i < approxN; i++) {
        const jitterPct = 0.20 * Math.sin(i * 2.3);
        const dt = nominalDt * (1 + jitterPct);
        currentT += dt;
        timestamps.push(currentT);
      }

      const dtArr: number[] = [];
      for (let k = 0; k < timestamps.length - 1; k++) {
        dtArr.push(timestamps[k + 1] - timestamps[k]);
      }
      const meanDt = dtArr.reduce((a, b) => a + b, 0) / dtArr.length;
      const varDt = dtArr.reduce((s, v) => s + Math.pow(v - meanDt, 2), 0) / dtArr.length;
      const cv = Math.sqrt(varDt) / meanDt;

      expect(cv).toBeGreaterThan(0.10);

      const cleanSignal: number[] = [];
      const noisySignal: number[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const t = timestamps[i];
        const clean = Math.sin(2 * Math.PI * 1.5 * t);
        const noise = 0.5 * Math.sin(2 * Math.PI * 12.0 * t);
        cleanSignal.push(clean);
        noisySignal.push(clean + noise);
      }

      const filteredGuardActive = zeroPhaseButterworth(noisySignal, nominalFps, 6.0, { timestamps });
      const filteredNaive = zeroPhaseButterworth(noisySignal, nominalFps, 6.0);

      expect(filteredGuardActive.length).toBe(timestamps.length);
      expect(filteredNaive.length).toBe(timestamps.length);
      expect(filteredGuardActive.every(Number.isFinite)).toBe(true);

      let rmsGuard = 0;
      for (let i = 10; i < timestamps.length - 10; i++) {
        rmsGuard += Math.pow(filteredGuardActive[i] - cleanSignal[i], 2);
      }
      rmsGuard = Math.sqrt(rmsGuard / (timestamps.length - 20));

      expect(rmsGuard).toBeLessThan(0.15);

      const maxClean = Math.max(...cleanSignal.slice(10, timestamps.length - 10));
      const maxGuard = Math.max(...filteredGuardActive.slice(10, timestamps.length - 10));
      expect(Math.abs(maxGuard - maxClean)).toBeLessThan(0.08);
    });
  });
});

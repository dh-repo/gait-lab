## 2026-08-10T07:38:20Z
Implement Milestone 2 requirements R2 and R7 in `src/lib/gait/signal.ts`:

1. R2: 2-State Constant-Velocity Kalman Filter in `kalmanFilter1D()` (`src/lib/gait/signal.ts`)
   - State vector x = [pos, vel]^T
   - State transition F = [[1, dt], [0, 1]] (default dt = 1/30 or parsed from parameters/options)
   - Process noise covariance Q(dt) continuous white-noise acceleration model: q * [[dt^3/3, dt^2/2], [dt^2/2, dt]] (q = processNoise, default 1e-4)
   - Measurement matrix H = [1, 0], measurement noise R (default 1e-2)
   - Innovation y = z - x_pred[0], Innovation covariance scalar S = P_pred[0,0] + R
   - Kalman gain K = [P_pred[0,0]/S, P_pred[1,0]/S]
   - State update: x_new[0] = x_pred[0] + K[0]*y, x_new[1] = x_pred[1] + K[1]*y
   - Covariance update with explicit symmetry averaging:
     P_new[0,0] = (1 - K[0]) * P_pred[0,0]
     P_new[0,1] = (1 - K[0]) * P_pred[0,1]
     P_new[1,0] = P_pred[1,0] - K[1] * P_pred[0,0]
     P_new[1,1] = P_pred[1,1] - K[1] * P_pred[0,1]
     P_new[0,1] = P_new[1,0] = (P_new[0,1] + P_new[1,0]) / 2
   - Occlusion / NaN coasting & visibility gating:
     If measurement z is non-finite (NaN / Infinity) or if optional visibility < 0.4:
     Coast: x_new[0] = x_pred[0] = x_{k-1}[0] + x_{k-1}[1]*dt, x_new[1] = x_{k-1}[1] * 0.98 (velocity decay)
     Inflate covariance: P_new = P_pred + Q * 2.0
   - Retain backward compatibility: `kalmanFilter1D(signal, processNoise, measurementNoise, dt)` returns `number[]` array of position values by default. Support optional options object `{ processNoise, measurementNoise, dt, visibility }` and export `kalmanFilter2D` or attach `.position` and `.velocity` arrays to the result.

2. R7: Adaptive SG Window & Uniform Resampling Guard in `src/lib/gait/signal.ts`
   - Implement `computeSgWindowSize(fps: number): number`:
     raw = Math.round(fps * 0.17), odd = raw % 2 === 0 ? raw + 1 : raw, clamp Math.max(5, Math.min(15, odd)).
   - Implement `savitzkyGolay(signal: number[], windowSize = 5): number[]` with dynamic Gram matrix quadratic/cubic kernel weights c_k = (S_4 - S_2 * k^2) / D for odd M in [5..15] and reflection boundary padding.
   - Implement `savitzkyGolayAdaptive(signal: number[], fps = 30): number[]`.
   - Retain `savitzkyGolay5(signal)` wrapper for 100% backward compatibility.
   - Implement 1D linear interpolation helper `linearInterpolate(xOrig, yOrig, xTarget)`.
   - Update `zeroPhaseButterworth()`: accept optional timestamps array or options `{ timestamps, dt }`. If timestamps exhibit non-uniformity (CV = std(dt)/mean(dt) > 0.10 or var(dt)/mean(dt) > 0.10), resample data linearly to a uniform grid t_grid = t0 + k * mean_dt before filtering, run zeroPhaseButterworth, and interpolate back to original timestamps.

3. Testing & Verification:
   - Run unit tests: `npx vitest run src/lib/gait/__tests__/signal.test.ts`
   - Run type check: `npx tsc --noEmit`
   - Add/update tests in `src/lib/gait/__tests__/signal.test.ts` to verify:
     - 2-state Kalman filter velocity coasting during NaN/occlusion gaps
     - Savitzky-Golay adaptive window scaling at 30, 60, and 120 FPS
     - Butterworth uniform resampling guard with non-uniform timestamps

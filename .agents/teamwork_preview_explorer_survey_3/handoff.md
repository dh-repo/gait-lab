# Comprehensive Survey & Analysis Report: Gait-Lab Platform

## 1. Observation

Direct observations from examining the `gait-lab` repository structure, dependencies, tool executions, and source code:

### 1.1 Tooling, Build, and Project Configuration
- **Package Manifest (`package.json`)**:
  - Contains scripts: `"dev"`, `"build"`, `"db:migrate"`, `"preview"`, `"typecheck"`, `"test"`, `"lint"`, `"format"`.
  - Core dependencies include `@mediapipe/tasks-vision` (^1.0.1), `@tanstack/react-router` (^1.170.0), `@tanstack/react-query` (^5.101.0), `@electric-sql/pglite` (^0.5.4), `better-auth` (^1.6.0), `recharts` (^2.13.0), and `zod` (^4.4.0).
- **TypeScript Compilation Failure (`npm run typecheck`)**:
  - Running `npm run typecheck` (`tsc --noEmit`) outputs the following verbatim errors:
    ```
    error TS2688: Cannot find type definition file for 'node'.
      The file is in the program because:
        Entry point of type library 'node' specified in compilerOptions
    error TS2688: Cannot find type definition file for 'vite/client'.
      The file is in the program because:
        Entry point of type library 'vite/client' specified in compilerOptions
    tsconfig.json(13,5): error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0.
    ```
  - In `tsconfig.json` (lines 12–14): `"types": ["vite/client", "node"]` and `"baseUrl": "."` cause configuration mismatch and deprecation warnings under TypeScript 5.7+.

### 1.2 Test Infrastructure & Test Coverage Gap
- **Current Test Runner (`npm test`)**:
  - Command: `node --test 'scripts/**/*.test.mjs'`
  - Result: 25 tests pass in 218ms (`scripts/brand-check.test.mjs` and `scripts/grok-pwa-plugin.test.mjs`).
  - **Zero automated unit tests exist for domain logic in `src/lib/gait/`** (`analysis.ts`, `landmarks.ts`, `pose.ts`, `guesses.ts`, `ratings.ts`). None of the kinematic calculation algorithms, view angle detection heuristics, peak finding methods, or educated guess rules are tested against unit specifications or mock gait datasets.

### 1.3 Analysis Pipeline & Biomechanical Signal Processing
- **Signal Filtering (`src/lib/gait/analysis.ts`, lines 23–37)**:
  - Uses a simple unweighted boxcar moving average `smooth(values, window=5)`:
    $$\bar{x}_i = \frac{1}{N} \sum_{j=i-k}^{i+k} x_j$$
  - Boxcar moving averages introduce phase distortion, attenuate true kinematic peaks, and fail to filter out high-frequency pose landmark jitter effectively compared to standard biomechanical zero-phase digital filters.
- **Gait Event Detection (`src/lib/gait/analysis.ts`, lines 230–341)**:
  - Step detection relies on heuristic peak detection (`findPeaks`) on smoothed ankle Y coordinates, fallback hip Y bounce, ankle X velocity stance matching, or ankle height crossovers (`crossIdx`).
  - Lacks formal gait phase segmentation (Initial Contact / Heel Strike, Toe Off, Stance Phase percentage, Swing Phase percentage).
- **Symmetry Metrics (`src/lib/gait/analysis.ts`, lines 58–65)**:
  - `asymmetryRatio(a, b)` computes:
    ```typescript
    if (aa < 1e-3 && bb < 1e-3) return 0;
    const max = Math.max(aa, bb, 1e-6);
    return Math.abs(aa - bb) / max;
    ```
  - This percentage-based ratio is sensitive to choice of maximum/reference side and can produce non-symmetric scaling or threshold artifacts for small values.
- **Model Asset & Extraction (`src/lib/gait/pose.ts`, line 35)**:
  - Loads `/models/pose_landmarker_lite.task`. The `lite` model has a lower parameter count and lower landmark precision relative to `pose_landmarker_full` or `pose_landmarker_heavy`, increasing jitter in 2D keypoints (wrist, ankle, heel, toe).

### 1.4 Database & Persistence
- Postgres / PGLite database configuration exists (`src/lib/db.ts`, `migrations/0001_auth.sql`), but **no gait analysis table or persistence layer exists**. All session results, metrics, and report data are stored temporarily in React state (`GaitApp.tsx`) and discarded when navigating away or opening a new video.

---

## 2. Logic Chain

### Step 2.1: Developer Experience & Software Reliability
1. **Observation**: `npm run typecheck` fails due to `tsconfig.json` `types` resolution and `baseUrl` deprecation.
2. **Inference**: CI/CD pipelines and developer builds cannot perform static type verification. Modifying gait analysis algorithms without working `tsc` risk introducing uncaught type errors or undefined property access.
3. **Actionable Resolution**: Update `tsconfig.json` to include proper `@types/node` references, remove deprecated `baseUrl` in favor of modern `moduleResolution: "bundler"` paths, and ensure `vite/client` types resolve cleanly.

### Step 2.2: Scientific Precision & Biomechanical Accuracy
1. **Observation**: Gait events (step contacts) are currently detected via ad-hoc local maxima on ankle vertical position (`leftAnkleY`) or hip vertical bounce.
2. **Biomechanical Principle**: In clinical biomechanics (Zeni et al., 2008, *Gait & Posture*), kinematic detection of Initial Contact (Heel Strike) and Toe-Off is accurately achieved using the **Zeni Algorithm**: tracking the anterior-posterior (AP) distance and velocity between the heel/toe landmarks and the pelvis/sacrum center:
   $$x_{\text{rel\_heel}}(t) = x_{\text{heel}}(t) - x_{\text{pelvis}}(t)$$
   - **Heel Strike (HS)** occurs at the local maximum of $x_{\text{rel\_heel}}(t)$ (maximal anterior foot reach).
   - **Toe-Off (TO)** occurs at the local minimum of $x_{\text{rel\_toe}}(t)$ (maximal posterior foot extension).
3. **Inference**: Replacing heuristic ankle-Y peak search with the Zeni algorithm will dramatically improve step timing accuracy, stance/swing ratio calculation, and cadence estimation across diverse camera angles.

### Step 2.3: Robust Asymmetry Quantification
1. **Observation**: The existing `asymmetryRatio` uses a non-standard ratio $\frac{|a - b|}{\max(|a|, |b|)}$.
2. **Biomechanical Principle**: Zifchock et al. (2008, *Gait & Posture*) established the **Symmetry Angle (SA)** as the gold-standard reference-free metric for inter-limb gait asymmetry:
   $$\theta = \arctan\left(\frac{X_L}{X_R}\right)$$
   $$SA = \frac{\left| \theta - 45^\circ \right|}{90^\circ} \times 100\%$$
   (If $\theta > 90^\circ$, $\theta$ is adjusted by subtracting $180^\circ$).
3. **Inference**: SA provides an un-biased 0%–100% scale that avoids reference-limb selection bias and prevents numerical instability when values approach zero.

### Step 2.4: Signal Filtering & Smoothness Quantification
1. **Observation**: `smooth()` uses a 5-point boxcar moving average, while `pathSmoothness` uses a simple linear detrending residual standard deviation.
2. **Biomechanical Principle**:
   - **Butterworth Low-pass Filter**: Standard gait analysis applies a 2nd or 4th-order zero-phase Butterworth filter with a 6 Hz cutoff frequency ($f_c = 6\text{ Hz}$) to remove high-frequency tracking noise while preserving gait dynamics (Winter, 2009).
   - **Harmonic Ratio (HR)**: Menz et al. (2003, *Journals of Gerontology*) showed that spectral harmonic analysis (FFT) of trunk accelerations provides a validated measure of gait smoothness and rhythmicity:
     $$HR_{\text{vertical/AP}} = \frac{\sum \text{Even Harmonics}}{\sum \text{Odd Harmonics}}$$
3. **Inference**: Implementing a 4th-order Butterworth digital filter and Harmonic Ratio calculation will elevate `gait-lab`'s signal processing to clinical research standards.

### Step 2.5: Dual-Task Cognitive-Motor Interference (CMI)
1. **Observation**: `computeDualTaskCost` calculates percent change for cadence and CV, but lacks standardized Dual-Task Effect (DTE) formulas and directionality flags.
2. **Biomechanical Principle**: Standardized Dual-Task Effect (Kelly et al., 2010):
   $$DTE_{\text{motor}} = \frac{\text{Dual Task} - \text{Single Task}}{\text{Single Task}} \times 100\%$$
   (where negative DTE indicates motor degradation under cognitive load).
3. **Inference**: Formalizing DTE metrics with clear research literature citations strengthens the scientific validity of the dual-task evaluation module.

---

## 3. Caveats

- **Read-Only Scope**: This survey is strictly read-only. No code modifications outside `.agents/teamwork_preview_explorer_survey_3/` were performed during this task.
- **Hardware Variation**: MediaPipe WebGL execution speed and canvas frame extraction timing depend on client GPU hardware and browser video decoding engine (e.g. Chrome WebCodecs vs Safari HTMLVideoElement seeking).
- **Camera Calibration**: 2D monocular pose estimation provides normalized image coordinates (0.0 to 1.0). Absolute spatial metrics in meters (e.g., stride length in meters, gait velocity in m/s) require either explicit user height input for pixel-to-meter scaling or a calibration marker in the video frame.

---

## 4. Conclusion

`gait-lab` provides an impressive on-device foundation for video-based gait analysis. However, to transform it into a state-of-the-art scientific and software engineering tool, the following high-impact improvements should be implemented:

### 4.1 Structural Engineering Roadmap
1. **Fix TypeScript & Linting Environment**:
   - Resolve `tsconfig.json` `types` resolution for `@types/node` and `vite/client`.
   - Ensure `npm run typecheck`, `npm test`, and `npm run lint` execute cleanly with 0 errors.
2. **Modularize Gait Analytics Core (`src/lib/gait/`)**:
   - `signal.ts`: Butterworth 4th-order digital filtering, zero-phase filtering, peak detection.
   - `events.ts`: Zeni algorithm for heel strike (IC) and toe-off (TO) detection, stance/swing phase calculation.
   - `symmetry.ts`: Zifchock Symmetry Angle (SA), Gait Symmetry Index (GSI).
   - `smoothness.ts`: Trunk Harmonic Ratio (HR) via FFT, detrended fluctuation analysis.
   - `dte.ts`: Dual-Task Effect (DTE) calculations and cognitive-motor interference classification.
3. **Comprehensive Automated Test Suite (`src/lib/gait/__tests__/`)**:
   - Add unit tests covering signal filtering, peak detection, Zeni event detection, Symmetry Angle calculation, metric computation, and edge-case handling (empty frames, short clips, extreme values).
4. **Database Persistence Layer**:
   - Create migration `migrations/0002_gait_sessions.sql` for storing gait analysis sessions, subject IDs, metrics, and structured reports.
   - Add API routes for saving, loading, exporting (JSON/CSV), and comparing historical gait sessions.

### 4.2 State-of-the-Art Scientific Enhancements
1. **Zeni Kinematic Event Detection**: Detect exact heel-strike and toe-off frames, calculating Stance Phase % (~60%), Swing Phase % (~40%), and Double Support Time (ms).
2. **Zifchock Symmetry Angle (SA)**: Replace raw percentage asymmetry with reference-free Symmetry Angle.
3. **Butterworth 4th-Order Zero-Phase Filtering**: Filter landmark time series at $f_c = 6\text{ Hz}$ to eliminate pose tracking jitter.
4. **Harmonic Ratio (HR)**: Compute trunk rhythmicity and smoothness via spectral analysis of hip accelerations.
5. **Scientific Justifications Document (`scientific_justifications.md`)**: Create a comprehensive research report documenting the scientific literature (Zeni 2008, Zifchock 2008, Menz 2003, Montero-Odasso 2020) and mathematical formulas supporting the updated codebase.

---

## 5. Verification Method

### 5.1 Verification Commands
To independently verify the current state of the codebase:
```bash
# 1. Test existing scripts (currently 25 tests, scripts only)
npm test

# 2. Inspect TypeScript typecheck error output
npm run typecheck

# 3. Inspect linter output
npm run lint
```

### 5.2 Future Verification After Implementation
Once implementation is complete, the following commands must succeed without errors:
```bash
# 1. Type check full codebase
npm run typecheck

# 2. Run expanded test suite (including src/lib/gait unit tests)
npm test

# 3. Verify production build and database migration script
npm run build

# 4. Verify code formatting and linting
npm run lint
```

# Scope: Milestone 2 — Analysis Engine Integration & UI Enhancement

## Objectives
1. Refactor `src/lib/gait/analysis.ts` to integrate the scientific core modules built in Milestone 1 (`signal.ts`, `events.ts`, `symmetry.ts`, `smoothness.ts`, `dte.ts`):
   - Replace 5-point boxcar smoothing with zero-phase 4th-order Butterworth low-pass filtering ($f_c = 6\text{ Hz}$).
   - Replace heuristic ankle-Y peak search with Zeni kinematic event detection (Heel Strike & Toe Off) for precise stance phase %, swing phase %, and double support time calculation.
   - Replace percentage asymmetry with Zifchock Symmetry Angle ($SA$).
   - Integrate Trunk Harmonic Ratio ($HR$) via FFT for path smoothness and rhythmicity.
   - Integrate standardized Dual-Task Effect ($DTE$) calculation.
2. Upgrade frame sampling and temporal interpolation in `src/components/gait/GaitApp.tsx` to support high-density sampling rates and cubic spline/linear coordinate interpolation to eliminate frame discretization jitter.
3. Update `src/lib/gait/ratings.ts` and `src/lib/gait/guesses.ts`:
   - Incorporate $SA$, $HR$, Zeni stance/swing breakdown, and $DTE$ into composite domain scores (Overall, Stability, Symmetry, Rhythm, Mobility, Automaticity).
   - Add new rule-based educated guesses for abnormal stance/swing ratio, poor harmonic ratio (gait dysrhythmia), significant inter-limb symmetry angle deviation, and cognitive-motor interference.
4. Upgrade UI visualization panels (`ReportPanel.tsx`, `MetricsPanel.tsx`, `GuessesPanel.tsx`, `GaitApp.tsx`):
   - Display Zeni Stance/Swing phase breakdown, Zifchock Symmetry Angle ($SA$), Harmonic Ratio ($HR$), and Dual-Task Effect ($DTE$) metrics in `ReportPanel.tsx` and `MetricsPanel.tsx`.
   - Add session saving and session history viewing features using the database persistence layer (`persistence.server.ts`).

## Assigned Features
- Feature 9: Integrated Gait Analysis Engine Update (`analysis.ts`)
- Feature 10: Sampling Rate & Interpolation Upgrade (`GaitApp.tsx`)
- Feature 11: Ratings & Guesses Engine Update (`ratings.ts` & `guesses.ts`)
- Feature 12: UI Visualization & Session History (`ReportPanel.tsx`, `MetricsPanel.tsx`, `GuessesPanel.tsx`)

## Reference Contracts
Refer to `/Users/damian/GitHub/gait-lab/PROJECT.md § Interface Contracts`.

## Status
- **Milestone 2**: DONE (Gate passed cleanly with 5 clean/approving verdicts, 0 type errors, 0 lint errors, 61 vitest unit tests passing, production Vercel build passing).


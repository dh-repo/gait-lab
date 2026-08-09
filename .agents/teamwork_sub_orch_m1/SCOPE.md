# Scope: Milestone 1 — Environment, Tooling & Scientific Core Architecture

## Objectives
1. Fix TypeScript type definitions in `tsconfig.json` (`@types/node`, `vite/client`, remove deprecated `baseUrl`).
2. Update `eslint.config.mjs` to ignore `public/wasm/**` Emscripten WebAssembly code so `npm run lint` passes without errors on WASM files.
3. Create migration file `migrations/0002_gait_sessions.sql` and database access functions for persisting gait analysis sessions.
4. Implement `src/lib/gait/signal.ts`: Zero-phase 4th-order low-pass Butterworth digital filter ($f_c = 6\text{ Hz}$), linear detrending, and FFT harmonic decomposition.
5. Implement `src/lib/gait/events.ts`: Zeni kinematic gait event detection (AP coordinate difference relative to pelvis) for Initial Contact (Heel Strike) and Terminal Contact (Toe-Off) detection, Stance Phase %, Swing Phase %, Double Support Time.
6. Implement `src/lib/gait/symmetry.ts`: Zifchock's Symmetry Angle ($SA$) and Gait Symmetry Index ($GSI$).
7. Implement `src/lib/gait/smoothness.ts`: Harmonic Ratio ($HR$) via FFT for trunk rhythmicity & smoothness.
8. Implement `src/lib/gait/dte.ts`: Standardized Dual-Task Effect ($DTE$) formulas and cognitive-motor interference classification.

## Status: DONE
- [x] Feature 1: TypeScript & Build Tooling Fixes (`tsconfig.json`) — DONE
- [x] Feature 2: ESLint WASM Exclusion (`eslint.config.mjs`) — DONE
- [x] Feature 3: Database Session Persistence Schema (`migrations/0002_gait_sessions.sql` & `persistence.server.ts`) — DONE
- [x] Feature 4: Butterworth Digital Filter (`src/lib/gait/signal.ts`) — DONE
- [x] Feature 5: Zeni Gait Event Detection (`src/lib/gait/events.ts`) — DONE
- [x] Feature 6: Zifchock Symmetry Angle (`src/lib/gait/symmetry.ts`) — DONE
- [x] Feature 7: Harmonic Ratio & Smoothness (`src/lib/gait/smoothness.ts`) — DONE
- [x] Feature 8: Standardized Dual-Task Effect (`src/lib/gait/dte.ts`) — DONE

## Reference Contracts
Refer to `/Users/damian/GitHub/gait-lab/PROJECT.md § Interface Contracts`.


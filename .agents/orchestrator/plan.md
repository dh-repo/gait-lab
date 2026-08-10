# Project Plan: Spatio-Temporal Gait Analysis Engine Enhancements

## Objective
Enhance the accuracy, precision, and reliability of the `gait-lab` spatio-temporal gait analysis engine across 4 key technical tiers (R1-R4) while maintaining 100% test pass rate, 0 typecheck errors, 0 lint errors, and clean production build.

## Phases
- Phase 0: Survey & Codebase/Spec Mapping (3 Explorers)
- Phase 1: PROJECT.md & Feature Inventory Setup
- Phase 2: Implementation Track & E2E Testing Track Execution
  - M1: R1 — Computer Vision & Model Fidelity Upgrades (`pose_landmarker_heavy.task` with fallback to `full`/`lite`, 1D Kalman or 5-point Savitzky-Golay temporal smoothing)
  - M2: R2 — Video Capture Constraints & Real-World Floor Calibration (`ideal: 60` FPS WebRTC, QR/AprilTag/card mm/px floor calibration)
  - M3: R3 — Multi-Signal Heel-Strike Fusion & Planar Homography (AP foot displacement + vertical ankle acceleration minima + ZUPT fusion, 2D top-down planar homography transformation)
  - M4: R4 — Steady-State Stride Filtering & Quality Control (exclude acceleration/deceleration strides for steady-state `stepTimeCV` calculation)
- Phase 3: Final E2E Verification & Gate Acceptance

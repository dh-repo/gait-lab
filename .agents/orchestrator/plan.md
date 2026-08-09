# Master Plan: gait-lab Exhaustive Peer Review & System Hardening

## Overview
Based on the multi-agent survey (Spec Miner `c1b9c355`, Code/Math Explorer `2916052f`, Test/Assets Explorer `98e0981f`), the scientific and mathematical derivations in `gait-lab` are 100% accurate. To achieve complete compliance with `ORIGINAL_REQUEST.md` and pass all acceptance criteria, the project executed 4 core implementation milestones.

## Milestones

| # | Milestone Name | Scope | Dependencies | Target Artifacts | Status |
|---|----------------|-------|--------------|------------------|--------|
| M1 | Scientific Documentation Alignment & Peer Review Report | Fix 8 line/function mapping inaccuracies in `scientific_justifications.md` and publish `peer_review_report.md` | Survey | `scientific_justifications.md`, `peer_review_report.md` | DONE |
| M2 | Adversarial & Edge-Case Test Suite Expansion & DSP Hardening | Add tests for jitter, frame drops, occlusions, extreme asymmetry, micro-steps, camera shake; harden DSP edge cases | M1 | `tests/adversarial_*.test.ts`, `src/lib/gait/*.ts` | DONE |
| M3 | Reference Video Dataset Acquisition & UI Sample Picker | Populate `public/samples/` with sagittal, frontal, follow-cam videos; wire sample picker UI in `GaitApp.tsx` | M1 | `public/samples/*.mp4`, `src/components/gait/*` | DONE |
| M4 | Final Swarm Review, Forensic Audit & Gate Verification | Execute 2x Reviewer, 2x Challenger, 1x Forensic Auditor (`teamwork_preview_auditor`); verify 0 build/lint/typecheck/test errors | M2, M3 | `GATE_STATUS.md`, clean build output | DONE |

## Feature Inventory
| # | Feature / Requirement | Category | Target Milestone | Status |
|---|------------------------|----------|------------------|--------|
| 1 | Peer Review Report Generation | R1/R4 | M1 | DONE |
| 2 | `scientific_justifications.md` Section 4 Fixes | R4 | M1 | DONE |
| 3 | Severe Landmark Jitter & Noise Stress Tests | R3 | M2 | DONE |
| 4 | Variable Frame Rate & Drop Rate Stress Tests | R3 | M2 | DONE |
| 5 | Severe Landmark Occlusion & Pose Loss Stress Tests | R3 | M2 | DONE |
| 6 | Extreme Gait Asymmetry Stress Tests | R3 | M2 | DONE |
| 7 | Micro-Steps & Parkinsonian Gait Stress Tests | R3 | M2 | DONE |
| 8 | High-Frequency Camera Shake Stress Tests | R3 | M2 | DONE |
| 9 | Edge Case DSP Boundary & Non-Finite Safeguards | R1/R2 | M2 | DONE |
| 10| Reference Video Dataset Assets (`public/samples/`) | R5 | M3 | DONE |
| 11| Multi-Sample UI Video Picker Component Integration | R5 | M3 | DONE |
| 12| Clean Test (`npm test`), Typecheck, Lint, Build Verification | All | M4 | DONE |

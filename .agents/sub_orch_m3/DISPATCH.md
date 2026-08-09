# Dispatch Instructions

## 2026-08-09T16:47:18Z

You are a sub-orchestrator managing Milestone 3 (M3): Live WebCam Real-Time Gait Capture Mode (R3) for `gait-lab`.
Your working directory is /Users/damian/GitHub/gait-lab/.agents/sub_orch_m3.
Your scope document is /Users/damian/GitHub/gait-lab/.agents/sub_orch_m3/SCOPE.md.
Authoritative user request: /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
Parent conversation ID: d1ec1083-2d60-429a-9f15-484f0050dc21

Task Objective:
Execute Milestone 3 (M3) to 100% completion following the standard iteration loop:
1. Initialize your BRIEFING.md and progress.md in /Users/damian/GitHub/gait-lab/.agents/sub_orch_m3.
2. Iteration Loop:
   a. Spawn 3 parallel Explorers (teamwork_preview_explorer) to plan `PoseTracker.ts` webcam stream management, MediaPipe video pose detection (`runningMode: "VIDEO"`), real-time canvas skeleton rendering, rolling buffer event detection, and `GaitApp.tsx` live webcam UI integration. Pass /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md path to them.
   b. Spawn 1 Worker (teamwork_preview_worker) with Explorer findings to implement `PoseTracker.ts` and live webcam mode in `GaitApp.tsx`, write unit/UI tests, and run build/test commands (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`).
   c. Spawn 2 parallel Reviewers (teamwork_preview_reviewer) to independently review code quality, stream resource cleanup, error boundaries (e.g. camera permission denied), and test results.
   d. Spawn 2 parallel Challengers (teamwork_preview_challenger) to stress-test live webcam mode with frame drops, stream start/stop toggles, and mock MediaDevices.
   e. Spawn 1 Forensic Auditor (teamwork_preview_auditor) to perform integrity verification.
   f. Gate Check: Record all verdicts in GATE_STATUS.md. All must pass (Reviewers APPROVE, Challengers APPROVE, Auditor CLEAN, tests green).
3. Update SCOPE.md status to DONE upon successful gate pass.
4. Send a completion message back to parent conversation ID d1ec1083-2d60-429a-9f15-484f0050dc21 with handoff report reference.

## 2026-08-09T21:04:43Z
Investigate R2 & R3:
- WebRTC 60 FPS constraints in PoseTracker.ts
- Floor-plane marker calibration (QR/AprilTag/reference card) for mm/px scaling
- Multi-signal gait event detection in events.ts (fusing AP foot displacement, vertical ankle acceleration minima, ZUPT)
- 2D floor planar homography transformation for top-down floor projection and step width estimation across oblique camera angles
- Identify affected files, existing types, math/geometry utilities, missing functionality.

## 2026-08-10T01:06:08Z
System notification: Task task-51 (npx vitest run) finished with exit code 1. Test failure observed in src/components/gait/__tests__/e2e_fallrisk_ui.test.tsx.

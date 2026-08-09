# Milestone 3 Stress Test Report: Live WebCam Real-Time Gait Capture Mode

**Author:** Challenger 1 (Milestone 3 — Live WebCam Real-Time Gait Capture Mode)  
**Date:** 2026-08-09  
**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/challenger_m3_1`  
**Target Repository:** `/Users/damian/GitHub/gait-lab`  
**Verdict:** `REQUEST_CHANGES`

---

## 1. Observation

Direct empirical stress testing of `src/lib/gait/PoseTracker.ts` and `src/components/gait/GaitApp.tsx` via custom test harness `src/lib/gait/__tests__/m3_challenger_1_stress.test.ts` yielded the following results across 11 stress scenarios:

### Test Command Executed:
```bash
npx vitest run src/lib/gait/__tests__/m3_challenger_1_stress.test.ts
```

### Test Output:
```text
 ❯ src/lib/gait/__tests__/m3_challenger_1_stress.test.ts (11 tests | 1 failed) 91ms
       ✓ 1.1 Rapid successive startWebcam calls clean up intermediate streams without leaking tracks
       ✓ 1.2 Interleaving startWebcam -> stopWebcam -> startWebcam leaves state consistent
       × 1.3 Async race condition test: stopWebcam during pending video.play() does NOT leave tracker active
       ✓ 1.4 Rapid toggle 50 times in a row without awaiting ensures no active loops remain
       ✓ 2.1 Guarantees strictly monotonic timestamps even when performance.now() regresses
       ✓ 2.2 Handles timestamp freeze without throwing exceptions or executing duplicate timestamps
       ✓ 2.3 Handles detectForVideo runtime errors gracefully without breaking the loop
       ✓ 3.1 Teardown stops all media tracks, clears srcObject, pauses video, and nullifies references
       ✓ 3.2 stopWebcam is idempotent and handles multiple consecutive invocations cleanly
       ✓ 3.3 Frame callbacks are halted immediately upon stopWebcam
       ✓ 3.4 Handles DOMExceptions thrown by track.stop() or video.pause() gracefully

FAIL: 1.3 Async race condition test: stopWebcam during pending video.play() does NOT leave tracker active
AssertionError: expected true to be false
  - Expected: false (tracker.isRunning() should be false after stopWebcam)
  - Received: true  (tracker.isRunning() remained true)
```

### Code Defect Location:
File: `/Users/damian/GitHub/gait-lab/src/lib/gait/PoseTracker.ts`  
Lines 194-207:
```typescript
194:    try {
195:      await this.videoElement.play();
196:    } catch (err) {
197:      console.warn("[PoseTracker] videoElement.play() warning:", err);
198:    }
199:
200:    // 6. Reset timing and start real-time animation loop
201:    this.isActive = true;
202:    this.lastTimestampMs = -1;
203:    this.lastProcessedTimeMs = 0;
204:    this.frameCount = 0;
205:    this.fpsStartTime = typeof performance !== "undefined" ? performance.now() : Date.now();
206:
207:    this.loop(this.fpsStartTime);
```

---

## 2. Logic Chain

1. **Session Guard Mechanism**: `PoseTracker.startWebcam` captures `const currentSession = ++this.sessionId;` and checks `if (this.sessionId !== currentSession)` after step 1 (`getPoseLandmarker()`), step 2 (`setOptions()`), and step 3 (`getUserMedia()`) to abort stale initialization loops when rapid toggles occur.
2. **Async Execution Window**: At line 195, `await this.videoElement.play()` introduces an asynchronous pause point.
3. **Interleaved Teardown**: If `stopWebcam()` is called while `this.videoElement.play()` is pending (e.g. rapid clinician double-click, component unmount, or mode switch to file upload), `stopWebcam()` executes immediately, incrementing `this.sessionId`, setting `this.isActive = false`, stopping stream tracks (`track.stop()`), and setting `this.stream = null` and `this.videoElement = null`.
4. **Missing Guard & Corruption**: When `this.videoElement.play()` resolves, control flow resumes after line 198. Because there is **no session check** after `await this.videoElement.play()`, lines 201-207 run unconditionally:
   - Line 201 overwrites `this.isActive = false` with `this.isActive = true`.
   - Line 207 invokes `this.loop(this.fpsStartTime)`.
5. **Consequence**: `tracker.isRunning()` returns `true` even though `stream` and `videoElement` are `null`. If the clinician immediately clicks "Start WebCam" again, a second concurrent session is launched while the old tracker remains in a corrupted zombie state, potentially spawning duplicate `requestAnimationFrame` loops.

---

## 3. Caveats

- **Passed Focus Areas**:
  - **Timestamp Monotonicity**: `Math.max(Math.floor(clockNow), this.lastTimestampMs + 1)` successfully prevented duplicate timestamps and handled backward time jitter (`performance.now()` regression) and frozen clock scenarios (Tests 2.1, 2.2, 2.3 passed).
  - **Teardown Mechanics**: When `stopWebcam()` is invoked directly on an active session, track cleanup (`track.stop()`), `srcObject` nullification, and animation frame loop cancellation function correctly and cleanly (Tests 3.1, 3.2, 3.3, 3.4 passed).
- **Scope Limit**: As a reviewer/challenger, I do NOT modify implementation code directly. The worker must apply the fix.

---

## 4. Conclusion

**Verdict: `REQUEST_CHANGES`**

`PoseTracker.ts` contains a critical asynchronous race condition bug during webcam initialization:
- Calling `stopWebcam()` while `videoElement.play()` is pending corrupts tracker state, leaving `isActive = true` with `stream = null` and `videoElement = null`.

### Recommended Fix for Worker:
In `src/lib/gait/PoseTracker.ts`, add a `sessionId` check immediately after line 198:

```typescript
    try {
      await this.videoElement.play();
    } catch (err) {
      console.warn("[PoseTracker] videoElement.play() warning:", err);
    }

    if (this.sessionId !== currentSession) {
      if (this.stream) {
        try {
          this.stream.getTracks().forEach((track) => track.stop());
        } catch (err) {
          // ignore
        }
        this.stream = null;
      }
      throw new WebcamError(
        "Webcam initialization aborted during video playback.",
        "UNKNOWN",
      );
    }
```

---

## 5. Verification Method

To independently verify:

```bash
# 1. Execute the Milestone 3 stress test suite:
npx vitest run src/lib/gait/__tests__/m3_challenger_1_stress.test.ts

# 2. Invalidation Condition:
# Test 1.3 ("Async race condition test: stopWebcam during pending video.play() does NOT leave tracker active") MUST pass (11/11 tests green).
```

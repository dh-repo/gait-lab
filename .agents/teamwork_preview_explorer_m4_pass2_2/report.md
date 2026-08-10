# Technical Blueprint: Frontal-Y Contact Disambiguation in `events.ts` (M4 Pass 2)

**Agent ID**: `teamwork_preview_explorer_m4_pass2_2`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m4_pass2_2`  
**Target File**: `/Users/damian/GitHub/gait-lab/src/lib/gait/events.ts` (lines ~349–370)  
**Test File**: `/Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/events.test.ts`  
**Date**: 2026-08-10  

---

## 1. Executive Summary

In frontal and near-frontal video recordings, anterior-posterior (AP) foot displacement along the X-axis collapses because depth movement occurs along the camera optical axis (Z-axis). To detect step contacts in frontal views, `detectGaitEventsZeni` in `src/lib/gait/events.ts` executes a frontal-Y fallback algorithm using the lower-limb vertical trajectory ($Y$-axis).

However, the existing implementation assigns ground contacts to left vs. right feet using **naive index parity alternation (`k % 2`)** across detected vertical extrema (`midStrikes`). This architecture suffers from two catastrophic failure modes:
1. **Initial Foot Inversion**: If the subject's first step in the video happens to be with the right foot, every single contact in the clip is assigned to the wrong side (100% label inversion).
2. **Cascading Missed-Peak Inversion**: A single missed contact or false noise peak inverts the parity ($k \to k \pm 1$) for **all subsequent steps** in the recording.

This blueprint details the spatial inspection architecture to replace `k % 2` with robust 2D/3D ankle landmark analysis (`lAnkleX/Y vs rAnkleX/Y`), multi-tiered landmark visibility gating, and alternation memory fallbacks.

---

## 2. Forensic Code Analysis & Problem Statement

### 2.1 Current Implementation (lines 349–370 in `src/lib/gait/events.ts`)

```ts
// Existing Frontal-Y contact assignment loop (lines 349–370):
for (let k = 0; k < midStrikes.length; k++) {
  const f = midStrikes[k];
  if (k % 2 === 0) rawLHeelStrikes.push(f);
  else rawRHeelStrikes.push(f);
  // Toe-off: mid-swing trough after each contact when available
  if (k + 1 < midStrikes.length) {
    const a = midStrikes[k];
    const b = midStrikes[k + 1];
    let minI = a;
    let minV = filtMidY[a];
    for (let j = a + 1; j < b; j++) {
      if (filtMidY[j] < minV) {
        minV = filtMidY[j];
        minI = j;
      }
    }
    if (minI > a && minI < b) {
      if (k % 2 === 0) rawLToeOffs.push(minI);
      else rawRToeOffs.push(minI);
    }
  }
}
```

### 2.2 Root Cause Analysis of Deficiencies

| Deficiency | Cause | Consequence |
|---|---|---|
| **Blind Parity Assumption** | Assumes `k=0` is always Left foot, `k=1` is Right foot. | 50% chance of complete L/R label inversion on arbitrary walk starts. |
| **Cascading Misassignment** | Index `k` shifts whenever 1 peak is missed or 1 false peak is added. | Phase inversion flips all subsequent steps for the remainder of the clip. |
| **Ignored Landmark Data** | Ignores landmark spatial coordinates available at frame `f` (`LM.L_ANKLE`, `LM.R_ANKLE`, `LM.L_HEEL`, `LM.R_HEEL`). | Fails to leverage unambiguous spatial cues present in MediaPipe pose frames. |

---

## 3. Mathematical & Algorithmic Design for Frontal-Y Disambiguation

### 3.1 Spatial Ankle Landmark Coordinates

In normalized MediaPipe camera coordinates, $Y = 0.0$ is the top edge and $Y = 1.0$ is the bottom edge of the frame.
When a foot makes ground contact during stance:
- The stance ankle/heel reaches its lowest vertical point in the image $\implies$ **maximum $Y$ coordinate value**.
- The opposite foot is in swing phase (clearing the floor) $\implies$ **higher vertical position in image (smaller $Y$ coordinate value)**.

Therefore, at any ground contact frame $f \in \text{midStrikes}$, the relative vertical ankle position $\Delta Y(f)$ provides a direct spatial indicator of foot contact:
$$\Delta Y(f) = \text{filtLY}[f] - \text{filtRY}[f]$$

- If $\Delta Y(f) > +\delta_y$ (where $\delta_y = 0.003$ is a noise deadband): Left ankle is lower $\implies$ **Left Foot Ground Contact**.
- If $\Delta Y(f) < -\delta_y$: Right ankle is lower $\implies$ **Right Foot Ground Contact**.

### 3.2 Multi-Tiered Decision Tree & Landmark Visibility Gating

When evaluating contact frame $f$:

1. **Landmark Visibility Extraction**:
   - Extract left landmark visibility $V_{\text{left}} = \max(\text{vis}(\text{LM.L\_ANKLE}), \text{vis}(\text{LM.L\_HEEL}))$.
   - Extract right landmark visibility $V_{\text{right}} = \max(\text{vis}(\text{LM.R\_ANKLE}), \text{vis}(\text{LM.R\_HEEL}))$.

2. **Tier 1 — Both Landmarks Visible ($V_{\text{left}} \ge 0.3$ and $V_{\text{right}} \ge 0.3$)**:
   - Compute vertical height difference $\Delta Y(f) = \text{filtLY}[f] - \text{filtRY}[f]$.
   - If $|\Delta Y(f)| > \delta_y$:
     - $\Delta Y(f) > 0 \implies \text{side} = \text{"left"}$
     - $\Delta Y(f) < 0 \implies \text{side} = \text{"right"}$
   - If $|\Delta Y(f)| \le \delta_y$ (ambiguous height within deadband, e.g. double support):
     - Proceed to Tier 3 (Alternation Memory).

3. **Tier 2 — Asymmetric Landmark Visibility**:
   - **Case 2A ($V_{\text{left}} \ge 0.3$, $V_{\text{right}} < 0.3$)**:
     - Check if left ankle is extended downward relative to left hip: $(\text{filtLY}[f] - y_{\text{lHip}}) > 0.25$.
     - If true $\implies \text{side} = \text{"left"}$; else $\implies$ invert `lastAssignedSide`.
   - **Case 2B ($V_{\text{right}} \ge 0.3$, $V_{\text{left}} < 0.3$)**:
     - Check if right ankle is extended downward relative to right hip: $(\text{filtRY}[f] - y_{\text{rHip}}) > 0.25$.
     - If true $\implies \text{side} = \text{"right"}$; else $\implies$ invert `lastAssignedSide`.

4. **Tier 3 — Ambiguous Signal / Visibility Fallback (Alternation Memory)**:
   - If spatial evidence is ambiguous or both landmarks are low-visibility ($V < 0.3$):
     - Use `lastAssignedSide` state memory:
       - If `lastAssignedSide === "left"`, assign `"right"`.
       - If `lastAssignedSide === "right"`, assign `"left"`.

5. **Tier 4 — Initial Contact Fallback**:
   - If $k = 0$ (first contact in video) and spatial evidence is completely ambiguous ($V < 0.3$ and $|\Delta Y| \le \delta_y$):
     - Fall back to `k % 2 === 0 ? "left" : "right"`.

---

## 4. Exact Implementation Blueprint

Replace lines ~349–370 in `src/lib/gait/events.ts` with the following replacement block:

```ts
    // Assign successive contacts based on spatial ankle position & landmark inspection
    rawLHeelStrikes = [];
    rawRHeelStrikes = [];
    rawLToeOffs = [];
    rawRToeOffs = [];

    let lastAssignedSide: "left" | "right" | null = null;
    const yDeadband = 0.003; // ~0.3% normalized image height threshold

    for (let k = 0; k < midStrikes.length; k++) {
      const f = midStrikes[k];
      const frame = frames[f];

      // Landmark visibility evaluation
      const lA = frame?.landmarks?.[LM.L_ANKLE];
      const rA = frame?.landmarks?.[LM.R_ANKLE];
      const lH = frame?.landmarks?.[LM.L_HEEL];
      const rH = frame?.landmarks?.[LM.R_HEEL];

      const lVis = Math.max(lA?.visibility ?? 1.0, lH?.visibility ?? 1.0);
      const rVis = Math.max(rA?.visibility ?? 1.0, rH?.visibility ?? 1.0);

      const diffY = filtLY[f] - filtRY[f]; // positive = Left ankle is lower (larger Y)
      let side: "left" | "right";

      if (lVis >= 0.3 && rVis >= 0.3 && Math.abs(diffY) > yDeadband) {
        // Tier 1: Primary spatial vertical height inspection
        side = diffY > 0 ? "left" : "right";
      } else if (lVis >= 0.3 && rVis < 0.3) {
        // Tier 2A: Asymmetric visibility (Left visible, Right occluded)
        const lHipY = frame?.landmarks?.[LM.L_HIP]?.y ?? 0.5;
        const lAnkleYVal = filtLY[f];
        side = (lAnkleYVal - lHipY > 0.25)
          ? "left"
          : (lastAssignedSide === "left" ? "right" : "left");
      } else if (rVis >= 0.3 && lVis < 0.3) {
        // Tier 2B: Asymmetric visibility (Right visible, Left occluded)
        const rHipY = frame?.landmarks?.[LM.R_HIP]?.y ?? 0.5;
        const rAnkleYVal = filtRY[f];
        side = (rAnkleYVal - rHipY > 0.25)
          ? "right"
          : (lastAssignedSide === "right" ? "left" : "right");
      } else {
        // Tier 3 & 4: Ambiguous height / low visibility fallback via Alternation Memory
        if (lastAssignedSide !== null) {
          side = lastAssignedSide === "left" ? "right" : "left";
        } else {
          side = k % 2 === 0 ? "left" : "right";
        }
      }

      lastAssignedSide = side;

      if (side === "left") {
        rawLHeelStrikes.push(f);
      } else {
        rawRHeelStrikes.push(f);
      }

      // Toe-off: mid-swing trough after each contact when available
      if (k + 1 < midStrikes.length) {
        const a = midStrikes[k];
        const b = midStrikes[k + 1];
        let minI = a;
        let minV = filtMidY[a];
        for (let j = a + 1; j < b; j++) {
          if (filtMidY[j] < minV) {
            minV = filtMidY[j];
            minI = j;
          }
        }
        if (minI > a && minI < b) {
          if (side === "left") rawLToeOffs.push(minI);
          else rawRToeOffs.push(minI);
        }
      }
    }
```

---

## 5. Verification Plan

### 5.1 Unit & Integration Test Suites
1. **Existing Unit Tests**: `npx vitest run src/lib/gait/__tests__/events.test.ts`
2. **Challenger Event Tests**: `npx vitest run src/lib/gait/__tests__/events.challenger_m7_2.test.ts`
3. **Adversarial Suite**: `npx vitest run src/lib/gait/__tests__/m1_challenger_adversarial_suite.test.ts`
4. **All Gait Tests**: `npx vitest run src/lib/gait/`

### 5.2 Specific Test Cases to Add in `events.test.ts`
- **Right-Foot Initial Contact Test**: Verify that when synthetic frontal walking starts with right foot contact, `detectGaitEventsZeni` assigns the first event to `side: "right"` and does not invert labels.
- **Single Missed Peak Resilience Test**: Verify that removing 1 contact frame from `midStrikes` does not invert the side labels of subsequent contacts.
- **Low Visibility / Occluded Ankle Fallback Test**: Verify that setting `visibility = 0.1` on left or right ankle landmarks smoothly degrades to alternation memory without throwing errors or producing `NaN`.

### 5.3 Static Quality Checks
- `npx tsc --noEmit` — 0 TypeScript errors.
- `npx eslint .` — 0 ESLint warnings/errors.

---

**Report Authored By**: `teamwork_preview_explorer_m4_pass2_2`  
**Status**: Investigation Complete & Blueprint Finalized

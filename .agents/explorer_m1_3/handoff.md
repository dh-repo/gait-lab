# Handoff Report — Requirement R4: Stride Duration Ceiling & Double Support Search Limits

## 1. Observation

### Target Codebase Locations & Verbatim Snippets

#### Location 1: `src/lib/gait/events.ts` (Line 584)
```typescript
581:       // Record valid contact assignment and update running step duration estimate
582:       if (lastAssignedSide !== null && lastAssignedFrame !== null && side !== lastAssignedSide) {
583:         const stepDur = f - lastAssignedFrame;
584:         if (stepDur >= 6 && stepDur <= 2.5 * effectiveFps) {
585:           estimatedStepFrames = Math.round(0.7 * estimatedStepFrames + 0.3 * stepDur);
586:         }
587:       }
```

#### Location 2: `src/lib/gait/events.ts` (Lines 677–681)
```typescript
675:       const ic1 = strikes[i];
676:       const ic2 = strikes[i + 1];
677:       const strideDur = ic2.timeSec - ic1.timeSec;
678: 
679:       if (strideDur > 0.3 && strideDur < 2.5) {
680:         const matchingTo = offs.find(
681:           (to) => to.timeSec > ic1.timeSec && to.timeSec < ic2.timeSec,
682:         );
```

#### Location 3: `src/lib/gait/events.ts` (Lines 720–738 & Lines 747–753)
```typescript
720:   // Left IC to Right TO
721:   for (const lic of leftStrikes) {
722:     const rto = rightOffs.find(
723:       (to) => to.timeSec > lic.timeSec && to.timeSec - lic.timeSec < 0.5,
724:     );
725:     if (rto) {
726:       dsIntervals.push(rto.timeSec - lic.timeSec);
727:     }
728:   }
729: 
730:   // Right IC to Left TO
731:   for (const ric of rightStrikes) {
732:     const lto = leftOffs.find(
733:       (to) => to.timeSec > ric.timeSec && to.timeSec - ric.timeSec < 0.5,
734:     );
735:     if (lto) {
736:       dsIntervals.push(lto.timeSec - ric.timeSec);
737:     }
738:   }
...
747:     for (let i = 0; i < leftStrikes.length - 1; i++) {
748:       const dur = leftStrikes[i + 1].timeSec - leftStrikes[i].timeSec;
749:       if (dur > 0.4 && dur < 2.5) {
750:         totalStrideDur += dur;
751:         strideCount++;
752:       }
753:     }
```

#### Location 4: `src/lib/gait/analysis.ts` (Line 363)
```typescript
361:   const avgStepTimeSec = mean(cvIntervals.length >= 2 ? cvIntervals : stepIntervals) || 0;
362:   // Prefer interval-based cadence (ignores lead-in/out standing); fall back to count/duration
363:   const cadenceFromIntervals = avgStepTimeSec > 0.2 && avgStepTimeSec < 1.5 ? 60 / avgStepTimeSec : 0;
```

---

## 2. Logic Chain

1. **Stride Duration Ceiling Issue (2.5s -> 4.0s)**:
   - In `events.ts` lines 679 and 749, any stride with a duration `strideDur >= 2.5s` is excluded from stance phase calculation (`computeStanceForSide`) and average stride duration calculation (`avgStrideDur`).
   - Walker-assisted or severely impaired Parkinsonian patients often exhibit slow walking with stride durations between 2.5s and 4.0s (cadence 30–48 spm).
   - Rejecting `strideDur >= 2.5s` causes slow strides to be ignored, falling back to static 60.0% default stance phase or default `1.1s` stride duration estimate.
   - Raising the stride duration ceiling from `2.5` to `4.0` in lines 584, 679, and 749 of `events.ts` enables valid processing of slow strides up to 4.0s.

2. **Double Support Search Limit Scaling (0.5s -> min(0.75 * meanStepTime, 1.0))**:
   - In `events.ts` lines 723 and 733, double support candidate toe-offs (`rto` and `lto`) are searched within a hardcoded `< 0.5s` window after initial contact (`lic` and `ric`).
   - For slow gait, double support duration routinely reaches 0.4s–0.6s. The fixed 0.5s cap clips valid double support events occurring between 0.5s and 0.6s.
   - Conversely, for very fast gait (step time ~0.35s), a fixed 0.5s limit could mistakenly match a toe-off from a subsequent stance phase.
   - Computing `meanStepTime` from consecutive heel strikes and dynamically setting `dsSearchLimit = Math.min(0.75 * meanStepTime, 1.0)` properly scales the search window:
     - For slow gait (`meanStepTime = 0.8s`): limit is `0.60s` (captures 0.4–0.6s double support).
     - For fast gait (`meanStepTime = 0.4s`): limit is `0.30s` (prevents cross-stride matching).
     - Capped at `1.0s` for extreme slow gait.

3. **Analysis Interval-Based Cadence Guard (`analysis.ts` line 363)**:
   - In `analysis.ts` line 363, `avgStepTimeSec < 1.5` rejects interval-based cadence when average step time reaches 1.5s (which corresponds to 40 spm cadence or 3.0s stride duration).
   - Changing `< 1.5` to `<= 2.5` ensures interval-based cadence estimation functions down to 24 spm (supporting the 40–140 spm clinical requirement).

---

## 3. Caveats

- **Fallback when step events are sparse**: When `heelStrikes.length < 2` or `stepIntervals.length === 0`, `meanStepTime` defaults to `0.55s`, yielding `dsSearchLimit = Math.min(0.75 * 0.55, 1.0) = 0.4125s` (which falls back safely).
- **Computed Double Support % Bounds**: `events.ts` line 758 enforces `if (computedDs >= 5 && computedDs <= 45)`. Extreme pathological double support values outside 5%–45% will fall back to `20.0%`.
- **No changes to source code files during investigation**: As per instructions, this report specifies the exact fix strategy for worker implementation.

---

## 4. Conclusion & Proposed Fix Strategy

### Detailed Proposed Modifications

#### File 1: `src/lib/gait/events.ts`

**Edit 1 (Line 584):** Update step duration ceiling for running step frame estimate.
```typescript
<<<<
        if (stepDur >= 6 && stepDur <= 2.5 * effectiveFps) {
====
        if (stepDur >= 6 && stepDur <= 4.0 * effectiveFps) {
>>>>
```

**Edit 2 (Line 679):** Update stride duration ceiling in stance phase calculation.
```typescript
<<<<
      if (strideDur > 0.3 && strideDur < 2.5) {
====
      if (strideDur > 0.3 && strideDur < 4.0) {
>>>>
```

**Edit 3 (Lines 718–756):** Scale double support search limit and update stride duration ceiling in double support calculation.
```typescript
<<<<
  const dsIntervals: number[] = [];

  // Left IC to Right TO
  for (const lic of leftStrikes) {
    const rto = rightOffs.find(
      (to) => to.timeSec > lic.timeSec && to.timeSec - lic.timeSec < 0.5,
    );
    if (rto) {
      dsIntervals.push(rto.timeSec - lic.timeSec);
    }
  }

  // Right IC to Left TO
  for (const ric of rightStrikes) {
    const lto = leftOffs.find(
      (to) => to.timeSec > ric.timeSec && to.timeSec - ric.timeSec < 0.5,
    );
    if (lto) {
      dsIntervals.push(lto.timeSec - ric.timeSec);
    }
  }

  if (dsIntervals.length > 0) {
    const avgDsTime =
      dsIntervals.reduce((a, b) => a + b, 0) / dsIntervals.length;
    // Estimate stride duration from consecutive strikes
    let totalStrideDur = 0;
    let strideCount = 0;

    for (let i = 0; i < leftStrikes.length - 1; i++) {
      const dur = leftStrikes[i + 1].timeSec - leftStrikes[i].timeSec;
      if (dur > 0.4 && dur < 2.5) {
        totalStrideDur += dur;
        strideCount++;
      }
    }
====
  const allStrikes = allEvents
    .filter((e) => e.type === "heel_strike")
    .sort((a, b) => a.timeSec - b.timeSec);

  const stepIntervals: number[] = [];
  for (let i = 1; i < allStrikes.length; i++) {
    const dt = allStrikes[i].timeSec - allStrikes[i - 1].timeSec;
    if (dt > 0.15 && dt < 4.0) {
      stepIntervals.push(dt);
    }
  }
  const meanStepTime =
    stepIntervals.length > 0
      ? stepIntervals.reduce((a, b) => a + b, 0) / stepIntervals.length
      : 0.55;

  const dsSearchLimit = Math.min(0.75 * meanStepTime, 1.0);

  const dsIntervals: number[] = [];

  // Left IC to Right TO
  for (const lic of leftStrikes) {
    const rto = rightOffs.find(
      (to) => to.timeSec > lic.timeSec && to.timeSec - lic.timeSec < dsSearchLimit,
    );
    if (rto) {
      dsIntervals.push(rto.timeSec - lic.timeSec);
    }
  }

  // Right IC to Left TO
  for (const ric of rightStrikes) {
    const lto = leftOffs.find(
      (to) => to.timeSec > ric.timeSec && to.timeSec - ric.timeSec < dsSearchLimit,
    );
    if (lto) {
      dsIntervals.push(lto.timeSec - ric.timeSec);
    }
  }

  if (dsIntervals.length > 0) {
    const avgDsTime =
      dsIntervals.reduce((a, b) => a + b, 0) / dsIntervals.length;
    // Estimate stride duration from consecutive strikes
    let totalStrideDur = 0;
    let strideCount = 0;

    for (let i = 0; i < leftStrikes.length - 1; i++) {
      const dur = leftStrikes[i + 1].timeSec - leftStrikes[i].timeSec;
      if (dur > 0.4 && dur < 4.0) {
        totalStrideDur += dur;
        strideCount++;
      }
    }
>>>>
```

#### File 2: `src/lib/gait/analysis.ts`

**Edit 1 (Line 363):** Update `avgStepTimeSec` upper bound for interval-based cadence.
```typescript
<<<<
  const cadenceFromIntervals = avgStepTimeSec > 0.2 && avgStepTimeSec < 1.5 ? 60 / avgStepTimeSec : 0;
====
  const cadenceFromIntervals = avgStepTimeSec > 0.2 && avgStepTimeSec <= 2.5 ? 60 / avgStepTimeSec : 0;
>>>>
```

---

## 5. Verification Method

1. **Test Suite Execution**:
   Run `npx vitest run` to ensure all existing 1224+ tests pass.

2. **TypeScript & Linting Check**:
   - `npx tsc --noEmit`
   - `npx eslint`

3. **New Target Unit Tests (for M4 / test suite)**:
   - Verify stride duration 3.5s is accepted by `detectGaitEventsZeni` without returning default fallback.
   - Verify double support search with `meanStepTime = 0.8s` uses `dsSearchLimit = 0.6s` and correctly detects double support interval of 0.55s.
   - Verify `computeGaitMetrics` with step duration 1.5s correctly computes cadence 40 spm using interval-based calculation.

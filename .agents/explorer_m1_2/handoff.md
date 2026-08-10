# Handoff Report: M1 R2 & R3 Codebase & Requirements Investigation

## 1. Observation

### R2: Contralateral Step Distance Mislabeled as "Stride Length"
- **Target File:** `src/lib/gait/analysis.ts` lines 402-416.
- **Verbatim Code Snippet:**
```typescript
401:   // Stride length proxy: hip travel between same-side steps (valid in sagittal/oblique)
402:   const leftStride: number[] = [];
403:   const rightStride: number[] = [];
404:   for (let i = 1; i < heelStrikes.length; i++) {
405:     if (heelStrikes[i].side !== heelStrikes[i - 1].side) {
406:       const i0 = nearestIndex(series.map((s) => s.t), heelStrikes[i - 1].timeSec);
407:       const i1 = nearestIndex(series.map((s) => s.t), heelStrikes[i].timeSec);
408:       const travel = Math.hypot(
409:         series[i1].midHipX - series[i0].midHipX,
410:         series[i1].midHipY - series[i0].midHipY,
411:       ) / mean(series.map((s) => s.torso));
412:       if (heelStrikes[i].side === "left") leftStride.push(travel);
413:       else rightStride.push(travel);
414:     }
415:   }
416:   const strideAsymmetry = !isFrontal ? asymmetryRatio(mean(leftStride) || 0, mean(rightStride) || 0) : null;
```
- **Direct Observation & Defect Analysis:**
  Line 405 evaluates `if (heelStrikes[i].side !== heelStrikes[i - 1].side)`. This condition measures travel between consecutive heel strikes of **opposite** feet (e.g. Right -> Left or Left -> Right). In gait analysis, travel between opposite foot contacts is **contralateral step distance** (Step Length).
  The code erroneously stores this step distance into `leftStride` and `rightStride`, mislabeling step length as stride length. True **stride length** is **ipsilateral** distance—the distance traveled between consecutive contacts of the **same** foot (Left -> Left or Right -> Right).

### R3: Hardcoded Cadence Penalty Kills Parkinsonian Gait
- **Target File:** `src/lib/gait/analysis.ts` lines 328-333.
- **Verbatim Code Snippet:**
```typescript
328:     const walkFit = (c: number) => {
329:       if (c < 45 || c > 165) return -1e9;
330:       // peak preference ~100–115 spm
331:       return -Math.abs(c - 108) - (c < 70 ? 40 : 0);
332:     };
333:     if (oscHs.length >= 4 && walkFit(oCad) > walkFit(zCad)) {
334:       stepEvents = osc;
335:     }
```
- **Direct Observation & Defect Analysis:**
  Line 331 applies a heavy `-40` penalty (`- (c < 70 ? 40 : 0)`) to any cadence lower than 70 steps per minute (spm).
  In frontal camera views (`if (isFrontal)`), `walkFit` compares cadence `zCad` derived from Zeni heel strikes against `oCad` derived from hip-Y oscillation peaks (`estimateStepsFromOscillation`).
  For Parkinsonian or slow-gait subjects with cadence under 70 spm (e.g. 50 spm), Zeni's accurate low-cadence detection receives the -40 penalty (`walkFit(50) = -58 - 40 = -98`). If `oscHs` generates noisy oscillation peaks around ~100 spm (`walkFit(100) = -8`), `walkFit(oCad) > walkFit(zCad)` evaluates to true.
  This forces the algorithm to discard true Zeni heel strikes (`stepEvents = osc`), overwriting low-cadence Parkinsonian steps with invalid high-frequency oscillation noise.
  Additionally, line 329 enforces `c < 45 || c > 165`, whereas the clinical standard for gait cadence selection range is 40–140 spm.

---

## 2. Logic Chain

### R2 Logic Chain
1. `heelStrikes` contains sorted gait events with `side: "left" | "right"` and `timeSec`.
2. Iterating through `i` from 1 to `heelStrikes.length - 1` with condition `side !== side` pairs `heelStrikes[i-1]` (Foot A) with `heelStrikes[i]` (Foot B). The distance traveled between Foot A contact and Foot B contact is contralateral step length.
3. True ipsilateral stride length must be computed by measuring travel between consecutive contacts of the **same** side (`side === side`):
   - For `side` in `["left", "right"]`:
   - Filter `heelStrikes` for `side`.
   - Iterate through consecutive same-side strikes `j - 1` and `j`.
   - Measure `midHip` travel between `timeSec` of `sideStrikes[j - 1]` and `sideStrikes[j]`, normalized by mean torso height.
   - Store in `leftStride` (for left) and `rightStride` (for right).
4. Retain contralateral step distance calculation for step length (e.g. `leftStep` / `rightStep`).
5. `strideAsymmetry` will continue to be computed as `asymmetryRatio(mean(leftStride) || 0, mean(rightStride) || 0)`, which now reflects true ipsilateral stride length asymmetry.

### R3 Logic Chain
1. In frontal views, `walkFit(c)` scores candidate cadence values to select between Zeni event detection (`zCad`) and hip-Y vertical oscillation peak detection (`oCad`).
2. Removing `- (c < 70 ? 40 : 0)` ensures slow gait (40–70 spm) is evaluated purely by its distance from typical cadence (-Math.abs(c - 108)) without artificial penalization.
3. Updating the valid cadence range check from `c < 45 || c > 165` to `c < 40 || c > 140` establishes the acceptable clinical range of 40–140 spm.
4. With this change, a Parkinsonian gait clip with cadence ~50 spm will yield `walkFit(50) = -58`. Unless oscillation peaks provide a genuinely closer fit to normal walking without false high-frequency peaks, Zeni's low-cadence detection is preserved instead of being overridden by `osc`.

---

## 3. Caveats
- **Stride length magnitude shift**: Switching `leftStride` and `rightStride` from contralateral (step) to ipsilateral (stride) will double the numeric travel distance value for symmetric gait (since 1 stride = 2 steps). Tests or modules checking absolute stride length values (rather than relative ratios or asymmetry percentages) will see doubled values.
- **Frontal View Scope of `walkFit`**: `walkFit` is exclusively invoked inside `if (isFrontal)` in `analysis.ts` (lines 320-336). Sagittal and oblique view processing are unaffected by `walkFit`.
- **Cadence upper bound 140 spm**: For `walkFit` in frontal view, cadences > 140 spm will return `-1e9`. Note that ultra-high cadence festinating gait (e.g., > 140 spm up to 300 spm in `cat5_micro_steps_parkinsonian.test.ts`) is evaluated in non-frontal or general processing where `walkFit` is not used.

---

## 4. Conclusion & Proposed Implementation Strategy

### Proposed Code Changes for `src/lib/gait/analysis.ts`

#### Fix R2: Ipsilateral Stride Length (lines 401-416)
```typescript
  // Contralateral step distance (step length)
  const leftStep: number[] = [];
  const rightStep: number[] = [];
  for (let i = 1; i < heelStrikes.length; i++) {
    if (heelStrikes[i].side !== heelStrikes[i - 1].side) {
      const i0 = nearestIndex(series.map((s) => s.t), heelStrikes[i - 1].timeSec);
      const i1 = nearestIndex(series.map((s) => s.t), heelStrikes[i].timeSec);
      const travel = Math.hypot(
        series[i1].midHipX - series[i0].midHipX,
        series[i1].midHipY - series[i0].midHipY,
      ) / mean(series.map((s) => s.torso));
      if (heelStrikes[i].side === "left") leftStep.push(travel);
      else rightStep.push(travel);
    }
  }

  // Ipsilateral stride length: hip travel between consecutive same-side steps (valid in sagittal/oblique)
  const leftStride: number[] = [];
  const rightStride: number[] = [];
  for (const side of ["left", "right"] as const) {
    const sideStrikes = heelStrikes.filter((e) => e.side === side);
    for (let i = 1; i < sideStrikes.length; i++) {
      const i0 = nearestIndex(series.map((s) => s.t), sideStrikes[i - 1].timeSec);
      const i1 = nearestIndex(series.map((s) => s.t), sideStrikes[i].timeSec);
      const travel = Math.hypot(
        series[i1].midHipX - series[i0].midHipX,
        series[i1].midHipY - series[i0].midHipY,
      ) / mean(series.map((s) => s.torso));
      if (side === "left") leftStride.push(travel);
      else rightStride.push(travel);
    }
  }
  const strideAsymmetry = !isFrontal ? asymmetryRatio(mean(leftStride) || 0, mean(rightStride) || 0) : null;
```

#### Fix R3: Remove Low-Cadence Penalty & Set Clinical Range 40-140 SPM (lines 328-333)
```typescript
    const walkFit = (c: number) => {
      if (c < 40 || c > 140) return -1e9;
      // peak preference ~100–115 spm
      return -Math.abs(c - 108);
    };
```

---

## 5. Verification Method

### Test Commands
1. **Unit Test Execution:**
   ```bash
   npx vitest run src/lib/gait/__tests__/analysis.test.ts src/lib/gait/__tests__/cat5_micro_steps_parkinsonian.test.ts
   ```
2. **Full Test Suite Run:**
   ```bash
   npx vitest run
   ```
3. **TypeScript Compliance Check:**
   ```bash
   npx tsc --noEmit
   ```

### Specific Verification Tests to Implement (under R11)
1. **Ipsilateral Stride Length Test (`src/lib/gait/__tests__/analysis.test.ts`):**
   Construct a synthetic pose sequence with known step geometry (e.g. step distance = 0.5 torso height, stride distance = 1.0 torso height). Verify that `leftStride` and `rightStride` yield ~1.0 torso height while `leftStep` / `rightStep` yield ~0.5 torso height.
2. **Parkinsonian Low Cadence WalkFit Test (`src/lib/gait/__tests__/analysis.test.ts`):**
   Pass a frontal view walking clip with cadence = 50 spm. Assert that Zeni heel strikes are preserved (`stepEvents` matches Zeni detection) and not replaced by oscillation peaks.

### Invalidation Conditions
- Any test failure across the vitest suite (0 failures required).
- Any TypeScript compilation error from `tsc`.

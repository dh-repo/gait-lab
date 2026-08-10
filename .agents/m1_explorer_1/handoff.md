# Handoff Report — Scale-Invariant Biometric Signature Refactoring (M1 Explorer 1)

## 1. Observation

### 1.1 Type Definitions
- **`src/lib/gait/analysis.ts` (lines 641–646)**:
  ```ts
  export type BiometricSignature = {
    aspectRatio: number;
    height: number;
    torsoRatio: number;
    shoulderWidthRatio: number;
  };
  ```
- **`src/lib/gait/types.ts` (lines 30–35)**:
  ```ts
  export type BiometricSignature = {
    aspectRatio: number;
    height: number;
    torsoRatio: number;
    shoulderWidthRatio: number;
  };
  ```

### 1.2 `computeBiometricSignature` Implementation
- **`src/lib/gait/analysis.ts` (lines 668–696)**:
  ```ts
  export function computeBiometricSignature(landmarks: Landmark[]): BiometricSignature {
    const box = boundingBox(landmarks);
    const h = Math.max(0.01, box.h);
    const w = Math.max(0.01, box.w);
    const aspectRatio = w / h;

    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    let torsoRatio = 0.35;
    let shoulderWidthRatio = 0.25;

    if (leftShoulder && rightShoulder && leftHip && rightHip) {
      const sMidX = (leftShoulder.x + rightShoulder.x) / 2;
      const sMidY = (leftShoulder.y + rightShoulder.y) / 2;
      const hMidX = (leftHip.x + rightHip.x) / 2;
      const hMidY = (leftHip.y + rightHip.y) / 2;

      const torsoLen = Math.hypot(sMidX - hMidX, sMidY - hMidY);
      torsoRatio = torsoLen / h;

      const shoulderW = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
      shoulderWidthRatio = shoulderW / h;
    }

    return { aspectRatio, height: h, torsoRatio, shoulderWidthRatio };
  }
  ```

### 1.3 `biometricDistance` Formula
- **`src/lib/gait/analysis.ts` (lines 698–706)**:
  ```ts
  export function biometricDistance(a?: BiometricSignature, b?: BiometricSignature): number {
    if (!a || !b) return 0;
    const dAspect = Math.abs(a.aspectRatio - b.aspectRatio) / Math.max(0.1, a.aspectRatio, b.aspectRatio);
    const dHeight = Math.abs(a.height - b.height) / Math.max(0.1, a.height, b.height);
    const dTorso = Math.abs(a.torsoRatio - b.torsoRatio) / Math.max(0.1, a.torsoRatio, b.torsoRatio);
    const dShoulder = Math.abs(a.shoulderWidthRatio - b.shoulderWidthRatio) / Math.max(0.1, a.shoulderWidthRatio, b.shoulderWidthRatio);

    return dAspect * 0.35 + dHeight * 0.35 + dTorso * 0.15 + dShoulder * 0.15;
  }
  ```

### 1.4 Downstream Type Usages & Mock Signature Creation
- **`src/lib/gait/analysis.ts` (lines 772–781 in `matchPeople`)**:
  ```ts
  if (trk.biometrics) {
    trk.biometrics = {
      aspectRatio: 0.7 * trk.biometrics.aspectRatio + 0.3 * bio.aspectRatio,
      height: 0.7 * trk.biometrics.height + 0.3 * bio.height,
      torsoRatio: 0.7 * trk.biometrics.torsoRatio + 0.3 * bio.torsoRatio,
      shoulderWidthRatio: 0.7 * trk.biometrics.shoulderWidthRatio + 0.3 * bio.shoulderWidthRatio,
    };
  } else {
    trk.biometrics = bio;
  }
  ```
- **`src/lib/gait/analysis.ts` (lines 885–890 in `mergeFragmentedTracks`)**:
  ```ts
  if (earlier.biometrics && later.biometrics) {
    const w1 = earlier.frames;
    const w2 = later.frames;
    earlier.biometrics = {
      aspectRatio: (earlier.biometrics.aspectRatio * w1 + later.biometrics.aspectRatio * w2) / (w1 + w2),
      height: (earlier.biometrics.height * w1 + later.biometrics.height * w2) / (w1 + w2),
      torsoRatio: (earlier.biometrics.torsoRatio * w1 + later.biometrics.torsoRatio * w2) / (w1 + w2),
      shoulderWidthRatio: (earlier.biometrics.shoulderWidthRatio * w1 + later.biometrics.shoulderWidthRatio * w2) / (w1 + w2),
    };
  }
  ```
- **`src/components/gait/GaitApp.tsx` (lines 960–966 in video sampling loop)**:
  ```ts
  lastBiometric = lastBiometric
    ? {
        aspectRatio: 0.7 * lastBiometric.aspectRatio + 0.3 * newBio.aspectRatio,
        height: 0.7 * lastBiometric.height + 0.3 * newBio.height,
        torsoRatio: 0.7 * lastBiometric.torsoRatio + 0.3 * newBio.torsoRatio,
        shoulderWidthRatio: 0.7 * lastBiometric.shoulderWidthRatio + 0.3 * newBio.shoulderWidthRatio,
      }
    : newBio;
  ```
- **`src/lib/gait/__tests__/analysis.test.ts` (lines 300, 315, 330, 353, 367)**:
  ```ts
  biometrics: { aspectRatio: 0.33, height: 0.6, torsoRatio: 0.35, shoulderWidthRatio: 0.25 }
  ```

---

## 2. Logic Chain

1. **Non-Scale Invariance Defect**:
   - `height` ($h$) measures absolute bounding box height in normalized image coordinates $[0, 1]$.
   - As a person walks toward or away from the camera, their bounding box height $h$ changes proportional to distance $d$: $h \propto 1/d$.
   - In `biometricDistance`, $dHeight = \frac{|h_a - h_b|}{\max(0.1, h_a, h_b)}$ carries a 35% weight ($0.35 \cdot dHeight$).
   - When a person moves, $dHeight$ spikes to 0.30–0.50, causing `biometricDistance` to exceed track matching and merging thresholds (`bioDist > 0.38`), splitting a single walking person into multiple duplicate tracklets.

2. **Scale-Invariant Morphological Ratios**:
   - Under uniform 2D scaling by factor $S > 0$:
     - `w` $\to S \cdot w$, `h` $\to S \cdot h \implies \text{aspectRatio} = (S \cdot w) / (S \cdot h) = w / h$ (scale invariant).
     - `torsoLen` $\to S \cdot \text{torsoLen}$, `legLen` $\to S \cdot \text{legLen} \implies \text{torsoLegRatio} = (S \cdot \text{torsoLen}) / (S \cdot \text{legLen}) = \text{torsoLen} / \text{legLen}$ (scale invariant).
     - `shoulderW` $\to S \cdot \text{shoulderW}$, `hipW` $\to S \cdot \text{hipW} \implies \text{shoulderHipRatio} = (S \cdot \text{shoulderW}) / (S \cdot \text{hipW}) = \text{shoulderW} / \text{hipW}$ (scale invariant).
   - Replacing `height`, `torsoRatio`, and `shoulderWidthRatio` with `aspectRatio`, `torsoLegRatio`, and `shoulderHipRatio` ensures `BiometricSignature` is 100% scale invariant.

3. **Denominator Safety Bounds**:
   - `aspectRatio`: $w / \max(0.01, h)$
   - `shoulderHipRatio`: $\text{shoulderW} / \max(0.01, \text{hipW})$
   - `torsoLegRatio`: $\text{torsoLen} / \max(0.01, \text{legLen})$
   - Wrapping all denominators with `Math.max(0.01, ...)` guarantees no division-by-zero, `NaN`, or `Infinity` under edge cases (e.g. side profile, collapsed hips, missing leg keypoints).

4. **Weighted Biometric Distance Metric**:
   - $d_{\text{aspect}} = \frac{|a.\text{aspectRatio} - b.\text{aspectRatio}|}{\max(0.1, a.\text{aspectRatio}, b.\text{aspectRatio})}$
   - $d_{\text{torsoLeg}} = \frac{|a.\text{torsoLegRatio} - b.\text{torsoLegRatio}|}{\max(0.1, a.\text{torsoLegRatio}, b.\text{torsoLegRatio})}$
   - $d_{\text{shoulderHip}} = \frac{|a.\text{shoulderHipRatio} - b.\text{shoulderHipRatio}|}{\max(0.1, a.\text{shoulderHipRatio}, b.\text{shoulderHipRatio})}$
   - `bioDist = 0.35 * dAspect + 0.35 * dTorsoLeg + 0.30 * dShoulderHip`
   - Bounded strictly in $[0, 1.0]$. For pure scale shifts, $d(a, b) = 0.0$.

5. **Type Audit & Compilation Preservation**:
   - `BiometricSignature` is defined in both `src/lib/gait/types.ts` and `src/lib/gait/analysis.ts`. Both must be updated synchronously.
   - Upstream track updates in `matchPeople`, `mergeFragmentedTracks`, and `GaitApp.tsx` must be updated to average `aspectRatio`, `torsoLegRatio`, and `shoulderHipRatio`.
   - Mock objects in `src/lib/gait/__tests__/analysis.test.ts` must be updated to use the new field names to maintain 100% TypeScript compilation (`npx tsc --noEmit`).

---

## 3. Caveats

- **MediaPipe Keypoint Availability**: If ankle keypoints (landmarks 27, 28) are missing or occluded, `legLen` defaults to `Math.max(0.01, h - torsoLen)`.
- **Side Profile Obliquity**: In extreme side profile views, hip keypoints (landmarks 23, 24) overlap in 2D projection, reducing `hipW`. The `Math.max(0.01, hipW)` safeguard prevents numeric instability, though `shoulderHipRatio` may temporarily increase; track temporal smoothing ($0.7 \cdot \text{prev} + 0.3 \cdot \text{curr}$) stabilizes the signature across frames.

---

## 4. Conclusion & Precise Code Replacement Plan

### 4.1 Edit `src/lib/gait/types.ts`
Replace lines 30–35 with:
```ts
export type BiometricSignature = {
  aspectRatio: number;
  torsoLegRatio: number;
  shoulderHipRatio: number;
};
```

### 4.2 Edit `src/lib/gait/analysis.ts`

1. **Replace `BiometricSignature` type (lines 641–646)**:
```ts
export type BiometricSignature = {
  aspectRatio: number;
  torsoLegRatio: number;
  shoulderHipRatio: number;
};
```

2. **Replace `computeBiometricSignature` (lines 668–696)**:
```ts
export function computeBiometricSignature(landmarks: Landmark[]): BiometricSignature {
  const box = boundingBox(landmarks);
  const h = Math.max(0.01, box.h);
  const w = Math.max(0.01, box.w);
  const aspectRatio = w / h;

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  let torsoLegRatio = 0.7;
  let shoulderHipRatio = 1.2;

  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const sMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const sMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hMidX = (leftHip.x + rightHip.x) / 2;
    const hMidY = (leftHip.y + rightHip.y) / 2;

    const torsoLen = Math.hypot(sMidX - hMidX, sMidY - hMidY);

    let legLen = h - torsoLen;
    if (leftAnkle && rightAnkle) {
      const aMidX = (leftAnkle.x + rightAnkle.x) / 2;
      const aMidY = (leftAnkle.y + rightAnkle.y) / 2;
      legLen = Math.hypot(hMidX - aMidX, hMidY - aMidY);
    }
    legLen = Math.max(0.01, legLen);
    torsoLegRatio = torsoLen / legLen;

    const shoulderW = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
    const hipW = Math.hypot(leftHip.x - rightHip.x, leftHip.y - rightHip.y);
    shoulderHipRatio = shoulderW / Math.max(0.01, hipW);
  }

  return { aspectRatio, torsoLegRatio, shoulderHipRatio };
}
```

3. **Replace `biometricDistance` (lines 698–706)**:
```ts
export function biometricDistance(a?: BiometricSignature, b?: BiometricSignature): number {
  if (!a || !b) return 0;
  const dAspect = Math.abs(a.aspectRatio - b.aspectRatio) / Math.max(0.1, a.aspectRatio, b.aspectRatio);
  const dTorsoLeg = Math.abs(a.torsoLegRatio - b.torsoLegRatio) / Math.max(0.1, a.torsoLegRatio, b.torsoLegRatio);
  const dShoulderHip = Math.abs(a.shoulderHipRatio - b.shoulderHipRatio) / Math.max(0.1, a.shoulderHipRatio, b.shoulderHipRatio);

  return dAspect * 0.35 + dTorsoLeg * 0.35 + dShoulderHip * 0.30;
}
```

4. **Update `matchPeople` biometrics smoothing (lines 772–781)**:
```ts
    if (trk.biometrics) {
      trk.biometrics = {
        aspectRatio: 0.7 * trk.biometrics.aspectRatio + 0.3 * bio.aspectRatio,
        torsoLegRatio: 0.7 * trk.biometrics.torsoLegRatio + 0.3 * bio.torsoLegRatio,
        shoulderHipRatio: 0.7 * trk.biometrics.shoulderHipRatio + 0.3 * bio.shoulderHipRatio,
      };
    } else {
      trk.biometrics = bio;
    }
```

5. **Update `mergeFragmentedTracks` biometrics averaging (lines 885–890)**:
```ts
          if (earlier.biometrics && later.biometrics) {
            const w1 = earlier.frames;
            const w2 = later.frames;
            earlier.biometrics = {
              aspectRatio: (earlier.biometrics.aspectRatio * w1 + later.biometrics.aspectRatio * w2) / (w1 + w2),
              torsoLegRatio: (earlier.biometrics.torsoLegRatio * w1 + later.biometrics.torsoLegRatio * w2) / (w1 + w2),
              shoulderHipRatio: (earlier.biometrics.shoulderHipRatio * w1 + later.biometrics.shoulderHipRatio * w2) / (w1 + w2),
            };
          }
```

### 4.3 Edit `src/components/gait/GaitApp.tsx`
Replace lines 960–966 with:
```ts
        lastBiometric = lastBiometric
          ? {
              aspectRatio: 0.7 * lastBiometric.aspectRatio + 0.3 * newBio.aspectRatio,
              torsoLegRatio: 0.7 * lastBiometric.torsoLegRatio + 0.3 * newBio.torsoLegRatio,
              shoulderHipRatio: 0.7 * lastBiometric.shoulderHipRatio + 0.3 * newBio.shoulderHipRatio,
            }
          : newBio;
```

### 4.4 Edit `src/lib/gait/__tests__/analysis.test.ts`
Replace lines 300, 315, 330, 353, 367 with:
```ts
        biometrics: { aspectRatio: 0.33, torsoLegRatio: 0.7, shoulderHipRatio: 1.2 },
```

---

## 5. Verification Method

1. **TypeScript Type Check**:
   ```bash
   npx tsc --noEmit
   ```
   *Pass criteria*: 0 compilation errors.

2. **Biometric Invariance Test**:
   ```bash
   npx vitest run src/lib/gait/__tests__/person_identification_stress.test.ts
   ```
   *Pass criteria*: `computes invariant biometric signatures across scale changes` passes with `bioDist < 0.30` (expected ~0.00).

3. **Analysis Unit Test Suite**:
   ```bash
   npx vitest run src/lib/gait/__tests__/analysis.test.ts
   ```
   *Pass criteria*: All tests pass 100%.

4. **Full Test Suite**:
   ```bash
   npm test
   ```
   *Pass criteria*: All test suites pass 100% without regressions.

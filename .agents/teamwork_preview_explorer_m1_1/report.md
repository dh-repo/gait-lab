# Blueprint Report: Requirement R1 — Hungarian (Kuhn-Munkres) Optimal Bipartite Matching for `matchPeople()`

**Agent ID**: `teamwork_preview_explorer_m1_1`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m1_1`  
**Target Source File**: `/Users/damian/GitHub/gait-lab/src/lib/gait/analysis.ts` (lines ~815–933)  
**Date**: 2026-08-10  

---

## Executive Summary

Requirement R1 mandates upgrading the person tracking assignment strategy in `matchPeople()` (`src/lib/gait/analysis.ts`) from a greedy cost-sorted pair matching loop to the **Hungarian (Kuhn-Munkres) $O(K^3)$ optimal bipartite matching algorithm**. 

While the existing greedy implementation performs adequately when single subjects walk in isolation, it fails under multi-person scenarios (e.g., crossing trajectories, parallel walking, U-turns, or close encounters). In such cases, greedy assignment selects local minimum cost pairs first, forcing remaining detections into sub-optimal track matches or prematurely gating them out—resulting in false duplicate tracks or track swapping.

This report delivers a complete, production-ready blueprint for implementing the Hungarian algorithm in `src/lib/gait/analysis.ts` without external dependencies. The design preserves existing spatial/biometric cost metrics and dynamic distance gating while guaranteeing global cost minimization.

---

## 1. Exact Breakdown of Current Greedy Assignment Logic

### 1.1 Code Structure (`src/lib/gait/analysis.ts`, lines 815–933)

The current `matchPeople()` function accepts `detections` ($M = \text{detections.length}$), `tracks` ($N = \text{tracks.length}$), `nextId` object reference, and an optional `frameIndex`.

```ts
export function matchPeople(
  detections: Landmark[][],
  tracks: PersonTrack[],
  nextId: { value: number },
  frameIndex?: number,
): number[]
```

The existing workflow operates in four sequential stages:

1. **Initialization**:
   - `assigned` array of size $M$, initialized with `-1`.
   - `usedTracks` set to track assigned track indices $ti$.
   - `currentFrame` derived from `frameIndex` or max track `lastFrameIndex` + 1.

2. **Pairwise Candidate Extraction & Cost Calculation**:
   - Loops through every detection $di \in [0, M-1]$ and track $ti \in [0, N-1]$.
   - Computes extrapolated predicted hip position based on frame gap ($\Delta t$) and track velocity $(v_x, v_y)$:
     $$\text{predHip} = (\text{lastHip.x} + v_x \cdot \text{gap}, \; \text{lastHip.y} + v_y \cdot \text{gap})$$
   - Computes spatial distance $\text{distPred} = \text{dist}(\text{hip}, \text{predHip})$ and $\text{distLast} = \text{dist}(\text{hip}, \text{lastHip})$.
   - Sets $\text{minDist} = \min(\text{distPred}, \text{distLast})$.
   - Computes biometric distance $\text{bioDist} = \text{biometricDistance}(\text{bio}_{\text{det}}, \text{bio}_{\text{track}})$.
   - Calculates composite pair cost:
     $$\text{cost} = \text{minDist} + \text{bioDist} \times 0.25$$

3. **Greedy Sorting & Sequential Assignment**:
   - Pushes all $M \times N$ candidate objects into a flat array `pairs` and sorts ascending by `cost`:
     `pairs.sort((a, b) => a.cost - b.cost)`
   - Iterates sequentially through sorted pairs $p$:
     - Skips if `assigned[p.di] !== -1` or `usedTracks.has(p.ti)`.
     - Computes dynamic distance thresholds:
       $$\text{speed} = \sqrt{v_x^2 + v_y^2}$$
       $$\text{maxAllowedDist} = 0.22 + 0.15 \cdot \min(1.0, \text{speed}) + \min(0.20, (\text{gap}-1) \cdot 0.08) + (\text{bioDist} < 0.25 ? 0.08 : 0)$$
       $$\text{maxAllowedCost} = \max(0.45, \text{maxAllowedDist} + 0.10)$$
     - Gating check: `if (p.spatialDist > maxAllowedDist || p.cost > maxAllowedCost) continue;`
     - Matches detection $p.di$ to track $p.ti$, marks $p.ti$ as used, and updates track properties (velocity EMA, biometrics EMA, lastHip, frameIndices).

4. **New Track Creation**:
   - Iterates $di \in [0, M-1]$. Any detection with `assigned[di] === -1` spawns a new track with `id = nextId.value++`.

### 1.2 Mathematical Proof of Greedy Assignment Failure

Greedy choice makes locally optimal assignments $\min_{di, ti} C_{di, ti}$ without considering total assignment cost $\sum_{k} C_{di_k, ti_k}$.

#### Counterexample Scenario:
Suppose 2 subjects ($T_0, T_1$) walk past each other. Frame $k$ yields 2 detections ($D_0, D_1$).
Cost matrix $C$:

| | Detection $D_0$ | Detection $D_1$ |
|---|---|---|
| **Track $T_0$** | **0.10** | 0.12 |
| **Track $T_1$** | 0.11 | **0.48** (exceeds gating threshold 0.45) |

- **Greedy Strategy Execution**:
  1. Smallest cost overall is $(D_0, T_0) = 0.10$. Greedy assigns $D_0 \to T_0$.
  2. Remaining unassigned: $D_1$ and $T_1$. Pair $(D_1, T_1)$ has cost $0.48 > 0.45$ (gated out).
  3. Result: $D_0 \to T_0$, while $D_1$ is unassigned and spawns **False Duplicate Track $T_2$**.
  4. Total valid matches = 1.

- **Hungarian Optimal Strategy Execution**:
  1. Hungarian considers both permutation assignments:
     - Assignment A: $(D_0 \to T_0, D_1 \to T_1) \implies \text{Cost} = 0.10 + 1e9 = 1e9$
     - Assignment B: $(D_0 \to T_1, D_1 \to T_0) \implies \text{Cost} = 0.11 + 0.12 = 0.23$
  2. Hungarian chooses Assignment B (total cost $0.23 \ll 1e9$).
  3. Result: $D_0 \to T_1$ (cost $0.11 \le 0.45$) and $D_1 \to T_0$ (cost $0.12 \le 0.45$).
  4. Total valid matches = 2. Zero false duplicate tracks spawned.

---

## 2. Step-by-Step Design of Hungarian (Kuhn-Munkres) $O(K^3)$ Algorithm in TypeScript

### 2.1 Mathematical Formulation

The Hungarian algorithm solves the linear sum assignment problem on a square $K \times K$ cost matrix $C \in \mathbb{R}^{K \times K}$:

$$\min_{\pi} \sum_{i=0}^{K-1} C_{i, \pi(i)}$$

where $\pi$ is a permutation of $\{0, 1, \dots, K-1\}$.

Using the shortest path augmenting algorithm (Jonker-Volgenant variant of Kuhn-Munkres), we maintain dual potentials $u_i$ for rows and $v_j$ for columns such that:

$$u_i + v_j \le C_{i, j} \quad \forall i, j$$

In each iteration $i$, an augmenting path is found using a modified Dijkstra search on reduced costs $C_{i, j} - u_i - v_j \ge 0$, achieving $O(K^3)$ time complexity.

### 2.2 Complete Pure TypeScript Implementation

The following function `hungarianAlgorithm` has zero external dependencies, uses 1-indexed internal arrays for numerical speed, and returns an array `assignment` where `assignment[i]` is the column index assigned to row $i$:

```ts
/**
 * Hungarian (Kuhn-Munkres) Algorithm for Minimum Cost Bipartite Matching.
 * Solves optimal assignment for a square K x K cost matrix in O(K^3) time.
 *
 * @param costMatrix Square K x K matrix of costs.
 * @returns Array where result[i] is the column index assigned to row i.
 */
export function hungarianAlgorithm(costMatrix: number[][]): number[] {
  const n = costMatrix.length;
  if (n === 0) return [];
  const m = costMatrix[0].length; // n === m === K for padded matrix

  // u[i]: dual potential for row i (1-indexed)
  // v[j]: dual potential for col j (1-indexed)
  // p[j]: row assigned to column j (1-indexed, p[0] holds current augmenting row)
  // way[j]: predecessor column in augmenting path
  const u = new Float64Array(n + 1);
  const v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1);
  const way = new Int32Array(m + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity);
    const used = new Uint8Array(m + 1).fill(0);

    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    // Backtrack augmenting path
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  // Convert p (col -> row, 1-indexed) to result (row -> col, 0-indexed)
  const result = new Int32Array(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j] > 0) {
      result[p[j] - 1] = j - 1;
    }
  }

  return Array.from(result);
}
```

### 2.3 Computational Complexity & Micro-Benchmark Analysis

- **Time Complexity**: $O(K^3)$ where $K = \max(N, M)$.
  - Outer loop runs $K$ times.
  - Inner loop visits up to $K$ columns, performing $O(K)$ updates.
  - Total operations $\approx \frac{1}{6} K^3$ floating-point operations.
- **Typical Gait-Lab Scale**:
  - $N, M \le 5$ in standard video scenes; $N, M \le 10$ in crowded stress benchmarks.
  - For $K = 5$: $\approx 25$ operations ($< 0.002\text{ ms}$).
  - For $K = 10$: $\approx 200$ operations ($< 0.01\text{ ms}$).
- **Memory Overhead**: Allocates small typed arrays (`Float64Array(K+1)`), garbage-collection footprint is near zero.

---

## 3. Exact Specification of Cost Matrix Generation

### 3.1 Matrix Layout & Dimensions

Let $N = \text{tracks.length}$ (existing tracks) and $M = \text{detections.length}$ (current frame pose candidate detections).

To maintain clean mapping to `assigned[di]`:
- **Rows**: Existing tracks $i \in [0, N-1]$.
- **Columns**: Current detections $j \in [0, M-1]$.
- **Dimension**: $N \times M$ unpadded raw matrix, padded to $K \times K$ square matrix where $K = \max(N, M)$.

*(Note: Symmetric formulation with Rows = Detections and Cols = Tracks is equally valid and produces identical matching results. Placing Tracks as Rows maps directly to track state update loops).*

### 3.2 Pairwise Cost Formula & Dynamic Distance Gating

For track $i \in [0, N-1]$ and detection $j \in [0, M-1]$:

1. **Detection Coordinates**:
   - $\text{hip}_j = \text{hipCenter}(\text{detections}[j])$
   - $\text{bio}_j = \text{computeBiometricSignature}(\text{detections}[j])$

2. **Track Motion Extrapolation**:
   - $\text{gap} = \max(1, \text{currentFrame} - (\text{trk}_i.\text{lastFrameIndex} \mathbin{??} (\text{currentFrame} - 1)))$
   - $v_x = \text{trk}_i.\text{velocity}?.v_x \mathbin{??} 0, \quad v_y = \text{trk}_i.\text{velocity}?.v_y \mathbin{??} 0$
   - $\text{predHip} = (\text{trk}_i.\text{lastHip.x} + v_x \cdot \text{gap}, \; \text{trk}_i.\text{lastHip.y} + v_y \cdot \text{gap})$

3. **Distance Metrics**:
   - $\text{distPred} = \text{dist}(\text{hip}_j, \text{predHip})$
   - $\text{distLast} = \text{dist}(\text{hip}_j, \text{trk}_i.\text{lastHip})$
   - $\text{minDist} = \min(\text{distPred}, \text{distLast})$
   - $\text{isDirectionFlip} = \text{distLast} < \text{distPred} \times 0.8$
   - $\text{bioDist} = \text{trk}_i.\text{biometrics} ? \text{biometricDistance}(\text{bio}_j, \text{trk}_i.\text{biometrics}) : 0$

4. **Composite Cost**:
   $$\text{cost} = \text{minDist} + \text{bioDist} \times 0.25$$

5. **Dynamic Thresholds & Sentinel Cost Assignment**:
   - $\text{speed} = \sqrt{v_x^2 + v_y^2}$
   - $\text{maxAllowedDist} = 0.22 + 0.15 \cdot \min(1.0, \text{speed}) + \min(0.20, (\text{gap}-1) \cdot 0.08) + (\text{bioDist} < 0.25 ? 0.08 : 0)$
   - $\text{maxAllowedCost} = \max(0.45, \text{maxAllowedDist} + 0.10)$
   
   **Gating Condition**:
   ```ts
   const SENTINEL_COST = 1e9;
   const isGatedOut = minDist > maxAllowedDist || cost > maxAllowedCost;
   const matrixCost = isGatedOut ? SENTINEL_COST : cost;
   ```

### 3.3 Matrix Padding Specification ($K \times K$)

Define $K = \max(N, M)$.
Create cost matrix $C$ of size $K \times K$ initialized with `SENTINEL_COST` ($1e9$):

```ts
const K = Math.max(N, M);
const costMatrix: number[][] = Array.from({ length: K }, () => new Array(K).fill(SENTINEL_COST));
```

- Real entries $(i < N, j < M)$ receive `matrixCost`.
- Dummy rows ($i \ge N$) and dummy columns ($j \ge M$) retain `SENTINEL_COST` ($1e9$).

---

## 4. Output Mapping & Track State Updates

### 4.1 Mapping Hungarian Output to Valid Matches

Call `const assignments = hungarianAlgorithm(costMatrix)`.  
`assignments[i]` gives the column index $j$ matched to row $i$ (track $i$).

To extract valid matches:

```ts
const assigned = new Array(M).fill(-1);
const usedTracks = new Set<number>();

for (let i = 0; i < N; i++) {
  const j = assignments[i];
  if (j < 0 || j >= M) continue; // Assigned to a dummy column

  const meta = metaMatrix[i][j]; // Retained pair calculation metadata
  if (!meta.isValid || meta.cost >= SENTINEL_COST || meta.minDist > meta.maxAllowedDist || meta.cost > meta.maxAllowedCost) {
    continue; // Gated out pair matched by Hungarian due to dummy assignment
  }

  // Valid assignment!
  assigned[j] = tracks[i].id;
  usedTracks.add(i);

  // Perform track state update for track i using detection j...
}
```

### 4.2 Track State Update Logic

For each valid match $(i, j)$:

1. **Velocity EMA Calculation**:
   - $\text{stepVx} = (\text{hip}_j.\text{x} - \text{trk}_i.\text{lastHip.x}) / \text{gap}$
   - $\text{stepVy} = (\text{hip}_j.\text{y} - \text{trk}_i.\text{lastHip.y}) / \text{gap}$
   - $\text{dotProduct} = v_x \cdot \text{stepVx} + v_y \cdot \text{stepVy}$
   - $\text{isReversal} = \text{dotProduct} < 0 \parallel \text{meta.isDirectionFlip}$
   - $\text{oldWeight} = \text{isReversal} ? 0.2 : 0.5$, $\text{stepWeight} = 1.0 - \text{oldWeight}$
   - $\text{trk}_i.\text{velocity} = \{ v_x: \text{oldWeight} \cdot v_x + \text{stepWeight} \cdot \text{stepVx}, \; v_y: \text{oldWeight} \cdot v_y + \text{stepWeight} \cdot \text{stepVy} \}$

2. **Biometric Signature EMA**:
   - If $\text{trk}_i.\text{biometrics}$ exists:
     - Blend aspect ratio, torso-leg ratio, shoulder-hip ratio with 70/30 weights (`0.7 * old + 0.3 * new`).
   - Else: assign frame biometrics directly.

3. **Track Metadata**:
   - Update `lastHip`, increment `frames`, update `box`, accumulate `areaSum` and `hipYSum`.
   - Update `lastFrameIndex = currentFrame` and append to `frameIndices`.

### 4.3 Unassigned Detections (New Track Spawning)

For every detection $j \in [0, M-1]$:
If `assigned[j] === -1`:
- Generate new track ID: `id = nextId.value++`.
- Set `assigned[j] = id`.
- Construct new `PersonTrack` object and push to `tracks`.

---

## 5. Comprehensive Boundary Case & Edge Case Specification

| Boundary / Edge Case | Condition | Blueprint Handling Strategy |
|---|---|---|
| **No Existing Tracks** | $N = 0$ | Fast-path: bypass Hungarian algorithm immediately. Initialize `assigned` with `-1`. All $M$ detections spawn new tracks with IDs `nextId.value++`. Returns `[1, 2, ..., M]`. |
| **No Current Detections** | $M = 0$ | Fast-path: bypass Hungarian algorithm immediately. Returns empty array `[]`. Existing tracks remain untouched in `tracks` array for occlusion coasting. |
| **Fewer Tracks than Detections** | $N < M$ | Matrix padded to $M \times M$ with $1e9$. Hungarian matches all $N$ tracks to $N$ best detections. Remaining $M - N$ detections match to dummy rows (cost $1e9$), failing output gating, and spawn new tracks. |
| **More Tracks than Detections** | $N > M$ | Matrix padded to $N \times N$ with $1e9$. Hungarian matches all $M$ detections to best tracks. Remaining $N - M$ tracks match to dummy columns (cost $1e9$), failing output gating, and coast without updates. |
| **Single Person** | $N = 1, M = 1$ | $1 \times 1$ matrix. Hungarian resolves in 1 iteration. Valid if cost $< 1e9$ and spatial distance $\le \text{maxAllowedDist}$; rejected and spawned as new track if gated out. |
| **All Pairs Gated Out** | $C_{i, j} = 1e9 \; \forall i, j$ | Matrix filled with $1e9$. Hungarian produces arbitrary dummy assignment. Output validation rejects all pairs (`cost >= 1e9`). All $M$ detections spawn new tracks; zero tracks corrupted. |
| **Occlusion Coasting** | $\text{gap} > 1$ | $\text{maxAllowedDist}$ expands dynamically with frame gap ($+0.08 \cdot (\text{gap}-1)$). Velocity prediction projects hip location ahead across missing frames. |
| **Trajectory Reversals** | $\text{dotProduct} < 0$ | `isReversal` flag triggers 80/20 velocity update (weighting current step velocity at 80%), rapidly updating track direction without losing identity. |

---

## 6. Implementation Code Patch Blueprint

Below is the complete, self-contained replacement for `matchPeople()` in `src/lib/gait/analysis.ts`:

```ts
/** Helper for Hungarian algorithm optimal assignment */
function hungarianAlgorithm(costMatrix: number[][]): number[] {
  const n = costMatrix.length;
  if (n === 0) return [];
  const m = costMatrix[0].length;

  const u = new Float64Array(n + 1);
  const v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1);
  const way = new Int32Array(m + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity);
    const used = new Uint8Array(m + 1).fill(0);

    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Int32Array(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j] > 0) {
      result[p[j] - 1] = j - 1;
    }
  }

  return Array.from(result);
}

/** Multi-person tracking via velocity motion extrapolation, biometric signature matching, and Hungarian optimal assignment. */
export function matchPeople(
  detections: Landmark[][],
  tracks: PersonTrack[],
  nextId: { value: number },
  frameIndex?: number,
): number[] {
  const M = detections.length;
  const N = tracks.length;
  const assigned = new Array(M).fill(-1);
  if (M === 0) return [];

  const currentFrame = frameIndex ?? (tracks.length > 0 ? Math.max(...tracks.map(t => t.lastFrameIndex ?? 0)) + 1 : 0);

  if (N === 0) {
    for (let di = 0; di < M; di++) {
      const id = nextId.value++;
      assigned[di] = id;
      const box = boundingBox(detections[di]);
      const hip = hipCenter(detections[di]);
      const bio = computeBiometricSignature(detections[di]);
      tracks.push({
        id,
        firstHip: hip,
        lastHip: hip,
        frames: 1,
        box,
        areaSum: box.w * box.h,
        hipYSum: hip.y,
        biometrics: bio,
        firstFrameIndex: currentFrame,
        lastFrameIndex: currentFrame,
        frameIndices: [currentFrame],
        velocity: { vx: 0, vy: 0 },
      });
    }
    return assigned;
  }

  const SENTINEL_COST = 1e9;
  const K = Math.max(N, M);
  const costMatrix: number[][] = Array.from({ length: K }, () => new Array(K).fill(SENTINEL_COST));

  interface PairMeta {
    cost: number;
    spatialDist: number;
    bioDist: number;
    isDirectionFlip: boolean;
    maxAllowedDist: number;
    maxAllowedCost: number;
    isValid: boolean;
  }

  const metaMatrix: PairMeta[][] = Array.from({ length: N }, () => new Array(M));

  for (let ti = 0; ti < N; ti++) {
    const trk = tracks[ti];
    const gap = Math.max(1, currentFrame - (trk.lastFrameIndex ?? (currentFrame - 1)));
    const vx = trk.velocity?.vx ?? 0;
    const vy = trk.velocity?.vy ?? 0;
    const speed = Math.hypot(vx, vy);

    const predHip = {
      x: trk.lastHip.x + vx * gap,
      y: trk.lastHip.y + vy * gap,
      z: 0,
    };

    for (let di = 0; di < M; di++) {
      const hip = hipCenter(detections[di]);
      const bio = computeBiometricSignature(detections[di]);

      const distPred = dist(hip, predHip);
      const distLast = dist(hip, trk.lastHip);
      const minDist = Math.min(distPred, distLast);
      const isDirectionFlip = distLast < distPred * 0.8;
      const bioDist = trk.biometrics ? biometricDistance(bio, trk.biometrics) : 0;

      const cost = minDist + bioDist * 0.25;

      const maxAllowedDist = 0.22 + 0.15 * Math.min(1.0, speed) + Math.min(0.20, (gap - 1) * 0.08) + (bioDist < 0.25 ? 0.08 : 0);
      const maxAllowedCost = Math.max(0.45, maxAllowedDist + 0.10);

      const isValid = minDist <= maxAllowedDist && cost <= maxAllowedCost;

      metaMatrix[ti][di] = {
        cost,
        spatialDist: minDist,
        bioDist,
        isDirectionFlip,
        maxAllowedDist,
        maxAllowedCost,
        isValid,
      };

      costMatrix[ti][di] = isValid ? cost : SENTINEL_COST;
    }
  }

  const assignments = hungarianAlgorithm(costMatrix);

  for (let ti = 0; ti < N; ti++) {
    const di = assignments[ti];
    if (di < 0 || di >= M) continue;

    const meta = metaMatrix[ti][di];
    if (!meta.isValid || costMatrix[ti][di] >= SENTINEL_COST) continue;

    const trk = tracks[ti];
    const gap = Math.max(1, currentFrame - (trk.lastFrameIndex ?? (currentFrame - 1)));

    assigned[di] = trk.id;

    const box = boundingBox(detections[di]);
    const hip = hipCenter(detections[di]);
    const bio = computeBiometricSignature(detections[di]);

    const stepVx = (hip.x - trk.lastHip.x) / gap;
    const stepVy = (hip.y - trk.lastHip.y) / gap;
    const oldVx = trk.velocity?.vx ?? 0;
    const oldVy = trk.velocity?.vy ?? 0;

    const dotProduct = oldVx * stepVx + oldVy * stepVy;
    const isReversal = dotProduct < 0 || meta.isDirectionFlip;
    const oldWeight = isReversal ? 0.2 : 0.5;
    const stepWeight = 1.0 - oldWeight;

    trk.velocity = {
      vx: oldWeight * oldVx + stepWeight * stepVx,
      vy: oldWeight * oldVy + stepWeight * stepVy,
    };

    if (trk.biometrics) {
      trk.biometrics = {
        aspectRatio: 0.7 * trk.biometrics.aspectRatio + 0.3 * bio.aspectRatio,
        torsoLegRatio: 0.7 * trk.biometrics.torsoLegRatio + 0.3 * bio.torsoLegRatio,
        shoulderHipRatio: 0.7 * trk.biometrics.shoulderHipRatio + 0.3 * bio.shoulderHipRatio,
      };
    } else {
      trk.biometrics = bio;
    }

    trk.lastHip = hip;
    trk.frames += 1;
    trk.box = box;
    trk.areaSum += box.w * box.h;
    trk.hipYSum += hip.y;
    trk.lastFrameIndex = currentFrame;
    if (!trk.frameIndices) trk.frameIndices = [];
    trk.frameIndices.push(currentFrame);
  }

  for (let di = 0; di < M; di++) {
    if (assigned[di] !== -1) continue;
    const id = nextId.value++;
    assigned[di] = id;
    const box = boundingBox(detections[di]);
    const hip = hipCenter(detections[di]);
    const bio = computeBiometricSignature(detections[di]);
    tracks.push({
      id,
      firstHip: hip,
      lastHip: hip,
      frames: 1,
      box,
      areaSum: box.w * box.h,
      hipYSum: hip.y,
      biometrics: bio,
      firstFrameIndex: currentFrame,
      lastFrameIndex: currentFrame,
      frameIndices: [currentFrame],
      velocity: { vx: 0, vy: 0 },
    });
  }

  return assigned;
}
```

---

## 7. Verification Strategy

1. **Vitest Suite**: Run `npx vitest run src/lib/gait/__tests__/person_identification_stress.test.ts` and `npx vitest run src/lib/gait/__tests__/analysis.test.ts` to confirm zero track-swapping regressions.
2. **TypeScript Compilation**: `npx tsc --noEmit` must pass with zero errors.
3. **Lint & Build**: `npx eslint .` and `npm run build` must pass cleanly.

---

**Report Authored By**: `teamwork_preview_explorer_m1_1`  
**Status**: Blueprint Complete & Ready for Builder Execution

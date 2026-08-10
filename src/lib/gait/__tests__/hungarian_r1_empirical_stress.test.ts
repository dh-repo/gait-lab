import { describe, expect, it } from "vitest";
import { hungarianAlgorithm, matchPeople, computeBiometricSignature, biometricDistance, type PersonTrack } from "../analysis";
import type { Landmark } from "../types";
import { hipCenter } from "../landmarks";

/** Helper to generate realistic human pose landmarks at a specific position and biometric shape */
function createSyntheticDetection(
  x: number,
  y: number,
  opts: {
    height?: number;
    aspectRatio?: number; // width / height
    shoulderHipRatio?: number;
    torsoLegRatio?: number;
    visibility?: number;
  } = {}
): Landmark[] {
  const h = opts.height ?? 0.6;
  const ar = opts.aspectRatio ?? 0.35;
  const w = h * ar;
  const vis = opts.visibility ?? 0.9;

  const shRatio = opts.shoulderHipRatio ?? 1.2;
  const tlRatio = opts.torsoLegRatio ?? 0.55;

  const torsoLen = (h * tlRatio) / (1 + tlRatio);
  const legLen = h - torsoLen;

  const hipW = w / (1 + shRatio * 0.5);
  const shoulderW = hipW * shRatio;

  const lms: Landmark[] = new Array(33).fill(null).map(() => ({ x, y, z: 0, visibility: vis }));

  // Nose (0)
  lms[0] = { x, y: y - torsoLen - 0.1, z: 0, visibility: vis };
  // L Shoulder (11), R Shoulder (12)
  lms[11] = { x: x - shoulderW / 2, y: y - torsoLen, z: 0, visibility: vis };
  lms[12] = { x: x + shoulderW / 2, y: y - torsoLen, z: 0, visibility: vis };
  // L Wrist (15), R Wrist (16)
  lms[15] = { x: x - shoulderW / 2 - 0.05, y: y - torsoLen * 0.5, z: 0, visibility: vis };
  lms[16] = { x: x + shoulderW / 2 + 0.05, y: y - torsoLen * 0.5, z: 0, visibility: vis };
  // L Hip (23), R Hip (24)
  lms[23] = { x: x - hipW / 2, y, z: 0, visibility: vis };
  lms[24] = { x: x + hipW / 2, y, z: 0, visibility: vis };
  // L Knee (25), R Knee (26)
  lms[25] = { x: x - hipW / 2, y: y + legLen * 0.5, z: 0, visibility: vis };
  lms[26] = { x: x + hipW / 2, y: y + legLen * 0.5, z: 0, visibility: vis };
  // L Ankle (27), R Ankle (28)
  lms[27] = { x: x - hipW / 2, y: y + legLen, z: 0, visibility: vis };
  lms[28] = { x: x + hipW / 2, y: y + legLen, z: 0, visibility: vis };

  return lms;
}

/** Greedy assignment algorithm benchmark to contrast against Hungarian global optimization */
function greedyMatchPeople(
  detections: Landmark[][],
  tracks: PersonTrack[],
  currentFrame: number
): number[] {
  const M = detections.length;
  const N = tracks.length;
  const assigned = new Array(M).fill(-1);

  interface PairCost {
    ti: number;
    di: number;
    cost: number;
  }

  const pairs: PairCost[] = [];

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

      const distPred = Math.hypot(hip.x - predHip.x, hip.y - predHip.y);
      const distLast = Math.hypot(hip.x - trk.lastHip.x, hip.y - trk.lastHip.y);
      const minDist = Math.min(distPred, distLast);
      const bioDist = trk.biometrics ? biometricDistance(bio, trk.biometrics) : 0;
      const cost = minDist + bioDist * 0.25;

      const maxAllowedDist = 0.22 + 0.15 * Math.min(1.0, speed) + Math.min(0.20, (gap - 1) * 0.08) + (bioDist < 0.25 ? 0.08 : 0);
      const maxAllowedCost = Math.max(0.45, maxAllowedDist + 0.10);

      if (minDist <= maxAllowedDist && cost <= maxAllowedCost) {
        pairs.push({ ti, di, cost });
      }
    }
  }

  // Sort greedy by cost ascending
  pairs.sort((a, b) => a.cost - b.cost);

  const usedTracks = new Set<number>();
  const usedDets = new Set<number>();

  for (const pair of pairs) {
    if (!usedTracks.has(pair.ti) && !usedDets.has(pair.di)) {
      usedTracks.add(pair.ti);
      usedDets.add(pair.di);
      assigned[pair.di] = tracks[pair.ti].id;
    }
  }

  return assigned;
}

describe("Hungarian Algorithm R1 Empirical Stress Suite", () => {
  describe("1. Pure Kuhn-Munkres Matrix Solver Verification", () => {
    it("solves standard 3x3 cost matrix optimally", () => {
      const costMatrix = [
        [10, 19, 8],
        [4, 12, 11],
        [15, 6, 9],
      ];
      // Optimal assignment: row 0 -> col 2 (8), row 1 -> col 0 (4), row 2 -> col 1 (6). Total = 18.
      const assignment = hungarianAlgorithm(costMatrix);
      expect(assignment).toEqual([2, 0, 1]);
    });

    it("handles 1x1 cost matrix", () => {
      expect(hungarianAlgorithm([[42]])).toEqual([0]);
    });

    it("handles empty 0x0 matrix", () => {
      expect(hungarianAlgorithm([])).toEqual([]);
    });

    it("handles rectangular padded cost matrix with sentinel values", () => {
      const SENTINEL = 1e9;
      // 3 tracks, 3 columns padded
      const costMatrix = [
        [0.05, 0.40, SENTINEL],
        [0.35, 0.06, SENTINEL],
        [SENTINEL, SENTINEL, SENTINEL],
      ];
      const assignment = hungarianAlgorithm(costMatrix);
      expect(assignment[0]).toBe(0); // track 0 -> det 0
      expect(assignment[1]).toBe(1); // track 1 -> det 1
    });
  });

  describe("2. Multi-Person Path Crossing Stress Test (2, 3, and 4 Subjects)", () => {
    it("prevents track swaps during 2-subject path crossing where greedy algorithm fails", () => {
      const nextId = { value: 1 };
      const tracks: PersonTrack[] = [];

      // Frame 0: Initial setup with two distinct subjects moving towards each other
      // Subject A (ID 1): starts at x=0.10, moving right at vx=+0.04/frame
      // Subject B (ID 2): starts at x=0.90, moving left at vx=-0.04/frame
      const detA_0 = createSyntheticDetection(0.10, 0.50, { aspectRatio: 0.30 }); // Subject A: thin aspect ratio
      const detB_0 = createSyntheticDetection(0.90, 0.50, { aspectRatio: 0.45 }); // Subject B: wide aspect ratio

      matchPeople([detA_0, detB_0], tracks, nextId, 0);

      expect(tracks).toHaveLength(2);
      const idA = tracks[0].id; // 1
      const idB = tracks[1].id; // 2

      // Simulate 10 frames of motion leading to crossing at frame 5 (x ~ 0.50)
      const numFrames = 11;
      let hungarianSwaps = 0;
      let greedySwaps = 0;

      // Duplicate track state for greedy comparison
      const greedyTracks: PersonTrack[] = JSON.parse(JSON.stringify(tracks));

      for (let f = 1; f < numFrames; f++) {
        // Position at frame f:
        // A moves from 0.10 to 0.50 (at f=5) to 0.70 (at f=10)
        // B moves from 0.90 to 0.50 (at f=5) to 0.30 (at f=10)
        const xA = 0.10 + f * 0.04;
        const xB = 0.90 - f * 0.04;

        const detA = createSyntheticDetection(xA, 0.50, { aspectRatio: 0.30 });
        const detB = createSyntheticDetection(xB, 0.50, { aspectRatio: 0.45 });

        // At frame 5, xA = 0.30, xB = 0.70; at frame 10 xA=0.50, xB=0.50.
        // Let's test close crossing at frame 10: xA = 0.49, xB = 0.51
        const detections = [detA, detB];

        // Hungarian matching
        const hungarianAssigned = matchPeople(detections, tracks, nextId, f);
        if (hungarianAssigned[0] !== idA || hungarianAssigned[1] !== idB) {
          hungarianSwaps++;
        }

        // Greedy matching on parallel state
        const greedyAssigned = greedyMatchPeople(detections, greedyTracks, f);
        if (greedyAssigned[0] !== idA || greedyAssigned[1] !== idB) {
          greedySwaps++;
        }
      }

      expect(hungarianSwaps).toBe(0); // 0 track swaps with Hungarian!
      expect(greedySwaps).toBeGreaterThan(0); // Greedy algorithm suffers from track swaps
    });

    it("maintains optimal track consistency during 3-person central junction crossing", () => {
      const nextId = { value: 10 };
      const tracks: PersonTrack[] = [];

      // Subject 1: Left to Right (x: 0.1 -> 0.9, y: 0.5)
      // Subject 2: Top to Bottom (x: 0.5, y: 0.1 -> 0.9)
      // Subject 3: Right to Left (x: 0.9 -> 0.1, y: 0.5)
      // Frame 0 setup
      const det1_0 = createSyntheticDetection(0.10, 0.50, { height: 0.60 });
      const det2_0 = createSyntheticDetection(0.50, 0.10, { height: 0.50 });
      const det3_0 = createSyntheticDetection(0.90, 0.50, { height: 0.70 });

      matchPeople([det1_0, det2_0, det3_0], tracks, nextId, 0);
      expect(tracks).toHaveLength(3);

      const id1 = tracks[0].id;
      const id2 = tracks[1].id;
      const id3 = tracks[2].id;

      // Crossing phase: frame 1..10 where all 3 converge near (0.5, 0.5)
      for (let f = 1; f <= 10; f++) {
        const x1 = 0.10 + f * 0.04;
        const y1 = 0.50;

        const x2 = 0.50;
        const y2 = 0.10 + f * 0.04;

        const x3 = 0.90 - f * 0.04;
        const y3 = 0.50;

        const det1 = createSyntheticDetection(x1, y1, { height: 0.60 });
        const det2 = createSyntheticDetection(x2, y2, { height: 0.50 });
        const det3 = createSyntheticDetection(x3, y3, { height: 0.70 });

        const assigned = matchPeople([det1, det2, det3], tracks, nextId, f);

        expect(assigned[0]).toBe(id1);
        expect(assigned[1]).toBe(id2);
        expect(assigned[2]).toBe(id3);
      }
    });

    it("handles 4-subject diamond pattern path swap with zero track corruption", () => {
      const nextId = { value: 100 };
      const tracks: PersonTrack[] = [];

      // 4 subjects moving towards center from 4 corners
      // S1: Top-Left (0.2, 0.2) -> Bottom-Right (0.8, 0.8)
      // S2: Top-Right (0.8, 0.2) -> Bottom-Left (0.2, 0.8)
      // S3: Bottom-Left (0.2, 0.8) -> Top-Right (0.8, 0.2)
      // S4: Bottom-Right (0.8, 0.8) -> Top-Left (0.2, 0.2)

      const f0_dets = [
        createSyntheticDetection(0.2, 0.2, { torsoLegRatio: 0.40 }),
        createSyntheticDetection(0.8, 0.2, { torsoLegRatio: 0.50 }),
        createSyntheticDetection(0.2, 0.8, { torsoLegRatio: 0.60 }),
        createSyntheticDetection(0.8, 0.8, { torsoLegRatio: 0.70 }),
      ];

      matchPeople(f0_dets, tracks, nextId, 0);
      expect(tracks).toHaveLength(4);
      const origIds = tracks.map((t) => t.id);

      for (let f = 1; f <= 8; f++) {
        const step = f * 0.035;
        const f_dets = [
          createSyntheticDetection(0.2 + step, 0.2 + step, { torsoLegRatio: 0.40 }),
          createSyntheticDetection(0.8 - step, 0.2 + step, { torsoLegRatio: 0.50 }),
          createSyntheticDetection(0.2 + step, 0.8 - step, { torsoLegRatio: 0.60 }),
          createSyntheticDetection(0.8 - step, 0.8 - step, { torsoLegRatio: 0.70 }),
        ];

        const assigned = matchPeople(f_dets, tracks, nextId, f);
        expect(assigned).toEqual(origIds);
      }
    });
  });

  describe("3. Unbalanced Bipartite Matrix Stress Test (M > N & N > M)", () => {
    it("handles detections > tracks (M=5, N=2) with new track creation", () => {
      const nextId = { value: 200 };
      const tracks: PersonTrack[] = [];

      // Initialize with 2 tracks
      const initialDets = [
        createSyntheticDetection(0.2, 0.5),
        createSyntheticDetection(0.8, 0.5),
      ];
      matchPeople(initialDets, tracks, nextId, 0);
      expect(tracks).toHaveLength(2);

      // Frame 1: 2 existing targets + 3 new detections far away
      const frame1Dets = [
        createSyntheticDetection(0.22, 0.51), // Matches Track 200
        createSyntheticDetection(0.78, 0.49), // Matches Track 201
        createSyntheticDetection(0.40, 0.20), // New Target 1
        createSyntheticDetection(0.50, 0.80), // New Target 2
        createSyntheticDetection(0.10, 0.90), // New Target 3
      ];

      const assigned = matchPeople(frame1Dets, tracks, nextId, 1);

      expect(assigned[0]).toBe(200);
      expect(assigned[1]).toBe(201);
      expect(assigned[2]).toBe(202);
      expect(assigned[3]).toBe(203);
      expect(assigned[4]).toBe(204);
      expect(tracks).toHaveLength(5);
    });

    it("handles tracks > detections (N=4, M=2) when subjects are occluded or leave frame", () => {
      const nextId = { value: 300 };
      const tracks: PersonTrack[] = [];

      // Frame 0: 4 active tracks
      const f0_dets = [
        createSyntheticDetection(0.1, 0.5),
        createSyntheticDetection(0.3, 0.5),
        createSyntheticDetection(0.6, 0.5),
        createSyntheticDetection(0.8, 0.5),
      ];
      matchPeople(f0_dets, tracks, nextId, 0);
      expect(tracks).toHaveLength(4);

      // Frame 1: Only 2 detections present (tracks at 0.3 and 0.6 are missing/occluded)
      const f1_dets = [
        createSyntheticDetection(0.11, 0.50), // Matches Track 300
        createSyntheticDetection(0.81, 0.50), // Matches Track 303
      ];

      const assigned = matchPeople(f1_dets, tracks, nextId, 1);

      expect(assigned).toHaveLength(2);
      expect(assigned[0]).toBe(300);
      expect(assigned[1]).toBe(303);

      // Track count remains 4 (the missing tracks 301 and 302 persist awaiting recovery)
      expect(tracks).toHaveLength(4);
      expect(tracks[1].lastFrameIndex).toBe(0); // Track 301 not updated in frame 1
      expect(tracks[2].lastFrameIndex).toBe(0); // Track 302 not updated in frame 1
    });

    it("enforces sentinel gating when detections exceed max allowed spatial/biometric cost", () => {
      const nextId = { value: 400 };
      const tracks: PersonTrack[] = [];

      const f0_det = createSyntheticDetection(0.5, 0.5, { aspectRatio: 0.30 });
      matchPeople([f0_det], tracks, nextId, 0);

      // Frame 1: Detection is far away (dx = 0.50, exceeds maxAllowedDist ~ 0.22)
      const f1_far_det = createSyntheticDetection(0.99, 0.99, { aspectRatio: 0.30 });

      const assigned = matchPeople([f1_far_det], tracks, nextId, 1);

      // Far detection must NOT be assigned to track 400 — should spawn new track 401
      expect(assigned[0]).toBe(401);
      expect(tracks).toHaveLength(2);
      expect(tracks[0].lastFrameIndex).toBe(0); // Original track was gated out
      expect(tracks[1].id).toBe(401);
    });
  });

  describe("4. High-Density Noise & Ghost Detection Filtering", () => {
    it("prevents ghost detections outside gating threshold from stealing active targets", () => {
      const nextId = { value: 500 };
      const tracks: PersonTrack[] = [];

      // 2 Primary walking subjects
      const subA_0 = createSyntheticDetection(0.20, 0.50, { height: 0.60 });
      const subB_0 = createSyntheticDetection(0.70, 0.50, { height: 0.60 });

      matchPeople([subA_0, subB_0], tracks, nextId, 0);
      expect(tracks).toHaveLength(2);

      // Frame 1: Real detections + 6 random ghost detections (reflections, background clutter)
      const realA = createSyntheticDetection(0.22, 0.50, { height: 0.60 });
      const realB = createSyntheticDetection(0.72, 0.50, { height: 0.60 });

      const ghost1 = createSyntheticDetection(0.05, 0.10, { height: 0.20 }); // tiny top left
      const ghost2 = createSyntheticDetection(0.95, 0.10, { height: 0.15 }); // tiny top right
      const ghost3 = createSyntheticDetection(0.50, 0.90, { height: 0.25 }); // bottom center
      const ghost4 = createSyntheticDetection(0.40, 0.20, { height: 0.30 }); // upper center
      const ghost5 = createSyntheticDetection(0.10, 0.80, { height: 0.18 });
      const ghost6 = createSyntheticDetection(0.85, 0.85, { height: 0.22 });

      const frame1Dets = [ghost1, ghost2, realA, ghost3, realB, ghost4, ghost5, ghost6];

      const assigned = matchPeople(frame1Dets, tracks, nextId, 1);

      // Verify realA (idx 2) is matched to Track 500
      expect(assigned[2]).toBe(500);
      // Verify realB (idx 4) is matched to Track 501
      expect(assigned[4]).toBe(501);

      // Verify ghosts spawned separate track IDs and did not disrupt primary targets
      expect(assigned[0]).not.toBe(500);
      expect(assigned[0]).not.toBe(501);
      expect(assigned[1]).not.toBe(500);
      expect(assigned[1]).not.toBe(501);
    });

    it("correctly filters transient 1-frame ghost clutter across multi-frame sequence", () => {
      const nextId = { value: 600 };
      const tracks: PersonTrack[] = [];

      // Frame 0: 1 active walker
      const f0_det = createSyntheticDetection(0.30, 0.50);
      matchPeople([f0_det], tracks, nextId, 0);

      // Frame 1: Walker + transient ghost
      const f1_walker = createSyntheticDetection(0.33, 0.50);
      const f1_ghost = createSyntheticDetection(0.80, 0.20);
      const assigned1 = matchPeople([f1_walker, f1_ghost], tracks, nextId, 1);

      expect(assigned1[0]).toBe(600);
      expect(assigned1[1]).toBe(601); // Ghost spawned track 601

      // Frame 2: Ghost disappears, walker continues
      const f2_walker = createSyntheticDetection(0.36, 0.50);
      const assigned2 = matchPeople([f2_walker], tracks, nextId, 2);

      expect(assigned2[0]).toBe(600); // Primary track unbroken

      // Primary track 600 has 3 frames; ghost track 601 has only 1 frame
      const track600 = tracks.find((t) => t.id === 600)!;
      const track601 = tracks.find((t) => t.id === 601)!;

      expect(track600.frames).toBe(3);
      expect(track601.frames).toBe(1);
    });
  });
});

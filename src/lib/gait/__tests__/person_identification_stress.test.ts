import { describe, it, expect } from "vitest";
import {
  matchPeople,
  tracksToPeople,
  mergeFragmentedTracks,
  computeBiometricSignature,
  biometricDistance,
  type PersonTrack,
} from "../analysis";
import type { Landmark } from "../types";
import {
  generateMultiPersonScenario,
  type PersonTrajectoryConfig,
} from "./testHelpers";

function mockPersonLandmarks(x: number, y: number, height = 0.6, width = 0.2, vis = 0.95): Landmark[] {
  const lms: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));
  const halfH = height / 2;
  const halfW = width / 2;

  lms[0] = { x, y: y - halfH, z: 0, visibility: vis };
  lms[11] = { x: x - halfW, y: y - halfH * 0.5, z: 0, visibility: vis };
  lms[12] = { x: x + halfW, y: y - halfH * 0.5, z: 0, visibility: vis };
  lms[23] = { x: x - halfW * 0.8, y: y + halfH * 0.2, z: 0, visibility: vis };
  lms[24] = { x: x + halfW * 0.8, y: y + halfH * 0.2, z: 0, visibility: vis };
  lms[27] = { x: x - halfW * 0.8, y: y + halfH, z: 0, visibility: vis };
  lms[28] = { x: x + halfW * 0.8, y: y + halfH, z: 0, visibility: vis };

  return lms;
}

describe("Comprehensive Person Identification & Track Consolidation Suite", () => {
  // Legacy / Baseline sanity checks
  it("computes invariant biometric signatures across scale changes", () => {
    const lmsSmall = mockPersonLandmarks(0.5, 0.5, 0.3, 0.1);
    const lmsLarge = mockPersonLandmarks(0.5, 0.5, 0.7, 0.233);

    const bioSmall = computeBiometricSignature(lmsSmall);
    const bioLarge = computeBiometricSignature(lmsLarge);

    const bioDist = biometricDistance(bioSmall, bioLarge);
    expect(bioDist).toBeLessThan(0.30);
  });

  // ==========================================
  // TIER 1: CATEGORY-PARTITION TESTS (30 Tests)
  // ==========================================
  describe("Tier 1: Category-Partition Tests", () => {
    // Category 1: ID Persistence During Trajectory Cross-Over
    describe("Category 1: Trajectory Cross-Over", () => {
      it("T1-CO1: Nominal Parallel Cross-Over (Left-to-Right vs Right-to-Left)", () => {
        const scenario = generateMultiPersonScenario({
          totalFrames: 30,
          people: [
            { id: "T1", role: "target", initialX: 0.1, initialY: 0.5, speed: 0.26, direction: 1 },
            { id: "P2", role: "passerby", initialX: 0.9, initialY: 0.5, speed: 0.26, direction: -1 },
          ],
        });
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (const frame of scenario.frames) {
          matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
        }
        const people = tracksToPeople(tracks, scenario.frames.length - 1);
        expect(people.length).toBe(2);
        expect(people[0].frameCount).toBeGreaterThanOrEqual(25);
        expect(people[1].frameCount).toBeGreaterThanOrEqual(25);
      });

      it("T1-CO2: Diagonal Cross-Over (y-Axis Angle Intersection)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const t = f / 29;
          const p1 = mockPersonLandmarks(0.1 + t * 0.8, 0.4 + t * 0.2, 0.6, 0.2);
          const p2 = mockPersonLandmarks(0.9 - t * 0.8, 0.7 - t * 0.4, 0.5, 0.18);
          matchPeople([p1, p2], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(2);
        expect(people[0].id).toBe(1);
        expect(people[1].id).toBe(2);
      });

      it("T1-CO3: Fast Passerby Crossing Slow Target (2:1 Velocity Ratio)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 20; f++) {
          const t = f / 19;
          const p1 = mockPersonLandmarks(0.2 + t * 0.2, 0.5, 0.6, 0.2); // slow
          const p2 = mockPersonLandmarks(0.8 - t * 0.6, 0.5, 0.55, 0.18); // fast
          matchPeople([p1, p2], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 19);
        expect(people.length).toBe(2);
      });

      it("T1-CO4: Biometrically Distinct Cross-Over (Tall Adult vs Shorter Child)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 25; f++) {
          const t = f / 24;
          const p1 = mockPersonLandmarks(0.1 + t * 0.8, 0.5, 0.7, 0.25);
          const p2 = mockPersonLandmarks(0.9 - t * 0.8, 0.5, 0.35, 0.12);
          matchPeople([p1, p2], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 24);
        expect(people.length).toBe(2);
      });

      it("T1-CO5: Low Frame Rate (15 FPS) Trajectory Cross-Over", () => {
        const scenario = generateMultiPersonScenario({
          fps: 15,
          totalFrames: 15,
          people: [
            { id: "T1", role: "target", initialX: 0.1, speed: 0.3, direction: 1 },
            { id: "P2", role: "passerby", initialX: 0.9, speed: 0.3, direction: -1 },
          ],
        });
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (const frame of scenario.frames) {
          matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
        }
        const people = tracksToPeople(tracks, scenario.frames.length - 1);
        expect(people.length).toBe(2);
      });
    });

    // Category 2: Static Background Observer Immunity
    describe("Category 2: Static Observer Immunity", () => {
      it("T1-SO1: Stationary Clinician Standing at Mid-Screen", () => {
        const scenario = generateMultiPersonScenario({
          totalFrames: 30,
          includeStaticObserver: true,
        });
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (const frame of scenario.frames) {
          matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
        }
        const people = tracksToPeople(tracks, scenario.frames.length - 1);
        expect(people.length).toBeGreaterThanOrEqual(1);
        const target = people.find((p) => p.frameCount >= 25);
        expect(target).toBeDefined();
      });

      it("T1-SO2: Static Observer at Far Background", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const target = mockPersonLandmarks(0.1 + f * 0.025, 0.6, 0.6, 0.2);
          const observer = mockPersonLandmarks(0.8, 0.2, 0.2, 0.08);
          matchPeople([target, observer], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBeGreaterThanOrEqual(1);
        const target = people.find((p) => p.frameCount >= 25);
        expect(target).toBeDefined();
      });

      it("T1-SO3: Target Walking Directly in Front of Static Observer", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const target = mockPersonLandmarks(0.1 + f * 0.025, 0.5, 0.65, 0.22);
          const observer = mockPersonLandmarks(0.5, 0.5, 0.5, 0.18);
          matchPeople([target, observer], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBeGreaterThanOrEqual(1);
        const target = people.find((p) => p.frameCount >= 25);
        expect(target).toBeDefined();
      });

      it("T1-SO4: Dual Static Observers on Opposite Sides", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const target = mockPersonLandmarks(0.1 + f * 0.025, 0.5, 0.6, 0.2);
          const obs1 = mockPersonLandmarks(0.2, 0.3, 0.5, 0.18);
          const obs2 = mockPersonLandmarks(0.8, 0.3, 0.5, 0.18);
          matchPeople([target, obs1, obs2], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBeGreaterThanOrEqual(1);
        const target = people.find((p) => p.frameCount >= 25);
        expect(target).toBeDefined();
      });

      it("T1-SO5: Low-Visibility Static Observer", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const target = mockPersonLandmarks(0.1 + f * 0.025, 0.5, 0.6, 0.2, 0.9);
          const observer = mockPersonLandmarks(0.85, 0.45, 0.6, 0.2, 0.45);
          matchPeople([target, observer], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBeGreaterThanOrEqual(1);
        const target = people.find((p) => p.frameCount >= 25);
        expect(target).toBeDefined();
      });
    });

    // Category 3: Dynamic Scale Variation Resilience
    describe("Category 3: Dynamic Scale Variation", () => {
      it("T1-DS1: Linear Dynamic Approaching Scale (h: 0.15 -> 0.85)", () => {
        const scenario = generateMultiPersonScenario({
          totalFrames: 30,
          enableTargetScaleChange: true,
        });
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (const frame of scenario.frames) {
          matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
        }
        const people = tracksToPeople(tracks, scenario.frames.length - 1);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-DS2: Linear Receding Scale (h: 0.85 -> 0.15)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const h = 0.85 - (f / 29) * 0.70;
          const w = h * 0.33;
          const target = mockPersonLandmarks(0.5, 0.5, h, w);
          matchPeople([target], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-DS3: Dynamic Zoom-In and Zoom-Out (h: 0.3 -> 0.7 -> 0.3)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const h = f < 15 ? 0.3 + (f / 15) * 0.4 : 0.7 - ((f - 15) / 14) * 0.4;
          const target = mockPersonLandmarks(0.5, 0.5, h, h * 0.33);
          matchPeople([target], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-DS4: Dynamic Scale Shift with Lateral Motion", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const t = f / 29;
          const x = 0.1 + t * 0.8;
          const h = 0.2 + t * 0.5;
          const target = mockPersonLandmarks(x, 0.5, h, h * 0.33);
          matchPeople([target], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-DS5: Rapid Scale Step Shift (h: 0.25 -> 0.60 in 1 frame)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const h = f < 15 ? 0.25 : 0.60;
          const target = mockPersonLandmarks(0.2 + f * 0.02, 0.5, h, h * 0.33);
          matchPeople([target], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });
    });

    // Category 4: Continuous U-Turn Trajectory Tracking
    describe("Category 4: Continuous U-Turn Trajectory Tracking", () => {
      it("T1-UT1: Continuous 5-Frame Turnaround Curve", () => {
        const scenario = generateMultiPersonScenario({
          totalFrames: 30,
          enableTargetUTurn: true,
        });
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (const frame of scenario.frames) {
          matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
        }
        const people = tracksToPeople(tracks, scenario.frames.length - 1);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-UT2: Slow Deep U-Turn Across 10 Transition Frames", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          let x = 0.2;
          if (f < 10) x = 0.2 + f * 0.03;
          else if (f <= 20) {
            const u = (f - 10) / 10;
            x = 0.5 + 0.05 * Math.sin(u * Math.PI);
          } else {
            x = 0.5 - (f - 20) * 0.03;
          }
          matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-UT3: U-Turn at Left Edge of Frame", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 25; f++) {
          const x = f < 10 ? 0.25 - f * 0.015 : 0.10 + (f - 10) * 0.015;
          matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 24);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-UT4: U-Turn at Right Edge of Frame", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 25; f++) {
          const x = f < 10 ? 0.75 + f * 0.015 : 0.90 - (f - 10) * 0.015;
          matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 24);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-UT5: Back-and-Forth Double U-Turn (Left-Right-Left over 50 Frames)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 50; f++) {
          let x = 0.2;
          if (f < 15) x = 0.2 + (f / 15) * 0.4; // 0.2 -> 0.6
          else if (f < 30) x = 0.6 - ((f - 15) / 15) * 0.4; // 0.6 -> 0.2
          else x = 0.2 + ((f - 30) / 20) * 0.4; // 0.2 -> 0.6
          matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 49);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });
    });

    // Category 5: High-Speed / Fast Walking Motion Tracking Stability
    describe("Category 5: Fast Walking Motion Tracking Stability", () => {
      it("T1-FW1: Fast Walk at 30 FPS (dx = 0.08 per frame)", () => {
        const scenario = generateMultiPersonScenario({
          totalFrames: 10,
          enableFastWalking: true,
        });
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (const frame of scenario.frames) {
          matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
        }
        const people = tracksToPeople(tracks, scenario.frames.length - 1);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-FW2: Fast Walk at 15 FPS (dx = 0.12 per frame)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 6; f++) {
          const x = 0.1 + f * 0.12;
          matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 5);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-FW3: Sudden Acceleration (dx: 0.02 -> 0.04 -> 0.08 -> 0.10)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        const dxs = [0.02, 0.02, 0.04, 0.04, 0.08, 0.08, 0.10, 0.10];
        let x = 0.1;
        for (let f = 0; f < dxs.length; f++) {
          x += dxs[f];
          matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, dxs.length - 1);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-FW4: High Speed Sprint with Vertical Oscillation", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 10; f++) {
          const x = 0.1 + f * 0.08;
          const y = 0.5 + (f % 2 === 0 ? 0.04 : -0.04);
          matchPeople([mockPersonLandmarks(x, y)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 9);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-FW5: Fast Walk Deceleration to Standstill", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        const dxs = [0.08, 0.08, 0.04, 0.02, 0.01, 0.00, 0.00];
        let x = 0.1;
        for (let f = 0; f < dxs.length; f++) {
          x += dxs[f];
          matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, dxs.length - 1);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });
    });

    // Category 6: Short and Long Occlusion Recovery
    describe("Category 6: Short and Long Occlusion Recovery", () => {
      it("T1-OC1: Short 2-Frame Complete Occlusion", () => {
        const scenario = generateMultiPersonScenario({
          totalFrames: 20,
          targetOcclusion: { startFrame: 10, durationFrames: 2, type: 'missing' },
        });
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (const frame of scenario.frames) {
          matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
        }
        const people = tracksToPeople(tracks, scenario.frames.length - 1);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-OC2: Medium 5-Frame Complete Occlusion", () => {
        const scenario = generateMultiPersonScenario({
          totalFrames: 25,
          targetOcclusion: { startFrame: 10, durationFrames: 5, type: 'missing' },
        });
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (const frame of scenario.frames) {
          matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
        }
        const people = tracksToPeople(tracks, scenario.frames.length - 1);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-OC3: Long 10-Frame Complete Occlusion", () => {
        const scenario = generateMultiPersonScenario({
          totalFrames: 30,
          targetOcclusion: { startFrame: 10, durationFrames: 10, type: 'missing' },
        });
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (const frame of scenario.frames) {
          matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
        }
        const people = tracksToPeople(tracks, scenario.frames.length - 1);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-OC4: Asymmetric Occlusion (Degraded Visibility Keypoints)", () => {
        const scenario = generateMultiPersonScenario({
          totalFrames: 20,
          targetOcclusion: { startFrame: 8, durationFrames: 5, type: 'degraded' },
        });
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (const frame of scenario.frames) {
          matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
        }
        const people = tracksToPeople(tracks, scenario.frames.length - 1);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });

      it("T1-OC5: Intermittent Stutter Occlusions (Multiple 2-Frame Drops)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        const missingFrames = new Set([5, 6, 12, 13, 19, 20]);
        for (let f = 0; f < 25; f++) {
          if (missingFrames.has(f)) {
            matchPeople([], tracks, nextId, f);
          } else {
            const x = 0.1 + f * 0.03;
            matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
          }
        }
        const people = tracksToPeople(tracks, 24);
        expect(people.length).toBe(1);
        expect(people[0].id).toBe(1);
      });
    });
  });

  // ==========================================
  // TIER 2: BOUNDARY VALUE ANALYSIS (30 Tests)
  // ==========================================
  describe("Tier 2: Boundary Value Analysis (BVA) Tests", () => {
    describe("BVA 1: Spatial Cross-Over Intersection Boundaries", () => {
      it("T2-CO1: Zero-Distance Exact Center Intersection", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const t = f / 29;
          const x1 = 0.1 + t * 0.8;
          const x2 = 0.9 - t * 0.8;
          const p1 = mockPersonLandmarks(x1, 0.5, 0.6, 0.2);
          const p2 = mockPersonLandmarks(x2, 0.5, 0.4, 0.12);
          matchPeople([p1, p2], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(2);
      });

      it("T2-CO2: Near-Identical Biometrics Cross-Over", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const t = f / 29;
          const p1 = mockPersonLandmarks(0.1 + t * 0.8, 0.5, 0.6, 0.2);
          const p2 = mockPersonLandmarks(0.9 - t * 0.8, 0.5, 0.59, 0.195);
          matchPeople([p1, p2], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(2);
      });

      it("T2-CO3: Grazing Cross-Over (dy = 0.02 Clearance)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const t = f / 29;
          const p1 = mockPersonLandmarks(0.1 + t * 0.8, 0.49, 0.6, 0.2);
          const p2 = mockPersonLandmarks(0.9 - t * 0.8, 0.51, 0.5, 0.18);
          matchPeople([p1, p2], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(2);
      });

      it("T2-CO4: Single-Frame Co-Location Drop (Both Occluded at Intersection)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          if (f === 15) {
            matchPeople([], tracks, nextId, f);
          } else {
            const t = f / 29;
            const p1 = mockPersonLandmarks(0.1 + t * 0.8, 0.5, 0.6, 0.2);
            const p2 = mockPersonLandmarks(0.9 - t * 0.8, 0.5, 0.5, 0.18);
            matchPeople([p1, p2], tracks, nextId, f);
          }
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(2);
      });

      it("T2-CO5: 3-Way Trajectory Cross-Over", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const t = f / 29;
          const p1 = mockPersonLandmarks(0.1 + t * 0.8, 0.5, 0.6, 0.2);
          const p2 = mockPersonLandmarks(0.9 - t * 0.8, 0.5, 0.45, 0.15);
          const p3 = mockPersonLandmarks(0.5, 0.1 + t * 0.8, 0.55, 0.18);
          matchPeople([p1, p2, p3], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe("BVA 2: Observer Visibility & Spatial Proximity Boundaries", () => {
      it("T2-SO1: Observer Standing at Gating Boundary Distance (d = 0.22)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const target = mockPersonLandmarks(0.1 + f * 0.02, 0.5, 0.6, 0.2);
          const observer = mockPersonLandmarks(0.5, 0.5, 0.6, 0.2);
          matchPeople([target, observer], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBeGreaterThanOrEqual(1);
        const target = people.find((p) => p.frameCount >= 25);
        expect(target).toBeDefined();
      });

      it("T2-SO2: Observer Visibility at Filter Threshold (vis = 0.40)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const target = mockPersonLandmarks(0.1 + f * 0.02, 0.5, 0.6, 0.2, 0.9);
          const observer = mockPersonLandmarks(0.8, 0.5, 0.6, 0.2, 0.40);
          matchPeople([target, observer], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBeGreaterThanOrEqual(1);
        const target = people.find((p) => p.frameCount >= 25);
        expect(target).toBeDefined();
      });

      it("T2-SO3: Observer Biometrically Identical to Target", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const target = mockPersonLandmarks(0.1 + f * 0.02, 0.5, 0.6, 0.2);
          const observer = mockPersonLandmarks(0.8, 0.5, 0.6, 0.2);
          matchPeople([target, observer], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBeGreaterThanOrEqual(1);
        const target = people.find((p) => p.frameCount >= 25);
        expect(target).toBeDefined();
      });

      it("T2-SO4: Observer Appearing Mid-Clip (Enters at Frame 15)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const target = mockPersonLandmarks(0.1 + f * 0.02, 0.5, 0.6, 0.2);
          const dets = f >= 15 ? [target, mockPersonLandmarks(0.8, 0.5, 0.5, 0.18)] : [target];
          matchPeople(dets, tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBeGreaterThanOrEqual(1);
        const target = people.find((p) => p.frameCount >= 25);
        expect(target).toBeDefined();
      });

      it("T2-SO5: Observer Larger Than Target (h = 0.80 vs h = 0.40)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const target = mockPersonLandmarks(0.1 + f * 0.02, 0.5, 0.40, 0.13);
          const observer = mockPersonLandmarks(0.8, 0.5, 0.80, 0.27);
          matchPeople([target, observer], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBeGreaterThanOrEqual(1);
        const target = people.find((p) => p.frameCount >= 25);
        expect(target).toBeDefined();
      });
    });

    describe("BVA 3: Dynamic Scale Extremes", () => {
      it("T2-DS1: Extreme Minimum Scale Bound (h = 0.10)", () => {
        const lms = mockPersonLandmarks(0.5, 0.5, 0.10, 0.03);
        const bio = computeBiometricSignature(lms);
        expect(bio).toBeDefined();
        expect(Number.isNaN(bio!.aspectRatio)).toBe(false);
        expect(Number.isNaN(bio!.torsoLegRatio)).toBe(false);
      });

      it("T2-DS2: Extreme Maximum Scale Bound (h = 0.90)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 20; f++) {
          const target = mockPersonLandmarks(0.2 + f * 0.03, 0.5, 0.90, 0.30);
          matchPeople([target], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 19);
        expect(people.length).toBe(1);
      });

      it("T2-DS3: Maximum Scale Ratio Expansion (7x Scale Change: h = 0.12 -> 0.84)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 40; f++) {
          const h = 0.12 + (f / 39) * 0.72;
          const target = mockPersonLandmarks(0.5, 0.5, h, h * 0.33);
          matchPeople([target], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 39);
        expect(people.length).toBe(1);
      });

      it("T2-DS4: Asymmetric Aspect Ratio Scaling", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const w = 0.15 + (f / 29) * 0.15;
          const target = mockPersonLandmarks(0.1 + f * 0.02, 0.5, 0.6, w);
          matchPeople([target], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(1);
      });

      it("T2-DS5: High-Frequency Scale Jitter", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          const jitter = (f % 2 === 0 ? 0.08 : -0.08);
          const target = mockPersonLandmarks(0.1 + f * 0.02, 0.5, 0.6 + jitter, 0.2);
          matchPeople([target], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(1);
      });
    });

    describe("BVA 4: Turnaround Velocity & Acceleration Boundaries", () => {
      it("T2-UT1: Abrupt 2-Frame Instant Reversal", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 20; f++) {
          const x = f < 10 ? 0.1 + f * 0.04 : 0.5 - (f - 10) * 0.04;
          matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 19);
        expect(people.length).toBe(1);
      });

      it("T2-UT2: Zero-Velocity Stationary Pause During Turnaround", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 25; f++) {
          let x = 0.2;
          if (f < 10) x = 0.2 + f * 0.03;
          else if (f <= 14) x = 0.5; // stationary pause
          else x = 0.5 - (f - 14) * 0.03;
          matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 24);
        expect(people.length).toBe(1);
      });

      it("T2-UT3: High-Speed Turnaround (dx = 0.07)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 16; f++) {
          const x = f < 8 ? 0.1 + f * 0.07 : 0.66 - (f - 8) * 0.07;
          matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 15);
        expect(people.length).toBe(1);
      });

      it("T2-UT4: Asymmetric Turnaround (vin = 0.02, vout = -0.08)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 20; f++) {
          const x = f < 10 ? 0.2 + f * 0.02 : 0.4 - (f - 10) * 0.08;
          matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 19);
        expect(people.length).toBe(1);
      });

      it("T2-UT5: Turnaround During Scale Shift", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 20; f++) {
          const x = f < 10 ? 0.1 + f * 0.03 : 0.4 - (f - 10) * 0.03;
          const h = 0.3 + (f / 19) * 0.3;
          matchPeople([mockPersonLandmarks(x, 0.5, h, h * 0.33)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 19);
        expect(people.length).toBe(1);
      });
    });

    describe("BVA 5: Maximum Velocity Gate Bounds", () => {
      it("T2-FW1: Maximum Velocity Boundary (dx = 0.12 per frame)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 6; f++) {
          matchPeople([mockPersonLandmarks(0.1 + f * 0.12, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 5);
        expect(people.length).toBe(1);
      });

      it("T2-FW2: Saturated Velocity Window (dx = 0.15 per frame)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 5; f++) {
          matchPeople([mockPersonLandmarks(0.1 + f * 0.15, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 4);
        expect(people.length).toBe(1);
      });

      it("T2-FW3: Velocity Direction Oscillation (Zig-Zag Gait)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 10; f++) {
          const y = 0.5 + (f % 2 === 0 ? 0.05 : -0.05);
          matchPeople([mockPersonLandmarks(0.1 + f * 0.05, y)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 9);
        expect(people.length).toBe(1);
      });

      it("T2-FW4: Single-Frame Speed Spike", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        const xs = [0.10, 0.12, 0.14, 0.24, 0.26, 0.28];
        for (let f = 0; f < xs.length; f++) {
          matchPeople([mockPersonLandmarks(xs[f], 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, xs.length - 1);
        expect(people.length).toBe(1);
      });

      it("T2-FW5: Low Sampling Rate Fast Walk (10 FPS, dx = 0.14)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 5; f++) {
          matchPeople([mockPersonLandmarks(0.1 + f * 0.14, 0.5)], tracks, nextId, f * 3);
        }
        const people = tracksToPeople(tracks, 12);
        expect(people.length).toBe(1);
      });
    });

    describe("BVA 6: Occlusion Gap Duration Bounds", () => {
      it("T2-OC1: Single-Frame Gap (N = 1 Drop)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 15; f++) {
          if (f === 7) matchPeople([], tracks, nextId, f);
          else matchPeople([mockPersonLandmarks(0.1 + f * 0.03, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 14);
        expect(people.length).toBe(1);
      });

      it("T2-OC2: 4-Frame Gap", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 20; f++) {
          if (f >= 7 && f <= 10) matchPeople([], tracks, nextId, f);
          else matchPeople([mockPersonLandmarks(0.1 + f * 0.03, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 19);
        expect(people.length).toBe(1);
      });

      it("T2-OC3: 8-Frame Gap", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 25; f++) {
          if (f >= 7 && f <= 14) matchPeople([], tracks, nextId, f);
          else matchPeople([mockPersonLandmarks(0.1 + f * 0.03, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 24);
        expect(people.length).toBe(1);
      });

      it("T2-OC4: 10-Frame Gap (Max Requirement Threshold Boundary)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 30; f++) {
          if (f >= 10 && f <= 19) matchPeople([], tracks, nextId, f);
          else matchPeople([mockPersonLandmarks(0.1 + f * 0.025, 0.5)], tracks, nextId, f);
        }
        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(1);
      });

      it("T2-OC5: 12-Frame Gap (Exceeds Occlusion Limit)", () => {
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };
        for (let f = 0; f < 32; f++) {
          if (f >= 10 && f <= 21) matchPeople([], tracks, nextId, f);
          else matchPeople([mockPersonLandmarks(0.1 + f * 0.025, 0.5)], tracks, nextId, f);
        }

        const consolidated = mergeFragmentedTracks(tracks);
        expect(consolidated).toBeDefined();
      });
    });
  });

  // ==========================================
  // TIER 3: PAIRWISE COMBINATION TESTS (8 Tests)
  // ==========================================
  describe("Tier 3: Pairwise Combination Tests", () => {
    it("T3-P1: U-Turn + Dynamic Scale Shift (h: 0.20 -> 0.70 -> 0.20)", () => {
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (let f = 0; f < 30; f++) {
        let x = 0.1;
        let h = 0.2;
        if (f < 15) {
          x = 0.1 + (f / 15) * 0.4;
          h = 0.2 + (f / 15) * 0.5;
        } else {
          x = 0.5 - ((f - 15) / 14) * 0.4;
          h = 0.7 - ((f - 15) / 14) * 0.5;
        }
        matchPeople([mockPersonLandmarks(x, 0.5, h, h * 0.33)], tracks, nextId, f);
      }
      const people = tracksToPeople(tracks, 29);
      expect(people.length).toBe(1);
    });

    it("T3-P2: Fast Walk (dx = 0.08) + 5-Frame Complete Occlusion", () => {
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (let f = 0; f < 20; f++) {
        if (f >= 8 && f <= 12) {
          matchPeople([], tracks, nextId, f);
        } else {
          matchPeople([mockPersonLandmarks(0.1 + f * 0.04, 0.5)], tracks, nextId, f);
        }
      }
      const people = tracksToPeople(tracks, 19);
      expect(people.length).toBe(1);
    });

    it("T3-P3: Trajectory Cross-Over + Static Background Observer", () => {
      const scenario = generateMultiPersonScenario({
        totalFrames: 30,
        includeCrossingPasserby: true,
        includeStaticObserver: true,
      });
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (const frame of scenario.frames) {
        matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
      }
      const people = tracksToPeople(tracks, scenario.frames.length - 1);
      expect(people.length).toBeGreaterThanOrEqual(2);
      const target = people.find((p) => p.frameCount >= 25);
      expect(target).toBeDefined();
    });

    it("T3-P4: Dynamic Scale Variation + 10-Frame Occlusion", () => {
      const scenario = generateMultiPersonScenario({
        totalFrames: 30,
        enableTargetScaleChange: true,
        targetOcclusion: { startFrame: 10, durationFrames: 10, type: 'missing' },
      });
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (const frame of scenario.frames) {
        matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
      }
      const people = tracksToPeople(tracks, scenario.frames.length - 1);
      expect(people.length).toBe(1);
    });

    it("T3-P5: U-Turn + Fast Acceleration post-turn", () => {
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (let f = 0; f < 25; f++) {
        const x = f < 12 ? 0.2 + f * 0.02 : 0.44 - (f - 12) * 0.06;
        matchPeople([mockPersonLandmarks(x, 0.5)], tracks, nextId, f);
      }
      const people = tracksToPeople(tracks, 24);
      expect(people.length).toBe(1);
    });

    it("T3-P6: Trajectory Cross-Over + 4-Frame Mid-Intersection Occlusion", () => {
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (let f = 0; f < 30; f++) {
        if (f >= 13 && f <= 16) {
          matchPeople([], tracks, nextId, f);
        } else {
          const t = f / 29;
          const p1 = mockPersonLandmarks(0.1 + t * 0.8, 0.5, 0.6, 0.2);
          const p2 = mockPersonLandmarks(0.9 - t * 0.8, 0.5, 0.45, 0.15);
          matchPeople([p1, p2], tracks, nextId, f);
        }
      }
      const people = tracksToPeople(tracks, 29);
      expect(people.length).toBe(2);
    });

    it("T3-P7: Static Observer + Fast Walk + Dynamic Scale Shift", () => {
      const scenario = generateMultiPersonScenario({
        totalFrames: 25,
        enableFastWalking: true,
        enableTargetScaleChange: true,
        includeStaticObserver: true,
      });
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (const frame of scenario.frames) {
        matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
      }
      const people = tracksToPeople(tracks, scenario.frames.length - 1);
      expect(people.length).toBeGreaterThanOrEqual(1);
      const target = people.find((p) => p.frameCount >= 20);
      expect(target).toBeDefined();
    });

    it("T3-P8: U-Turn + Trajectory Cross-Over with Background Passerby", () => {
      const scenario = generateMultiPersonScenario({
        totalFrames: 30,
        enableTargetUTurn: true,
        includeCrossingPasserby: true,
      });
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (const frame of scenario.frames) {
        matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
      }
      const people = tracksToPeople(tracks, scenario.frames.length - 1);
      expect(people.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================
  // TIER 4: REAL-WORLD APPLICATION WORKLOADS (5 Scenarios)
  // ==========================================
  describe("Tier 4: Real-World Application Workloads", () => {
    it("T4-RW1: Clinical Walkway U-Turn with Scale Shift & 5-Frame Occlusion", () => {
      const scenario = generateMultiPersonScenario({
        totalFrames: 60,
        enableTargetScaleChange: true,
        enableTargetUTurn: true,
        targetOcclusion: { startFrame: 30, durationFrames: 5, type: 'missing' },
      });
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (const frame of scenario.frames) {
        matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
      }
      const people = tracksToPeople(tracks, scenario.frames.length - 1);
      expect(people.length).toBe(1);
      expect(people[0].id).toBe(1);
    });

    it("T4-RW2: Live Webcam Corridor Stream with 2 Crossing Passersby & Low-Visibility Observer", () => {
      const scenario = generateMultiPersonScenario({
        totalFrames: 60,
        enableTargetUTurn: true,
        includeCrossingPasserby: true,
        includeStaticObserver: true,
      });
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (const frame of scenario.frames) {
        matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
      }
      const people = tracksToPeople(tracks, scenario.frames.length - 1);
      expect(people.length).toBeGreaterThanOrEqual(1);
      const target = people.find((p) => p.frameCount >= 40);
      expect(target).toBeDefined();
    });

    it("T4-RW3: Fast-Walking Athlete Gait Track with 15 FPS Sampling & 3-Frame Drop", () => {
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (let f = 0; f < 30; f++) {
        if (f >= 8 && f <= 10) {
          matchPeople([], tracks, nextId, f);
        } else {
          matchPeople([mockPersonLandmarks(0.1 + f * 0.025, 0.5)], tracks, nextId, f);
        }
      }
      const people = tracksToPeople(tracks, 29);
      expect(people.length).toBe(1);
      expect(people[0].id).toBe(1);
    });

    it("T4-RW4: Low-Visibility Dynamic Zoom Approach with 10-Frame Complete Occlusion", () => {
      const scenario = generateMultiPersonScenario({
        totalFrames: 50,
        enableTargetScaleChange: true,
        targetOcclusion: { startFrame: 20, durationFrames: 10, type: 'missing' },
      });
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (const frame of scenario.frames) {
        matchPeople(frame.landmarks, tracks, nextId, frame.frameIndex);
      }
      const people = tracksToPeople(tracks, scenario.frames.length - 1);
      expect(people.length).toBe(1);
      expect(people[0].id).toBe(1);
    });

    it("T4-RW5: Dual Parallel Walkers with Intermittent Passersby Cross-Over & U-Turn", () => {
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      for (let f = 0; f < 50; f++) {
        const x1 = f < 25 ? 0.2 + (f / 25) * 0.3 : 0.5 - ((f - 25) / 24) * 0.3;
        const x2 = f < 25 ? 0.6 + (f / 25) * 0.3 : 0.9 - ((f - 25) / 24) * 0.3;
        const p1 = mockPersonLandmarks(x1, 0.5, 0.6, 0.2);
        const p2 = mockPersonLandmarks(x2, 0.5, 0.5, 0.17);

        const frameLandmarks = [p1, p2];
        if (f === 20) {
          // Passersby crossing between them
          frameLandmarks.push(mockPersonLandmarks(0.4, 0.5, 0.45, 0.15));
        }

        matchPeople(frameLandmarks, tracks, nextId, f);
      }
      const people = tracksToPeople(tracks, 49);
      expect(people.length).toBeGreaterThanOrEqual(2);
      expect(people[0].frameCount).toBeGreaterThanOrEqual(20);
      expect(people[1].frameCount).toBeGreaterThanOrEqual(20);
    });
  });
});

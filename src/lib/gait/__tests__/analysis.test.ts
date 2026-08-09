import { describe, it, expect } from "vitest";
import {
  detectViewAngle,
  computeGaitMetrics,
  matchPeople,
  trackPriorityScore,
  tracksToPeople,
  computeDualTaskCost,
  type PersonTrack,
} from "../analysis";
import {
  generateSyntheticWalkingFrames,
  generateStationaryPoseFrames,
  createMockMetrics,
} from "./testHelpers";
import type { Landmark } from "../types";

describe("Integrated Gait Analysis Engine (analysis.ts)", () => {
  describe("detectViewAngle", () => {
    it("returns unknown with confidence 0.2 for fewer than 4 frames", () => {
      const frames = generateSyntheticWalkingFrames({ durationSec: 1.0, fps: 30 }).slice(0, 3);
      const result = detectViewAngle(frames);
      expect(result.angle).toBe("unknown");
      expect(result.confidence).toBe(0.2);
    });

    it("detects sagittal view for side-walking camera perspective", () => {
      const frames = generateSyntheticWalkingFrames({
        viewAngle: "sagittal",
        durationSec: 2.0,
      });
      const result = detectViewAngle(frames);
      expect(["sagittal", "oblique"]).toContain(result.angle);
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    });

    it("detects frontal view for front/back camera perspective", () => {
      const frames = generateSyntheticWalkingFrames({
        viewAngle: "frontal",
        durationSec: 2.0,
      });
      const result = detectViewAngle(frames);
      expect(["frontal", "oblique"]).toContain(result.angle);
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    });
  });

  describe("computeGaitMetrics", () => {
    it("returns empty metrics fallback when frames < 5", () => {
      const frames = generateSyntheticWalkingFrames({ durationSec: 1.0, fps: 30 }).slice(0, 4);
      const metrics = computeGaitMetrics(frames);
      expect(metrics.viewAngle).toBe("unknown");
      expect(metrics.stepCount).toBe(0);
      expect(metrics.cadenceSpm).toBe(0);
      expect(metrics.overallScore).toBe(0);
    });

    it("executes complete spatio-temporal pipeline on synthetic walking clip", () => {
      const frames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 3.5,
      });

      const metrics = computeGaitMetrics(frames);

      expect(metrics.durationSec).toBeGreaterThan(3.0);
      expect(metrics.fpsEffective).toBeCloseTo(30, 0);
      expect(metrics.leftStancePct).toBeGreaterThan(0);
      expect(metrics.rightStancePct).toBeGreaterThan(0);
      expect(metrics.symmetryAngle).toBeGreaterThanOrEqual(0);
      expect(metrics.harmonicRatio).toBeGreaterThan(0);
      expect(metrics.overallScore).toBeGreaterThan(0);
      expect(metrics.overallScore).toBeLessThanOrEqual(100);
    });

    it("computes metrics for stationary clips without crashing", () => {
      const frames = generateStationaryPoseFrames(30, 3.0);
      const metrics = computeGaitMetrics(frames);

      expect(metrics.durationSec).toBeGreaterThan(2.5);
      expect(metrics.stepCount).toBeGreaterThanOrEqual(0);
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Multi-Person Tracking (matchPeople, trackPriorityScore, tracksToPeople)", () => {
    it("assigns detections to existing tracks within distance threshold <= 0.22", () => {
      const track: PersonTrack = {
        id: 1,
        lastHip: { x: 0.5, y: 0.5, z: 0 },
        frames: 5,
        box: { x: 0.4, y: 0.2, w: 0.2, h: 0.6 },
        areaSum: 0.6,
        hipYSum: 2.5,
      };

      const detectionsNear: Landmark[][] = [
        new Array(33).fill(null).map((_, i) => ({
          x: i === 23 || i === 24 ? 0.51 : 0.5,
          y: i === 23 || i === 24 ? 0.51 : 0.5,
          z: 0,
        })),
      ];

      const nextId = { value: 2 };
      const tracks = [track];
      const assigned = matchPeople(detectionsNear, tracks, nextId);

      expect(assigned).toEqual([1]);
      expect(tracks[0].frames).toBe(6);
      expect(nextId.value).toBe(2);
    });

    it("creates new track when detection distance exceeds threshold > 0.22", () => {
      const track: PersonTrack = {
        id: 1,
        lastHip: { x: 0.1, y: 0.1, z: 0 },
        frames: 5,
        box: { x: 0.05, y: 0.05, w: 0.1, h: 0.2 },
        areaSum: 0.1,
        hipYSum: 0.5,
      };

      const detectionsFar: Landmark[][] = [
        new Array(33).fill(null).map((_, i) => ({
          x: i === 23 || i === 24 ? 0.8 : 0.8,
          y: i === 23 || i === 24 ? 0.8 : 0.8,
          z: 0,
        })),
      ];

      const nextId = { value: 2 };
      const tracks = [track];
      const assigned = matchPeople(detectionsFar, tracks, nextId);

      expect(assigned).toEqual([2]);
      expect(tracks.length).toBe(2);
      expect(tracks[1].id).toBe(2);
      expect(nextId.value).toBe(3);
    });

    it("calculates trackPriorityScore favoring persistent, larger, lower subjects", () => {
      const smallShortTrack: PersonTrack = {
        id: 1,
        lastHip: { x: 0.5, y: 0.2, z: 0 },
        frames: 2,
        box: { x: 0.45, y: 0.1, w: 0.1, h: 0.2 },
        areaSum: 0.04,
        hipYSum: 0.4,
      };

      const persistentLargeTrack: PersonTrack = {
        id: 2,
        lastHip: { x: 0.5, y: 0.7, z: 0 },
        frames: 20,
        box: { x: 0.3, y: 0.4, w: 0.4, h: 0.6 },
        areaSum: 4.8,
        hipYSum: 14.0,
      };

      const score1 = trackPriorityScore(smallShortTrack);
      const score2 = trackPriorityScore(persistentLargeTrack);

      expect(score2).toBeGreaterThan(score1);
    });

    it("converts and sorts tracks to people with color wrap-around", () => {
      const tracks: PersonTrack[] = [
        {
          id: 1,
          lastHip: { x: 0.5, y: 0.2, z: 0 },
          frames: 5,
          box: { x: 0.4, y: 0.1, w: 0.2, h: 0.4 },
          areaSum: 0.4,
          hipYSum: 1.0,
        },
        {
          id: 2,
          lastHip: { x: 0.5, y: 0.8, z: 0 },
          frames: 50,
          box: { x: 0.2, y: 0.4, w: 0.6, h: 0.5 },
          areaSum: 15.0,
          hipYSum: 40.0,
        },
      ];

      const people = tracksToPeople(tracks, 10);

      expect(people.length).toBe(2);
      expect(people[0].id).toBe(2);
      expect(people[0].color).toBeDefined();
      expect(people[1].id).toBe(1);
    });
  });

  describe("computeDualTaskCost", () => {
    it("computes dual task cost and summary description", () => {
      const single = createMockMetrics({
        cadenceSpm: 100,
        stepTimeCV: 0.04,
        stabilityScore: 85,
        automaticityScore: 85,
      });

      const dual = createMockMetrics({
        cadenceSpm: 90,
        stepTimeCV: 0.08,
        stabilityScore: 75,
        automaticityScore: 70,
      });

      const cost = computeDualTaskCost(single, dual);

      expect(cost.cadenceCostPct).toBe(10.0);
      expect(cost.stepTimeCvCostPct).toBe(100.0);
      expect(cost.stabilityCostPts).toBe(10.0);
      expect(cost.automaticityCostPts).toBe(15.0);
      expect(cost.cmiClassification).toBe("mutual_interference");
      expect(cost.summary).toContain("mutual_interference");
    });
  });
});

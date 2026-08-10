import { describe, it, expect } from "vitest";
import {
  detectViewAngle,
  computeGaitMetrics,
  matchPeople,
  trackPriorityScore,
  tracksToPeople,
  computeDualTaskCost,
  analyzeGait,
  type PersonTrack,
} from "../analysis";
import {
  generateSyntheticWalkingFrames,
  generateStationaryPoseFrames,
  createMockMetrics,
} from "./testHelpers";
import type { Landmark } from "../types";
import { buildStructuredReport } from "../ratings";
import { buildEducatedGuesses } from "../guesses";

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

    it("ensures stepTimeCV calculation is clip-length invariant across 10s, 30s, and 60s clips", () => {
      const frames10s = generateSyntheticWalkingFrames({ fps: 30, durationSec: 10.0 });
      const frames30s = generateSyntheticWalkingFrames({ fps: 30, durationSec: 30.0 });
      const frames60s = generateSyntheticWalkingFrames({ fps: 30, durationSec: 60.0 });

      const m10 = computeGaitMetrics(frames10s);
      const m30 = computeGaitMetrics(frames30s);
      const m60 = computeGaitMetrics(frames60s);

      // Verify that stepTimeCV remains consistent across clip durations without decimation inflation
      expect(Math.abs(m10.stepTimeCV - m30.stepTimeCV)).toBeLessThan(0.005);
      expect(Math.abs(m30.stepTimeCV - m60.stepTimeCV)).toBeLessThan(0.005);
    }, 15000);

    it("computes and reports true achieved samplingFps in GaitMetrics", () => {
      const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 5.0 });
      const metrics = computeGaitMetrics(frames);
      const samplingFps = (metrics as Record<string, unknown>).samplingFps as number | undefined;

      expect(samplingFps).toBeDefined();
      expect(samplingFps).toBeCloseTo(30, 0);
    });

    it("suppresses sagittal metrics (emits null) when viewAngle is frontal", () => {
      const frames = generateSyntheticWalkingFrames({ viewAngle: "frontal", durationSec: 4.0, fps: 30 });
      const metrics = computeGaitMetrics(frames);

      expect(metrics.viewAngle).toBe("frontal");
      expect(metrics.kneeFlexLeft).toBeNull();
      expect(metrics.kneeFlexRight).toBeNull();
      expect(metrics.kneeAsymmetry).toBeNull();
      expect(metrics.strideAsymmetry).toBeNull();
      expect(metrics.leftStancePct).toBeNull();
      expect(metrics.rightStancePct).toBeNull();
      expect(metrics.leftSwingPct).toBeNull();
      expect(metrics.rightSwingPct).toBeNull();
      expect(metrics.doubleSupportPct).toBeNull();
    });

    it("suppresses frontal metrics (emits null) when viewAngle is sagittal", () => {
      const frames = generateSyntheticWalkingFrames({ viewAngle: "sagittal", durationSec: 4.0, fps: 30 });
      const metrics = computeGaitMetrics(frames);

      expect(metrics.viewAngle).toBe("sagittal");
      expect(metrics.lateralSway).toBeNull();
      expect(metrics.meanStepWidth).toBeNull();
      expect(metrics.stepWidthVariability).toBeNull();
      expect(metrics.pelvicObliquity).toBeNull();
      expect(metrics.pelvicObliquityVar).toBeNull();
    });

    it("computes split-half reliability testing and populates 95% confidence intervals", () => {
      const frames = generateSyntheticWalkingFrames({ durationSec: 6.0, fps: 30 });
      const metrics = computeGaitMetrics(frames);

      expect(metrics.confidenceIntervals).toBeDefined();
      expect(metrics.confidenceIntervals?.cadenceSpm).toBeDefined();
      expect(metrics.confidenceIntervals?.cadenceSpm?.ci95Lower).toBeDefined();
      expect(metrics.confidenceIntervals?.cadenceSpm?.ci95Upper).toBeDefined();
      expect(metrics.confidenceIntervals?.stepTimeCV).toBeDefined();
      expect(metrics.confidenceIntervals?.symmetryAngle).toBeDefined();
    });

    it("applies keypoint smoothing via options parameter ('savitzky-golay', 'kalman', 'none')", () => {
      const baseFrames = generateSyntheticWalkingFrames({ durationSec: 4.0, fps: 30 });
      // Add high frequency jitter to landmark coordinates
      const noisyFrames = baseFrames.map((f, i) => ({
        ...f,
        landmarks: f.landmarks.map((lm) => ({
          ...lm,
          x: lm.x + (i % 2 === 0 ? 0.03 : -0.03),
          y: lm.y + (i % 2 === 0 ? 0.03 : -0.03),
        })),
      }));

      const sgMetrics = computeGaitMetrics(noisyFrames, { smoothingMethod: "savitzky-golay" });
      const kalmanMetrics = computeGaitMetrics(noisyFrames, { smoothingMethod: "kalman" });
      const noneMetrics = computeGaitMetrics(noisyFrames, { smoothingMethod: "none" });

      expect(sgMetrics.overallScore).toBeGreaterThan(0);
      expect(kalmanMetrics.overallScore).toBeGreaterThan(0);
      expect(noneMetrics.overallScore).toBeGreaterThan(0);
      // Smoothed trajectories should produce lower or equal step time variability than un-smoothed jitter
      expect(sgMetrics.stepTimeCV).toBeLessThanOrEqual(noneMetrics.stepTimeCV + 0.05);
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
          firstFrameIndex: 0,
          lastFrameIndex: 4,
          frameIndices: [0, 1, 2, 3, 4],
        },
        {
          id: 2,
          lastHip: { x: 0.5, y: 0.8, z: 0 },
          frames: 50,
          box: { x: 0.2, y: 0.4, w: 0.6, h: 0.5 },
          areaSum: 15.0,
          hipYSum: 40.0,
          firstFrameIndex: 0,
          lastFrameIndex: 49,
          frameIndices: Array.from({ length: 50 }, (_, i) => i),
        },
      ];

      const people = tracksToPeople(tracks, 10);

      expect(people.length).toBe(2);
      // tracksToPeople reassigns IDs sequentially after sorting by priority
      // Track with 50 frames sorts first (higher priority) and gets id=1
      expect(people[0].id).toBe(1);
      expect(people[0].color).toBeDefined();
      expect(people[1].id).toBe(2);
    });

    it("merges fragmented sequential tracks of a single walking subject into 1 person", () => {
      // Simulates a single person walking across screen, creating 3 fragmented tracklets due to motion/gaps
      const track1: PersonTrack = {
        id: 1,
        firstHip: { x: 0.1, y: 0.5, z: 0 },
        lastHip: { x: 0.3, y: 0.5, z: 0 },
        frames: 5,
        box: { x: 0.1, y: 0.2, w: 0.2, h: 0.6 },
        areaSum: 0.6,
        hipYSum: 2.5,
        velocity: { vx: 0.04, vy: 0 },
        biometrics: { aspectRatio: 0.33, torsoLegRatio: 0.7, shoulderHipRatio: 1.2 },
        firstFrameIndex: 0,
        lastFrameIndex: 4,
        frameIndices: [0, 1, 2, 3, 4],
      };

      const track2: PersonTrack = {
        id: 2,
        firstHip: { x: 0.35, y: 0.5, z: 0 },
        lastHip: { x: 0.6, y: 0.5, z: 0 },
        frames: 6,
        box: { x: 0.35, y: 0.2, w: 0.2, h: 0.6 },
        areaSum: 0.72,
        hipYSum: 3.0,
        velocity: { vx: 0.04, vy: 0 },
        biometrics: { aspectRatio: 0.33, torsoLegRatio: 0.7, shoulderHipRatio: 1.2 },
        firstFrameIndex: 5,
        lastFrameIndex: 10,
        frameIndices: [5, 6, 7, 8, 9, 10],
      };

      const track3: PersonTrack = {
        id: 3,
        firstHip: { x: 0.64, y: 0.5, z: 0 },
        lastHip: { x: 0.85, y: 0.5, z: 0 },
        frames: 5,
        box: { x: 0.64, y: 0.2, w: 0.2, h: 0.6 },
        areaSum: 0.6,
        hipYSum: 2.5,
        velocity: { vx: 0.04, vy: 0 },
        biometrics: { aspectRatio: 0.33, torsoLegRatio: 0.7, shoulderHipRatio: 1.2 },
        firstFrameIndex: 11,
        lastFrameIndex: 15,
        frameIndices: [11, 12, 13, 14, 15],
      };

      const tracks = [track1, track2, track3];
      const people = tracksToPeople(tracks, 15);

      expect(people.length).toBe(1); // 3 tracklets merged into 1 person!
      expect(people[0].id).toBe(1);
      expect(people[0].frameCount).toBe(16);
    });

    it("does NOT merge distinct people walking simultaneously in the same frame", () => {
      const person1Track: PersonTrack = {
        id: 1,
        firstHip: { x: 0.2, y: 0.5, z: 0 },
        lastHip: { x: 0.3, y: 0.5, z: 0 },
        frames: 10,
        box: { x: 0.2, y: 0.2, w: 0.2, h: 0.6 },
        areaSum: 1.2,
        hipYSum: 5.0,
        biometrics: { aspectRatio: 0.33, torsoLegRatio: 0.7, shoulderHipRatio: 1.2 },
        firstFrameIndex: 0,
        lastFrameIndex: 9,
        frameIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      };

      const person2Track: PersonTrack = {
        id: 2,
        firstHip: { x: 0.7, y: 0.5, z: 0 },
        lastHip: { x: 0.8, y: 0.5, z: 0 },
        frames: 10,
        box: { x: 0.7, y: 0.2, w: 0.2, h: 0.6 },
        areaSum: 1.2,
        hipYSum: 5.0,
        biometrics: { aspectRatio: 0.33, torsoLegRatio: 0.7, shoulderHipRatio: 1.2 },
        firstFrameIndex: 0,
        lastFrameIndex: 9,
        frameIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      };

      const tracks = [person1Track, person2Track];
      const people = tracksToPeople(tracks, 9);

      expect(people.length).toBe(2); // Two simultaneous people remain 2 distinct subjects
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
  describe("Null Metric Processing in Ratings & Guesses", () => {
    it("buildStructuredReport and buildEducatedGuesses process null metrics cleanly", () => {
      const frontalMetrics = computeGaitMetrics(
        generateSyntheticWalkingFrames({ viewAngle: "frontal", durationSec: 4.0, fps: 30 })
      );
      const guesses = buildEducatedGuesses(frontalMetrics);
      const report = buildStructuredReport(frontalMetrics, guesses, {
        taskMode: "single",
        analyzedFrames: 120,
      });

      expect(guesses).toBeDefined();
      expect(Array.isArray(guesses)).toBe(true);
      expect(report).toBeDefined();
      expect(report.headline).toBeDefined();
      expect(report.domains.length).toBeGreaterThan(0);
      expect(report.metrics.length).toBeGreaterThan(0);

      // Verify that null metrics in metric ratings display N/A notes or text
      const kneeLRating = report.metrics.find((m) => m.id === "kneeL");
      expect(kneeLRating?.display).toBe("N/A");

      const sagittalMetrics = computeGaitMetrics(
        generateSyntheticWalkingFrames({ viewAngle: "sagittal", durationSec: 4.0, fps: 30 })
      );
      const guessesSag = buildEducatedGuesses(sagittalMetrics);
      const reportSag = buildStructuredReport(sagittalMetrics, guessesSag, {
        taskMode: "single",
        analyzedFrames: 120,
      });

      expect(guessesSag).toBeDefined();
      expect(reportSag).toBeDefined();
      const swayRating = reportSag.metrics.find((m) => m.id === "sway");
      expect(swayRating?.display).toBe("N/A");
    });
  });

  describe("analyzeGait master entry point", () => {
    it("computes metrics, angleAnalysis, and attaches patientMeta to AnalysisResult", () => {
      const frames = generateSyntheticWalkingFrames({ viewAngle: "sagittal", durationSec: 3.0, fps: 30 });
      const patientMeta = {
        patientId: "PT-TEST-123",
        assessmentDate: "2026-08-09",
        assessmentCondition: "Single-Task Walk",
        clinicianNotes: "Test notes",
      };

      const result = analyzeGait(frames, 1, "single", undefined, patientMeta);

      expect(result.metrics).toBeDefined();
      expect(result.guesses).toBeDefined();
      expect(result.angleAnalysis).toBeDefined();
      expect(result.angleAnalysis?.normalizedPoints.length).toBe(101);
      expect(result.patientMeta).toEqual(patientMeta);
    });
  });
});

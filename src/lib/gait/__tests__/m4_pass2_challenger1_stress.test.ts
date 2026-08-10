import { describe, it, expect } from "vitest";
import {
  detectGaitEventsZeni,
  detectFusedGaitEvents,
  detectGaitEventsFused,
  combineExtremaByDirection,
  findExtrema,
} from "../events";
import type { PoseFrame, Landmark } from "../types";

/**
 * Generator for 180° U-Turn walk-and-turn sequences with customizable speed profiles and landmark conditions.
 */
interface UTurnGeneratorOptions {
  fps?: number;
  outboundDurationSec?: number;
  turnDurationSec?: number;
  returnDurationSec?: number;
  outboundSpeed?: number; // norm units / sec
  returnSpeed?: number;   // norm units / sec
  turnSpeedProfile?: "constant" | "accelerating" | "decelerating" | "near_stop";
  chatterNoiseAmp?: number;
  chatterOffset?: number;
  missingKeypointsInTurn?: boolean;
  missingKeypointType?: "low_visibility" | "undefined_landmarks" | "zero_coords";
  turnStartFrameOffset?: number;
}

function generateVariableSpeedUTurnFrames(opts: UTurnGeneratorOptions = {}): PoseFrame[] {
  const fps = opts.fps ?? 30;
  const outSec = opts.outboundDurationSec ?? 3.0;
  const turnSec = opts.turnDurationSec ?? 1.0;
  const retSec = opts.returnDurationSec ?? 3.0;

  const outFrames = Math.floor(fps * outSec);
  const turnFrames = Math.floor(fps * turnSec);
  const retFrames = Math.floor(fps * retSec);
  const totalFrames = outFrames + turnFrames + retFrames;

  const outSpeed = opts.outboundSpeed ?? 0.15;
  const retSpeed = opts.returnSpeed ?? 0.15;

  const frames: PoseFrame[] = [];

  let currentX = 0.15;
  const freq = 1.6;

  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    const timeMs = t * 1000;

    let headingAngle = 0; // 0 = L->R, PI = R->L
    let currentSpeed = outSpeed;
    let inTurn = false;

    if (f < outFrames) {
      headingAngle = 0;
      currentSpeed = outSpeed;
      currentX += (currentSpeed / fps);
    } else if (f >= outFrames && f < outFrames + turnFrames) {
      inTurn = true;
      const u = (f - outFrames) / Math.max(1, turnFrames);
      headingAngle = Math.PI * u;

      if (opts.turnSpeedProfile === "accelerating") {
        currentSpeed = outSpeed + u * (retSpeed - outSpeed + 0.1);
      } else if (opts.turnSpeedProfile === "decelerating") {
        currentSpeed = outSpeed * (1 - 0.7 * u);
      } else if (opts.turnSpeedProfile === "near_stop") {
        currentSpeed = Math.sin(Math.PI * u) < 0.5 ? 0.01 : retSpeed;
      } else {
        currentSpeed = (outSpeed + retSpeed) / 2;
      }

      currentX += (currentSpeed / fps) * Math.cos(headingAngle);
    } else {
      headingAngle = Math.PI;
      currentSpeed = retSpeed;
      currentX -= (currentSpeed / fps);
    }

    const midHipX = currentX;
    const midHipY = 0.5 + 0.015 * Math.sin(2 * Math.PI * freq * 2 * t);
    const legPhase = 2 * Math.PI * freq * t;
    const rightPhase = legPhase + Math.PI;

    const dirCos = Math.cos(headingAngle);
    const leftAnkleOffset = 0.12 * Math.sin(legPhase) * dirCos;
    const rightAnkleOffset = 0.12 * Math.sin(rightPhase) * dirCos;

    const leftAnkleX = midHipX + leftAnkleOffset;
    const rightAnkleX = midHipX + rightAnkleOffset;
    const leftAnkleY = 0.85 - 0.05 * Math.max(0, Math.sin(legPhase));
    const rightAnkleY = 0.85 - 0.05 * Math.max(0, Math.sin(rightPhase));

    const footOffset = 0.04 * (dirCos >= 0 ? 1 : -1);

    let vis = 0.9;
    let isUndefinedLms = false;
    let isZeroLms = false;

    if (inTurn && opts.missingKeypointsInTurn) {
      if (opts.missingKeypointType === "low_visibility") {
        vis = 0.1;
      } else if (opts.missingKeypointType === "undefined_landmarks") {
        isUndefinedLms = true;
      } else if (opts.missingKeypointType === "zero_coords") {
        isZeroLms = true;
      }
    }

    const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));

    if (!isUndefinedLms) {
      landmarks[0] = { x: isZeroLms ? 0 : midHipX, y: isZeroLms ? 0 : 0.2, z: 0, visibility: vis };
      landmarks[11] = { x: isZeroLms ? 0 : midHipX - 0.03, y: isZeroLms ? 0 : 0.3, z: 0, visibility: vis };
      landmarks[12] = { x: isZeroLms ? 0 : midHipX + 0.03, y: isZeroLms ? 0 : 0.3, z: 0, visibility: vis };
      landmarks[23] = { x: isZeroLms ? 0 : midHipX - 0.03, y: isZeroLms ? 0 : midHipY, z: 0, visibility: vis };
      landmarks[24] = { x: isZeroLms ? 0 : midHipX + 0.03, y: isZeroLms ? 0 : midHipY, z: 0, visibility: vis };

      if (isZeroLms) {
        landmarks[27] = { x: 0, y: 0, z: 0, visibility: vis };
        landmarks[28] = { x: 0, y: 0, z: 0, visibility: vis };
        landmarks[29] = { x: 0, y: 0, z: 0, visibility: vis };
        landmarks[30] = { x: 0, y: 0, z: 0, visibility: vis };
        landmarks[31] = { x: 0, y: 0, z: 0, visibility: vis };
        landmarks[32] = { x: 0, y: 0, z: 0, visibility: vis };
      } else {
        landmarks[27] = { x: leftAnkleX, y: leftAnkleY, z: 0, visibility: vis };
        landmarks[28] = { x: rightAnkleX, y: rightAnkleY, z: 0, visibility: vis };
        landmarks[29] = { x: leftAnkleX - footOffset * 0.3, y: leftAnkleY, z: 0, visibility: vis };
        landmarks[30] = { x: rightAnkleX - footOffset * 0.3, y: rightAnkleY, z: 0, visibility: vis };
        landmarks[31] = { x: leftAnkleX + footOffset, y: leftAnkleY + 0.01, z: 0, visibility: vis };
        landmarks[32] = { x: rightAnkleX + footOffset, y: rightAnkleY + 0.01, z: 0, visibility: vis };
      }

      // Add directional chatter noise if specified
      if (opts.chatterNoiseAmp && opts.chatterNoiseAmp > 0) {
        const chatter = (f % 2 === 0 ? 1 : -1) * opts.chatterNoiseAmp + (opts.chatterOffset ?? 0);
        landmarks[31].x += chatter;
        landmarks[32].x += chatter;
      }
    }

    frames.push({
      timeMs,
      landmarks: isUndefinedLms ? ([] as unknown as Landmark[]) : landmarks,
    });
  }

  return frames;
}

describe("Empirical Challenger M4 Pass 2: Dynamic Walking Direction & U-Turn Event Detection Stress Suite", () => {
  describe("1. Variable-Speed 180° Walk-and-Turn Sequences", () => {
    it("handles slow outbound (0.06 m/s), fast turn, and fast inbound (0.25 m/s) with zero crashes or NaNs", () => {
      const frames = generateVariableSpeedUTurnFrames({
        fps: 30,
        outboundDurationSec: 3.0,
        turnDurationSec: 1.0,
        returnDurationSec: 3.0,
        outboundSpeed: 0.06,
        returnSpeed: 0.25,
        turnSpeedProfile: "accelerating",
      });

      const result = detectGaitEventsZeni(frames, 30);

      // Verify zero NaNs in breakdown metrics
      expect(Number.isNaN(result.leftStancePct)).toBe(false);
      expect(Number.isNaN(result.rightStancePct)).toBe(false);
      expect(Number.isNaN(result.leftSwingPct)).toBe(false);
      expect(Number.isNaN(result.rightSwingPct)).toBe(false);
      expect(Number.isNaN(result.doubleSupportPct)).toBe(false);

      // Verify stance percentages are within valid physiological bounds [30%, 85%]
      expect(result.leftStancePct).toBeGreaterThanOrEqual(30);
      expect(result.leftStancePct).toBeLessThanOrEqual(85);
      expect(result.rightStancePct).toBeGreaterThanOrEqual(30);
      expect(result.rightStancePct).toBeLessThanOrEqual(85);

      // Verify stance + swing = 100%
      expect(result.leftStancePct + result.leftSwingPct).toBeCloseTo(100, 1);
      expect(result.rightStancePct + result.rightSwingPct).toBeCloseTo(100, 1);

      // Verify event chronological order and presence across both outbound and return segments
      expect(result.stepEvents.length).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < result.stepEvents.length; i++) {
        expect(result.stepEvents[i].frame).toBeGreaterThanOrEqual(result.stepEvents[i - 1].frame);
        expect(Number.isNaN(result.stepEvents[i].timeSec)).toBe(false);
      }
    });

    it("handles fast outbound (0.25 m/s), decelerating near-stop turn, and slow inbound (0.06 m/s)", () => {
      const frames = generateVariableSpeedUTurnFrames({
        fps: 30,
        outboundDurationSec: 3.5,
        turnDurationSec: 1.5,
        returnDurationSec: 3.5,
        outboundSpeed: 0.25,
        returnSpeed: 0.06,
        turnSpeedProfile: "near_stop",
      });

      const result = detectGaitEventsZeni(frames, 30);

      expect(Number.isNaN(result.leftStancePct)).toBe(false);
      expect(Number.isNaN(result.rightStancePct)).toBe(false);
      expect(result.stepEvents.length).toBeGreaterThan(0);

      // Check events occur in both halves (frame < 100 and frame > 140)
      const outboundEvents = result.stepEvents.filter((e) => e.frame < 105);
      const returnEvents = result.stepEvents.filter((e) => e.frame > 150);

      expect(outboundEvents.length).toBeGreaterThan(0);
      expect(returnEvents.length).toBeGreaterThan(0);
    });

    it("handles high frame rate (60 FPS) variable-speed U-turn walk test", () => {
      const frames = generateVariableSpeedUTurnFrames({
        fps: 60,
        outboundDurationSec: 2.5,
        turnDurationSec: 1.0,
        returnDurationSec: 2.5,
        outboundSpeed: 0.12,
        returnSpeed: 0.18,
      });

      const result = detectGaitEventsZeni(frames, 60);

      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.doubleSupportPct).toBeGreaterThanOrEqual(5.0);
      expect(result.doubleSupportPct).toBeLessThanOrEqual(50.0);
    });
  });

  describe("2. Rapid Directional Chatter Near Hysteresis Threshold (> 0.01)", () => {
    it("resists rapid directional chatter oscillating across ±0.010 threshold without event duplication or NaN", () => {
      // Chatter noise amplitude 0.012 fluctuates right around the 0.01 hysteresis threshold
      const frames = generateVariableSpeedUTurnFrames({
        fps: 30,
        outboundDurationSec: 3.0,
        turnDurationSec: 0.5,
        returnDurationSec: 3.0,
        chatterNoiseAmp: 0.012,
      });

      const result = detectGaitEventsZeni(frames, 30);

      expect(Number.isNaN(result.leftStancePct)).toBe(false);
      expect(Number.isNaN(result.rightStancePct)).toBe(false);
      expect(result.inferredDirection === 1 || result.inferredDirection === -1).toBe(true);

      // Verify no duplicate events at identical frames
      const eventFrames = result.stepEvents.map((e) => `${e.frame}_${e.side}_${e.type}`);
      const uniqueEventFrames = new Set(eventFrames);
      expect(eventFrames.length).toBe(uniqueEventFrames.size);
    });

    it("combineExtremaByDirection handles rapid direction sign flipping safely", () => {
      const signal = [0, 0.05, 0.10, 0.05, 0, -0.05, -0.10, -0.05, 0, 0.05, 0.10, 0.05, 0];
      // Rapid direction flip array [1, -1, 1, -1, 1, -1, ...]
      const directions = signal.map((_, i) => (i % 2 === 0 ? 1 : -1));

      const heelEvents = combineExtremaByDirection(signal, directions, "heel", 2);
      const toeEvents = combineExtremaByDirection(signal, directions, "toe", 2);

      expect(Array.isArray(heelEvents)).toBe(true);
      expect(Array.isArray(toeEvents)).toBe(true);
      heelEvents.forEach((f) => expect(Number.isNaN(f)).toBe(false));
      toeEvents.forEach((f) => expect(Number.isNaN(f)).toBe(false));
    });
  });

  describe("3. Missing Keypoint Frames During Turning", () => {
    it("handles low visibility keypoints (< 0.3) during U-turn apex gracefully", () => {
      const frames = generateVariableSpeedUTurnFrames({
        fps: 30,
        outboundDurationSec: 3.0,
        turnDurationSec: 1.5,
        returnDurationSec: 3.0,
        missingKeypointsInTurn: true,
        missingKeypointType: "low_visibility",
      });

      const result = detectGaitEventsZeni(frames, 30);

      expect(Number.isNaN(result.leftStancePct)).toBe(false);
      expect(Number.isNaN(result.rightStancePct)).toBe(false);
      expect(result.stepEvents.length).toBeGreaterThan(0);
    });

    it("handles undefined/empty landmark arrays during U-turn transition without throwing", () => {
      const frames = generateVariableSpeedUTurnFrames({
        fps: 30,
        outboundDurationSec: 2.5,
        turnDurationSec: 1.0,
        returnDurationSec: 2.5,
        missingKeypointsInTurn: true,
        missingKeypointType: "undefined_landmarks",
      });

      expect(() => {
        const result = detectGaitEventsZeni(frames, 30);
        expect(Number.isNaN(result.leftStancePct)).toBe(false);
      }).not.toThrow();
    });

    it("handles zero landmark coordinates (0, 0, 0) during turning without NaN propagation", () => {
      const frames = generateVariableSpeedUTurnFrames({
        fps: 30,
        outboundDurationSec: 2.5,
        turnDurationSec: 1.0,
        returnDurationSec: 2.5,
        missingKeypointsInTurn: true,
        missingKeypointType: "zero_coords",
      });

      const result = detectGaitEventsZeni(frames, 30);

      expect(Number.isNaN(result.leftStancePct)).toBe(false);
      expect(Number.isNaN(result.rightStancePct)).toBe(false);
      expect(Number.isNaN(result.doubleSupportPct)).toBe(false);
    });
  });

  describe("4. Short Signals & Boundary Edge Cases", () => {
    it("returns physiological default breakdown when frame count n < 10", () => {
      const shortFrames: PoseFrame[] = new Array(7).fill(null).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })),
      }));

      const result = detectGaitEventsZeni(shortFrames, 30);

      expect(result.leftStancePct).toBe(60.0);
      expect(result.rightStancePct).toBe(60.0);
      expect(result.leftSwingPct).toBe(40.0);
      expect(result.rightSwingPct).toBe(40.0);
      expect(result.doubleSupportPct).toBe(20.0);
      expect(result.stepEvents).toEqual([]);
    });

    it("handles short 15-frame signal (~0.5s) without crashing", () => {
      const frames = generateVariableSpeedUTurnFrames({
        fps: 30,
        outboundDurationSec: 0.25,
        turnDurationSec: 0.25,
        returnDurationSec: 0.25,
      });

      const result = detectGaitEventsZeni(frames, 30);

      expect(Number.isNaN(result.leftStancePct)).toBe(false);
      expect(Number.isNaN(result.rightStancePct)).toBe(false);
      expect(Array.isArray(result.stepEvents)).toBe(true);
    });

    it("handles empty or null frame array safely", () => {
      expect(detectGaitEventsZeni([], 30).stepEvents).toEqual([]);
      expect(detectGaitEventsZeni(null as unknown as PoseFrame[], 30).stepEvents).toEqual([]);
      expect(detectFusedGaitEvents([], 30)).toEqual([]);
      expect(detectFusedGaitEvents(null as unknown as PoseFrame[], 30)).toEqual([]);
    });
  });

  describe("5. Multi-Signal Fused Event Detection (detectFusedGaitEvents & detectGaitEventsFused)", () => {
    it("fuses vertical acceleration minima and ZUPT state during 180° U-turn walk test", () => {
      const frames = generateVariableSpeedUTurnFrames({
        fps: 30,
        outboundDurationSec: 3.0,
        turnDurationSec: 1.0,
        returnDurationSec: 3.0,
      });

      const events = detectFusedGaitEvents(frames, 30);
      const fusedBreakdown = detectGaitEventsFused(frames, 30);

      expect(events.length).toBeGreaterThan(0);
      expect(fusedBreakdown.stepEvents.length).toBeGreaterThan(0);
      expect(Number.isNaN(fusedBreakdown.leftStancePct)).toBe(false);

      for (const ev of events) {
        expect(ev.frame).toBeGreaterThanOrEqual(0);
        expect(ev.frame).toBeLessThan(frames.length);
        expect(Number.isNaN(ev.timeSec)).toBe(false);
        expect(ev.side === "left" || ev.side === "right").toBe(true);
        expect(ev.type === "heel_strike" || ev.type === "toe_off").toBe(true);
      }
    });

    it("produces zero false heel strikes when subject is stationary (ZUPT gate)", () => {
      const stationaryFrames: PoseFrame[] = new Array(60).fill(null).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.85, z: 0, visibility: 0.9 })),
      }));

      const events = detectFusedGaitEvents(stationaryFrames, 30);
      expect(events).toEqual([]);
    });
  });
});

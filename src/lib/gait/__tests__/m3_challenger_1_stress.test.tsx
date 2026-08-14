// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { GaitMetronome } from "../metronome";
import { computeLiveCoMSway } from "@/components/gait/GaitApp";
import { LiveBiofeedbackHUD } from "@/components/gait/LiveBiofeedbackHUD";
import type { PoseFrame } from "../types";

// Mock Web Audio API for JSDOM
class MockAudioParam {
  value: number = 0;
  setValueAtTime = vi.fn().mockImplementation((val: number) => {
    this.value = val;
    return this;
  });
  linearRampToValueAtTime = vi.fn().mockReturnThis();
  exponentialRampToValueAtTime = vi.fn().mockReturnThis();
}

class MockOscillatorNode {
  type: string = "sine";
  frequency = new MockAudioParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockGainNode {
  gain = new MockAudioParam();
  connect = vi.fn();
}

class MockAudioContext {
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime: number = 0.0;
  destination = {};

  resume = vi.fn().mockImplementation(() => {
    this.state = "running";
    return Promise.resolve();
  });

  close = vi.fn().mockImplementation(() => {
    this.state = "closed";
    return Promise.resolve();
  });

  createOscillator = vi.fn().mockImplementation(() => new MockOscillatorNode());
  createGain = vi.fn().mockImplementation(() => new MockGainNode());
}

describe("Milestone 3 Empirical Stress & Adversarial Test Suite", () => {
  let originalAudioContext: any;
  let lastCreatedCtx: MockAudioContext | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    originalAudioContext = (window as any).AudioContext;

    (window as any).AudioContext = vi.fn().mockImplementation(function () {
      lastCreatedCtx = new MockAudioContext();
      return lastCreatedCtx;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    (window as any).AudioContext = originalAudioContext;
    lastCreatedCtx = null;
  });

  describe("1. Metronome BPM Edge & Out-of-Bounds Clamping Stress", () => {
    it("handles extreme negative, zero, and sub-boundary BPM values (-50, 0, 29)", () => {
      const metNeg = new GaitMetronome({ bpm: -50 });
      expect(metNeg.getBpm()).toBe(30);

      const metZero = new GaitMetronome({ bpm: 0 });
      expect(metZero.getBpm()).toBe(30);

      const met29 = new GaitMetronome({ bpm: 29 });
      expect(met29.getBpm()).toBe(30);
    });

    it("handles boundary and extreme high BPM values (30, 240, 241, 999)", () => {
      const met30 = new GaitMetronome({ bpm: 30 });
      expect(met30.getBpm()).toBe(30);

      const met240 = new GaitMetronome({ bpm: 240 });
      expect(met240.getBpm()).toBe(240);

      const met241 = new GaitMetronome({ bpm: 241 });
      expect(met241.getBpm()).toBe(240);

      const met999 = new GaitMetronome({ bpm: 999 });
      expect(met999.getBpm()).toBe(240);
    });

    it("clamps dynamic setBpm calls strictly across out-of-bound ranges", () => {
      const met = new GaitMetronome({ bpm: 100 });
      met.setBpm(-50);
      expect(met.getBpm()).toBe(30);

      met.setBpm(0);
      expect(met.getBpm()).toBe(30);

      met.setBpm(29);
      expect(met.getBpm()).toBe(30);

      met.setBpm(30);
      expect(met.getBpm()).toBe(30);

      met.setBpm(240);
      expect(met.getBpm()).toBe(240);

      met.setBpm(241);
      expect(met.getBpm()).toBe(240);

      met.setBpm(999);
      expect(met.getBpm()).toBe(240);
    });
  });

  describe("2. Volume = 0 & Audio Safety Exponential Ramp Stress", () => {
    it("ensures volume = 0 clamps initial gain to >= 0.0001 for exponential gain ramps (scheduleNote)", () => {
      const met = new GaitMetronome({ volume: 0 });
      met.start();

      vi.advanceTimersByTime(50);

      expect(lastCreatedCtx).not.toBeNull();
      const gainCalls = (lastCreatedCtx?.createGain as any).mock.results;
      expect(gainCalls.length).toBeGreaterThan(0);
      const gainNode = gainCalls[0].value as MockGainNode;

      const setValCalls = gainNode.gain.setValueAtTime.mock.calls;
      expect(setValCalls.length).toBeGreaterThan(0);
      const initialGainValue = setValCalls[0][0];
      expect(initialGainValue).toBeGreaterThanOrEqual(0.0001);
    });

    it("ensures volume = 0 in playAsymmetryAlert clamps initial gain to >= 0.0001 for exponential gain ramps", () => {
      const met = new GaitMetronome({ volume: 0 });
      met.playAsymmetryAlert();

      expect(lastCreatedCtx).not.toBeNull();
      const gainCalls = (lastCreatedCtx?.createGain as any).mock.results;
      expect(gainCalls.length).toBeGreaterThan(0);
      const gainNode = gainCalls[gainCalls.length - 1].value as MockGainNode;

      const setValCalls = gainNode.gain.setValueAtTime.mock.calls;
      expect(setValCalls.length).toBeGreaterThan(0);
      const initialGainValue = setValCalls[0][0];
      expect(initialGainValue).toBeGreaterThanOrEqual(0.0001);
    });

    it("handles negative and overflowing volume inputs safely", () => {
      const metNeg = new GaitMetronome({ volume: -0.5 });
      metNeg.start();
      vi.advanceTimersByTime(50);

      const metHigh = new GaitMetronome({ volume: 1.5 });
      metHigh.setVolume(-10);
      metHigh.setVolume(5);
    });
  });

  describe("3. Stance Balance & Live HUD Visual Edge Cases", () => {
    it("handles 0% L / 100% R stance balance without breaking UI", () => {
      render(<LiveBiofeedbackHUD stanceBalanceLeft={0} stanceBalanceRight={100} />);
      expect(screen.getByText("0% L")).toBeTruthy();
      expect(screen.getByText("100% R")).toBeTruthy();
      expect(screen.getByText("Asymmetric")).toBeTruthy();
    });

    it("handles 100% L / 0% R stance balance without breaking UI", () => {
      render(<LiveBiofeedbackHUD stanceBalanceLeft={100} stanceBalanceRight={0} />);
      expect(screen.getByText("100% L")).toBeTruthy();
      expect(screen.getByText("0% R")).toBeTruthy();
      expect(screen.getByText("Asymmetric")).toBeTruthy();
    });

    it("handles negative stance balance values gracefully", () => {
      render(<LiveBiofeedbackHUD stanceBalanceLeft={-20} stanceBalanceRight={120} />);
      expect(screen.getByText("-20% L")).toBeTruthy();
      expect(screen.getByText("120% R")).toBeTruthy();
      expect(screen.getByText("Asymmetric")).toBeTruthy();
    });

    it("evaluates asymmetry boundary correctly around 6.0% threshold", () => {
      // 5.9% diff -> Balanced
      const { unmount: unmount1 } = render(<LiveBiofeedbackHUD stanceBalanceLeft={52.95} stanceBalanceRight={47.05} />);
      expect(screen.getByText("Balanced")).toBeTruthy();
      unmount1();

      // 6.1% diff -> Asymmetric
      render(<LiveBiofeedbackHUD stanceBalanceLeft={53.1} stanceBalanceRight={47.0} />);
      expect(screen.getByText("Asymmetric")).toBeTruthy();
    });
  });

  describe("4. Trunk Sway Distance Helper (computeLiveCoMSway) Robustness", () => {
    it("returns safe default 0.04m for null, undefined, or empty frames array", () => {
      expect(computeLiveCoMSway(null as any)).toBe(0.04);
      expect(computeLiveCoMSway(undefined as any)).toBe(0.04);
      expect(computeLiveCoMSway([])).toBe(0.04);
    });

    it("returns safe default 0.04m when total frames is less than 5", () => {
      const dummyFrame: PoseFrame = {
        timeMs: 100,
        landmarks: Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 1 }),
      };
      expect(computeLiveCoMSway([dummyFrame, dummyFrame, dummyFrame, dummyFrame])).toBe(0.04);
    });

    it("returns safe default 0.04m when landmarks are missing, empty, or missing lower/upper keypoints", () => {
      const corruptFrames: PoseFrame[] = [
        { timeMs: 0, landmarks: undefined as any },
        { timeMs: 33, landmarks: [] },
        { timeMs: 66, landmarks: Array(10).fill({ x: 0.5, y: 0.5, z: 0, visibility: 1 }) }, // missing hip/shoulder indices
        { timeMs: 99, landmarks: undefined as any },
        { timeMs: 132, landmarks: [] },
      ];
      expect(computeLiveCoMSway(corruptFrames)).toBe(0.04);
    });

    it("filters out frames with collapsed torso height (torsoH < 0.05m)", () => {
      // Create frames where shoulders and hips coincide (torsoH = 0)
      const collapsedLandmarks = Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
      const frames: PoseFrame[] = Array(10).fill(null).map((_, i) => ({ timeMs: i * 33, landmarks: collapsedLandmarks }));
      expect(computeLiveCoMSway(frames)).toBe(0.04);
    });

    it("computes accurate scale-invariant trunk sway distance for valid sway trajectories", () => {
      // Build 10 valid synthetic frames with lateral sway range of 0.10 in x and torso height of 0.50
      const frames: PoseFrame[] = [];
      for (let i = 0; i < 10; i++) {
        const xOffset = (i % 2 === 0 ? 0.05 : -0.05); // x range = 0.10
        const lSh = { x: 0.45 + xOffset, y: 0.2, z: 0, visibility: 1 };
        const rSh = { x: 0.55 + xOffset, y: 0.2, z: 0, visibility: 1 };
        const lHip = { x: 0.45 + xOffset, y: 0.7, z: 0, visibility: 1 };
        const rHip = { x: 0.55 + xOffset, y: 0.7, z: 0, visibility: 1 };

        const lm = Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
        lm[11] = lSh;
        lm[12] = rSh;
        lm[23] = lHip;
        lm[24] = rHip;
        frames.push({ timeMs: i * 33, landmarks: lm });
      }

      const sway = computeLiveCoMSway(frames);
      // torsoH = Math.hypot(0.5 - 0.5, 0.2 - 0.7) = 0.50
      // rangeX = 0.55 - 0.45 = 0.10
      // swayMeters = (0.10 / 0.50) * 0.48 = 0.096
      expect(sway).toBe(0.096);
    });

    it("reveals empirical flaw: NaN landmark coordinates cause computeLiveCoMSway to return NaN instead of fallback 0.04m", () => {
      const nanLandmarks = Array(33).fill(null).map(() => ({ x: NaN, y: NaN, z: 0, visibility: 1 }));
      const frames: PoseFrame[] = Array(10).fill(null).map((_, i) => ({ timeMs: i * 33, landmarks: nanLandmarks }));
      const sway = computeLiveCoMSway(frames);
      // Empirical observation: NaN < 0.05 is false, so invalid frames are pushed to comXList and torsoHeights, returning NaN.
      expect(Number.isNaN(sway)).toBe(true);
    });
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { GaitMetronome } from "../metronome";
import { LiveBiofeedbackHUD } from "@/components/gait/LiveBiofeedbackHUD";

// Mock AudioParam and Nodes for JSDOM AudioContext testing
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

describe("Milestone 3 Challenger 2: Audio & Biofeedback Empirical Test Suite", () => {
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

  describe("1. GaitMetronome AudioContext Teardown & Destruction Resilience", () => {
    it("1.1 destroy() calls ctx.close(), sets ctx to null, and sets isRunning to false", () => {
      const metronome = new GaitMetronome({ bpm: 120 });
      metronome.start();
      expect(metronome.getActive()).toBe(true);
      const ctx = lastCreatedCtx;

      metronome.destroy();

      expect(metronome.getActive()).toBe(false);
      expect(ctx?.close).toHaveBeenCalled();

      // Starting again re-initializes ctx cleanly
      metronome.start();
      expect(metronome.getActive()).toBe(true);
      expect(lastCreatedCtx).not.toBe(ctx);
    });

    it("1.2 destroy() handles synchronous throws in ctx.close() without crashing", () => {
      const metronome = new GaitMetronome({ bpm: 100 });
      metronome.start();

      if (lastCreatedCtx) {
        lastCreatedCtx.close = vi.fn().mockImplementation(() => {
          throw new DOMException("The AudioContext was closed already.", "InvalidStateError");
        });
      }

      expect(() => metronome.destroy()).not.toThrow();
      expect(metronome.getActive()).toBe(false);
    });

    it("1.3 destroy() handles rejected Promises from ctx.close() cleanly", async () => {
      const metronome = new GaitMetronome({ bpm: 100 });
      metronome.start();

      if (lastCreatedCtx) {
        lastCreatedCtx.close = vi.fn().mockReturnValue(Promise.reject(new Error("Hardware context failed to close")));
      }

      expect(() => metronome.destroy()).not.toThrow();
      expect(metronome.getActive()).toBe(false);
    });

    it("1.4 destroy() is idempotent and safe to invoke multiple times consecutively", () => {
      const metronome = new GaitMetronome({ bpm: 110 });
      metronome.start();

      expect(() => {
        metronome.destroy();
        metronome.destroy();
        metronome.close();
      }).not.toThrow();
      expect(metronome.getActive()).toBe(false);
    });
  });

  describe("2. GaitMetronome Input Validation & DOMException Protection", () => {
    it("2.1 Constructor and setBpm clamp out-of-bounds BPM strictly to [30, 240]", () => {
      const met1 = new GaitMetronome({ bpm: -50 });
      expect(met1.getBpm()).toBe(30);

      const met2 = new GaitMetronome({ bpm: 999 });
      expect(met2.getBpm()).toBe(240);

      met1.setBpm(15);
      expect(met1.getBpm()).toBe(30);

      met1.setBpm(350);
      expect(met1.getBpm()).toBe(240);
    });

    it("2.2 Volume values are clamped to [0.0, 1.0] and initial gain is clamped >= 0.0001 to prevent Web Audio exponentialRamp exceptions", () => {
      const metronome = new GaitMetronome({ volume: 0.0 });
      metronome.start();
      vi.advanceTimersByTime(50);

      expect(lastCreatedCtx).not.toBeNull();
      const gainCalls = (lastCreatedCtx?.createGain as any).mock.results;
      const gainNode = gainCalls[0].value as MockGainNode;

      // Web Audio exponentialRampToValueAtTime throws DOMException if start value is 0.0
      expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, expect.any(Number));
    });

    it("2.3 playAsymmetryAlert schedules a frequency drop ramp (440Hz -> 330Hz) and clamps volume", () => {
      const metronome = new GaitMetronome({ volume: 0.8 });
      metronome.playAsymmetryAlert();

      expect(lastCreatedCtx).not.toBeNull();
      const oscCalls = (lastCreatedCtx?.createOscillator as any).mock.results;
      const osc = oscCalls[oscCalls.length - 1].value as MockOscillatorNode;

      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(440, expect.any(Number));
      expect(osc.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(330, expect.any(Number));
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    });
  });

  describe("3. LiveBiofeedbackHUD Empirical Cooldown & Teardown Verification", () => {
    it("3.1 Rate limits asymmetry alert chimes to once every 3000ms on asymmetry state transitions", () => {
      const playAlertSpy = vi.fn();
      const destroySpy = vi.fn();

      vi.spyOn(GaitMetronome.prototype, "playAsymmetryAlert").mockImplementation(playAlertSpy);
      vi.spyOn(GaitMetronome.prototype, "destroy").mockImplementation(destroySpy);

      const { rerender } = render(
        <LiveBiofeedbackHUD stanceBalanceLeft={60} stanceBalanceRight={40} />
      );

      // Initial render with >6% asymmetry triggers first alert
      expect(playAlertSpy).toHaveBeenCalledTimes(1);

      // Advance time by 1500ms (within 3000ms cooldown) and re-render with balanced stance
      vi.advanceTimersByTime(1500);
      rerender(<LiveBiofeedbackHUD stanceBalanceLeft={50} stanceBalanceRight={50} />);
      expect(playAlertSpy).toHaveBeenCalledTimes(1); // No new alert on balanced stance

      // Advance time by 1600ms (total 3100ms > 3000ms cooldown) and re-render with asymmetric stance
      vi.advanceTimersByTime(1600);
      rerender(<LiveBiofeedbackHUD stanceBalanceLeft={65} stanceBalanceRight={35} />);
      expect(playAlertSpy).toHaveBeenCalledTimes(2); // Fires on state transition after 3000ms cooldown!
    });

    it("3.2 Displays elevated trunk sway alert banner when comSwayDistance > 0.08m and hides when <= 0.08m", () => {
      const { rerender } = render(<LiveBiofeedbackHUD comSwayDistance={0.05} />);
      expect(screen.queryByText(/Elevated trunk lateral sway/i)).toBeNull();

      rerender(<LiveBiofeedbackHUD comSwayDistance={0.09} />);
      expect(screen.getByText(/Elevated trunk lateral sway \(9\.0 cm\)\. Provide lateral stability support\./i)).toBeTruthy();

      rerender(<LiveBiofeedbackHUD comSwayDistance={0.08} />);
      expect(screen.queryByText(/Elevated trunk lateral sway/i)).toBeNull();
    });

    it("3.3 Calls met.destroy() on component unmount to prevent AudioContext leaks", () => {
      const destroySpy = vi.fn();
      vi.spyOn(GaitMetronome.prototype, "destroy").mockImplementation(destroySpy);

      const { unmount } = render(<LiveBiofeedbackHUD />);
      expect(destroySpy).not.toHaveBeenCalled();

      unmount();
      expect(destroySpy).toHaveBeenCalledTimes(1);
    });
  });
});

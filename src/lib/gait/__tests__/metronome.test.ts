// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GaitMetronome } from "../metronome";

// Comprehensive Mock Web Audio API Implementation for JSDOM
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

describe("GaitMetronome Web Audio Engine Test Suite", () => {
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
    vi.clearAllTimers();
    vi.useRealTimers();
    (window as any).AudioContext = originalAudioContext;
    lastCreatedCtx = null;
  });

  it("initializes AudioContext and resumes if suspended when start() is called", () => {
    const metronome = new GaitMetronome({ bpm: 120 });
    expect(metronome.getActive()).toBe(false);
    expect(lastCreatedCtx).toBeNull();

    metronome.start();

    expect(metronome.getActive()).toBe(true);
    expect(lastCreatedCtx).not.toBeNull();
    expect(lastCreatedCtx?.resume).toHaveBeenCalled();
  });

  it("starts and stops scheduling loop cleanly and maintains idempotency", () => {
    const metronome = new GaitMetronome({ bpm: 100 });
    metronome.start();
    expect(metronome.getActive()).toBe(true);

    // Call start again when already running
    metronome.start();
    expect(metronome.getActive()).toBe(true);

    metronome.stop();
    expect(metronome.getActive()).toBe(false);
  });

  it("clamps BPM inputs strictly to clinical bounds [30, 240] SPM in constructor and setBpm", () => {
    // Constructor clamping
    const metLow = new GaitMetronome({ bpm: 10 });
    expect(metLow.getBpm()).toBe(30);

    const metHigh = new GaitMetronome({ bpm: 300 });
    expect(metHigh.getBpm()).toBe(240);

    // setBpm clamping
    const metronome = new GaitMetronome({ bpm: 100 });
    metronome.setBpm(140);
    expect(metronome.getBpm()).toBe(140);

    metronome.setBpm(15);
    expect(metronome.getBpm()).toBe(30);

    metronome.setBpm(500);
    expect(metronome.getBpm()).toBe(240);
  });

  it("alternates frequencies between 880Hz (Left downbeat) and 660Hz (Right downbeat)", () => {
    const metronome = new GaitMetronome({ bpm: 120 });
    metronome.start();

    // Fast-forward fake timer to trigger note scheduling for beat 0
    vi.advanceTimersByTime(25);
    // Advance mock AudioContext currentTime so scheduler picks up beat 1 (500ms per beat at 120 SPM)
    if (lastCreatedCtx) {
      lastCreatedCtx.currentTime = 0.5;
    }
    vi.advanceTimersByTime(25);

    expect(lastCreatedCtx).not.toBeNull();
    const oscCalls = (lastCreatedCtx?.createOscillator as any).mock.results;
    expect(oscCalls.length).toBeGreaterThanOrEqual(2);

    const osc0 = oscCalls[0].value as MockOscillatorNode;
    const osc1 = oscCalls[1].value as MockOscillatorNode;

    // Beat 0 (Even): Left footfall -> 880 Hz
    expect(osc0.frequency.setValueAtTime).toHaveBeenCalledWith(880, expect.any(Number));

    // Beat 1 (Odd): Right footfall -> 660 Hz
    expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(660, expect.any(Number));
  });

  it("invokes onBeat callback with incrementing beat numbers during playback", () => {
    const beatCb = vi.fn();
    const metronome = new GaitMetronome({ bpm: 120 });
    metronome.onBeat(beatCb);

    metronome.start();
    vi.advanceTimersByTime(200);

    expect(beatCb).toHaveBeenCalled();
    expect(beatCb).toHaveBeenCalledWith(0);
  });

  it("schedules frequency drop ramp (440Hz -> 330Hz) and gain envelope when playAsymmetryAlert() is called", () => {
    const metronome = new GaitMetronome();
    metronome.playAsymmetryAlert();

    expect(lastCreatedCtx).not.toBeNull();
    const oscCalls = (lastCreatedCtx?.createOscillator as any).mock.results;
    const osc = oscCalls[oscCalls.length - 1].value as MockOscillatorNode;

    expect(osc.type).toBe("sine");
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(440, expect.any(Number));
    expect(osc.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(330, expect.any(Number));
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  it("handles volume 0.0 without throwing DOMException by clamping initial gain to >= 0.0001", () => {
    const metronome = new GaitMetronome({ volume: 0.0 });
    metronome.start();
    vi.advanceTimersByTime(100);

    expect(lastCreatedCtx).not.toBeNull();
    const gainCalls = (lastCreatedCtx?.createGain as any).mock.results;
    expect(gainCalls.length).toBeGreaterThan(0);
    const gainNode = gainCalls[0].value as MockGainNode;

    // Initial gain value set at time should be at least 0.0001
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, expect.any(Number));
  });

  it("closes AudioContext and stops playback when destroy() or close() is called", () => {
    const metronome = new GaitMetronome({ bpm: 110 });
    metronome.start();
    expect(metronome.getActive()).toBe(true);
    const ctx = lastCreatedCtx;

    metronome.destroy();
    expect(metronome.getActive()).toBe(false);
    expect(ctx?.close).toHaveBeenCalled();

    // Calling close() alias
    const met2 = new GaitMetronome({ bpm: 110 });
    met2.start();
    const ctx2 = lastCreatedCtx;
    met2.close();
    expect(met2.getActive()).toBe(false);
    expect(ctx2?.close).toHaveBeenCalled();
  });
});

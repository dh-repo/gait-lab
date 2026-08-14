// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { LiveBiofeedbackHUD } from "../LiveBiofeedbackHUD";

// Spy setup for GaitMetronome
const mockStart = vi.fn();
const mockStop = vi.fn();
const mockDestroy = vi.fn();
const mockSetBpm = vi.fn();
const mockPlayAsymmetryAlert = vi.fn();
let capturedOnBeatCb: ((beat: number) => void) | null = null;

vi.mock("@/lib/gait/metronome", () => {
  return {
    GaitMetronome: vi.fn().mockImplementation(function (this: any) {
      this.start = mockStart;
      this.stop = mockStop;
      this.destroy = mockDestroy;
      this.close = mockDestroy;
      this.setBpm = mockSetBpm;
      this.playAsymmetryAlert = mockPlayAsymmetryAlert;
      this.onBeat = vi.fn().mockImplementation((cb) => {
        capturedOnBeatCb = cb;
      });
    }),
  };
});

describe("LiveBiofeedbackHUD Component Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnBeatCb = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders cadence pacing telemetry and default target values correctly", () => {
    render(<LiveBiofeedbackHUD currentCadence={108.4} targetCadence={110} />);
    expect(screen.getByText("Live Clinical Biofeedback")).toBeTruthy();
    expect(screen.getByText("108")).toBeTruthy();
    expect(screen.getByText("/ Target: 110")).toBeTruthy();
  });

  it("handles BPM slider change, updates UI target readout, and calls setBpm on metronome", () => {
    render(<LiveBiofeedbackHUD targetCadence={110} />);
    const slider = screen.getByRole("slider");
    expect((slider as HTMLInputElement).value).toBe("110");

    fireEvent.change(slider, { target: { value: "125" } });

    expect(screen.getByText("/ Target: 125")).toBeTruthy();
    expect(mockSetBpm).toHaveBeenCalledWith(125);
  });

  it("toggles metronome active state when start/stop pacing button is clicked", () => {
    render(<LiveBiofeedbackHUD targetCadence={110} />);
    const button = screen.getByRole("button", { name: /Start Pacing Metronome/i });
    expect(button).toBeTruthy();

    // Click to start metronome
    fireEvent.click(button);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Audio Pacing: 110 SPM/i })).toBeTruthy();

    // Click to stop metronome
    const activeBtn = screen.getByRole("button", { name: /Audio Pacing: 110 SPM/i });
    fireEvent.click(activeBtn);
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Start Pacing Metronome/i })).toBeTruthy();
  });

  it("renders visual beat flasher when metronome is active and toggles left/right stride indicators on beat", () => {
    render(<LiveBiofeedbackHUD targetCadence={110} />);
    expect(screen.queryByText("Left Stride (880Hz)")).toBeNull();

    // Start metronome
    fireEvent.click(screen.getByRole("button", { name: /Start Pacing Metronome/i }));

    expect(screen.getByText("Left Stride (880Hz)")).toBeTruthy();
    expect(screen.getByText("Right Stride (660Hz)")).toBeTruthy();

    // Trigger even beat (beat 0: Left downbeat 880Hz)
    if (capturedOnBeatCb) {
      act(() => {
        capturedOnBeatCb!(0);
      });
    }
    const leftDot = screen.getByText("Left Stride (880Hz)").previousElementSibling;
    expect(leftDot?.className).toContain("bg-sky-400");

    // Trigger odd beat (beat 1: Right downbeat 660Hz)
    if (capturedOnBeatCb) {
      act(() => {
        capturedOnBeatCb!(1);
      });
    }
    const rightDot = screen.getByText("Right Stride (660Hz)").nextElementSibling;
    expect(rightDot?.className).toContain("bg-rose-500");
  });

  it("renders 'Balanced' badge and neutral bar when stance ratio difference <= 6.0%", () => {
    render(<LiveBiofeedbackHUD stanceBalanceLeft={52} stanceBalanceRight={48} />);
    expect(screen.getByText("Balanced")).toBeTruthy();
    expect(screen.getByText("52% L")).toBeTruthy();
    expect(screen.getByText("48% R")).toBeTruthy();
  });

  it("renders 'Asymmetric' danger badge and triggers playAsymmetryAlert when stance ratio difference > 6.0%", () => {
    render(<LiveBiofeedbackHUD stanceBalanceLeft={65} stanceBalanceRight={35} />);
    expect(screen.getByText("Asymmetric")).toBeTruthy();
    expect(screen.getByText("65% L")).toBeTruthy();
    expect(screen.getByText("35% R")).toBeTruthy();
    expect(mockPlayAsymmetryAlert).toHaveBeenCalled();
  });

  it("omits sway warning banner when comSwayDistance <= 0.08m", () => {
    render(<LiveBiofeedbackHUD comSwayDistance={0.04} />);
    expect(screen.queryByText(/Elevated trunk lateral sway/i)).toBeNull();
  });

  it("renders high sway alert banner with converted cm distance when comSwayDistance > 0.08m", () => {
    render(<LiveBiofeedbackHUD comSwayDistance={0.12} />);
    expect(screen.getByText(/Elevated trunk lateral sway \(12\.0 cm\)\. Provide lateral stability support\./i)).toBeTruthy();
  });

  it("calls destroy on GaitMetronome when component unmounts", () => {
    const { unmount } = render(<LiveBiofeedbackHUD />);
    expect(mockDestroy).not.toHaveBeenCalled();
    unmount();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});

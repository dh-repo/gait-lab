// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CameraCalibrationAssistant } from "../CameraCalibrationAssistant";
import type { CameraPerspectiveParams } from "@/lib/gait/perspective";

afterEach(() => {
  cleanup();
});

const mockNominalParams: CameraPerspectiveParams = {
  pitchDeg: 3.2,
  yawDeg: 88.5,
  rollDeg: 0.8,
  distanceMeters: 2.85,
  cameraHeightMeters: 1.45,
  isOrthogonal: true,
  obliqueDeviationDeg: 3.2,
  warningLevel: "nominal",
  warningMessage: "Camera is optimally aligned within the orthogonal plane (Pitch: +3.2°, Yaw: 88.5°).",
  guidance: {
    heightAdjustmentCm: 0,
    tiltAdjustmentDeg: -3.2,
    yawAdjustmentDeg: 1.5,
    distanceAdjustmentM: 0,
    guidanceText: [
      "Tripod height is optimal (~1.45 m elevation).",
      "Optical azimuth alignment is nominal (88.5°).",
      "Subject distance is optimal (2.85 m).",
    ],
  },
  anthropometrics: {
    thighShankRatio: 1.05,
    torsoLegRatio: 0.59,
    normativeThighShankRatio: 1.05,
    normativeTorsoLegRatio: 0.586,
    anthroPitchDeg: 3.0,
  },
  foreshorteningFactor: 0.998,
  confidence: 0.92,
};

const mockWarningParams: CameraPerspectiveParams = {
  ...mockNominalParams,
  pitchDeg: 14.5,
  obliqueDeviationDeg: 14.5,
  isOrthogonal: false,
  warningLevel: "warning",
  warningMessage: "Non-orthogonal camera view (14.5° tilt > 10°). Sagittal angles may be foreshortened by ~9%. Perspective correction recommended.",
  guidance: {
    heightAdjustmentCm: -72.5,
    tiltAdjustmentDeg: -14.5,
    yawAdjustmentDeg: 0,
    distanceAdjustmentM: 0,
    guidanceText: [
      "Lower tripod by ~73 cm, or tilt camera up by 15° to align with hip height.",
      "Optical azimuth alignment is nominal (90.0°).",
      "Subject distance is optimal (2.85 m).",
    ],
  },
};

const mockCriticalParams: CameraPerspectiveParams = {
  ...mockNominalParams,
  pitchDeg: 24.8,
  yawDeg: 62.0,
  obliqueDeviationDeg: 28.0,
  isOrthogonal: false,
  warningLevel: "critical",
  warningMessage: "Severe non-orthogonal perspective distortion (28° tilt). Apparent sagittal angles are foreshortened by ~16%. Perspective correction is required.",
};

describe("CameraCalibrationAssistant Component", () => {
  it("renders trigger button and opens dialog when clicked", () => {
    render(<CameraCalibrationAssistant perspectiveParams={mockNominalParams} />);

    const openBtn = screen.getByTestId("open-camera-calibration-btn");
    expect(openBtn).toBeDefined();

    fireEvent.click(openBtn);

    expect(screen.getByText("Markerless Optical Camera Perspective & Calibration")).toBeDefined();
    expect(screen.getByText("Orthogonal Alignment Verified")).toBeDefined();
  });

  it("displays nominal status with green warning banner badge", () => {
    render(<CameraCalibrationAssistant perspectiveParams={mockNominalParams} initialOpen={true} />);

    const banner = screen.getByTestId("calibration-warning-banner");
    expect(banner).toBeDefined();
    expect(screen.getByText("nominal")).toBeDefined();
    expect(screen.getByText(/Camera is optimally aligned/i)).toBeDefined();
  });

  it("displays warning level (>10°) with amber alert and physical guidance", () => {
    render(<CameraCalibrationAssistant perspectiveParams={mockWarningParams} initialOpen={true} />);

    expect(screen.getByText("Non-Orthogonal Optical View (>10° Tilt)")).toBeDefined();
    expect(screen.getByText("warning")).toBeDefined();
    expect(screen.getByText(/Lower tripod by ~73 cm/i)).toBeDefined();
  });

  it("displays critical level (>20°) with severe distortion alert", () => {
    render(<CameraCalibrationAssistant perspectiveParams={mockCriticalParams} initialOpen={true} />);

    expect(screen.getByText("Severe Oblique Angle (>20° Tilt)")).toBeDefined();
    expect(screen.getByText("critical")).toBeDefined();
  });

  it("displays spirit level inclinometer gauge with SVG elements", () => {
    render(<CameraCalibrationAssistant perspectiveParams={mockNominalParams} initialOpen={true} />);

    const gauge = screen.getByLabelText("Spirit level inclinometer gauge");
    expect(gauge).toBeDefined();
    expect(screen.getByText("Dual-Axis Spirit Level Gauge")).toBeDefined();
  });

  it("toggles perspective rectification checkbox and triggers callback", () => {
    const onToggle = vi.fn();
    render(
      <CameraCalibrationAssistant
        perspectiveParams={mockNominalParams}
        initialOpen={true}
        enablePerspectiveCorrection={true}
        onTogglePerspectiveCorrection={onToggle}
      />
    );

    const toggle = screen.getByTestId("toggle-perspective-rectification") as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("switches target plane between Sagittal and Frontal", () => {
    const onUpdate = vi.fn();
    render(
      <CameraCalibrationAssistant
        perspectiveParams={mockNominalParams}
        initialOpen={true}
        onUpdateCalibrationOptions={onUpdate}
      />
    );

    const frontalBtn = screen.getByText("Frontal (0°)");
    fireEvent.click(frontalBtn);

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ targetView: "frontal" }));
  });

  it("closes modal on Apply & Close button click", () => {
    const onClose = vi.fn();
    render(
      <CameraCalibrationAssistant
        perspectiveParams={mockNominalParams}
        isOpen={true}
        onClose={onClose}
      />
    );

    const applyBtn = screen.getByTestId("apply-calibration-btn");
    fireEvent.click(applyBtn);

    expect(onClose).toHaveBeenCalled();
  });
});

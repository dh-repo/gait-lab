import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SkeletonCanvas } from "../SkeletonCanvas";
import type { CameraPerspectiveParams } from "@/lib/gait/perspective";

describe("SkeletonCanvas Accessibility & Performance Wrapper", () => {
  it("renders fixed aspect-ratio wrapper to ensure zero layout shift (CLS = 0)", () => {
    const html = renderToStaticMarkup(
      <SkeletonCanvas
        video={null}
        poses={[]}
        selectedId={null}
        personColors={{}}
      />,
    );

    expect(html).toContain('data-testid="skeleton-canvas-wrapper"');
    expect(html).toContain("aspect-video bg-black rounded-lg relative overflow-hidden");
  });

  it("renders canvas element with role='img' and descriptive aria-label", () => {
    const html = renderToStaticMarkup(
      <SkeletonCanvas
        video={null}
        poses={[{ id: 1, landmarks: [] }]}
        selectedId={1}
        personColors={{ 1: "#3b82f6" }}
        interactive={true}
      />,
    );

    expect(html).toContain('<canvas');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Pose estimation skeleton rendering canvas"');
    expect(html).toContain('tabindex="0"');
  });

  it("sets tabIndex='-1' when non-interactive", () => {
    const html = renderToStaticMarkup(
      <SkeletonCanvas
        video={null}
        poses={[]}
        selectedId={null}
        personColors={{}}
        interactive={false}
      />,
    );

    expect(html).toContain('tabindex="-1"');
  });

  it("renders spirit level bubble HUD when perspectiveParams is supplied", () => {
    const mockParams: CameraPerspectiveParams = {
      pitchDeg: 4.5,
      yawDeg: 88.0,
      rollDeg: 1.0,
      distanceMeters: 2.8,
      cameraHeightMeters: 1.4,
      isOrthogonal: true,
      obliqueDeviationDeg: 4.5,
      warningLevel: "nominal",
      warningMessage: "Optimal alignment",
      guidance: { heightAdjustmentCm: 0, tiltAdjustmentDeg: 0, yawAdjustmentDeg: 0, distanceAdjustmentM: 0, guidanceText: [] },
      anthropometrics: { thighShankRatio: 1.05, torsoLegRatio: 0.59, normativeThighShankRatio: 1.05, normativeTorsoLegRatio: 0.586, anthroPitchDeg: 4.0 },
      foreshorteningFactor: 0.997,
      confidence: 0.9,
    };

    const html = renderToStaticMarkup(
      <SkeletonCanvas
        video={null}
        poses={[]}
        selectedId={null}
        personColors={{}}
        perspectiveParams={mockParams}
        showSpiritLevel={true}
      />,
    );

    expect(html).toContain('data-testid="skeleton-spirit-level-hud"');
    expect(html).toContain("+4.5°");
    expect(html).toContain("nominal");
  });

  it("renders non-orthogonal warning banner when warningLevel is warning or critical", () => {
    const mockWarningParams: CameraPerspectiveParams = {
      pitchDeg: 14.8,
      yawDeg: 85.0,
      rollDeg: 0.0,
      distanceMeters: 3.0,
      cameraHeightMeters: 1.5,
      isOrthogonal: false,
      obliqueDeviationDeg: 14.8,
      warningLevel: "warning",
      warningMessage: "Warning tilt",
      guidance: { heightAdjustmentCm: -50, tiltAdjustmentDeg: -14.8, yawAdjustmentDeg: 5, distanceAdjustmentM: 0, guidanceText: [] },
      anthropometrics: { thighShankRatio: 1.15, torsoLegRatio: 0.55, normativeThighShankRatio: 1.05, normativeTorsoLegRatio: 0.586, anthroPitchDeg: 14.0 },
      foreshorteningFactor: 0.965,
      confidence: 0.85,
    };

    const html = renderToStaticMarkup(
      <SkeletonCanvas
        video={null}
        poses={[]}
        selectedId={null}
        personColors={{}}
        perspectiveParams={mockWarningParams}
        showTiltWarning={true}
      />,
    );

    expect(html).toContain('data-testid="skeleton-tilt-warning-banner"');
    expect(html).toContain("NON-ORTHOGONAL VIEW: +14.8° pitch tilt");
    expect(html).toContain("Correction Active");
  });
});

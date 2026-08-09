import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JointAnglesChart } from "../JointAnglesChart";
import { getNormativeGaitCurves } from "@/lib/gait/angles";
import type {
  GaitAngleAnalysis,
  JointAnglePoint,
  JointAngleMetrics,
} from "@/lib/gait/angles";

describe("JointAnglesChart Component", () => {
  const mockNormative = getNormativeGaitCurves();

  const mockNormalizedPoints: JointAnglePoint[] = Array.from({ length: 101 }, (_, i) => ({
    gaitCyclePct: i,
    kneeAngleLeft: Number((5 + 57 * Math.sin((i / 100) * Math.PI)).toFixed(1)),
    kneeAngleRight: Number((4 + 55 * Math.sin((i / 100) * Math.PI)).toFixed(1)),
    hipAngleLeft: Number((30 - 42 * (i / 100)).toFixed(1)),
    hipAngleRight: Number((28 - 40 * (i / 100)).toFixed(1)),
    ankleAngleLeft: Number((10 * Math.sin((i / 50) * Math.PI)).toFixed(1)),
    ankleAngleRight: Number((8 * Math.sin((i / 50) * Math.PI)).toFixed(1)),
  }));

  const mockMetrics: JointAngleMetrics = {
    kneeRomLeft: 62.5,
    kneeRomRight: 59.8,
    kneePeakFlexionLeft: 62.5,
    kneePeakFlexionRight: 59.8,
    kneeAsymmetryPct: 4.3,

    hipRomLeft: 42.0,
    hipRomRight: 40.0,
    hipPeakFlexionLeft: 30.0,
    hipPeakExtensionLeft: -12.0,
    hipPeakFlexionRight: 28.0,
    hipPeakExtensionRight: -12.0,
    hipAsymmetryPct: 4.8,

    ankleRomLeft: 25.0,
    ankleRomRight: 23.0,
    anklePeakDorsiflexionLeft: 10.0,
    anklePeakPlantarflexionLeft: -15.0,
    anklePeakDorsiflexionRight: 8.0,
    anklePeakPlantarflexionRight: -15.0,
    ankleAsymmetryPct: 8.0,
  };

  const validAnalysis: GaitAngleAnalysis = {
    isSuppressed: false,
    normalizedPoints: mockNormalizedPoints,
    leftStrides: [],
    rightStrides: [],
    metrics: mockMetrics,
    normativeData: mockNormative,
  };

  const suppressedAnalysis: GaitAngleAnalysis = {
    isSuppressed: true,
    suppressionReason:
      "Joint kinematic angles in the sagittal plane (flexion/extension) cannot be reliably computed from a frontal camera view.",
    normalizedPoints: [],
    leftStrides: [],
    rightStrides: [],
    metrics: mockMetrics,
    normativeData: mockNormative,
  };

  it("renders joint chart tabs (Knee, Hip, Ankle)", () => {
    const html = renderToStaticMarkup(<JointAnglesChart angleAnalysis={validAnalysis} />);

    expect(html).toContain("Joint Kinematic Angle Trajectories");
    expect(html).toContain('data-testid="tab-knee"');
    expect(html).toContain('data-testid="tab-hip"');
    expect(html).toContain('data-testid="tab-ankle"');
    expect(html).toContain("Knee");
    expect(html).toContain("Hip");
    expect(html).toContain("Ankle");
  });

  it("renders Knee joint kinematics and ROM badges by default", () => {
    const html = renderToStaticMarkup(<JointAnglesChart angleAnalysis={validAnalysis} />);

    expect(html).toContain("Perry &amp; Burnfield (2010) normative range (0–70° flexion)");
    expect(html).toContain('data-testid="rom-stat-badges"');
    expect(html).toContain('data-testid="left-peak-rom"');
    expect(html).toContain('data-testid="right-peak-rom"');
    expect(html).toContain('data-testid="peak-flexion"');
    expect(html).toContain('data-testid="peak-extension"');
    expect(html).toContain('data-testid="rom-asymmetry"');

    expect(html).toContain("Left Peak ROM: 62.5°");
    expect(html).toContain("Right Peak ROM: 59.8°");
    expect(html).toContain("Peak Flexion: L 62.5° / R 59.8°");
    expect(html).toContain("ROM Asymmetry: 4.3%");
  });

  it("renders view suppression banner when isSuppressed is true", () => {
    const html = renderToStaticMarkup(<JointAnglesChart angleAnalysis={suppressedAnalysis} />);

    expect(html).toContain('data-testid="view-suppression-banner"');
    expect(html).toContain("2D Kinematic View Angle Suppressed");
    expect(html).toContain(
      "Joint kinematic angles in the sagittal plane (flexion/extension) cannot be reliably computed from a frontal camera view.",
    );
    expect(html).not.toContain('data-testid="rom-stat-badges"');
  });

  it("renders Recharts chart components (XAxis, YAxis, Area, Line) in markup", () => {
    const html = renderToStaticMarkup(<JointAnglesChart angleAnalysis={validAnalysis} />);

    expect(html).toContain("recharts-responsive-container");
  });
});

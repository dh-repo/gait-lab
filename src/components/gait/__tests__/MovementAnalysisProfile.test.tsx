import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MovementAnalysisProfile } from "../MovementAnalysisProfile";
import { computeFullGPSAndMAP, getGPSNormativeCurves } from "@/lib/gait/gpsNormatives";
import type { GaitAngleAnalysis, JointAnglePoint } from "@/lib/gait/angles";

describe("MovementAnalysisProfile Component", () => {
  const normCurves = getGPSNormativeCurves();

  const mockHealthyPoints: JointAnglePoint[] = normCurves.map((nc) => ({
    gaitCyclePct: nc.gaitCyclePct,
    pelvicTiltAngle: nc.pelvicTiltMean,
    pelvicObliquityAngle: nc.pelvicObliquityMean,
    pelvicRotationAngle: nc.pelvicRotationMean,
    hipAngleLeft: nc.hipFlexionMean,
    hipAngleRight: nc.hipFlexionMean,
    hipAbductionLeft: nc.hipAbductionMean,
    hipAbductionRight: nc.hipAbductionMean,
    hipRotationLeft: nc.hipRotationMean,
    hipRotationRight: nc.hipRotationMean,
    kneeAngleLeft: nc.kneeFlexionMean,
    kneeAngleRight: nc.kneeFlexionMean,
    ankleAngleLeft: nc.ankleFlexionMean,
    ankleAngleRight: nc.ankleFlexionMean,
    footProgressionLeft: nc.footProgressionMean,
    footProgressionRight: nc.footProgressionMean,
  }));

  const healthyAnalysis: GaitAngleAnalysis = {
    isSuppressed: false,
    normalizedPoints: mockHealthyPoints as any,
    leftStrides: [],
    rightStrides: [],
    metrics: {} as any,
    normativeData: undefined as any,
  };

  const mockPathologicalPoints: JointAnglePoint[] = normCurves.map((nc) => ({
    gaitCyclePct: nc.gaitCyclePct,
    pelvicTiltAngle: nc.pelvicTiltMean + 6.0,
    pelvicObliquityAngle: nc.pelvicObliquityMean,
    pelvicRotationAngle: nc.pelvicRotationMean,
    hipAngleLeft: nc.hipFlexionMean + 8.0,
    hipAngleRight: nc.hipFlexionMean,
    hipAbductionLeft: nc.hipAbductionMean,
    hipAbductionRight: nc.hipAbductionMean,
    hipRotationLeft: nc.hipRotationMean,
    hipRotationRight: nc.hipRotationMean,
    kneeAngleLeft: nc.kneeFlexionMean + 12.0,
    kneeAngleRight: nc.kneeFlexionMean,
    ankleAngleLeft: nc.ankleFlexionMean - 7.0,
    ankleAngleRight: nc.ankleFlexionMean,
    footProgressionLeft: nc.footProgressionMean,
    footProgressionRight: nc.footProgressionMean,
  }));

  const pathologicalAnalysis: GaitAngleAnalysis = {
    isSuppressed: false,
    normalizedPoints: mockPathologicalPoints as any,
    leftStrides: [],
    rightStrides: [],
    metrics: {} as any,
    normativeData: undefined as any,
  };

  const suppressedAnalysis: GaitAngleAnalysis = {
    isSuppressed: true,
    suppressionReason: "Sagittal kinematics suppressed in frontal camera view.",
    normalizedPoints: [],
    leftStrides: [],
    rightStrides: [],
    metrics: {} as any,
    normativeData: [],
  };

  it("renders Executive GPS summary cards and title", () => {
    const gpsResult = computeFullGPSAndMAP(healthyAnalysis);
    const html = renderToStaticMarkup(<MovementAnalysisProfile gpsResult={gpsResult} />);

    expect(html).toContain('data-testid="movement-analysis-profile"');
    expect(html).toContain("Movement Analysis Profile (MAP) &amp; Gait Profile Score (GPS)");
    expect(html).toContain("Baker et al. (2009)");
    expect(html).toContain('data-testid="gps-overall-badge"');
    expect(html).toContain('data-testid="gps-left-value"');
    expect(html).toContain('data-testid="gps-right-value"');
    expect(html).toContain("0.0°");
    expect(html).toContain("NORMAL");
  });

  it("renders all 4 anatomical plane filter buttons with testids", () => {
    const html = renderToStaticMarkup(<MovementAnalysisProfile angleAnalysis={healthyAnalysis} />);

    expect(html).toContain('data-testid="plane-filter-all"');
    expect(html).toContain('data-testid="plane-filter-sagittal"');
    expect(html).toContain('data-testid="plane-filter-frontal"');
    expect(html).toContain('data-testid="plane-filter-transverse"');
    expect(html).toContain("All Variables (9)");
    expect(html).toContain("Sagittal");
    expect(html).toContain("Frontal");
    expect(html).toContain("Transverse");
  });

  it("renders Recharts Bar Chart container and reference indicators", () => {
    const html = renderToStaticMarkup(<MovementAnalysisProfile angleAnalysis={pathologicalAnalysis} />);

    expect(html).toContain('data-testid="map-chart-container"');
    expect(html).toContain("recharts-responsive-container");
    expect(html).toContain("Control (5.2°)");
    expect(html).toContain("MCID (1.6°)");
  });

  it("renders detailed clinical breakdown table with GVS variables", () => {
    const html = renderToStaticMarkup(<MovementAnalysisProfile angleAnalysis={healthyAnalysis} showTable={true} />);

    expect(html).toContain('data-testid="map-breakdown-table"');
    expect(html).toContain("Pelvic Tilt");
    expect(html).toContain("Pelvic Obliquity");
    expect(html).toContain("Pelvic Rotation");
    expect(html).toContain("Hip Flexion / Extension");
    expect(html).toContain("Hip Abduction / Adduction");
    expect(html).toContain("Hip Internal / External Rotation");
    expect(html).toContain("Knee Flexion / Extension");
    expect(html).toContain("Ankle Dorsi / Plantarflexion");
    expect(html).toContain("Foot Progression Angle");
  });

  it("reflects inter-limb asymmetry and severity badges for pathological gait", () => {
    const gpsResult = computeFullGPSAndMAP(pathologicalAnalysis);
    const html = renderToStaticMarkup(<MovementAnalysisProfile gpsResult={gpsResult} />);

    expect(gpsResult.asymmetryDeltaGPS).toBeGreaterThan(0);
    expect(html).toContain('data-testid="gps-asymmetry-badge"');
    expect(html).toContain("Δ L/R:");
    expect(html).toContain("Knee Flex");
  });

  it("handles suppressed input gracefully without runtime errors", () => {
    const html = renderToStaticMarkup(<MovementAnalysisProfile angleAnalysis={suppressedAnalysis} />);

    expect(html).toContain('data-testid="movement-analysis-profile"');
    expect(html).toContain("Unevaluated");
    expect(html).toContain("0.0°");
  });

  it("supports initialPlaneFilter prop (e.g. sagittal)", () => {
    const html = renderToStaticMarkup(
      <MovementAnalysisProfile angleAnalysis={healthyAnalysis} initialPlaneFilter="sagittal" />,
    );

    expect(html).toContain('data-testid="map-breakdown-table"');
    expect(html).toContain("Knee Flexion / Extension");
    // Only sagittal variables shown in breakdown table
    expect(html).not.toContain("Foot Progression Angle");
  });
});

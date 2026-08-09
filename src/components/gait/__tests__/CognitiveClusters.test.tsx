import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CognitiveClusters } from "../CognitiveClusters";
import type { GaitMetrics, DualTaskCost } from "@/lib/gait/types";

describe("CognitiveClusters Accessibility & Semantic Markup", () => {
  const mockMetrics: GaitMetrics = {
    viewAngle: "sagittal",
    viewConfidence: 0.95,
    durationSec: 10.0,
    fpsEffective: 30,
    stepCount: 18,
    cadenceSpm: 110,
    avgStepTimeSec: 0.545,
    stepTimeAsymmetry: 0.02,
    strideAsymmetry: 0.015,
    lateralSway: 0.035,
    verticalBounce: 0.028,
    armSwingLeft: 0.15,
    armSwingRight: 0.14,
    armSwingAsymmetry: 0.05,
    kneeFlexLeft: 62.0,
    kneeFlexRight: 61.5,
    kneeAsymmetry: 0.02,
    stepWidthVariability: 0.01,
    doubleSupportHint: 0.2,
    leftStancePct: 60.5,
    rightStancePct: 60.0,
    leftSwingPct: 39.5,
    rightSwingPct: 40.0,
    doubleSupportPct: 20.5,
    symmetryAngle: 1.8,
    stepTimeCV: 0.025,
    strideTimeCV: 0.02,
    pelvicObliquity: 0.01,
    pelvicObliquityVar: 0.002,
    meanStepWidth: 0.14,
    pathSmoothness: 0.94,
    stabilityScore: 88,
    rhythmScore: 92,
    symmetryScore: 94,
    mobilityScore: 90,
    automaticityScore: 91,
    overallScore: 91,
    series: [],
    stepEvents: [],
  };

  const mockDualTask: DualTaskCost = {
    cadenceCostPct: 2.5,
    cadenceDTE: 2.5,
    stepTimeCvCostPct: 3.1,
    stepTimeCvDTE: 3.1,
    stabilityCostPts: 2.0,
    automaticityCostPts: 3.0,
    cmiClassification: "no_interference",
    summary: "Minimal cognitive gait interference.",
  };

  it("renders section region landmark with descriptive aria-label", () => {
    const html = renderToStaticMarkup(
      <CognitiveClusters metrics={mockMetrics} dualTaskCost={mockDualTask} />,
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Cognitive Gait Metric Clusters"');
  });

  it("renders accordion header buttons with aria-expanded, aria-controls, and tabIndex={0}", () => {
    const html = renderToStaticMarkup(
      <CognitiveClusters metrics={mockMetrics} dualTaskCost={mockDualTask} />,
    );

    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="button"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="cluster-content-spatiotemporal"');
    expect(html).toContain('aria-controls="cluster-content-symmetry"');
    expect(html).toContain('aria-controls="cluster-content-stability"');
    expect(html).toContain('aria-controls="cluster-content-dualtask"');
  });

  it("renders progress bars with role='progressbar' and valuenow attributes", () => {
    const html = renderToStaticMarkup(
      <CognitiveClusters metrics={mockMetrics} dualTaskCost={mockDualTask} />,
    );

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="60.5"');
    expect(html).toContain('aria-valuenow="60"');
    expect(html).toContain('aria-valuenow="20.5"');
  });

  it("displays cluster status badges correctly (Normal status)", () => {
    const html = renderToStaticMarkup(
      <CognitiveClusters metrics={mockMetrics} dualTaskCost={mockDualTask} />,
    );

    expect(html).toContain('data-testid="status-badge-pace"');
    expect(html).toContain('data-testid="status-badge-symmetry"');
    expect(html).toContain('data-testid="status-badge-stability"');
    expect(html).toContain('data-testid="status-badge-dualtask"');
    expect(html).toContain("Normal");
  });
});

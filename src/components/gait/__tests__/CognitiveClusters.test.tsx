import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CognitiveClusters } from "../CognitiveClusters";
import type { GaitMetrics, DualTaskCost } from "@/lib/gait/types";
import { createMockMetrics } from "@/lib/gait/__tests__/testHelpers";

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
    expect(html).toContain('aria-label="Gait metric findings by cluster"');
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
    expect(html).toContain("Within expected range");
  });

  it("shows N/A instead of a perfect 0.0% when symmetryAngle is missing", () => {
    const { symmetryAngle: _omit, ...rest } = mockMetrics;
    const html = renderToStaticMarkup(
      <CognitiveClusters metrics={rest as GaitMetrics} dualTaskCost={mockDualTask} />,
    );

    expect(html).toContain("SA: N/A");
    // The SA tile must read N/A, never a fabricated "perfect" 0.0%.
    const saTile = html.slice(html.indexOf("Symmetry Angle (SA)"));
    expect(saTile.slice(0, saTile.indexOf("Zifchock"))).not.toContain("0.0%");
    expect(saTile.slice(0, saTile.indexOf("Zifchock"))).toContain("N/A");
  });

  it("does not fall back to the textbook 1.50 stance/swing ratio when phases are null", () => {
    const html = renderToStaticMarkup(
      <CognitiveClusters
        metrics={{ ...mockMetrics, leftStancePct: null, leftSwingPct: null }}
        dualTaskCost={mockDualTask}
      />,
    );

    expect(html).not.toContain("1.50<");
    expect(html).toContain("N/A (Requires Side View)");
  });

  it("renders an explicit not-assessed dual-task state when no dualTaskCost is supplied", () => {
    const html = renderToStaticMarkup(<CognitiveClusters metrics={mockMetrics} />);

    expect(html).toContain('data-testid="status-badge-dualtask"');
    expect(html).toContain("Not assessed");
    expect(html).toContain("Requires a paired single-task and dual-task recording");

    const dualTaskSection = html.slice(html.indexOf("4. Dual-Task Cognitive Cost"));
    expect(dualTaskSection).not.toContain("0.0%");
    expect(dualTaskSection).not.toContain("0.0 pts");
  });

  it("never renders uncalibrated distance or speed quantities", () => {
    const html = renderToStaticMarkup(
      <CognitiveClusters metrics={mockMetrics} dualTaskCost={mockDualTask} />,
    );

    expect(html).not.toContain(" m/s");
    expect(html).not.toContain("Gait Speed");
    expect(html).not.toContain("Stride Length");
    expect(html).not.toContain("Normative: 1.2");
  });

  it("renders the summary chips at all viewport widths (no hidden sm: gating)", () => {
    const html = renderToStaticMarkup(
      <CognitiveClusters metrics={mockMetrics} dualTaskCost={mockDualTask} />,
    );

    expect(html).not.toContain("hidden sm:flex");
    expect(html).toContain("110 spm");
    expect(html).toContain("CV: 2.5%");
  });
});

describe("unmeasured step timing is not fabricated", () => {
  it("shows N/A rather than a substituted default when no step intervals were recovered", () => {
    // analysis.ts sets avgStepTimeSec to 0 when mean(stepIntervals) is empty. A
    // `|| 0.5` fallback used to render "0.50 s" step time and "1.00 s" stride time
    // as if measured — indistinguishable from a real reading.
    const html = renderToStaticMarkup(
      React.createElement(CognitiveClusters, {
        metrics: createMockMetrics({ avgStepTimeSec: 0, stepCount: 0, cadenceSpm: 0 }),
      }),
    );
    expect(html).toContain("No step intervals detected");
    expect(html).not.toContain("1.00 <");
    expect(html).not.toContain("0.50 <");
  });
});

describe("dual-task chip does not assert an unrecorded task mode", () => {
  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      React.createElement(CognitiveClusters, {
        metrics: createMockMetrics(),
        ...props,
      } as never),
    );

  it("says a dual-task run has no baseline, rather than calling it a baseline", () => {
    // A dual-task clip with no paired single-task run has no dualTaskCost. The chip
    // used to print "Single-Task Baseline" here — asserting the opposite of the truth.
    const html = render({ taskMode: "dual" });
    expect(html).toContain("No baseline recorded");
    expect(html).not.toContain("Single-Task Baseline");
  });

  it("still names a genuine single-task baseline", () => {
    expect(render({ taskMode: "single" })).toContain("Single-Task Baseline");
  });

  it("claims neither when the task mode was not recorded", () => {
    const html = render({});
    expect(html).toContain("Task mode not recorded");
    expect(html).not.toContain("Single-Task Baseline");
  });
});

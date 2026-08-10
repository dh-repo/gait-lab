import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FallRiskPanel } from "../FallRiskPanel";
import type { AnalysisResult } from "@/lib/gait/types";
import { createMockMetrics } from "@/lib/gait/__tests__/testHelpers";

describe("FallRiskPanel Component UI Integration Tests", () => {
  const mockResult: AnalysisResult = {
    personId: 1,
    analyzedFrames: 300,
    taskMode: "single",
    notes: ["Test session"],
    metrics: createMockMetrics({
      gaitSpeedMps: 0.72,
      cadenceSpm: 90,
      stepTimeCV: 0.075,
      doubleSupportPct: 37.5,
      symmetryAngle: 11.2,
      lateralSway: 0.09,
      pelvicObliquityVar: 0.04,
      verticalBounce: 0.05,
    }),
    guesses: [],
  };

  it("renders FallRiskPanel main container with data-testid='fall-risk-panel'", () => {
    const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
    expect(html).toContain('data-testid="fall-risk-panel"');
    expect(html).toContain("Fall Risk &amp; Acute Motor Weakness Engine");
  });

  it("renders Model A card, Model B card, and predictive agreement badge", () => {
    const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
    expect(html).toContain('data-testid="model-a-card"');
    expect(html).toContain('data-testid="model-b-card"');
    expect(html).toContain('data-testid="predictive-agreement-badge"');
    expect(html).toContain("Model A: CDC STEADI Cutoffs");
    expect(html).toContain("Model B: Composite Index");
  });

  it("renders model comparison toggle buttons for Comparison, Model A, and Model B", () => {
    const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
    expect(html).toContain('data-testid="model-comparison-toggle"');
    expect(html).toContain('data-testid="toggle-comparison"');
    expect(html).toContain('data-testid="toggle-model-a"');
    expect(html).toContain('data-testid="toggle-model-b"');
    expect(html).toContain("Comparison View");
    expect(html).toContain("Model A (STEADI)");
    expect(html).toContain("Model B (Composite Index)");
  });

  it("renders STEADI cutoff criteria checklist in Model A card", () => {
    const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
    expect(html).toContain('data-testid="criterion-gait-speed"');
    expect(html).toContain('data-testid="criterion-step-cv"');
    expect(html).toContain('data-testid="criterion-double-support"');
    expect(html).toContain('data-testid="criterion-symmetry-angle"');
    expect(html).toContain('data-testid="model-a-points"');
  });

  it("renders sub-scores domain breakdown in Model B card", () => {
    const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
    expect(html).toContain('data-testid="subscore-kinematics"');
    expect(html).toContain('data-testid="subscore-sway"');
    expect(html).toContain('data-testid="subscore-dte"');
    expect(html).toContain('data-testid="subscore-variability"');
  });

  it("respects activeModelToggle prop when forced to modelA", () => {
    const html = renderToStaticMarkup(
      <FallRiskPanel result={mockResult} activeModelToggle="modelA" />
    );
    expect(html).toContain('data-testid="model-a-card"');
    expect(html).not.toContain('data-testid="model-b-card"');
  });

  it("respects activeModelToggle prop when forced to modelB", () => {
    const html = renderToStaticMarkup(
      <FallRiskPanel result={mockResult} activeModelToggle="modelB" />
    );
    expect(html).not.toContain('data-testid="model-a-card"');
    expect(html).toContain('data-testid="model-b-card"');
  });

  it("renders acute weakness warning cards section", () => {
    const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
    expect(html).toContain('data-testid="acute-weakness-section"');
    expect(html).toContain("Acute Neuromuscular &amp; Metabolic Weakness Diagnostics");
  });

  it("renders baseline sparklines section", () => {
    const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
    expect(html).toContain('data-testid="baseline-sparklines-section"');
    expect(html).toContain("Longitudinal Patient Baseline Deviation Sparklines");
  });

  it("renders FallRiskGaugeDial score components", () => {
    const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
    expect(html).toContain('data-testid="fall-risk-gauge-dial"');
  });

  it("handles dual-task result mode", () => {
    const dualResult: AnalysisResult = {
      ...mockResult,
      taskMode: "dual",
      dualTaskCost: {
        cadenceCostPct: 10,
        stepTimeCvCostPct: 15,
        stabilityCostPts: 5,
        automaticityCostPts: 5,
        summary: "Dual-task cost present",
        cadenceDTE: -10,
        stepTimeCvDTE: -15,
      },
    };
    const html = renderToStaticMarkup(<FallRiskPanel result={dualResult} />);
    expect(html).toContain("Dual-Task");
  });

  it("handles empty historical sessions array", () => {
    const html = renderToStaticMarkup(
      <FallRiskPanel result={mockResult} historicalSessions={[]} />
    );
    expect(html).toContain("Sessions Analyzed: 0");
  });
});

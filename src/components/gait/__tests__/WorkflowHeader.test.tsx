import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowHeader } from "../WorkflowHeader";

describe("WorkflowHeader Accessibility & Semantic Markup", () => {
  it("renders semantic header and nav landmarks with aria-label", () => {
    const html = renderToStaticMarkup(
      <WorkflowHeader currentStage={2} hasResults={false} />,
    );

    expect(html).toContain("<header");
    expect(html).toContain('<nav aria-label="Workflow progression"');
    expect(html).toContain("Gait Lab");
    expect(html).toContain("Not a medical device");
  });

  it("sets aria-current='step' on the active workflow stage button", () => {
    const html = renderToStaticMarkup(
      <WorkflowHeader currentStage={3} hasResults={true} />,
    );

    expect(html).toContain('aria-current="step"');
    expect(html).toContain('aria-label="Stage 3: Analyze - Metrics, findings &amp; kinematics"');
  });

  it("renders all 4 linear workflow stages with descriptive aria-labels", () => {
    const html = renderToStaticMarkup(
      <WorkflowHeader currentStage={1} hasResults={false} />,
    );

    expect(html).toContain("Stage 1: Capture");
    expect(html).toContain("Stage 2: Process");
    expect(html).toContain("Stage 3: Analyze");
    expect(html).toContain("Stage 4: Report");
  });
});

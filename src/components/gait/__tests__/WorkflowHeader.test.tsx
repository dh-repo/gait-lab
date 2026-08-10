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
    expect(html).not.toContain("Not a medical device");
    expect(html).toContain("Spatio-temporal gait analysis");
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

  it("gives stage-rail and new-session action the 44px touch-target utility below sm", () => {
    const html = renderToStaticMarkup(
      <WorkflowHeader
        currentStage={2}
        hasResults={true}
        onSelectStage={() => {}}
        onReset={() => {}}
      />,
    );

    // No Compare / History / filter controls — only stage rail + New session.
    expect(html).not.toContain("Filter sessions");
    expect(html).not.toContain("header-compare-button");
    expect(html).not.toContain("Open session history");
    expect(html).not.toContain("Open session comparison");

    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(5); // 4 rail + new session

    for (const button of buttons) {
      // Mobile: 44px min; desktop stage rail keeps ~48dp Material density (sm:min-h-12)
      // while the new-session ghost control can collapse (sm:min-h-0).
      expect(button).toContain("min-h-11");
      expect(button.includes("sm:min-h-0") || button.includes("sm:min-h-12")).toBe(true);
    }

    const newSession = buttons.find((b) => b.includes('aria-label="Start new session"'));
    expect(newSession).toBeTruthy();
    expect(newSession).toContain("min-w-11");
    expect(newSession).toContain("sm:min-w-0");
  });
});

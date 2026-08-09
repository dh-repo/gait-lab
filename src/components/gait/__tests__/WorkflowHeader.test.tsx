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

  it("gives stage-rail and header action buttons the 44px touch-target utility below sm", () => {
    const html = renderToStaticMarkup(
      <WorkflowHeader
        currentStage={2}
        hasResults={true}
        onSelectStage={() => {}}
        onReset={() => {}}
        onOpenHistory={() => {}}
        onOpenCompare={() => {}}
      />,
    );

    // jsdom/SSR does no layout, so assert the utility classes instead of pixels.
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(7); // 4 rail + compare + history + new session

    for (const button of buttons) {
      expect(button).toContain("min-h-11");
      expect(button).toContain("sm:min-h-0");
    }

    // Header action buttons additionally need width, since their labels are hidden below sm.
    const headerActions = buttons.filter((b) => b.includes("aria-label=\"Open session"));
    expect(headerActions).toHaveLength(2);
    for (const button of headerActions) {
      expect(button).toContain("min-w-11");
      expect(button).toContain("sm:min-w-0");
    }
  });
});

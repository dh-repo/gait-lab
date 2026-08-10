import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GaitApp } from "../GaitApp";

describe("GaitApp Accessibility & Layout Landmarks", () => {
  it("renders main landmark and Stage 1 section region", () => {
    const html = renderToStaticMarkup(<GaitApp />);

    expect(html).toContain("<main");
    expect(html).toContain('<section role="region" aria-label="Stage 1: Capture"');
    expect(html).toContain("<footer");
  });

  it("renders protocol toggle buttons with focus ring styles", () => {
    const html = renderToStaticMarkup(<GaitApp />);

    expect(html).toContain("Single-Task (Walk Only)");
    expect(html).toContain("Dual-Task (Walk + Cognitive)");
    expect(html).toContain("focus-visible:ring-2");
    // Tokenized focus ring (primary and ring share Google Blue)
    expect(
      html.includes("focus-visible:ring-[var(--color-ring)]") ||
        html.includes("focus-visible:ring-[var(--color-primary)]"),
    ).toBe(true);
  });
});

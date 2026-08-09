import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricsPanel } from "../MetricsPanel";
import { createMockMetrics } from "@/lib/gait/__tests__/testHelpers";

/**
 * Variability metrics (step-time CV, stride-time CV) have error scaling as
 * 1/sqrt(strides). Measured on synthetic walks with a known true CV of 0.060:
 * ~9 strides recovers 0.0496 with a 0.0147 between-run SD (24% relative error,
 * 17% low bias); ~18 strides recovers 0.0551 with a 0.0086 SD (14%).
 * The stride count is therefore as load-bearing as the value, and must be shown.
 */
describe("MetricsPanel variability sample-size disclosure", () => {
  it("reports the stride count the CV estimates rest on", () => {
    const html = renderToStaticMarkup(
      React.createElement(MetricsPanel, { metrics: createMockMetrics({ stepCount: 36 }) }),
    );
    expect(html).toContain("from 18 strides");
  });

  it("warns when the stride count is too low to support the estimate", () => {
    const html = renderToStaticMarkup(
      React.createElement(MetricsPanel, { metrics: createMockMetrics({ stepCount: 16 }) }),
    );
    expect(html).toContain("from 8 strides");
    expect(html).toContain("indicative");
  });

  it("does not warn once the stride count is adequate", () => {
    const html = renderToStaticMarkup(
      React.createElement(MetricsPanel, { metrics: createMockMetrics({ stepCount: 40 }) }),
    );
    expect(html).toContain("from 20 strides");
    expect(html).not.toContain("indicative");
  });

  it("omits the basis line entirely when no steps were detected", () => {
    const html = renderToStaticMarkup(
      React.createElement(MetricsPanel, { metrics: createMockMetrics({ stepCount: 0 }) }),
    );
    expect(html).not.toContain("strides");
  });
});

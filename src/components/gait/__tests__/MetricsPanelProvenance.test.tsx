import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricsPanel } from "../MetricsPanel";
import { createMockMetrics } from "@/lib/gait/__tests__/testHelpers";

/**
 * The panel groups metrics by provenance so a directly measured cadence and a
 * clip duration no longer carry identical visual weight. The grouping is purely
 * a hierarchy fix: every tile still renders unconditionally, with no interaction.
 */
function render(overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(MetricsPanel, { metrics: createMockMetrics(overrides) }),
  );
}

const BAND_HEADINGS = [
  "Directly measured",
  "Uncalibrated indices",
  "Composite research indices (unvalidated weighting)",
  "Recording context (not scored)",
];

describe("MetricsPanel provenance bands", () => {
  it("renders all four provenance band headings", () => {
    const html = render({ stepCount: 36 });
    for (const heading of BAND_HEADINGS) {
      expect(html).toContain(heading);
    }
  });

  it("orders the bands measured -> uncalibrated -> composite -> context", () => {
    const html = render({ stepCount: 36 });
    const positions = BAND_HEADINGS.map((h) => html.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  it("places the score rings below the directly measured band", () => {
    const html = render({ stepCount: 36 });
    expect(html.indexOf("Directly measured")).toBeLessThan(
      html.indexOf("Composite research indices (unvalidated weighting)"),
    );
    // The honest disclaimer stays attached to the rings.
    expect(html).toContain("Secondary 0–100 research indices — not clinical scores or a diagnosis.");
    for (const label of ["Overall", "Stability", "Symmetry", "Rhythm", "Mobility", "Automaticity"]) {
      expect(html).toContain(label);
    }
  });

  it("puts Steps detected and Clip duration in the recording-context band, marked '(context, not scored)'", () => {
    const html = render({ stepCount: 36 });
    const contextStart = html.indexOf("Recording context (not scored)");
    expect(contextStart).toBeGreaterThan(-1);
    const contextBand = html.slice(contextStart);
    expect(contextBand).toContain("(context, not scored)");
    expect(contextBand).toContain("Steps detected");
    expect(contextBand).toContain("Clip duration");
    // and they are not sitting up in the directly measured band
    const measured = html.slice(
      html.indexOf("Directly measured"),
      html.indexOf("Uncalibrated indices"),
    );
    expect(measured).not.toContain("Steps detected");
    expect(measured).not.toContain("Clip duration");
  });

  it("renders the label 'Automaticity' exactly once (duplicate Stat tile removed)", () => {
    const html = render({ stepCount: 36 });
    const occurrences = html.split("Automaticity").length - 1;
    expect(occurrences).toBe(1);
    // The old duplicate tile rendered the score with a '/100' unit.
    expect(html).not.toContain("/100");
  });

  it("renders every uncalibrated tile in the initial markup with no interaction", () => {
    const html = render({ stepCount: 36 });
    const start = html.indexOf("Uncalibrated indices");
    const end = html.indexOf("Composite research indices (unvalidated weighting)");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const band = html.slice(start, end);
    for (const label of [
      "Lateral sway",
      "Vertical bounce",
      "Pelvic obliquity",
      "Mean step width",
      "Arm swing L",
      "Arm swing R",
      "Path smoothness",
    ]) {
      expect(band).toContain(label);
    }
    expect(band).toContain(
      "No calibrated scale. Interpret only as change against this subject&#x27;s own earlier session; the absolute value has no reference range.",
    );
  });

  it("hides nothing behind a disclosure widget", () => {
    const html = render({ stepCount: 36 });
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<summary");
    expect(html).not.toContain("aria-expanded");
  });

  it("keeps both CV tiles, with their stride basis, inside the directly measured band", () => {
    const html = render({ stepCount: 36 });
    const measured = html.slice(
      html.indexOf("Directly measured"),
      html.indexOf("Uncalibrated indices"),
    );
    expect(measured).toContain("Step-time CV");
    expect(measured).toContain("Stride-time CV");
    expect(measured).toContain("from 18 strides");
  });

  it("does not introduce any meaningful-change or MDC threshold", () => {
    const html = render({ stepCount: 36 });
    expect(html).not.toContain("MDC");
    expect(html.toLowerCase()).not.toContain("meaningful change");
    expect(html.toLowerCase()).not.toContain("minimal detectable");
  });
});

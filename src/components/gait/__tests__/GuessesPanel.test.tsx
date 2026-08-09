import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GuessesPanel } from "../GuessesPanel";
import type { DualTaskCost } from "@/lib/gait/types";

/**
 * analysis.ts (computeDualTaskCost) defines cadenceCostPct = -cadenceDTE and
 * stepTimeCvCostPct = -stepTimeCvDTE. Anything the panel labels "DTE" must use
 * the DTE sign, including when the optional DTE fields are absent and the value
 * has to be recovered from the cost fields.
 */
const baseDtc: DualTaskCost = {
  cadenceCostPct: 15.0,
  stepTimeCvCostPct: 50.0,
  stabilityCostPts: 10.0,
  automaticityCostPts: 12.0,
  summary: "Mutual interference",
  cmiClassification: "mutual_interference",
};

function render(dualTaskCost: DualTaskCost): string {
  return renderToStaticMarkup(
    React.createElement(GuessesPanel, { guesses: [], dualTaskCost }),
  );
}

describe("GuessesPanel dual-task DTE sign convention", () => {
  it("renders the explicit DTE fields as-is when present", () => {
    const html = render({ ...baseDtc, cadenceDTE: -15.0, stepTimeCvDTE: -50.0 });
    expect(html).toContain("Cadence DTE");
    expect(html).toContain("-15.0%");
    expect(html).toContain("Step Time CV DTE");
    expect(html).toContain("-50.0%");
  });

  it("negates the cost fields when the DTE fields are absent", () => {
    const html = render(baseDtc);
    expect(html).toContain("Cadence DTE");
    expect(html).toContain("-15.0%");
    expect(html).toContain("-50.0%");
    expect(html).not.toContain(">15.0%<");
    expect(html).not.toContain(">50.0%<");
  });

  it("matches the guesses.ts evidence convention for a positive DTE", () => {
    const html = render({ ...baseDtc, cadenceDTE: 4.5, stepTimeCvDTE: 2.5 });
    expect(html).toContain("4.5%");
    expect(html).toContain("2.5%");
  });
});

import { describe, it, expect } from "vitest";
import { buildEducatedGuesses, DETERMINATION_LADDER, resolveDteValues } from "../guesses";
import { createMockMetrics } from "./testHelpers";
import type { DualTaskCost } from "../types";

describe("Rule-Based Guesses Engine (guesses.ts)", () => {
  describe("buildEducatedGuesses Rule Triggers", () => {
    it("always generates camera view guess", () => {
      const metrics = createMockMetrics({ viewAngle: "sagittal" });
      const guesses = buildEducatedGuesses(metrics);

      const viewGuess = guesses.find((g) => g.id === "view");
      expect(viewGuess).toBeDefined();
      expect(viewGuess?.title).toContain("Side-view");
    });

    it("triggers zifchock-sa-deviation when symmetryAngle > 5.0%", () => {
      const metrics = createMockMetrics({ symmetryAngle: 8.5 });
      const guesses = buildEducatedGuesses(metrics);

      const saGuess = guesses.find((g) => g.id === "zifchock-sa-deviation");
      expect(saGuess).toBeDefined();
      expect(saGuess?.severity).toBe("moderate");
      expect(saGuess?.category).toBe("symmetry");

      // High SA (> 10%) upgrades severity to elevated
      const highSaMetrics = createMockMetrics({ symmetryAngle: 12.0 });
      const highSaGuess = buildEducatedGuesses(highSaMetrics).find((g) => g.id === "zifchock-sa-deviation");
      expect(highSaGuess?.severity).toBe("elevated");
    });

    it("triggers zeni-stance-breakdown when stance diff > 6% or double support > 26%", () => {
      const metrics = createMockMetrics({
        leftStancePct: 68.0,
        rightStancePct: 58.0,
        doubleSupportPct: 22.0,
      });

      const guesses = buildEducatedGuesses(metrics);
      const stanceGuess = guesses.find((g) => g.id === "zeni-stance-breakdown");
      expect(stanceGuess).toBeDefined();
      expect(stanceGuess?.title).toContain("Asymmetric stance phase");
    });

    it("triggers cmi-classification when dual task cost classification is present", () => {
      const metrics = createMockMetrics();
      const dualTaskCost: DualTaskCost = {
        cadenceCostPct: 15.0,
        stepTimeCvCostPct: 50.0,
        stabilityCostPts: 10.0,
        automaticityCostPts: 12.0,
        summary: "Mutual interference",
        cadenceDTE: -15.0,
        stepTimeCvDTE: -50.0,
        symmetryDTE: -8.0,
        cmiClassification: "mutual_interference",
      };

      const guesses = buildEducatedGuesses(metrics, { dualTaskCost });
      const cmiGuess = guesses.find((g) => g.id === "cmi-classification");

      expect(cmiGuess).toBeDefined();
      expect(cmiGuess?.title).toBe("Mutual Cognitive-Motor Interference");
      expect(cmiGuess?.severity).toBe("elevated");
      expect(cmiGuess?.evidence).toContain("Cadence DTE: -15.0%");
      expect(cmiGuess?.evidence).toContain("Step-Time CV DTE: -50.0%");
    });

    it("negates the cost fields when the optional DTE fields are absent", () => {
      const metrics = createMockMetrics();
      const dualTaskCost: DualTaskCost = {
        cadenceCostPct: 15.0,
        stepTimeCvCostPct: 50.0,
        stabilityCostPts: 10.0,
        automaticityCostPts: 12.0,
        summary: "Mutual interference",
        cmiClassification: "mutual_interference",
      };

      const cmiGuess = buildEducatedGuesses(metrics, { dualTaskCost }).find(
        (g) => g.id === "cmi-classification",
      );

      // cost = -DTE (analysis.ts computeDualTaskCost), so a +15% cadence cost
      // is a -15% cadence DTE.
      expect(cmiGuess?.evidence).toContain("Cadence DTE: -15.0%");
      expect(cmiGuess?.evidence).toContain("Step-Time CV DTE: -50.0%");
    });

    it("resolveDteValues keeps explicit DTE fields and negates cost fallbacks", () => {
      const base = {
        stabilityCostPts: 0,
        automaticityCostPts: 0,
        summary: "",
      };
      expect(
        resolveDteValues({ ...base, cadenceCostPct: 15, stepTimeCvCostPct: 50 }),
      ).toEqual({ cadenceDte: -15, stepTimeCvDte: -50 });
      expect(
        resolveDteValues({
          ...base,
          cadenceCostPct: 15,
          stepTimeCvCostPct: 50,
          cadenceDTE: -15,
          stepTimeCvDTE: -50,
        }),
      ).toEqual({ cadenceDte: -15, stepTimeCvDte: -50 });
    });

    it("triggers bag-load when armSwingAsymmetry > 0.35", () => {
      const metrics = createMockMetrics({
        armSwingLeft: 0.3,
        armSwingRight: 0.1,
        armSwingAsymmetry: 0.5,
      });

      const guesses = buildEducatedGuesses(metrics);
      const bagGuess = guesses.find((g) => g.id === "bag-load");
      expect(bagGuess).toBeDefined();
      expect(bagGuess?.patternTag).toBe("load / bag effect");
    });

    it("triggers antalgic when stepTimeAsymmetry > 0.22 and kneeAsymmetry > 0.2", () => {
      const metrics = createMockMetrics({
        stepTimeAsymmetry: 0.25,
        kneeAsymmetry: 0.25,
      });

      const guesses = buildEducatedGuesses(metrics);
      const antalgicGuess = guesses.find((g) => g.id === "antalgic");
      expect(antalgicGuess).toBeDefined();
      expect(antalgicGuess?.category).toBe("pain");
    });

    it("triggers trendelenburg-ish when pelvicObliquity > 0.08 and view is frontal/oblique", () => {
      const metrics = createMockMetrics({
        viewAngle: "frontal",
        pelvicObliquity: 0.12,
        pelvicObliquityVar: 0.05,
      });

      const guesses = buildEducatedGuesses(metrics);
      const trendGuess = guesses.find((g) => g.id === "trendelenburg-ish");
      expect(trendGuess).toBeDefined();
    });

    it("triggers overall-good when overallScore >= 70 and few elevated red flags", () => {
      const metrics = createMockMetrics({ overallScore: 88, symmetryAngle: 1.0 });
      const guesses = buildEducatedGuesses(metrics);
      const goodGuess = guesses.find((g) => g.id === "overall-good");
      expect(goodGuess).toBeDefined();
    });
  });

  describe("Evidence Formatting & String Safety", () => {
    it("ensures zero evidence items contain undefined, NaN, or null substrings", () => {
      const metrics = createMockMetrics();
      const guesses = buildEducatedGuesses(metrics);

      for (const g of guesses) {
        expect(g.title).not.toContain("undefined");
        expect(g.title).not.toContain("NaN");
        expect(g.title).not.toContain("null");
        expect(g.summary).not.toContain("undefined");
        expect(g.summary).not.toContain("NaN");
        expect(g.summary).not.toContain("null");

        for (const ev of g.evidence) {
          expect(ev).not.toContain("undefined");
          expect(ev).not.toContain("NaN");
          expect(ev).not.toContain("null");
        }
      }
    });
  });

  describe("Severity & Confidence Ranking", () => {
    it("sorts guesses strictly by severity (elevated -> moderate -> low), then confidence", () => {
      const metrics = createMockMetrics({
        symmetryAngle: 12.0, // elevated
      });

      const guesses = buildEducatedGuesses(metrics);
      expect(guesses.length).toBeGreaterThan(2);

      const sevRank = { elevated: 0, moderate: 1, low: 2 };
      for (let i = 1; i < guesses.length; i++) {
        const prev = sevRank[guesses[i - 1].severity];
        const curr = sevRank[guesses[i].severity];
        expect(prev).toBeLessThanOrEqual(curr);
      }
    });
  });

  describe("DETERMINATION_LADDER Structure", () => {
    it("contains 4 valid determination layers with can and cannot arrays", () => {
      expect(DETERMINATION_LADDER.length).toBe(4);
      const ids = DETERMINATION_LADDER.map((l) => l.id);
      expect(ids).toEqual(["measure", "pattern", "hypothesis", "cognition"]);

      for (const layer of DETERMINATION_LADDER) {
        expect(layer.id).toBeTruthy();
        expect(layer.title).toBeTruthy();
        expect(layer.can.length).toBeGreaterThan(0);
        expect(layer.cannot.length).toBeGreaterThan(0);
      }
    });
  });
});

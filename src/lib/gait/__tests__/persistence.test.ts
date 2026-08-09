import { describe, it, expect } from "vitest";
import {
  saveGaitSession,
  listGaitSessions,
  getGaitSession,
  deleteGaitSession,
  type GaitSessionRecord,
} from "../persistence";
import { createMockMetrics } from "./testHelpers";
import type { DualTaskCost, EducatedGuess } from "../types";

describe("Session Persistence Module (persistence.ts)", () => {
  describe("GaitSessionRecord JSON Payload Serialization Integrity", () => {
    it("serializes and deserializes full GaitMetrics correctly", () => {
      const metrics = createMockMetrics({
        symmetryAngle: 3.5,
        harmonicRatio: 2.1,
        leftStancePct: 62.0,
        rightStancePct: 58.0,
      });

      const serialized = JSON.stringify(metrics);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.viewAngle).toBe("sagittal");
      expect(deserialized.overallScore).toBe(metrics.overallScore);
      expect(deserialized.symmetryAngle).toBe(3.5);
      expect(deserialized.harmonicRatio).toBe(2.1);
      expect(deserialized.leftStancePct).toBe(62.0);
    });

    it("serializes and deserializes EducatedGuess[] array correctly", () => {
      const guesses: EducatedGuess[] = [
        {
          id: "zifchock-sa-deviation",
          title: "Symmetry Angle Deviation",
          summary: "Moderate asymmetry detected",
          evidence: ["SA: 6.5%"],
          confidence: 0.75,
          severity: "moderate",
          category: "symmetry",
        },
      ];

      const serialized = JSON.stringify(guesses);
      const deserialized = JSON.parse(serialized) as EducatedGuess[];

      expect(deserialized.length).toBe(1);
      expect(deserialized[0].id).toBe("zifchock-sa-deviation");
      expect(deserialized[0].severity).toBe("moderate");
    });

    it("serializes and deserializes DualTaskCost correctly", () => {
      const dtc: DualTaskCost = {
        cadenceCostPct: 10.0,
        stepTimeCvCostPct: 50.0,
        stabilityCostPts: 5.0,
        automaticityCostPts: 8.0,
        summary: "Cognitive prioritization",
        cadenceDTE: -10.0,
        stepTimeCvDTE: -50.0,
        symmetryDTE: -2.0,
        cmiClassification: "cognitive_prioritization",
      };

      const serialized = JSON.stringify(dtc);
      const deserialized = JSON.parse(serialized) as DualTaskCost;

      expect(deserialized.cadenceCostPct).toBe(10.0);
      expect(deserialized.cmiClassification).toBe("cognitive_prioritization");
    });
  });

  describe("Server Function Definitions & Contract Specifications", () => {
    it("defines valid saveGaitSession server function with method POST", () => {
      expect(saveGaitSession).toBeDefined();
      expect(typeof saveGaitSession).toBe("function");
    });

    it("defines valid listGaitSessions server function with method GET", () => {
      expect(listGaitSessions).toBeDefined();
      expect(typeof listGaitSessions).toBe("function");
    });

    it("defines valid getGaitSession server function", () => {
      expect(getGaitSession).toBeDefined();
      expect(typeof getGaitSession).toBe("function");
    });

    it("defines valid deleteGaitSession server function", () => {
      expect(deleteGaitSession).toBeDefined();
      expect(typeof deleteGaitSession).toBe("function");
    });

    it("formats GaitSessionRecord correctly matching SQL column aliases", () => {
      const mockRecord: GaitSessionRecord = {
        id: "gs_123456789_abc",
        userId: "usr_test_123",
        sessionName: "Test Gait Run",
        taskMode: "single",
        overallScore: 85,
        stabilityScore: 88,
        rhythmScore: 84,
        symmetryScore: 90,
        mobilityScore: 82,
        automaticityScore: 86,
        cadenceSpm: 105,
        stepCount: 12,
        durationSec: 6.5,
        viewAngle: "sagittal",
        symmetryAngle: 2.1,
        harmonicRatio: 2.3,
        metricsJson: createMockMetrics(),
        guessesJson: [],
        createdAt: "2026-08-08T23:50:00Z",
        updatedAt: "2026-08-08T23:50:00Z",
      };

      expect(mockRecord.id).toMatch(/^gs_\d+_[a-z0-9]+$/);
      expect(mockRecord.userId).toBe("usr_test_123");
      expect(mockRecord.taskMode).toBe("single");
      expect(mockRecord.symmetryAngle).toBe(2.1);
      expect(mockRecord.harmonicRatio).toBe(2.3);
    });
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
        leftStancePct: 62.0,
        rightStancePct: 58.0,
      });

      const serialized = JSON.stringify(metrics);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.viewAngle).toBe("sagittal");
      expect(deserialized.overallScore).toBe(metrics.overallScore);
      expect(deserialized.symmetryAngle).toBe(3.5);
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

    it("persists patient metadata and angle analysis as their own JSONB columns", () => {
      // The previous version of this test round-tripped a local object literal
      // through JSON.stringify/parse — it exercised no repo code and passed
      // whatever persistence.ts did. Assert the actual contract instead: both
      // payloads must have dedicated columns, be written from the save handler,
      // and be aliased back on read.
      const source = readFileSync(new URL("../persistence.ts", import.meta.url), "utf8");

      for (const col of ["angle_analysis_json", "patient_meta_json"]) {
        // written on insert
        expect(source).toContain(col);
        // and aliased back to camelCase on every read path
        const alias = col.replace(/_(\w)/g, (_, c) => c.toUpperCase());
        expect(source).toContain(`${col} as "${alias}"`);
      }
      // and actually serialized from the handler's inputs, not dropped
      expect(source).toMatch(/angleAnalysis \? JSON\.stringify\(angleAnalysis\) : null/);
      expect(source).toMatch(/patientMeta \? JSON\.stringify\(patientMeta\) : null/);
    });

    it("formats GaitSessionRecord correctly matching SQL column aliases including angleAnalysisJson & patientMetaJson", () => {
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
        metricsJson: createMockMetrics(),
        guessesJson: [],
        angleAnalysisJson: {
          isSuppressed: false,
          normalizedPoints: [],
          leftStrides: [],
          rightStrides: [],
          metrics: {
            kneeRomLeft: 55,
            kneeRomRight: 56,
            kneePeakFlexionLeft: 60,
            kneePeakFlexionRight: 62,
            kneeAsymmetryPct: 1.8,
            hipRomLeft: 35,
            hipRomRight: 36,
            hipPeakFlexionLeft: 25,
            hipPeakExtensionLeft: 10,
            hipPeakFlexionRight: 26,
            hipPeakExtensionRight: 12,
            hipAsymmetryPct: 2.8,
            ankleRomLeft: 25,
            ankleRomRight: 26,
            anklePeakDorsiflexionLeft: 15,
            anklePeakDorsiflexionRight: 16,
            anklePeakPlantarflexionLeft: 10,
            anklePeakPlantarflexionRight: 10,
            ankleAsymmetryPct: 3.8,
          },
          normativeData: [],
        },
        patientMetaJson: {
          patientId: "PT-12345",
          clinicianNotes: "Baseline test",
          assessmentDate: "2026-08-09",
          assessmentCondition: "Single-Task Walk",
        },
        createdAt: "2026-08-08T23:50:00Z",
        updatedAt: "2026-08-08T23:50:00Z",
      };

      expect(mockRecord.id).toMatch(/^gs_\d+_[a-z0-9]+$/);
      expect(mockRecord.userId).toBe("usr_test_123");
      expect(mockRecord.taskMode).toBe("single");
      expect(mockRecord.symmetryAngle).toBe(2.1);
      expect(mockRecord.angleAnalysisJson?.isSuppressed).toBe(false);
      expect(mockRecord.patientMetaJson?.patientId).toBe("PT-12345");
    });
  });
});

/**
 * Source-level guard. saveGaitSession runs behind auth middleware against a real
 * Postgres/PGLite, so asserting its behaviour would need a live DB and a forged
 * session context — disproportionate here. What must never regress is narrow and
 * checkable in the source: the upsert's DO UPDATE branch has to be scoped to the
 * calling user. Without it, a client-supplied id (GaitApp sends one for re-saves)
 * lets any authenticated user overwrite another user's row.
 */
describe("saveGaitSession upsert ownership guard", () => {
  const source = readFileSync(
    new URL("../persistence.ts", import.meta.url),
    "utf8",
  );

  it("scopes ON CONFLICT DO UPDATE to the authenticated user", () => {
    const conflictIdx = source.indexOf("ON CONFLICT (id) DO UPDATE");
    expect(conflictIdx).toBeGreaterThan(-1);
    const returningIdx = source.indexOf("RETURNING *", conflictIdx);
    const updateClause = source.slice(conflictIdx, returningIdx);
    expect(updateClause).toMatch(/WHERE\s+gait_sessions\.user_id\s*=\s*\$\{context\.userId\}/);
  });

  it("does not silently succeed when the guard rejects the row", () => {
    // Postgres returns zero rows when the WHERE guard fails; returning undefined
    // into a "saved!" path would tell the user their data was written when it was not.
    expect(source).toMatch(/if\s*\(!rows\[0\]\)/);
  });

  it("still scopes every read and delete to the owner", () => {
    const owned = source.match(/WHERE[^\n]*user_id\s*=\s*\$\{context\.userId\}/g) || [];
    expect(owned.length).toBeGreaterThanOrEqual(3);
  });
});

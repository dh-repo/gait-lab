import { describe, it, expect } from "vitest";
import * as serverPersistence from "../persistence.server";
import * as basePersistence from "../persistence";
import {
  saveGaitSession,
  listGaitSessions,
  listPatientSessions,
  getGaitSession,
  deleteGaitSession,
  getPersistenceMode,
} from "../persistence.server";

describe("Gait Persistence Server Entrypoint (persistence.server.ts)", () => {
  describe("Re-Export Completeness & Integrity", () => {
    it("re-exports all core persistence methods from ./persistence", () => {
      expect(serverPersistence.saveGaitSession).toBe(basePersistence.saveGaitSession);
      expect(serverPersistence.listGaitSessions).toBe(basePersistence.listGaitSessions);
      expect(serverPersistence.listPatientSessions).toBe(basePersistence.listPatientSessions);
      expect(serverPersistence.getGaitSession).toBe(basePersistence.getGaitSession);
      expect(serverPersistence.deleteGaitSession).toBe(basePersistence.deleteGaitSession);
      expect(serverPersistence.getPersistenceMode).toBe(basePersistence.getPersistenceMode);
    });

    it("maintains function type definitions for all exported server functions", () => {
      expect(typeof saveGaitSession).toBe("function");
      expect(typeof listGaitSessions).toBe("function");
      expect(typeof listPatientSessions).toBe("function");
      expect(typeof getGaitSession).toBe("function");
      expect(typeof deleteGaitSession).toBe("function");
      expect(typeof getPersistenceMode).toBe("function");
    });
  });

  describe("Server Function Structure & Handlers", () => {
    it("exposes callable server functions matching TanStack Start server function contract", () => {
      const serverFunctions = [
        saveGaitSession,
        listGaitSessions,
        listPatientSessions,
        getGaitSession,
        deleteGaitSession,
        getPersistenceMode,
      ];
      for (const fn of serverFunctions) {
        expect(fn).toBeDefined();
        expect(typeof fn).toBe("function");
      }
    });
  });
});

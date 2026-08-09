// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  SessionComparisonView,
  computeDelta,
} from "../SessionComparisonView";
import type { GaitSessionRecord } from "@/lib/gait/persistence";
import { listGaitSessions } from "@/lib/gait/persistence";
import type { GaitMetrics } from "@/lib/gait/types";
import { getNormativeGaitCurves, type GaitAngleAnalysis } from "@/lib/gait/angles";

// The component calls the `listGaitSessions` server fn directly when no
// `sessions` prop is supplied. Mock the persistence module so the fetch path is
// exercised without a database or an authenticated request context.
vi.mock("@/lib/gait/persistence", () => ({
  listGaitSessions: vi.fn(),
  deleteGaitSession: vi.fn(),
  saveGaitSession: vi.fn(),
  getGaitSession: vi.fn(),
}));

const mockListGaitSessions = vi.mocked(
  listGaitSessions as unknown as () => Promise<GaitSessionRecord[]>,
);

/**
 * Recharts' <ResponsiveContainer> measures its parent via ResizeObserver, which
 * jsdom does not implement. Without a size it renders nothing, so stub an
 * observer that reports a fixed box on observe().
 */
function installResizeObserverStub(width = 800, height = 400) {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: height,
  });
  globalThis.ResizeObserver = class {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(el: Element) {
      this.cb(
        [
          {
            target: el,
            contentRect: {
              width,
              height,
              top: 0,
              left: 0,
              right: width,
              bottom: height,
              x: 0,
              y: 0,
            },
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/**
 * Extracts the ordered x coordinates of each vertex from an SVG path "d"
 * attribute. Recharts renders `type="monotone"` lines as cubic segments, so the
 * vertex is the *last* coordinate pair of every command.
 */
function pathXCoords(d: string): number[] {
  const xs: number[] = [];
  for (const seg of d.matchAll(/([MLCQ])([^MLCQZ]*)/g)) {
    const pairs = Array.from(
      seg[2].matchAll(/(-?[\d.]+(?:e-?\d+)?),(-?[\d.]+(?:e-?\d+)?)/g),
    );
    if (pairs.length === 0) continue;
    xs.push(Number(pairs[pairs.length - 1][1]));
  }
  return xs;
}

describe("SessionComparisonView Component & Delta Engine", () => {
  const mockNormative = getNormativeGaitCurves();

  const createMockAngleAnalysis = (isSuppressed = false): GaitAngleAnalysis => ({
    isSuppressed,
    suppressionReason: isSuppressed
      ? "Frontal view camera recording detected. Sagittal plane joint angles are suppressed."
      : undefined,
    normalizedPoints: Array.from({ length: 101 }, (_, i) => ({
      gaitCyclePct: i,
      kneeAngleLeft: 5 + 50 * Math.sin((i / 100) * Math.PI),
      kneeAngleRight: 4 + 48 * Math.sin((i / 100) * Math.PI),
      hipAngleLeft: 30 - 40 * (i / 100),
      hipAngleRight: 28 - 38 * (i / 100),
      ankleAngleLeft: 10 * Math.sin((i / 50) * Math.PI),
      ankleAngleRight: 8 * Math.sin((i / 50) * Math.PI),
    })),
    leftStrides: [],
    rightStrides: [],
    metrics: {
      kneeRomLeft: 60,
      kneeRomRight: 58,
      kneePeakFlexionLeft: 60,
      kneePeakFlexionRight: 58,
      kneeAsymmetryPct: 3.4,
      hipRomLeft: 40,
      hipRomRight: 38,
      hipPeakFlexionLeft: 28,
      hipPeakExtensionLeft: -12,
      hipPeakFlexionRight: 26,
      hipPeakExtensionRight: -12,
      hipAsymmetryPct: 5.2,
      ankleRomLeft: 24,
      ankleRomRight: 22,
      anklePeakDorsiflexionLeft: 10,
      anklePeakPlantarflexionLeft: -14,
      anklePeakDorsiflexionRight: 8,
      anklePeakPlantarflexionRight: -14,
      ankleAsymmetryPct: 8.7,
    },
    normativeData: mockNormative,
  });

  const sessionA: GaitSessionRecord = {
    id: "session-001",
    userId: "user-1",
    sessionName: "Baseline Walk (Single-Task)",
    taskMode: "single",
    overallScore: 78.5,
    mobilityScore: 80.0,
    symmetryScore: 76.0,
    stabilityScore: 75.0,
    rhythmScore: 82.0,
    automaticityScore: 79.0,
    cadenceSpm: 104.0,
    stepCount: 42,
    durationSec: 24.2,
    viewAngle: "sagittal",
    symmetryAngle: 3.8,
    metricsJson: ({
      cadenceSpm: 104.0,
      stepCount: 42,
      durationSec: 24.2,
      avgStepTimeSec: 0.577,
      doubleSupportPct: 22.4,
      symmetryAngle: 3.8,
      stepTimeCV: 0.042,
      strideTimeCV: 0.039,
      stepTimeAsymmetry: 0.024,
      pathSmoothness: 0.85,
      verticalBounce: 0.045,
      overallScore: 78.5,
      mobilityScore: 80.0,
      symmetryScore: 76.0,
      stabilityScore: 75.0,
      rhythmScore: 82.0,
      automaticityScore: 79.0,
      viewAngle: "sagittal",
      viewConfidence: 0.9,
      fpsEffective: 30,
      strideAsymmetry: 0.02,
      lateralSway: 0.03,
      armSwingLeft: 0.2,
      armSwingRight: 0.2,
      armSwingAsymmetry: 0.01,
      kneeFlexLeft: 60,
      kneeFlexRight: 58,
      kneeAsymmetry: 0.03,
      stepWidthVariability: 0.02,
      doubleSupportHint: 0.2,
      stepTimeCVCostPct: 0,
      stabilityCostPts: 0,
      automaticityCostPts: 0,
      series: [],
      stepEvents: [],
    } as unknown as GaitMetrics),
    guessesJson: [],
    dualTaskJson: undefined,
    angleAnalysisJson: createMockAngleAnalysis(false),
    patientMetaJson: {
      patientId: "PT-1001",
      assessmentDate: "2026-08-01",
      assessmentCondition: "Baseline Single-Task",
      clinicianNotes: "Initial baseline evaluation",
    },
    createdAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-01T10:00:00Z",
  };

  const sessionB: GaitSessionRecord = {
    id: "session-002",
    userId: "user-1",
    sessionName: "Follow-Up Walk (Rehab Week 4)",
    taskMode: "single",
    overallScore: 86.2,
    mobilityScore: 88.5,
    symmetryScore: 84.0,
    stabilityScore: 83.5,
    rhythmScore: 87.0,
    automaticityScore: 85.0,
    cadenceSpm: 112.5,
    stepCount: 48,
    durationSec: 25.6,
    viewAngle: "sagittal",
    symmetryAngle: 2.1,
    metricsJson: ({
      cadenceSpm: 112.5,
      stepCount: 48,
      durationSec: 25.6,
      avgStepTimeSec: 0.533,
      doubleSupportPct: 19.8,
      symmetryAngle: 2.1,
      stepTimeCV: 0.026,
      strideTimeCV: 0.024,
      stepTimeAsymmetry: 0.011,
      pathSmoothness: 0.92,
      verticalBounce: 0.038,
      overallScore: 86.2,
      mobilityScore: 88.5,
      symmetryScore: 84.0,
      stabilityScore: 83.5,
      rhythmScore: 87.0,
      automaticityScore: 85.0,
      viewAngle: "sagittal",
      viewConfidence: 0.95,
      fpsEffective: 30,
      strideAsymmetry: 0.01,
      lateralSway: 0.02,
      armSwingLeft: 0.22,
      armSwingRight: 0.22,
      armSwingAsymmetry: 0.005,
      kneeFlexLeft: 62,
      kneeFlexRight: 61,
      kneeAsymmetry: 0.01,
      stepWidthVariability: 0.015,
      doubleSupportHint: 0.18,
      series: [],
      stepEvents: [],
    } as unknown as GaitMetrics),
    guessesJson: [],
    dualTaskJson: undefined,
    angleAnalysisJson: createMockAngleAnalysis(false),
    patientMetaJson: {
      patientId: "PT-1001",
      assessmentDate: "2026-08-28",
      assessmentCondition: "Follow-Up Rehabilitation",
      clinicianNotes: "Improved step cadence and reduced asymmetry",
    },
    createdAt: "2026-08-28T14:30:00Z",
    updatedAt: "2026-08-28T14:30:00Z",
  };

  const sessionFrontal: GaitSessionRecord = {
    ...sessionB,
    id: "session-003",
    sessionName: "Frontal Camera Session",
    viewAngle: "frontal",
    angleAnalysisJson: createMockAngleAnalysis(true),
  };

  /**
   * Third session with a *coarser* normalized joint-angle grid (60 samples
   * rather than 101). Persisted records are not guaranteed to agree on sample
   * count, so the overlaid chart must still put both curves on one shared
   * gaitCyclePct axis.
   */
  const sessionCAngles: GaitAngleAnalysis = {
    isSuppressed: false,
    normalizedPoints: Array.from({ length: 60 }, (_, i) => {
      const pct = (i / 59) * 100;
      return {
        gaitCyclePct: pct,
        kneeAngleLeft: 6 + 52 * Math.sin((pct / 100) * Math.PI),
        kneeAngleRight: 5 + 50 * Math.sin((pct / 100) * Math.PI),
        hipAngleLeft: 32 - 42 * (pct / 100),
        hipAngleRight: 30 - 40 * (pct / 100),
        ankleAngleLeft: 11 * Math.sin((pct / 50) * Math.PI),
        ankleAngleRight: 9 * Math.sin((pct / 50) * Math.PI),
      };
    }),
    leftStrides: [],
    rightStrides: [],
    metrics: {
      kneeRomLeft: 66,
      kneeRomRight: 64,
      kneePeakFlexionLeft: 66,
      kneePeakFlexionRight: 64,
      kneeAsymmetryPct: 2.1,
      hipRomLeft: 44,
      hipRomRight: 43,
      hipPeakFlexionLeft: 30,
      hipPeakExtensionLeft: -14,
      hipPeakFlexionRight: 29,
      hipPeakExtensionRight: -14,
      hipAsymmetryPct: 2.9,
      ankleRomLeft: 27,
      ankleRomRight: 26,
      anklePeakDorsiflexionLeft: 12,
      anklePeakPlantarflexionLeft: -15,
      anklePeakDorsiflexionRight: 11,
      anklePeakPlantarflexionRight: -15,
      ankleAsymmetryPct: 4.4,
    },
    normativeData: mockNormative,
  };

  const sessionC: GaitSessionRecord = {
    ...sessionB,
    id: "session-004",
    sessionName: "Discharge Walk (Week 12)",
    overallScore: 92.0,
    mobilityScore: 93.0,
    symmetryScore: 90.0,
    stabilityScore: 91.0,
    rhythmScore: 94.0,
    automaticityScore: 90.5,
    cadenceSpm: 118.0,
    stepCount: 54,
    durationSec: 27.0,
    symmetryAngle: 1.4,
    metricsJson: ({
      ...sessionB.metricsJson,
      cadenceSpm: 118.0,
      stepCount: 54,
      durationSec: 27.0,
      symmetryAngle: 1.4,
      stepTimeCV: 0.019,
      overallScore: 92.0,
    } as unknown as GaitMetrics),
    angleAnalysisJson: sessionCAngles,
    createdAt: "2026-09-20T09:00:00Z",
    updatedAt: "2026-09-20T09:00:00Z",
  };

  describe("computeDelta Helper Function", () => {
    it("computes improvement for higherIsBetter metrics when valB > valA", () => {
      const res = computeDelta("overallScore", "Overall Gait Score", "/100", 78.5, 86.2, {
        higherIsBetter: true,
        epsilon: 0.5,
      });

      expect(res.deltaAbs).toBeCloseTo(7.7, 1);
      expect(res.deltaPct).toBeGreaterThan(0);
      expect(res.badgeTone).toBe("success");
      expect(res.interpretation).toBe("improved");
      expect(res.formattedDelta).toContain("+7.7 /100");
    });

    it("computes degradation for higherIsBetter metrics when valB < valA", () => {
      const res = computeDelta("overallScore", "Overall Gait Score", "/100", 86.2, 78.5, {
        higherIsBetter: true,
        epsilon: 0.5,
      });

      expect(res.deltaAbs).toBeCloseTo(-7.7, 1);
      expect(res.badgeTone).toBe("danger");
      expect(res.interpretation).toBe("degraded");
      expect(res.formattedDelta).toContain("-7.7 /100");
    });

    it("computes improvement for lowerIsBetter metrics when valB < valA", () => {
      const res = computeDelta("symmetryAngle", "Symmetry Angle", "%", 3.8, 2.1, {
        lowerIsBetter: true,
        epsilon: 0.2,
      });

      expect(res.deltaAbs).toBeCloseTo(-1.7, 1);
      expect(res.badgeTone).toBe("success");
      expect(res.interpretation).toBe("improved");
    });

    it("computes degradation for lowerIsBetter metrics when valB > valA", () => {
      const res = computeDelta("stepTimeCV", "Step Time CV", "%", 2.6, 4.2, {
        lowerIsBetter: true,
        epsilon: 0.2,
      });

      expect(res.deltaAbs).toBeCloseTo(1.6, 1);
      expect(res.badgeTone).toBe("danger");
      expect(res.interpretation).toBe("degraded");
    });

    it("assigns neutral tone when change is within noise threshold epsilon", () => {
      const res = computeDelta("mobilityScore", "Mobility", "/100", 80.0, 80.2, {
        higherIsBetter: true,
        epsilon: 0.5,
      });

      expect(res.badgeTone).toBe("neutral");
      expect(res.interpretation).toBe("unchanged");
    });

    it("handles null/undefined inputs gracefully", () => {
      const res = computeDelta("test", "Test Metric", "unit", null, 10);
      expect(res.deltaAbs).toBeNull();
      expect(res.badgeTone).toBe("neutral");
      expect(res.formattedValA).toBe("—");
    });
  });

  describe("Fallback Views Rendering", () => {
    it("renders fallback card for 0 sessions", () => {
      const html = renderToStaticMarkup(
        <SessionComparisonView sessions={[]} />,
      );

      expect(html).toContain('data-testid="fallback-0-sessions"');
      expect(html).toContain("Dual Session Comparison Requires 2 Gait Sessions");
      expect(html).toContain("Currently, no saved sessions exist in the database");
    });

    it("renders fallback notice for 1 session", () => {
      const html = renderToStaticMarkup(
        <SessionComparisonView sessions={[sessionA]} />,
      );

      expect(html).toContain('data-testid="fallback-1-session"');
      expect(html).toContain("Only 1 Saved Session Found");
      expect(html).toContain("Baseline Walk (Single-Task)");
      expect(html).toContain("Save a second session");
    });
  });

  describe("2+ Sessions Side-by-Side Workstation Rendering", () => {
    it("renders dual session comparison view with dropdown selectors", () => {
      const html = renderToStaticMarkup(
        <SessionComparisonView
          sessions={[sessionA, sessionB]}
          initialSessionA={sessionA}
          initialSessionB={sessionB}
        />,
      );

      expect(html).toContain('data-testid="session-comparison-view"');
      expect(html).toContain('data-testid="selector-session-a"');
      expect(html).toContain('data-testid="selector-session-b"');
      expect(html).toContain("Baseline Walk (Single-Task)");
      expect(html).toContain("Follow-Up Walk (Rehab Week 4)");
    });

    it("renders domain gait health score cards with metric deltas and badges", () => {
      const html = renderToStaticMarkup(
        <SessionComparisonView
          sessions={[sessionA, sessionB]}
          initialSessionA={sessionA}
          initialSessionB={sessionB}
        />,
      );

      expect(html).toContain('data-testid="card-overallScore"');
      expect(html).toContain('data-testid="card-mobilityScore"');
      expect(html).toContain('data-testid="card-symmetryScore"');
      expect(html).toContain('data-testid="card-stabilityScore"');
      expect(html).toContain('data-testid="card-rhythmScore"');
      expect(html).toContain('data-testid="card-automaticityScore"');
    });

    it("renders spatio-temporal and symmetry comparison tables", () => {
      const html = renderToStaticMarkup(
        <SessionComparisonView
          sessions={[sessionA, sessionB]}
          initialSessionA={sessionA}
          initialSessionB={sessionB}
        />,
      );

      expect(html).toContain("Spatio-Temporal Parameters");
      expect(html).toContain("Symmetry &amp; Variability Metrics");
      expect(html).toContain('data-testid="row-cadenceSpm"');
      expect(html).toContain('data-testid="row-symmetryAngle"');
      expect(html).toContain('data-testid="row-stepTimeCV"');
      expect(html).toContain('data-testid="row-stepTimeAsymmetry"');
    });

    it("renders Recharts joint angle trajectory chart and joint selection tabs", () => {
      const html = renderToStaticMarkup(
        <SessionComparisonView
          sessions={[sessionA, sessionB]}
          initialSessionA={sessionA}
          initialSessionB={sessionB}
        />,
      );

      expect(html).toContain("Overlaid Joint Kinematic Trajectories");
      expect(html).toContain('data-testid="joint-tab-knee"');
      expect(html).toContain('data-testid="joint-tab-hip"');
      expect(html).toContain('data-testid="joint-tab-ankle"');
      expect(html).toContain('data-testid="joint-rom-badges"');
      expect(html).toContain("recharts-responsive-container");
    });

    it("renders view suppression alert banner when frontal camera view is present", () => {
      const html = renderToStaticMarkup(
        <SessionComparisonView
          sessions={[sessionA, sessionFrontal]}
          initialSessionA={sessionA}
          initialSessionB={sessionFrontal}
        />,
      );

      expect(html).toContain('data-testid="view-suppression-banner"');
      expect(html).toContain("2D Kinematic View Angle Suppressed");
      expect(html).toContain("Frontal view camera recording detected");
      expect(html).not.toContain('data-testid="joint-rom-badges"');
    });

    it("renders same session warning badge when sessionA and sessionB are identical", () => {
      const html = renderToStaticMarkup(
        <SessionComparisonView
          sessions={[sessionA]}
          initialSessionA={sessionA}
          initialSessionB={sessionA}
        />,
      );

      expect(html).toContain('data-testid="same-session-warning"');
      expect(html).toContain("Baseline (Session A) and Target (Session B) are identical");
    });
  });

  // ------------------------------------------------------------------
  // Interactive DOM behaviour (jsdom + @testing-library/react)
  // ------------------------------------------------------------------
  describe("Interactive DOM Behaviour", () => {
    const threeSessions = [sessionC, sessionB, sessionA]; // newest first, as listGaitSessions orders

    beforeAll(() => {
      installResizeObserverStub();
    });

    beforeEach(() => {
      mockListGaitSessions.mockReset();
    });

    afterEach(() => {
      cleanup();
    });

    it("recomputes rendered deltas when Session B is changed via the selector", () => {
      render(
        <SessionComparisonView
          sessions={threeSessions}
          initialSessionA={sessionA}
          initialSessionB={sessionB}
        />,
      );

      const selectorB = screen.getByTestId("selector-session-b") as HTMLSelectElement;
      expect(selectorB.value).toBe("session-002");

      // Baseline A = 78.5, Target B = 86.2 -> +7.7
      expect(screen.getByTestId("card-overallScore").textContent).toContain("A: 78.5 /100");
      expect(screen.getByTestId("card-overallScore").textContent).toContain("B: 86.2 /100");
      expect(screen.getByTestId("card-overallScore").textContent).toContain("+7.7 /100");
      // Cadence 104.0 -> 112.5
      expect(screen.getByTestId("row-cadenceSpm").textContent).toContain("+8.5 spm");

      fireEvent.change(selectorB, { target: { value: "session-004" } });

      expect(selectorB.value).toBe("session-004");
      // Baseline A = 78.5, Target B = 92.0 -> +13.5
      expect(screen.getByTestId("card-overallScore").textContent).toContain("B: 92.0 /100");
      expect(screen.getByTestId("card-overallScore").textContent).toContain("+13.5 /100");
      expect(screen.getByTestId("card-overallScore").textContent).not.toContain("+7.7 /100");
      // Cadence 104.0 -> 118.0
      expect(screen.getByTestId("row-cadenceSpm").textContent).toContain("+14.0 spm");
      // Symmetry angle 3.8 -> 1.4 (lower is better)
      expect(screen.getByTestId("row-symmetryAngle").textContent).toContain("-2.4 %");
    });

    it("switches the ROM/asymmetry badge row when the hip and ankle tabs are clicked", () => {
      render(
        <SessionComparisonView
          sessions={threeSessions}
          initialSessionA={sessionA}
          initialSessionB={sessionB}
        />,
      );

      const badges = () => screen.getByTestId("joint-rom-badges").textContent ?? "";

      expect(badges()).toContain("Knee Joint ROM Comparison");
      expect(screen.getByTestId("rom-left-a").textContent).toContain("60.0°");
      expect(screen.getByTestId("rom-right-b").textContent).toContain("58.0°");
      expect(screen.getByTestId("asymmetry-comp").textContent).toContain("A 3.4%");

      fireEvent.click(screen.getByTestId("joint-tab-hip"));

      expect(badges()).toContain("Hip Joint ROM Comparison");
      expect(badges()).not.toContain("Knee Joint ROM Comparison");
      expect(screen.getByTestId("rom-left-a").textContent).toContain("40.0°");
      expect(screen.getByTestId("rom-right-b").textContent).toContain("38.0°");
      expect(screen.getByTestId("asymmetry-comp").textContent).toContain("A 5.2%");

      fireEvent.click(screen.getByTestId("joint-tab-ankle"));

      expect(badges()).toContain("Ankle Joint ROM Comparison");
      expect(badges()).not.toContain("Hip Joint ROM Comparison");
      expect(screen.getByTestId("rom-left-a").textContent).toContain("24.0°");
      expect(screen.getByTestId("rom-right-b").textContent).toContain("22.0°");
      expect(screen.getByTestId("asymmetry-comp").textContent).toContain("A 8.7%");
    });

    it("fetches via listGaitSessions and defaults to second-newest (A) vs newest (B)", async () => {
      mockListGaitSessions.mockResolvedValue(threeSessions);

      render(<SessionComparisonView />);

      await screen.findByTestId("session-comparison-view");

      expect(mockListGaitSessions).toHaveBeenCalledTimes(1);

      const selectorA = screen.getByTestId("selector-session-a") as HTMLSelectElement;
      const selectorB = screen.getByTestId("selector-session-b") as HTMLSelectElement;

      // threeSessions[0] is the newest (session-004), [1] the second-newest.
      expect(selectorB.value).toBe("session-004");
      expect(selectorA.value).toBe("session-002");
      expect(screen.queryByTestId("same-session-warning")).toBeNull();
    });

    it("shows a distinct error card (not the empty state) when listGaitSessions rejects", async () => {
      mockListGaitSessions.mockRejectedValue(new Error("unauthenticated"));

      render(<SessionComparisonView />);

      const errorCard = await screen.findByTestId("comparison-load-error");

      expect(errorCard.textContent).toMatch(/could not|failed|unable|sign[- ]in/i);
      // A fetch failure must not be reported as "you have no saved sessions".
      expect(screen.queryByTestId("fallback-0-sessions")).toBeNull();
      expect(
        screen.queryByText(/no saved sessions exist in the database/i),
      ).toBeNull();
    });

    it("renders the 0-session fallback in the DOM when the fetch resolves empty", async () => {
      mockListGaitSessions.mockResolvedValue([]);

      render(<SessionComparisonView />);

      const fallback = await screen.findByTestId("fallback-0-sessions");
      expect(fallback.textContent).toContain(
        "Dual Session Comparison Requires 2 Gait Sessions",
      );
      expect(screen.queryByTestId("session-comparison-view")).toBeNull();
    });

    it("renders the 1-session fallback in the DOM when only one session exists", async () => {
      mockListGaitSessions.mockResolvedValue([sessionA]);

      render(<SessionComparisonView />);

      const fallback = await screen.findByTestId("fallback-1-session");
      expect(fallback.textContent).toContain("Only 1 Saved Session Found");
      expect(fallback.textContent).toContain("Baseline Walk (Single-Task)");
    });

    it("surfaces the identical-A/B warning once the user selects the same session twice", () => {
      render(
        <SessionComparisonView
          sessions={threeSessions}
          initialSessionA={sessionA}
          initialSessionB={sessionB}
        />,
      );

      expect(screen.queryByTestId("same-session-warning")).toBeNull();

      fireEvent.change(screen.getByTestId("selector-session-a"), {
        target: { value: "session-002" },
      });

      const warning = screen.getByTestId("same-session-warning");
      expect(warning.textContent).toContain(
        "Baseline (Session A) and Target (Session B) are identical",
      );
    });

    it("overlays both sessions on one shared gaitCyclePct grid despite differing sample counts", () => {
      // sessionA has 101 normalized points; sessionC has 60.
      expect(sessionA.angleAnalysisJson!.normalizedPoints.length).toBe(101);
      expect(sessionC.angleAnalysisJson!.normalizedPoints.length).toBe(60);

      const { container } = render(
        <SessionComparisonView
          sessions={threeSessions}
          initialSessionA={sessionA}
          initialSessionB={sessionC}
        />,
      );

      const curves = Array.from(
        container.querySelectorAll<SVGPathElement>("path.recharts-line-curve"),
      );
      // Session A left/right + Session B left/right.
      expect(curves.length).toBe(4);

      const byStroke = (stroke: string) => {
        const el = curves.find((c) => c.getAttribute("stroke") === stroke);
        expect(el, `missing curve with stroke ${stroke}`).toBeTruthy();
        return pathXCoords(el!.getAttribute("d") ?? "");
      };

      const aLeft = byStroke("#3b82f6");
      const aRight = byStroke("#06b6d4");
      const bLeft = byStroke("#10b981");
      const bRight = byStroke("#f59e0b");

      // One sample per whole gait-cycle percent, 0..100 inclusive.
      expect(aLeft.length).toBe(101);
      expect(bLeft.length).toBe(101);
      // All four overlaid curves share exactly the same x positions.
      expect(bLeft).toEqual(aLeft);
      expect(aRight).toEqual(aLeft);
      expect(bRight).toEqual(aLeft);
      // Grid is monotonically increasing and spans the full plot area.
      expect(aLeft[0]).toBeLessThan(aLeft[100]);
      for (let i = 1; i < aLeft.length; i++) {
        expect(aLeft[i]).toBeGreaterThan(aLeft[i - 1]);
      }
    });
  });

  describe("metric units are the engine's units", () => {
    it("renders step-time CV as a true percentage, not the raw ratio", () => {
      // Engine: stepTimeCV = std/mean, dimensionless (~0.02-0.10). Fixture A is
      // 0.042. Displayed with a "%" unit it must read 4.2, not 0.0 — the missing
      // x100 previously made every CV render as "0.0 %".
      const d = computeDelta("stepTimeCV", "Step Time CV", "%", 0.042 * 100, 0.026 * 100, {
        lowerIsBetter: true,
        epsilon: 2.4,
        decimals: 1,
      });
      expect(d.formattedValA).toBe("4.2 %");
      expect(d.formattedValB).toBe("2.6 %");
      // 4.2 -> 2.6 is a 1.6 pp drop, inside the 2.4 pp measurement-noise band.
      expect(d.interpretation).toBe("unchanged");
    });

    it("flags a CV change only once it exceeds the measured noise band", () => {
      const d = computeDelta("stepTimeCV", "Step Time CV", "%", 8.0, 4.0, {
        lowerIsBetter: true,
        epsilon: 2.4,
        decimals: 1,
      });
      expect(d.interpretation).toBe("improved");
    });

    it("does not label dimensionless indices with physical units", () => {
      const markup = renderToStaticMarkup(
        React.createElement(SessionComparisonView, {
          sessions: [sessionA, sessionB],
          initialSessionAId: sessionA.id,
          initialSessionBId: sessionB.id,
        }),
      );
      // verticalBounce and stepTimeAsymmetry are normalized-image-coordinate
      // indices; there is no metre or second scale anywhere in this pipeline.
      // A number followed by a bare "m" would be a fabricated metre reading.
      expect(markup).not.toMatch(/\d+\.\d+\s*m(?![a-z])/);
      // And the wiring must scale: fixture stepTimeCV 0.042 must surface as 4.2 %,
      // never 0.0 %. This is what fails if the x100 is dropped again.
      expect(markup).toContain("4.2 %");
      expect(markup).not.toContain("0.0 %");
    });
  });
});

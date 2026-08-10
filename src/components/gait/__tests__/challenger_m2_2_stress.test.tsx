// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { JointAnglesChart } from "../JointAnglesChart";
import { MetricsPanel } from "../MetricsPanel";
import { CognitiveClusters } from "../CognitiveClusters";
import { GuessesPanel } from "../GuessesPanel";
import { GuidePanel } from "../GuidePanel";
import type { GaitMetrics, DualTaskCost, EducatedGuess } from "@/lib/gait/types";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";

// Mock Recharts ResponsiveContainer to prevent 0x0 size warnings in JSDOM
vi.mock("recharts", async () => {
  const original = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 400 }}>{children}</div>
    ),
  };
});

const mockGaitMetrics: GaitMetrics = {
  durationSec: 10,
  fpsEffective: 30,
  stepCount: 18,
  cadenceSpm: 108,
  avgStepTimeSec: 0.55,
  stepTimeAsymmetry: 0.04,
  stepTimeCV: 0.03,
  strideTimeCV: 0.035,
  symmetryAngle: 2.1,
  kneeFlexLeft: 58,
  kneeFlexRight: 60,
  kneeAsymmetry: 0.03,
  leftStancePct: 62,
  rightStancePct: 61,
  leftSwingPct: 38,
  rightSwingPct: 39,
  doubleSupportPct: 23,
  doubleSupportHint: 0.23,
  strideAsymmetry: 0.02,
  lateralSway: 0.045,
  verticalBounce: 0.032,
  pelvicObliquity: 0.015,
  pelvicObliquityVar: 0.005,
  meanStepWidth: 0.12,
  stepWidthVariability: 0.01,
  armSwingLeft: 0.25,
  armSwingRight: 0.26,
  armSwingAsymmetry: 0.04,
  pathSmoothness: 0.92,
  overallScore: 88,
  stabilityScore: 85,
  symmetryScore: 90,
  rhythmScore: 87,
  mobilityScore: 86,
  automaticityScore: 89,
  viewAngle: "sagittal",
  viewConfidence: 0.95,
  confidenceIntervals: {
    cadenceSpm: { value: 108, ci95Lower: 104, ci95Upper: 112, splitHalfDiff: 2 },
    stepTimeCV: { value: 0.03, ci95Lower: 0.02, ci95Upper: 0.04, splitHalfDiff: 0.005 },
    strideTimeCV: { value: 0.035, ci95Lower: 0.025, ci95Upper: 0.045, splitHalfDiff: 0.005 },
    symmetryAngle: { value: 2.1, ci95Lower: 1.5, ci95Upper: 2.7, splitHalfDiff: 0.3 },
  },
  series: Array.from({ length: 20 }, (_, i) => ({
    t: i * 0.1,
    midHipX: 0.5 + Math.sin(i) * 0.02,
    midHipY: 0.5 + Math.cos(i) * 0.01,
    leftAnkleY: 0.8 + Math.sin(i) * 0.05,
    rightAnkleY: 0.8 + Math.cos(i) * 0.05,
    leftWristX: 0.4 + Math.sin(i) * 0.01,
    rightWristX: 0.6 + Math.cos(i) * 0.01,
    leftKneeAngle: 30 + Math.sin(i) * 20,
    rightKneeAngle: 30 + Math.cos(i) * 20,
  })),
  stepEvents: [],
};

const mockAngleAnalysis: GaitAngleAnalysis = {
  isSuppressed: false,
  normalizedPoints: Array.from({ length: 101 }, (_, i) => ({
    gaitCyclePct: i,
    kneeAngleLeft: 10 + Math.sin((i / 100) * Math.PI * 2) * 25 + 25,
    kneeAngleRight: 12 + Math.sin((i / 100) * Math.PI * 2) * 24 + 24,
    hipAngleLeft: 5 + Math.sin((i / 100) * Math.PI * 2) * 15,
    hipAngleRight: 6 + Math.sin((i / 100) * Math.PI * 2) * 14,
    ankleAngleLeft: Math.sin((i / 100) * Math.PI * 2) * 10,
    ankleAngleRight: Math.cos((i / 100) * Math.PI * 2) * 10,
  })),
  leftStrides: [],
  rightStrides: [],
  metrics: {
    kneeRomLeft: 50,
    kneeRomRight: 48,
    kneePeakFlexionLeft: 60,
    kneePeakFlexionRight: 58,
    kneeAsymmetryPct: 4.15,
    hipRomLeft: 30,
    hipRomRight: 28,
    hipPeakFlexionLeft: 20,
    hipPeakFlexionRight: 19,
    hipPeakExtensionLeft: -10,
    hipPeakExtensionRight: -9,
    hipAsymmetryPct: 6.9,
    ankleRomLeft: 20,
    ankleRomRight: 19,
    anklePeakDorsiflexionLeft: 10,
    anklePeakDorsiflexionRight: 9,
    anklePeakPlantarflexionLeft: -10,
    anklePeakPlantarflexionRight: -10,
    ankleAsymmetryPct: 5.2,
  },
  normativeData: Array.from({ length: 101 }, (_, i) => ({
    gaitCyclePct: i,
    kneeMean: 35,
    kneeMin: 0,
    kneeMax: 70,
    hipMean: 10,
    hipMin: -18,
    hipMax: 38,
    ankleMean: -3.5,
    ankleMin: -22,
    ankleMax: 15,
  })),
};

const mockDualTaskCost: DualTaskCost = {
  cadenceCostPct: 10.9,
  stepTimeCvCostPct: 66.7,
  stabilityCostPts: 10,
  automaticityCostPts: 11,
  cadenceDTE: -10.9,
  stepTimeCvDTE: 66.7,
  cmiClassification: "mutual_interference",
  summary: "Significant cognitive cost detected with motor performance decrement during dual-task walking.",
};

const mockGuesses: EducatedGuess[] = [
  {
    id: "g1",
    title: "Elevated Step-Time Variability Pattern",
    category: "variability",
    severity: "elevated",
    confidence: 0.85,
    summary: "Step time coefficient of variation is elevated above normal threshold.",
    evidence: ["Step time CV = 5.2% (> 4.0% threshold)", "Stride time CV = 5.8%"],
    alternatives: ["Fatigue during recording", "Irregular walking surface"],
    patternTag: "High variability",
  },
  {
    id: "g2",
    title: "Slight Inter-Limb Asymmetry",
    category: "symmetry",
    severity: "moderate",
    confidence: 0.65,
    summary: "Minor stance time imbalance between left and right legs.",
    evidence: ["Stance phase L/R ratio = 1.15", "Step time asymmetry = 6.2%"],
    alternatives: ["Antalgic gait adaptation"],
  },
];

describe("Milestone 2 Empirical Stress & Landmark Verification", () => {
  afterEach(() => {
    cleanup();
  });
  describe("1. JointAnglesChart", () => {
    it("renders joint tabs and switches between knee, hip, and ankle kinematics", () => {
      render(<JointAnglesChart angleAnalysis={mockAngleAnalysis} />);

      expect(screen.getByTestId("tab-knee")).toBeDefined();
      expect(screen.getByTestId("tab-hip")).toBeDefined();
      expect(screen.getByText("Perry & Burnfield (2010) normative range (0–70° flexion)")).toBeDefined();

      fireEvent.click(screen.getByTestId("tab-hip"));
      expect(screen.getByText("Perry & Burnfield (2010) normative range (-18° extension to +38° flexion)")).toBeDefined();

      fireEvent.click(screen.getByTestId("tab-ankle"));
      expect(screen.getByText("Perry & Burnfield (2010) normative range (-22° plantarflexion to +15° dorsiflexion)")).toBeDefined();
      expect(screen.getByTestId("peak-flexion").textContent).toContain("Peak Dorsiflexion");
    });

    it("renders peak ROM stat badges with correct values", () => {
      render(<JointAnglesChart angleAnalysis={mockAngleAnalysis} />);

      expect(screen.getByTestId("rom-stat-badges")).toBeDefined();
      expect(screen.getByTestId("left-peak-rom").textContent).toContain("50.0°");
      expect(screen.getByTestId("right-peak-rom").textContent).toContain("48.0°");
      expect(screen.getByTestId("rom-asymmetry").textContent).toContain("4.2%");
    });

    it("renders view suppression banner when view is suppressed", () => {
      const suppressedAnalysis: GaitAngleAnalysis = {
        ...mockAngleAnalysis,
        isSuppressed: true,
        suppressionReason: "Frontal view cannot measure sagittal angles.",
      };

      render(<JointAnglesChart angleAnalysis={suppressedAnalysis} />);

      expect(screen.getByTestId("view-suppression-banner")).toBeDefined();
      expect(screen.getByText("2D Kinematic View Angle Suppressed")).toBeDefined();
      expect(screen.getByText("Frontal view cannot measure sagittal angles.")).toBeDefined();
      expect(screen.queryByTestId("rom-stat-badges")).toBeNull();
    });

    it("handles missing metrics or undefined points gracefully", () => {
      const emptyAnalysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        metrics: undefined as unknown as GaitAngleAnalysis["metrics"],
        normativeData: [],
      };

      render(<JointAnglesChart angleAnalysis={emptyAnalysis} />);
      expect(screen.getByText("Joint Kinematic Angle Trajectories")).toBeDefined();
      expect(screen.queryByTestId("rom-stat-badges")).toBeNull();
    });
  });

  describe("2. MetricsPanel", () => {
    it("renders high-density clinical tables with proper headers and landmarks", () => {
      render(<MetricsPanel metrics={mockGaitMetrics} />);

      const tables = document.querySelectorAll("table.clinical-table");
      expect(tables.length).toBeGreaterThanOrEqual(3);

      expect(screen.getByText("Directly measured")).toBeDefined();
      expect(screen.getByText("Uncalibrated indices")).toBeDefined();
      expect(screen.getByText("Composite research indices (unvalidated weighting)")).toBeDefined();
      expect(screen.getByText("Recording context (not scored)")).toBeDefined();

      tables.forEach((table) => {
        expect(table.querySelector("thead")).toBeDefined();
        expect(table.querySelector("tbody")).toBeDefined();
        const headers = table.querySelectorAll("th");
        expect(headers.length).toBe(4);
      });
    });

    it("displays stride count basis disclaimers when stride count is low", () => {
      const lowStrideMetrics: GaitMetrics = {
        ...mockGaitMetrics,
        stepCount: 14, // 7 strides -> low stride warning
      };

      render(<MetricsPanel metrics={lowStrideMetrics} />);
      expect(screen.getAllByText(/from 7 strides — wide margin, treat as indicative/i).length).toBeGreaterThan(0);
    });

    it("handles suppressed frontal metrics correctly", () => {
      const frontalMetrics: GaitMetrics = {
        ...mockGaitMetrics,
        viewAngle: "frontal",
        kneeFlexLeft: null,
        kneeFlexRight: null,
        leftStancePct: null,
        rightStancePct: null,
        doubleSupportPct: null,
        strideAsymmetry: null,
      };

      render(<MetricsPanel metrics={frontalMetrics} />);
      expect(screen.getAllByText("N/A (Requires Side View)").length).toBeGreaterThan(0);
      expect(screen.getByText("Knee flexion kinematic chart suppressed for frontal camera perspective.")).toBeDefined();
    });
  });

  describe("3. CognitiveClusters", () => {
    it("renders all 4 cluster accordions with semantic region role and aria attributes", () => {
      render(<CognitiveClusters metrics={mockGaitMetrics} dualTaskCost={mockDualTaskCost} />);

      const region = screen.getByTestId("cognitive-clusters");
      expect(region).toBeDefined();
      expect(region.getAttribute("role")).toBe("region");
      expect(region.getAttribute("aria-label")).toBe("Gait metric findings by cluster");

      expect(screen.getByTestId("cluster-spatiotemporal")).toBeDefined();
      expect(screen.getByTestId("cluster-symmetry")).toBeDefined();
      expect(screen.getByTestId("cluster-stability")).toBeDefined();
      expect(screen.getByTestId("cluster-dualtask")).toBeDefined();
    });

    it("toggles cluster accordions on click and keyboard interaction", () => {
      render(<CognitiveClusters metrics={mockGaitMetrics} />);

      const header0 = screen.getByTestId("cluster-header-0");
      expect(header0.getAttribute("aria-expanded")).toBe("true");

      fireEvent.click(header0);
      expect(header0.getAttribute("aria-expanded")).toBe("false");

      fireEvent.keyDown(header0, { key: "Enter" });
      expect(header0.getAttribute("aria-expanded")).toBe("true");

      fireEvent.keyDown(header0, { key: " " });
      expect(header0.getAttribute("aria-expanded")).toBe("false");
    });

    it("renders progress bars with role progressbar and valid ARIA attributes", () => {
      render(<CognitiveClusters metrics={mockGaitMetrics} />);

      const progressBars = screen.getAllByRole("progressbar");
      expect(progressBars.length).toBe(3);
      expect(progressBars[0].getAttribute("aria-valuenow")).toBe("62");
      expect(progressBars[1].getAttribute("aria-valuenow")).toBe("61");
      expect(progressBars[2].getAttribute("aria-valuenow")).toBe("23");
    });

    it("handles missing dualTaskCost and taskMode fallback states gracefully", () => {
      render(<CognitiveClusters metrics={mockGaitMetrics} taskMode="single" />);

      expect(screen.getAllByText("Single-Task Baseline").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Single-Task Walk Baseline").length).toBeGreaterThan(0);
    });
  });

  describe("4. GuessesPanel", () => {
    it("renders disclaimer banner and guess cards with severity badges", () => {
      const { container } = render(<GuessesPanel guesses={mockGuesses} dualTaskCost={mockDualTaskCost} />);

      expect(container.textContent).toContain("Pattern hypotheses — not a diagnosis");
      expect(container.textContent).toContain("Dual-task cost (paired session)");
      expect(container.textContent).toContain("Elevated Step-Time Variability Pattern");
      expect(container.textContent).toContain("Slight Inter-Limb Asymmetry");

      expect(screen.getAllByText("elevated").length).toBeGreaterThan(0);
      expect(screen.getAllByText("moderate").length).toBeGreaterThan(0);
      expect(screen.getByText("85% conf.")).toBeDefined();
    });

    it("renders without dualTaskCost gracefully", () => {
      const { container } = render(<GuessesPanel guesses={mockGuesses} />);

      expect(container.textContent).toContain("Pattern hypotheses — not a diagnosis");
      expect(container.textContent).not.toContain("Dual-task cost (paired session)");
      expect(container.textContent).toContain("Elevated Step-Time Variability Pattern");
    });
  });

  describe("5. GuidePanel", () => {
    it("renders determination ladder, cognition protocol, pattern language, and quality guidelines", () => {
      render(<GuidePanel />);

      expect(screen.getByText("What we can determine vs diagnose")).toBeDefined();
      expect(screen.getByText("Cognition & dual-task protocol")).toBeDefined();
      expect(screen.getByText("Pattern language (observational)")).toBeDefined();
      expect(screen.getByText("Better recordings")).toBeDefined();

      const canBadges = screen.getAllByText("CAN");
      const cannotBadges = screen.getAllByText("CANNOT");
      expect(canBadges.length).toBeGreaterThan(0);
      expect(cannotBadges.length).toBeGreaterThan(0);
    });
  });
});

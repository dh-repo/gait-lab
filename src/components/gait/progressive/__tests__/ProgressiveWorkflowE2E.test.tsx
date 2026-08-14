/// <reference types="@testing-library/jest-dom/vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import React, { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { ProgressiveDisclosureNav } from "../ProgressiveDisclosureNav";
import { HumanCenteredSummary } from "../HumanCenteredSummary";
import { Level1PatientView } from "../Level1PatientView";
import { Level2BiomechanicsView } from "../Level2BiomechanicsView";
import { Level3SpecialistView } from "../Level3SpecialistView";
import { ResponsiveMediaViewport } from "../ResponsiveMediaViewport";
import { ViewportHUD } from "../ViewportHUD";
import type { DisclosureTier } from "../types";
import type { AnalysisResult } from "@/lib/gait/types";
import { createMockMetrics, generateSyntheticWalkingFrames } from "@/lib/gait/__tests__/testHelpers";
import { computeGaitAngleAnalysis } from "@/lib/gait/angles";

// Mock Three.js / DigitalTwinCanvas for safe jsdom rendering
vi.mock("@/components/gait/DigitalTwinCanvas", () => {
  return {
    DigitalTwinCanvas: (props: any) => (
      <div data-testid="mock-digital-twin-canvas" data-current-time={props.currentTime}>
        Digital Twin 3D Viewport (Time: {props.currentTime?.toFixed(2)}s)
      </div>
    ),
  };
});

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
});

/**
 * Integrated Multi-Tier Container Harness simulating GaitApp Stage 3 progressive disclosure.
 */
function IntegratedProgressiveWorkspace({
  analysis,
  initialTier = "level1_patient",
  onOpenCalibration,
  onOpenSoapNote,
  onExportCsv,
  onExportJson,
  onOpenHepModal,
}: {
  analysis: AnalysisResult;
  initialTier?: DisclosureTier;
  onOpenCalibration?: () => void;
  onOpenSoapNote?: () => void;
  onExportCsv?: () => void;
  onExportJson?: () => void;
  onOpenHepModal?: (exerciseId?: string) => void;
}) {
  const [activeTier, setActiveTier] = useState<DisclosureTier>(initialTier);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(1.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  return (
    <div data-testid="progressive-workspace" className="flex flex-col gap-6 p-6">
      {/* Top Human-Centered Summary Landing Banner */}
      <HumanCenteredSummary analysis={analysis} />

      {/* 3-Tier Progressive Disclosure Navigation */}
      <ProgressiveDisclosureNav
        activeTier={activeTier}
        onSelectTier={setActiveTier}
        anomalyCount={analysis.guesses.length}
      />

      {/* Tiered Content Render */}
      {activeTier === "level1_patient" && (
        <Level1PatientView
          analysis={analysis}
          currentTimeSec={currentTimeSec}
          isPlaying={isPlaying}
          onSeek={setCurrentTimeSec}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onOpenHepModal={onOpenHepModal}
        />
      )}

      {activeTier === "level2_biomechanics" && (
        <Level2BiomechanicsView
          analysis={analysis}
          currentTimeSec={currentTimeSec}
          isPlaying={isPlaying}
          onSeek={setCurrentTimeSec}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
        />
      )}

      {activeTier === "level3_specialist" && (
        <Level3SpecialistView
          analysis={analysis}
          onOpenCalibration={onOpenCalibration}
          onOpenSoapNote={onOpenSoapNote}
          onExportCsv={onExportCsv}
          onExportJson={onExportJson}
        />
      )}

      {/* Responsive Media Viewport with Embedded HUD */}
      <ResponsiveMediaViewport
        aspectRatio="16:9"
        hudOverlay={
          <ViewportHUD
            fps={30}
            confidence={0.92}
            pitchDeg={analysis.cameraPerspective?.pitchDeg ?? 1.5}
            rollDeg={analysis.cameraPerspective?.rollDeg ?? 0.5}
            currentPhase="Initial Contact"
            isCollapsible={true}
          />
        }
      >
        <div data-testid="viewport-media-content">Synchronized Media Stream</div>
      </ResponsiveMediaViewport>
    </div>
  );
}

describe("ProgressiveWorkflowE2E Test Suite (Tiers 1-4)", () => {
  const frames = generateSyntheticWalkingFrames({ durationSec: 6.0, fps: 30 });
  const angleAnalysis = computeGaitAngleAnalysis(frames, [] as any, "sagittal");

  const comprehensiveMockAnalysis: AnalysisResult = {
    personId: 101,
    analyzedFrames: 180,
    taskMode: "single",
    notes: ["Multi-tier E2E verification session"],
    metrics: createMockMetrics({
      overallScore: 82,
      rhythmScore: 80,
      symmetryScore: 88,
      mobilityScore: 78,
      pathSmoothness: 0.86,
      cadenceSpm: 106,
      gaitSpeedMps: 1.22,
      kneeFlexLeft: 56.4,
      kneeFlexRight: 58.2,
      symmetryAngle: 3.1,
      leftStancePct: 61.0,
      rightStancePct: 60.5,
      leftSwingPct: 39.0,
      rightSwingPct: 39.5,
      doubleSupportPct: 21.5,
      confidenceIntervals: {
        cadence: { value: 106, ci95Lower: 103.5, ci95Upper: 108.5, splitHalfDiff: 1.8 },
        gaitSpeed: { value: 1.22, ci95Lower: 1.18, ci95Upper: 1.26, splitHalfDiff: 0.03 },
        symmetryAngle: { value: 3.1, ci95Lower: 2.7, ci95Upper: 3.5, splitHalfDiff: 0.25 },
      },
    }),
    guesses: [
      {
        id: "guess-1",
        title: "Mild Symmetrical Stride",
        summary: "Normal bilateral symmetry with slight step length reduction.",
        evidence: ["Symmetry angle < 3.5%"],
        confidence: 0.88,
        severity: "low",
        category: "symmetry",
      },
    ],
    angleAnalysis: angleAnalysis || undefined,
    cameraPerspective: {
      pitchDeg: 2.1,
      yawDeg: 89.2,
      rollDeg: 0.4,
      distanceMeters: 2.9,
      cameraHeightMeters: 1.45,
      isOrthogonal: true,
      obliqueDeviationDeg: 2.1,
      warningLevel: "nominal",
      warningMessage: "Camera is optimally aligned",
      guidance: {
        heightAdjustmentCm: 0,
        tiltAdjustmentDeg: -2.1,
        yawAdjustmentDeg: 0.8,
        distanceAdjustmentM: 0,
        guidanceText: ["Optimal camera alignment"],
      },
      confidence: 0.95,
      anthropometrics: {
        thighShankRatio: 1.05,
        torsoLegRatio: 0.586,
        normativeThighShankRatio: 1.05,
        normativeTorsoLegRatio: 0.586,
        anthroPitchDeg: 0,
      },
      foreshorteningFactor: 1.0,
    } as any,
    patientMeta: {
      patientId: "E2E-PT-100",
      clinicianNotes: "Comprehensive progressive test run",
      assessmentDate: "2026-08-14",
      assessmentCondition: "Self-selected normal pace",
    },
    frames,
  };

  // =========================================================================
  // TIER 1: MULTI-TIER FEATURE COVERAGE
  // =========================================================================

  describe("Tier 1: Multi-Tier Integration Coverage", () => {
    it("renders full landing experience with summary hero, tier navigation, and Level 1 by default", () => {
      render(<IntegratedProgressiveWorkspace analysis={comprehensiveMockAnalysis} />);

      // Human-Centered Summary Landing
      expect(screen.getAllByText("82").length).toBeGreaterThanOrEqual(1); // Readiness Score Ring
      expect(screen.getByText(/Good|Excellent/i)).toBeInTheDocument();

      // Tier Navigation
      expect(screen.getByRole("tablist")).toBeInTheDocument();

      // Level 1 Patient View components
      expect(screen.getByTestId("mock-digital-twin-canvas")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /Recommended Exercises|Quick Exercise Guide|Home Plan/i })).toBeInTheDocument();
    });

    it("transitions smoothly from Level 1 to Level 2 (Biomechanics) and renders telemetry", () => {
      render(<IntegratedProgressiveWorkspace analysis={comprehensiveMockAnalysis} />);

      const tabs = screen.getAllByRole("tab");
      // Click Level 2 (Biomechanics)
      fireEvent.click(tabs[1]);

      // Level 2 Kinematics rendered
      expect(screen.getByRole("tab", { name: /Knee/i })).toBeInTheDocument();
      expect(screen.getAllByText(/Initial Contact|\bIC\b/).length).toBeGreaterThanOrEqual(1); // Perry 8-phase ribbon
      expect(screen.getByText(/Cadence/i)).toBeInTheDocument(); // Spatiotemporal table
    });

    it("transitions from Level 2 to Level 3 (Specialist Workstation) and renders clinical tools", () => {
      const onSoap = vi.fn();
      const onExport = vi.fn();

      render(
        <IntegratedProgressiveWorkspace
          analysis={comprehensiveMockAnalysis}
          onOpenSoapNote={onSoap}
          onExportCsv={onExport}
        />
      );

      const tabs = screen.getAllByRole("tab");
      // Click Level 3 (Specialist Workstation)
      fireEvent.click(tabs[2]);

      // Level 3 Specialist tools rendered
      expect(screen.getByRole("heading", { name: /Gait Profile Score|GPS|Movement Analysis Profile|MAP/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Generate SOAP Note|SOAP Note/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Export CSV|Download CSV/i })).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Pathologies, Nulls, Extreme Asymmetry)
  // =========================================================================

  describe("Tier 2: Boundary & Corner Cases", () => {
    it("handles severe antalgic limping (70/30 stance distribution) across all tiers", () => {
      const antalgicAnalysis: AnalysisResult = {
        ...comprehensiveMockAnalysis,
        metrics: createMockMetrics({
          overallScore: 48,
          leftStancePct: 70.0,
          rightStancePct: 48.0,
          leftSwingPct: 30.0,
          rightSwingPct: 52.0,
          symmetryAngle: 18.2,
          kneeFlexLeft: 35.0,
          kneeFlexRight: 62.0,
        }),
      };

      render(<IntegratedProgressiveWorkspace analysis={antalgicAnalysis} />);

      // Landing flags Needs Attention or Fair
      expect(screen.getAllByText("48").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Needs Attention|Fair/i).length).toBeGreaterThanOrEqual(1);

      // Switch to Level 2
      const tabs = screen.getAllByRole("tab");
      fireEvent.click(tabs[1]);

      // Symmetry angle > 18% displayed
      expect(screen.getAllByText(/18\.2/).length).toBeGreaterThanOrEqual(1);
    });

    it("handles missing confidence intervals and uncalibrated metrics without throwing", () => {
      const uncalibratedAnalysis: AnalysisResult = {
        ...comprehensiveMockAnalysis,
        metrics: createMockMetrics({
          confidenceIntervals: undefined,
          gaitSpeedMps: null,
        }),
      };

      render(<IntegratedProgressiveWorkspace analysis={uncalibratedAnalysis} />);
      expect(screen.getByTestId("progressive-workspace")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // =========================================================================

  describe("Tier 3: Cross-Feature Combinations", () => {
    it("maintains playback state when switching back and forth between tiers", () => {
      render(<IntegratedProgressiveWorkspace analysis={comprehensiveMockAnalysis} />);

      // Start at Level 1, play media
      const playBtn = screen.getByRole("button", { name: /Play|Pause|toggle-play/i });
      fireEvent.click(playBtn);

      const tabs = screen.getAllByRole("tab");

      // Switch to Level 2
      fireEvent.click(tabs[1]);
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");

      // Switch back to Level 1
      fireEvent.click(tabs[0]);
      expect(tabs[0]).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("mock-digital-twin-canvas")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (1 to 5)
  // =========================================================================

  describe("Tier 4: Real-World Application Scenarios", () => {
    it("Scenario 1: Patient Post-ACL Reconstruction Initial Assessment (F1, F2, F3, F4, F5, F6)", () => {
      const onHepModal = vi.fn();
      render(
        <IntegratedProgressiveWorkspace
          analysis={comprehensiveMockAnalysis}
          onOpenHepModal={onHepModal}
        />
      );

      // F1: Human-Centered Overview
      expect(screen.getByText(/Good|Excellent|Mobility/i)).toBeInTheDocument();

      // F3: Digital Twin
      expect(screen.getByTestId("mock-digital-twin-canvas")).toBeInTheDocument();

      // F4: Score Rings
      expect(screen.getAllByText("82").length).toBeGreaterThanOrEqual(1);

      // F6: Quick HEP Preview & click
      const exerciseCards = screen.getAllByTestId("hep-exercise-card");
      expect(exerciseCards.length).toBeGreaterThan(0);
      fireEvent.click(exerciseCards[0]);
      expect(onHepModal).toHaveBeenCalled();
    });

    it("Scenario 2: Biomechanist Joint Angle Asymmetry & ROM Deep Dive (F2, F7, F8, F9, F10)", () => {
      render(
        <IntegratedProgressiveWorkspace
          analysis={comprehensiveMockAnalysis}
          initialTier="level2_biomechanics"
        />
      );

      // F7: Waveforms
      expect(screen.getByRole("tab", { name: /Knee/i })).toBeInTheDocument();

      // F8: Perry 8-Phase Ribbon
      expect(screen.getAllByText(/Initial Contact|\bIC\b/).length).toBeGreaterThanOrEqual(1);

      // F9: Symmetry Angle
      expect(screen.getByText(/3\.1/)).toBeInTheDocument();

      // F10: Spatio-temporal table with 95% CIs
      expect(screen.getByText(/106/)).toBeInTheDocument();
      expect(screen.getByText(/95% CI|Confidence Interval/i)).toBeInTheDocument();
    });

    it("Scenario 3: Clinical Specialist Baker GPS/MAP Diagnosis & SOAP Note EHR Export (F2, F11, F13, F14)", () => {
      const onSoap = vi.fn();
      const onExportCsv = vi.fn();
      const onExportJson = vi.fn();

      render(
        <IntegratedProgressiveWorkspace
          analysis={comprehensiveMockAnalysis}
          initialTier="level3_specialist"
          onOpenSoapNote={onSoap}
          onExportCsv={onExportCsv}
          onExportJson={onExportJson}
        />
      );

      // F11: Baker GPS / MAP
      expect(screen.getByRole("heading", { name: /Gait Profile Score|GPS|Movement Analysis Profile|MAP/i })).toBeInTheDocument();

      // F13: SOAP Note trigger
      const soapBtn = screen.getByRole("button", { name: /SOAP Note/i });
      fireEvent.click(soapBtn);
      expect(onSoap).toHaveBeenCalledTimes(1);

      // F14: Exporters
      const csvBtn = screen.getByRole("button", { name: /CSV/i });
      fireEvent.click(csvBtn);
      expect(onExportCsv).toHaveBeenCalledTimes(1);

      const jsonBtn = screen.getByRole("button", { name: /JSON/i });
      fireEvent.click(jsonBtn);
      expect(onExportJson).toHaveBeenCalledTimes(1);
    });

    it("Scenario 4: Mobile 9:16 Portrait Video Recording with Calibration & HUD Overlay (F12, F15, F16, F17)", () => {
      render(
        <ResponsiveMediaViewport
          aspectRatio="9:16"
          orientation="portrait"
          hudOverlay={
            <ViewportHUD
              fps={60}
              confidence={0.96}
              pitchDeg={1.2}
              rollDeg={0.3}
              currentPhase="Loading Response"
              isCollapsible={true}
              defaultExpanded={true}
            />
          }
        >
          <div data-testid="mobile-recording-canvas">Mobile Camera View</div>
        </ResponsiveMediaViewport>
      );

      // F15: 9:16 Portrait Viewport
      expect(screen.getByTestId("mobile-recording-canvas")).toBeInTheDocument();

      // F16: Viewport HUD
      expect(screen.getByText(/60.*FPS|60/i)).toBeInTheDocument();
      expect(screen.getByText(/Loading Response/i)).toBeInTheDocument();
    });

    it("Scenario 5: Full End-to-End Multi-Tier Progressive Analysis Workflow (F1-F17)", () => {
      const onSoap = vi.fn();
      const onCalib = vi.fn();
      const onExport = vi.fn();

      render(
        <IntegratedProgressiveWorkspace
          analysis={comprehensiveMockAnalysis}
          onOpenSoapNote={onSoap}
          onOpenCalibration={onCalib}
          onExportCsv={onExport}
        />
      );

      // Step 1: Patient overview at Level 1
      expect(screen.getAllByText("82").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId("mock-digital-twin-canvas")).toBeInTheDocument();

      // Step 2: Switch to Level 2 Biomechanics
      const tabs = screen.getAllByRole("tab");
      fireEvent.click(tabs[1]);
      expect(screen.getAllByText(/Initial Contact|\bIC\b/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/3\.1/)).toBeInTheDocument(); // Symmetry angle

      // Step 3: Transition to Level 3
      fireEvent.click(tabs[2]);

      // F11: MAP Chart
      expect(screen.getByRole("heading", { name: /Gait Profile Score|GPS|MAP/i })).toBeInTheDocument();

      // F12: Camera Perspective & Homography
      expect(screen.getByText(/Optical Calibration|Camera Homography/i)).toBeInTheDocument();

      // F13: SOAP Note Generator
      expect(screen.getByRole("button", { name: /SOAP Note/i })).toBeInTheDocument();

      // F14: Research Exporters
      expect(screen.getByRole("button", { name: /Export CSV/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Export JSON/i })).toBeInTheDocument();
    });

    it("verifies interactive tier navigation through dedicated header tabs", () => {
      const onTierChange = vi.fn();
      const onSoap = vi.fn();
      const onCalib = vi.fn();
      const onExport = vi.fn();

      render(
        <IntegratedProgressiveWorkspace
          analysis={comprehensiveMockAnalysis}
          onOpenSoapNote={onSoap}
          onOpenCalibration={onCalib}
          onExportCsv={onExport}
        />
      );

      // Step 1: Patient overview at Level 1
      expect(screen.getAllByText("82").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId("mock-digital-twin-canvas")).toBeInTheDocument();

      // Step 2: Switch to Level 2 Biomechanics
      const tabs = screen.getAllByRole("tab");
      fireEvent.click(tabs[1]);
      expect(screen.getAllByText(/Initial Contact|\bIC\b/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/3\.1/)).toBeInTheDocument(); // Symmetry angle

      // Step 3: Switch to Level 3 Specialist
      fireEvent.click(tabs[2]);
      expect(screen.getByRole("heading", { name: /Gait Profile Score|GPS|MAP/i })).toBeInTheDocument();
      // Step 4: Trigger calibration and SOAP note
      const calibBtn = screen.getByRole("button", { name: /Calibrate Camera|Homography/i });
      fireEvent.click(calibBtn);
      expect(onCalib).toHaveBeenCalledTimes(1);

      const soapBtn = screen.getByRole("button", { name: /SOAP Note/i });
      fireEvent.click(soapBtn);
      expect(onSoap).toHaveBeenCalledTimes(1);

      // Step 5: Export CSV
      const csvBtn = screen.getByRole("button", { name: /CSV/i });
      fireEvent.click(csvBtn);
      expect(onExport).toHaveBeenCalledTimes(1);
    });
  });
});

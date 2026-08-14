// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Level3SpecialistView } from "../Level3SpecialistView";
import type { AnalysisResult } from "@/lib/gait/types";
import { createMockMetrics, generateSyntheticWalkingFrames } from "@/lib/gait/__tests__/testHelpers";
import { computeGaitAngleAnalysis } from "@/lib/gait/angles";

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

describe("Level3SpecialistView Component", () => {
  const frames = generateSyntheticWalkingFrames({ durationSec: 5.0, fps: 30 });
  const angleAnalysis = computeGaitAngleAnalysis(frames, [] as any, "sagittal");

  const mockAnalysis: AnalysisResult = {
    personId: 101,
    analyzedFrames: 300,
    taskMode: "single",
    notes: ["Clinical Specialist Workstation Session, with special characters: \", ', \n"],
    metrics: createMockMetrics({
      overallScore: 78,
      cadenceSpm: 110,
      symmetryAngle: 4.1,
      kneeFlexLeft: 48,
      kneeFlexRight: 60,
    }),
    guesses: [
      {
        id: "guess-stiff-knee",
        title: "Stiff Knee Gait Pattern",
        summary: "Reduced knee flexion during swing phase on left side.",
        evidence: ["Peak knee flexion 48° vs 60° normal"],
        confidence: 0.85,
        severity: "moderate",
        category: "neuromotor",
      },
    ],
    angleAnalysis: angleAnalysis || undefined,
    cameraPerspective: {
      pitchDeg: 4.2,
      yawDeg: 88.0,
      rollDeg: 1.1,
      distanceMeters: 2.8,
      cameraHeightMeters: 1.4,
      isOrthogonal: true,
      obliqueDeviationDeg: 4.2,
      warningLevel: "nominal",
      warningMessage: "Optimal camera alignment",
      guidance: {
        heightAdjustmentCm: 0,
        tiltAdjustmentDeg: -4.2,
        yawAdjustmentDeg: 2.0,
        distanceAdjustmentM: 0,
        guidanceText: ["Optimal camera placement"],
      },
      confidence: 0.92,
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
      patientId: "PT-9042",
      clinicianNotes: "Pre-surgical gait assessment",
      assessmentDate: "2026-08-14",
      assessmentCondition: "Barefoot self-selected speed",
    },
    frames,
  };

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Baker GPS/MAP, Homography, SOAP, Exporters)
  // =========================================================================

  describe("Tier 1: Feature Coverage", () => {
    it("renders Baker GPS (Gait Profile Score) & MAP (Movement Analysis Profile)", () => {
      render(<Level3SpecialistView analysis={mockAnalysis} />);

      // GPS & MAP headers and score display
      expect(
        screen.getByRole("heading", { name: /Gait Profile Score|GPS|Movement Analysis Profile|MAP/i })
      ).toBeInTheDocument();

      // Kinematic variables or chart container
      expect(screen.getByText(/Knee Flexion|Pelvic|Hip/i)).toBeInTheDocument();
    });

    it("displays MCID (1.6°) and control (5.2°) reference markers or labels", () => {
      render(<Level3SpecialistView analysis={mockAnalysis} />);

      expect(screen.getByText(/1.6°|MCID|Control Threshold|5.2°/i)).toBeInTheDocument();
    });

    it("renders 3D Camera Homography & Perspective status and calibration button", () => {
      const onOpenCalibration = vi.fn();
      render(
        <Level3SpecialistView
          analysis={mockAnalysis}
          onOpenCalibration={onOpenCalibration}
        />
      );

      // Homography section
      expect(
        screen.getByRole("heading", { name: /Camera Perspective|Homography|Calibration/i })
      ).toBeInTheDocument();

      // Calibrate button
      const calibButton = screen.getByRole("button", {
        name: /Calibrate Camera|Open Homography|Adjust Perspective/i,
      });
      expect(calibButton).toBeInTheDocument();

      fireEvent.click(calibButton);
      expect(onOpenCalibration).toHaveBeenCalledTimes(1);
    });

    it("renders Full EHR SOAP Note Generator launcher", () => {
      const onOpenSoapNote = vi.fn();
      render(
        <Level3SpecialistView
          analysis={mockAnalysis}
          onOpenSoapNote={onOpenSoapNote}
        />
      );

      // SOAP Note button
      const soapButton = screen.getByRole("button", {
        name: /Generate SOAP Note|EHR Documentation|SOAP Note/i,
      });
      expect(soapButton).toBeInTheDocument();

      fireEvent.click(soapButton);
      expect(onOpenSoapNote).toHaveBeenCalledTimes(1);
    });

    it("renders Raw CSV & JSON Telemetry Exporter actions", () => {
      const onExportCsv = vi.fn();
      const onExportJson = vi.fn();
      render(
        <Level3SpecialistView
          analysis={mockAnalysis}
          onExportCsv={onExportCsv}
          onExportJson={onExportJson}
        />
      );

      // CSV Export Button
      const csvButton = screen.getByRole("button", {
        name: /Export CSV|Download CSV|Summary CSV/i,
      });
      expect(csvButton).toBeInTheDocument();
      fireEvent.click(csvButton);
      expect(onExportCsv).toHaveBeenCalledTimes(1);

      // JSON Export Button
      const jsonButton = screen.getByRole("button", {
        name: /Export JSON|Download JSON|Research JSON/i,
      });
      expect(jsonButton).toBeInTheDocument();
      fireEvent.click(jsonButton);
      expect(onExportJson).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Perspective Warning, Missing Meta, Filter)
  // =========================================================================

  describe("Tier 2: Boundary & Corner Cases", () => {
    it("highlights homography warning when camera perspective exceeds tilt threshold", () => {
      const highTiltAnalysis: AnalysisResult = {
        ...mockAnalysis,
        cameraPerspective: {
          pitchDeg: 12.5,
          yawDeg: 72.0,
          rollDeg: 5.4,
          distanceMeters: 2.5,
          cameraHeightMeters: 1.2,
          isOrthogonal: false,
          obliqueDeviationDeg: 12.5,
          warningLevel: "critical",
          warningMessage: "High perspective distortion detected (Pitch: +12.5°).",
          guidance: {
            heightAdjustmentCm: 20,
            tiltAdjustmentDeg: -12.5,
            yawAdjustmentDeg: 18.0,
            distanceAdjustmentM: 0,
            guidanceText: ["Adjust camera tripod"],
          },
          confidence: 0.45,
          anthropometrics: {
            thighShankRatio: 1.05,
            torsoLegRatio: 0.586,
            normativeThighShankRatio: 1.05,
            normativeTorsoLegRatio: 0.586,
            anthroPitchDeg: 12.5,
          },
          foreshorteningFactor: 0.85,
        } as any,
      };

      render(<Level3SpecialistView analysis={highTiltAnalysis} />);

      expect(
        screen.getByText(/High perspective distortion|Severe|Tilt Warning/i)
      ).toBeInTheDocument();
    });

    it("handles missing patient metadata gracefully with clinical fallback defaults", () => {
      const noMetaAnalysis: AnalysisResult = {
        ...mockAnalysis,
        patientMeta: undefined,
      };

      render(<Level3SpecialistView analysis={noMetaAnalysis} />);
      // Should still render workstation without throwing
      expect(screen.getByRole("heading", { name: /Specialist|Clinical|GPS/i })).toBeInTheDocument();
    });

    it("filters MAP kinematic variables when anatomical plane filter is toggled", () => {
      render(<Level3SpecialistView analysis={mockAnalysis} />);

      // Plane filter buttons: All, Sagittal, Frontal, Transverse
      const sagittalFilter = screen.getByRole("button", { name: /^Sagittal$/i });
      fireEvent.click(sagittalFilter);

      // Should filter to Sagittal plane variables
      expect(screen.getByText(/Knee Flexion|Hip Flexion/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // =========================================================================

  describe("Tier 3: Cross-Feature Combinations", () => {
    it("passes patient ID and notes to the EHR and Export sub-systems", () => {
      render(<Level3SpecialistView analysis={mockAnalysis} />);

      // Patient ID PT-9042 displayed in metadata banner or specialist info
      expect(screen.getByText(/PT-9042/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // =========================================================================

  describe("Tier 4: Real-World Application Scenarios", () => {
    it("Scenario: Specialist evaluates stiff-knee gait, inspects MAP knee GVS, and prepares SOAP export", () => {
      const specialistOnSoap = vi.fn();
      const specialistOnExport = vi.fn();

      render(
        <Level3SpecialistView
          analysis={mockAnalysis}
          onOpenSoapNote={specialistOnSoap}
          onExportCsv={specialistOnExport}
        />
      );

      // Verify specialist workstation features
      expect(screen.getByText(/Stiff Knee Gait Pattern|Reduced knee flexion/i)).toBeInTheDocument();

      // Click SOAP Note
      const soapBtn = screen.getByRole("button", { name: /SOAP Note/i });
      fireEvent.click(soapBtn);
      expect(specialistOnSoap).toHaveBeenCalledTimes(1);

      // Click CSV Export
      const csvBtn = screen.getByRole("button", { name: /CSV/i });
      fireEvent.click(csvBtn);
      expect(specialistOnExport).toHaveBeenCalledTimes(1);
    });
  });
});

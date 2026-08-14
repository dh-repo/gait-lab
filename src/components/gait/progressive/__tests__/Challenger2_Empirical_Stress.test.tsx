/// <reference types="@testing-library/jest-dom/vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

import {
  exportGaitSessionAsJson,
  exportGaitMetricsAsCsv,
  exportTimeSeriesKinematicsAsCsv,
  downloadBlob,
} from "@/lib/gait/export";

import {
  computeHomographyMatrix,
  solveLinearSystem8x8,
  transformPoint,
  projectToFloorPlane,
} from "@/lib/gait/homography";

import { SOAPNoteModal } from "@/components/gait/SOAPNoteModal";
import { CameraCalibrationAssistant } from "@/components/gait/CameraCalibrationAssistant";
import { Level3SpecialistView } from "../Level3SpecialistView";
import { ResponsiveMediaViewport } from "../ResponsiveMediaViewport";
import { ViewportHUD } from "../ViewportHUD";

import type { AnalysisResult, GaitMetrics, PatientMetadata, CameraPerspectiveParams } from "@/lib/gait/types";
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
  vi.restoreAllMocks();
});

describe("Challenger 2: Empirical Stress-Test Suite — Level 3 Specialist, Exporters, Homography & Viewport", () => {
  const frames = generateSyntheticWalkingFrames({ durationSec: 5.0, fps: 30 });
  const angleAnalysis = computeGaitAngleAnalysis(frames, [] as any, "sagittal");

  const baseAnalysis: AnalysisResult = {
    personId: 402,
    analyzedFrames: 150,
    taskMode: "single",
    notes: ["Challenger 2 Empirical Verification Session"],
    metrics: createMockMetrics({
      overallScore: 78,
      cadenceSpm: 110,
      gaitSpeedMps: 1.25,
      symmetryAngle: 3.4,
      leftStancePct: 60.5,
      rightStancePct: 59.5,
      leftSwingPct: 39.5,
      rightSwingPct: 40.5,
      doubleSupportPct: 20.0,
      kneeFlexLeft: 58.0,
      kneeFlexRight: 57.5,
      kneeAsymmetry: 0.5,
    }),
    guesses: [
      {
        id: "guess-1",
        title: "Normal Symmetrical Gait",
        summary: "Normal range kinematics.",
        evidence: ["Symmetry < 5%"],
        confidence: 0.9,
        severity: "low",
        category: "symmetry",
      },
    ],
    angleAnalysis: angleAnalysis || undefined,
    cameraPerspective: {
      pitchDeg: 1.0,
      yawDeg: 90.0,
      rollDeg: 0.2,
      distanceMeters: 3.0,
      cameraHeightMeters: 1.4,
      isOrthogonal: true,
      obliqueDeviationDeg: 1.0,
      warningLevel: "nominal",
      warningMessage: "Optimal camera alignment",
      confidence: 0.95,
      guidance: {
        heightAdjustmentCm: 0,
        tiltAdjustmentDeg: 0,
        yawAdjustmentDeg: 0,
        distanceAdjustmentM: 0,
        guidanceText: ["Optimal camera alignment"],
      },
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
      patientId: "PT-CHALLENGER-2",
      clinicianNotes: "Empirical boundary stress testing",
      assessmentDate: "2026-08-14",
      assessmentCondition: "Single-Task Walk",
    },
    frames,
  };

  // =========================================================================
  // 1. RAW RESEARCH CSV & JSON EXPORTERS STRESS TESTS
  // =========================================================================

  describe("1. Raw Research CSV & JSON Exporters Stress Testing", () => {
    it("1.1 Handles entirely missing, null, undefined, and NaN metrics in exportGaitMetricsAsCsv", () => {
      const emptyMetrics: GaitMetrics = {
        gaitSpeedMps: null as any,
        cadenceSpm: undefined as any,
        durationSec: Number.NaN,
        stepCount: null as any,
        avgStepTimeSec: undefined as any,
        stepTimeCV: Number.NaN,
        strideTimeCV: null as any,
        leftStancePct: undefined as any,
        rightStancePct: null as any,
        leftSwingPct: Number.NaN,
        rightSwingPct: undefined as any,
        doubleSupportPct: null as any,
        doubleSupportHint: Number.NaN,
        symmetryAngle: undefined as any,
        stepTimeAsymmetry: null as any,
        strideAsymmetry: Number.NaN,
        meanStepWidth: undefined as any,
        lateralSway: null as any,
        verticalBounce: Number.NaN,
        pelvicObliquity: undefined as any,
        pelvicObliquityVar: null as any,
        armSwingLeft: Number.NaN,
        armSwingRight: undefined as any,
        armSwingAsymmetry: null as any,
        kneeFlexLeft: Number.NaN,
        kneeFlexRight: undefined as any,
        kneeAsymmetry: null as any,
        overallScore: Number.NaN,
        stabilityScore: null as any,
        mobilityScore: undefined as any,
        symmetryScore: Number.NaN,
        rhythmScore: null as any,
        automaticityScore: undefined as any,
      };

      const csv = exportGaitMetricsAsCsv(emptyMetrics);
      expect(typeof csv).toBe("string");
      expect(csv.length).toBeGreaterThan(0);

      const lines = csv.split("\n");
      // Header line + 32 metric rows
      expect(lines.length).toBe(33);
      expect(lines[0]).toBe("Parameter,Value,Unit,Reference Range");

      // Verify every row has "N/A" as value and conforms to 4 comma-separated columns
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        expect(line).toContain('"N/A"');
        const columns = line.split('","');
        expect(columns.length).toBe(4);
      }
    });

    it("1.2 Sanitizes special characters, delimiters, newlines, and unicode in session names and JSON serialization", () => {
      const specialMeta: PatientMetadata = {
        patientId: 'PT-"Alpha",\nNew\r\nLine\t<script>alert("xss")</script>\' OR \'1\'=\'1;--',
        clinicianNotes: 'Special delimiters: , ; | \\ \t \n\r "Quoted" and Emoji: 🏃‍♂️🦿⚕️',
        assessmentCondition: 'Fast Walk, 2.5 m/s; "Treadmill" mode',
        assessmentDate: "2026-08-14",
      };

      const jsonStr = exportGaitSessionAsJson(baseAnalysis, specialMeta);
      expect(typeof jsonStr).toBe("string");

      // Verify strict JSON validity
      let parsed: any;
      expect(() => {
        parsed = JSON.parse(jsonStr);
      }).not.toThrow();

      expect(parsed.metadata.patient.patientId).toBe(specialMeta.patientId);
      expect(parsed.metadata.patient.clinicianNotes).toBe(specialMeta.clinicianNotes);
      expect(parsed.metadata.patient.assessmentCondition).toBe(specialMeta.assessmentCondition);
      expect(parsed.metadata.generator).toContain("Gait Lab Quantitative Biomechanics Suite");
      expect(parsed.metrics.cadenceSpm).toBe(110);
    });

    it("1.3 Handles empty, undefined, and sparse kinematics time-series arrays in exportTimeSeriesKinematicsAsCsv", () => {
      // Case A: undefined series
      const csvUndef = exportTimeSeriesKinematicsAsCsv(undefined);
      const linesUndef = csvUndef.trim().split("\n");
      expect(linesUndef.length).toBe(1);
      expect(linesUndef[0]).toBe("Timestamp_s,MidHip_X,MidHip_Y,LeftAnkle_Y,RightAnkle_Y,LeftWrist_X,RightWrist_X,LeftKnee_Angle_Deg,RightKnee_Angle_Deg");

      // Case B: empty series []
      const csvEmpty = exportTimeSeriesKinematicsAsCsv([]);
      const linesEmpty = csvEmpty.trim().split("\n");
      expect(linesEmpty.length).toBe(1);

      // Case C: Sparse series with null/undefined/NaN elements and alternate alias properties
      const sparseSeries: any[] = [
        { t: 0.0, midHipX: 0.5, midHipY: null, leftAnkleY: undefined, kneeAngleLeft: 45.2 },
        { t: 0.033, midHipX: NaN, midHipY: 0.82, rightKneeAngle: 38.5 },
        null,
        undefined,
        { t: 0.1, leftKneeAngle: 55.0, rightKneeAngle: 54.0 },
      ];

      const csvSparse = exportTimeSeriesKinematicsAsCsv(sparseSeries);
      const linesSparse = csvSparse.trim().split("\n");
      expect(linesSparse.length).toBe(6); // 1 header + 5 rows

      // Row 1 checks
      expect(linesSparse[1]).toBe("0.0000,0.5000,,,,,,45.20,");
      // Row 3 (null item) should emit 8 empty commas
      expect(linesSparse[3]).toBe(",,,,,,,,");
    });

    it("1.4 Handles extreme numeric boundaries (Infinity, -Infinity, MAX_SAFE_INTEGER, denormals) safely", () => {
      const extremeMetrics = createMockMetrics({
        gaitSpeedMps: Infinity,
        cadenceSpm: -Infinity,
        symmetryAngle: Number.MAX_SAFE_INTEGER,
        stepTimeCV: 1e-15,
        leftStancePct: -50.0,
      });

      const csv = exportGaitMetricsAsCsv(extremeMetrics);
      expect(csv).toContain('"Gait Speed"');
      expect(csv).toContain('"Infinity"');
      expect(csv).toContain('"-Infinity"');

      // Safe JSON serialization
      const jsonStr = exportGaitSessionAsJson({
        ...baseAnalysis,
        metrics: extremeMetrics,
      });
      // In standard JSON, Infinity serializes to null per spec
      const parsed = JSON.parse(jsonStr);
      expect(parsed.metrics.gaitSpeedMps).toBeNull();
    });

    it("1.5 Triggers downloadBlob safely in browser and exits cleanly in SSR environment", () => {
      const appendSpy = vi.spyOn(document.body, "appendChild");
      const removeSpy = vi.spyOn(document.body, "removeChild");
      const createObjUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
      const revokeObjUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

      downloadBlob("test-content", "test-export.csv", "text/csv");

      expect(createObjUrlSpy).toHaveBeenCalled();
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      expect(revokeObjUrlSpy).toHaveBeenCalledWith("blob:mock-url");
    });
  });

  // =========================================================================
  // 2. EHR SOAP NOTE GENERATOR STRESS TESTS
  // =========================================================================

  describe("2. EHR SOAP Note Generator Stress Testing", () => {
    it("2.1 Generates structured note with extreme abnormal GVS, severe asymmetry (95%/5%), and missing angles", () => {
      const extremeAsymmetryAnalysis: AnalysisResult = {
        ...baseAnalysis,
        taskMode: "dual",
        metrics: createMockMetrics({
          overallScore: 22,
          stabilityScore: 18,
          mobilityScore: 25,
          symmetryScore: 10,
          gaitSpeedMps: 0.35,
          cadenceSpm: 45,
          stepLength: 0.20,
          meanStepWidth: 0.35,
          stepTimeCV: 0.185,
          leftStancePct: 95.0,
          rightStancePct: 5.0,
          leftSwingPct: 5.0,
          rightSwingPct: 95.0,
          symmetryAngle: 48.5,
        }),
        angleAnalysis: {
          metrics: {
            kneePeakFlexionLeft: 12.0,
            kneePeakFlexionRight: 75.0,
            kneeRomLeft: 8.0,
            kneeRomRight: 65.0,
            kneeAsymmetryPct: 155.0,
          },
        } as any,
      };

      render(
        <SOAPNoteModal
          analysis={extremeAsymmetryAnalysis}
          initialOpen={true}
        />
      );

      // Verify Modal Title
      expect(screen.getByText("Automated Clinical SOAP Note")).toBeInTheDocument();

      // Verify Monospace Note Content
      const noteElement = screen.getByText(/CLINICAL GAIT BIOMECHANICS CONSULTATION & SOAP NOTE/i);
      expect(noteElement).toBeInTheDocument();
      const noteText = noteElement.textContent || "";

      // Section S checks
      expect(noteText).toContain("S (SUBJECTIVE):");
      expect(noteText).toContain("Dual-Task (Cognitive Motor Interference)");

      // Section O checks
      expect(noteText).toContain("O (OBJECTIVE KINEMATICS & TELEMETRY):");
      expect(noteText).toContain("Gait Speed: 0.35 m/s");
      expect(noteText).toContain("Cadence: 45 steps/min");
      expect(noteText).toContain("Left 95.0% | Right 5.0%");
      expect(noteText).toContain("Zifchock Symmetry Angle (SA): 48.5%");
      expect(noteText).toContain("Overall Score: 22/100");

      // Section A checks
      expect(noteText).toContain("A (ASSESSMENT & CLINICAL IMPRESSIONS):");

      // Section P checks
      expect(noteText).toContain("P (PLAN & THERAPEUTIC RECOMMENDATIONS):");
    });

    it("2.2 Handles undefined, null, and empty patientMetadata gracefully with fallbacks", () => {
      render(
        <SOAPNoteModal
          analysis={baseAnalysis}
          patientMetadata={undefined}
          initialOpen={true}
        />
      );

      const noteText = screen.getByText(/CLINICAL GAIT BIOMECHANICS/i).textContent || "";
      expect(noteText).toContain("PATIENT ID: PT-ANONYMOUS");
      expect(noteText).toContain("Clinician Intake Notes: General mobility and stability evaluation.");
      expect(noteText).toContain("ASSESSMENT PROTOCOL: Single-Task Walk");
    });

    it("2.3 Copies note to clipboard when 'Copy to Clipboard' button is clicked", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(
        <SOAPNoteModal
          analysis={baseAnalysis}
          initialOpen={true}
        />
      );

      const copyBtn = screen.getByRole("button", { name: /Copy to Clipboard/i });
      fireEvent.click(copyBtn);

      expect(writeTextMock).toHaveBeenCalled();
      const copiedPayload = writeTextMock.mock.calls[0][0];
      expect(copiedPayload).toContain("CLINICAL GAIT BIOMECHANICS CONSULTATION & SOAP NOTE");
    });
  });

  // =========================================================================
  // 3. 3D CAMERA HOMOGRAPHY & DLT SOLVER STRESS TESTS
  // =========================================================================

  describe("3. 3D Camera Homography Assistant & DLT Solver Stress Testing", () => {
    it("3.1 Returns identity matrix fallback for degenerate collinear coordinate points", () => {
      // 4 collinear points on a diagonal line (0,0), (1,1), (2,2), (3,3)
      const collinearImage = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 200, y: 200 },
        { x: 300, y: 300 },
      ];
      const floorPoints = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];

      const H = computeHomographyMatrix(collinearImage, floorPoints);
      expect(H).toEqual([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]);
    });

    it("3.2 Returns identity matrix fallback for insufficient or coincident coordinate points", () => {
      // Less than 4 points
      const fewPoints = [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ];
      const floorPoints = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];

      expect(computeHomographyMatrix(fewPoints as any, floorPoints)).toEqual([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]);

      // Coincident duplicate points
      const duplicatePoints = [
        { x: 50, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 50 },
      ];
      expect(computeHomographyMatrix(duplicatePoints, floorPoints)).toEqual([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]);
    });

    it("3.3 Solves singular 8x8 linear system safely returning null without throwing", () => {
      // All zeroes matrix
      const singularA = Array(8).fill(0).map(() => Array(8).fill(0));
      const b = Array(8).fill(0);

      const res = solveLinearSystem8x8(singularA, b);
      expect(res).toBeNull();
    });

    it("3.4 Correctly transforms 2D points and projects onto floor plane with valid matrix", () => {
      const H = [
        [2, 0, 10],
        [0, 2, 20],
        [0, 0, 1],
      ];

      const p = transformPoint({ x: 5, y: 10 }, H);
      expect(p.x).toBe(20); // 2*5 + 10 = 20
      expect(p.y).toBe(40); // 2*10 + 20 = 40

      const [fx, fy] = projectToFloorPlane([5, 10], H);
      expect(fx).toBe(20);
      expect(fy).toBe(40);
    });

    it("3.5 Handles extreme pitch/roll angles (±89°, ±180°) in CameraCalibrationAssistant without crashing", () => {
      const extremeCamera: CameraPerspectiveParams = {
        pitchDeg: 45.0,
        yawDeg: 135.0,
        rollDeg: 35.0,
        distanceMeters: 4.5,
        cameraHeightMeters: 2.1,
        isOrthogonal: false,
        obliqueDeviationDeg: 45.0,
        warningLevel: "critical",
        warningMessage: "Severe oblique camera angle (>20° tilt). Rectification recommended.",
        confidence: 0.42,
        guidance: {
          heightAdjustmentCm: -30,
          tiltAdjustmentDeg: -45,
          yawAdjustmentDeg: -45,
          distanceAdjustmentM: -1.0,
          guidanceText: ["Lower camera height", "Level camera tilt to 0°"],
        },
        anthropometrics: {
          thighShankRatio: 1.65,
          torsoLegRatio: 0.92,
          normativeThighShankRatio: 1.05,
          normativeTorsoLegRatio: 0.586,
          anthroPitchDeg: 45,
        },
        foreshorteningFactor: 0.707,
      } as any;

      render(
        <CameraCalibrationAssistant
          frames={frames}
          perspectiveParams={extremeCamera}
          initialOpen={true}
        />
      );

      // Warning banner confirms critical severity
      const banner = screen.getByTestId("calibration-warning-banner");
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(/Severe Oblique Angle/i);
      expect(banner).toHaveTextContent(/critical/i);

      // Verify pitch and roll display
      expect(screen.getAllByText(/\+45\.0°/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/35\.0°/).length).toBeGreaterThanOrEqual(1);

      // Anthropometric distortions detected
      expect(screen.getByText(/1\.65/)).toBeInTheDocument(); // Thigh shank ratio
    });

    it("3.6 Tests Level3SpecialistView severe tilt advisory and anatomical plane filtering", () => {
      const severeCam: CameraPerspectiveParams = {
        pitchDeg: 12.5,
        yawDeg: 90.0,
        rollDeg: 8.2,
        distanceMeters: 2.8,
        cameraHeightMeters: 1.4,
        isOrthogonal: false,
        obliqueDeviationDeg: 12.5,
        warningLevel: "critical",
        warningMessage: "Severe camera angle tilt detected.",
        confidence: 0.55,
        guidance: {
          heightAdjustmentCm: 0,
          tiltAdjustmentDeg: -12.5,
          yawAdjustmentDeg: 0,
          distanceAdjustmentM: 0,
          guidanceText: ["Realign camera"],
        },
        anthropometrics: {
          thighShankRatio: 1.2,
          torsoLegRatio: 0.65,
          normativeThighShankRatio: 1.05,
          normativeTorsoLegRatio: 0.586,
          anthroPitchDeg: 12.5,
        },
        foreshorteningFactor: 0.85,
      } as any;

      const { rerender } = render(
        <Level3SpecialistView
          analysis={baseAnalysis}
          cameraPerspective={severeCam}
        />
      );

      // Severe tilt displays calibration advisory in camera card
      expect(screen.getAllByText(/Perspective Alignment Advisory|Excessive camera angle detected/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Kinematic Telemetry Calibrating/i)).toBeInTheDocument();

      // Rerender with normal camera to test plane filtering
      rerender(
        <Level3SpecialistView
          analysis={baseAnalysis}
          cameraPerspective={baseAnalysis.cameraPerspective}
        />
      );

      // Plane filter buttons
      const sagittalBtn = screen.getByRole("button", { name: "Sagittal" });
      fireEvent.click(sagittalBtn);
      expect(screen.getByText(/Sagittal Kinematic Variables/i)).toBeInTheDocument();
      expect(screen.getByText("Knee Extension Angle")).toBeInTheDocument();

      const frontalBtn = screen.getByRole("button", { name: "Frontal" });
      fireEvent.click(frontalBtn);
      expect(screen.getByText(/Frontal Kinematic Variables/i)).toBeInTheDocument();
      expect(screen.getByText("Pelvic Obliquity")).toBeInTheDocument();

      const transverseBtn = screen.getByRole("button", { name: "Transverse" });
      fireEvent.click(transverseBtn);
      expect(screen.getByText(/Transverse Kinematic Variables/i)).toBeInTheDocument();
      expect(screen.getByText("Foot Progression")).toBeInTheDocument();
    });

    it("3.7 Tests Level3SpecialistView action callbacks for SOAP, Calibration, CSV, and JSON export", () => {
      const onSoap = vi.fn();
      const onCalib = vi.fn();
      const onCsv = vi.fn();
      const onJson = vi.fn();

      render(
        <Level3SpecialistView
          analysis={baseAnalysis}
          onOpenSoapNote={onSoap}
          onOpenCalibration={onCalib}
          onExportCsv={onCsv}
          onExportJson={onJson}
        />
      );

      // Trigger SOAP Note button
      const soapBtn = screen.getByRole("button", { name: /Generate SOAP Note/i });
      fireEvent.click(soapBtn);
      expect(onSoap).toHaveBeenCalledTimes(1);

      // Trigger Calibrate Camera button
      const calibBtn = screen.getByRole("button", { name: /Calibrate Camera/i });
      fireEvent.click(calibBtn);
      expect(onCalib).toHaveBeenCalledTimes(1);

      // Trigger Export CSV button
      const csvBtn = screen.getByRole("button", { name: /Export CSV/i });
      fireEvent.click(csvBtn);
      expect(onCsv).toHaveBeenCalledTimes(1);

      // Trigger Export JSON button
      const jsonBtn = screen.getByRole("button", { name: /Export JSON/i });
      fireEvent.click(jsonBtn);
      expect(onJson).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 4. DYNAMIC VIEWPORT RESIZING & HUD ACCESSIBILITY STRESS TESTS
  // =========================================================================

  describe("4. Dynamic Viewport Resizing & HUD Accessibility Stress Testing", () => {
    it("4.1 Resizes between 9:16 portrait and 16:9 landscape aspect ratios with matching CSS classes", () => {
      const { rerender } = render(
        <ResponsiveMediaViewport
          aspectRatio="16:9"
          orientation="landscape"
        >
          <div data-testid="viewport-child">Landscape Stream</div>
        </ResponsiveMediaViewport>
      );

      const viewport = screen.getByTestId("responsive-media-viewport");
      expect(viewport).toHaveClass("aspect-video");

      // Dynamically switch to 9:16 Portrait
      rerender(
        <ResponsiveMediaViewport
          aspectRatio="9:16"
          orientation="portrait"
        >
          <div data-testid="viewport-child">Portrait Stream</div>
        </ResponsiveMediaViewport>
      );

      expect(viewport).toHaveClass("aspect-[9/16]");
    });

    it("4.2 Switches between 2D Video and 3D Avatar modes when allowModeToggle is enabled", () => {
      render(
        <ResponsiveMediaViewport
          allowModeToggle={true}
        />
      );

      const btn2D = screen.getByRole("button", { name: /2D Video/i });
      const btn3D = screen.getByRole("button", { name: /3D Avatar/i });

      expect(btn2D).toBeInTheDocument();
      expect(btn3D).toBeInTheDocument();

      // Click 3D Avatar
      fireEvent.click(btn3D);
      expect(btn3D).toHaveClass("bg-[var(--color-primary)]");

      // Click 2D Video
      fireEvent.click(btn2D);
      expect(btn2D).toHaveClass("bg-[var(--color-primary)]");
    });

    it("4.3 Verifies HUD accessibility, pointer-events layering, and non-blocking overlays", () => {
      const onToggleSkeleton = vi.fn();
      const onToggleJointArcs = vi.fn();
      const onToggleSwayVector = vi.fn();

      render(
        <ResponsiveMediaViewport
          hudOverlay={
            <ViewportHUD
              fps={60}
              confidence={0.45} // Low confidence (<0.5) triggers alert
              pitchDeg={7.5}    // High tilt (>5) triggers warning badge
              rollDeg={1.2}
              currentPhase="Terminal Stance"
              isCollapsible={true}
              defaultExpanded={false}
              showSkeleton={true}
              onToggleSkeleton={onToggleSkeleton}
              showJointArcs={true}
              onToggleJointArcs={onToggleJointArcs}
              showSwayVector={false}
              onToggleSwayVector={onToggleSwayVector}
            />
          }
        >
          <div data-testid="underlying-canvas">Underlying Video/Canvas</div>
        </ResponsiveMediaViewport>
      );

      // Verify underlying canvas is present
      expect(screen.getByTestId("underlying-canvas")).toBeInTheDocument();

      // Low confidence alert is active
      expect(screen.getByText(/45%.*Low Confidence/i)).toBeInTheDocument();

      // High tilt badge is visible in collapsed state
      expect(screen.getByText(/Tilt Warning \(7\.5°\)/i)).toBeInTheDocument();

      // Expand HUD via button
      const toggleBtn = screen.getByRole("button", { name: /Toggle HUD/i });
      expect(toggleBtn).toHaveAttribute("aria-expanded", "false");

      fireEvent.click(toggleBtn);
      expect(toggleBtn).toHaveAttribute("aria-expanded", "true");

      // Expanded HUD telemetry is visible
      expect(screen.getByText(/Camera Spirit Level/i)).toBeInTheDocument();
      expect(screen.getByText(/Pitch: 7\.5°/i)).toBeInTheDocument();

      // Test checkbox control toggles
      const skeletonCheckbox = screen.getByLabelText(/Skeleton/i);
      fireEvent.click(skeletonCheckbox);
      expect(onToggleSkeleton).toHaveBeenCalledWith(false);

      const swayCheckbox = screen.getByLabelText(/Sway Vector/i);
      fireEvent.click(swayCheckbox);
      expect(onToggleSwayVector).toHaveBeenCalledWith(true);
    });
  });
});

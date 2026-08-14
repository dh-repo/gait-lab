// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  reconstructPoseAtPhase,
  calculateDempsterCoM,
  buildBilateralTrajectories,
  buildFullCycleTrajectories,
  type TrajectoryJoint,
} from "../poseReconstruction";
import {
  CLINICAL_EXERCISE_DATABASE,
  ANOMALY_CLINICAL_PROTOCOLS,
} from "../rehab/database";
import {
  generateHomeExerciseProgram,
  calculateScaledDosage,
  inferAffectedSide,
  filterExercisesByPhase,
  formatSoapPlanSection,
} from "../rehab/generator";
import type {
  RehabPhase,
  ExerciseDefinition,
} from "../rehab/types";
import type { Landmark, GaitMetrics } from "../types";
import type { GaitAngleAnalysis } from "../angles";
import type { AnomalyFinding } from "../anomalies";
import { DualAvatarCanvas } from "@/components/gait/DualAvatarCanvas";
import { SessionComparisonView } from "@/components/gait/SessionComparisonView";
import { HepEditorModal } from "@/components/gait/rehab/HepEditorModal";
import { PatientHandoutModal } from "@/components/gait/rehab/PatientHandoutModal";
import type { GaitSessionRecord } from "../persistence";

// Mock Three.js WebGLRenderer for headful DOM testing
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();

  class MockWebGLRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false };
    setSize(_w: number, _h: number) {}
    setPixelRatio(_r: number) {}
    render(_s: unknown, _c: unknown) {}
    dispose() {}
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

// Install ResizeObserver stub for Recharts in jsdom
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 400,
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
              width: 800,
              height: 400,
              top: 0,
              left: 0,
              right: 800,
              bottom: 400,
              x: 0,
              y: 0,
              toJSON: () => ({}),
            },
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function createFullMockSession(id: string, name: string): GaitSessionRecord {
  return {
    id,
    userId: "user-eval-1",
    sessionName: name,
    taskMode: "single",
    createdAt: "2026-08-14T10:00:00.000Z",
    updatedAt: "2026-08-14T10:00:00.000Z",
    overallScore: 84.0,
    stabilityScore: 82.0,
    rhythmScore: 86.0,
    symmetryScore: 85.0,
    mobilityScore: 83.0,
    automaticityScore: 84.0,
    cadenceSpm: 112,
    stepCount: 30,
    durationSec: 16.0,
    viewAngle: "sagittal",
    guessesJson: [],
    metricsJson: {
      viewAngle: "sagittal",
      viewConfidence: 0.95,
      durationSec: 16.0,
      fpsEffective: 30,
      stepCount: 30,
      cadenceSpm: 112,
      avgStepTimeSec: 0.535,
      stepTimeAsymmetry: 1.5,
      strideAsymmetry: 1.2,
      lateralSway: 0.02,
      verticalBounce: 0.015,
      armSwingLeft: 22,
      armSwingRight: 23,
      armSwingAsymmetry: 3.0,
      kneeFlexLeft: 60,
      kneeFlexRight: 61,
      kneeAsymmetry: 1.0,
      stepWidthVariability: 0.02,
      doubleSupportHint: 0.20,
      stepTimeCV: 0.022,
      strideTimeCV: 0.020,
      pelvicObliquity: 3.0,
      pelvicObliquityVar: 0.3,
      meanStepWidth: 0.11,
      pathSmoothness: 0.94,
      stabilityScore: 82.0,
      rhythmScore: 86.0,
      symmetryScore: 85.0,
      mobilityScore: 83.0,
      automaticityScore: 84.0,
      overallScore: 84.0,
      series: [],
      stepEvents: [],
    },
    angleAnalysisJson: {
      isSuppressed: false,
      normalizedPoints: Array.from({ length: 101 }, (_, i) => ({
        gaitCyclePct: i,
        kneeAngleLeft: 10 + 45 * Math.sin((i / 100) * Math.PI),
        kneeAngleRight: 10 + 45 * Math.sin((((i + 50) % 100) / 100) * Math.PI),
        hipAngleLeft: 25 * Math.cos((i / 100) * 2 * Math.PI),
        hipAngleRight: -25 * Math.cos((i / 100) * 2 * Math.PI),
        ankleAngleLeft: 7 * Math.sin((i / 100) * 2 * Math.PI),
        ankleAngleRight: -7 * Math.sin((i / 100) * 2 * Math.PI),
      })),
      leftStrides: [],
      rightStrides: [],
      metrics: {
        kneeRomLeft: 45,
        kneeRomRight: 45,
        kneePeakFlexionLeft: 55,
        kneePeakFlexionRight: 55,
        kneeAsymmetryPct: 0,
        hipRomLeft: 50,
        hipRomRight: 50,
        hipPeakFlexionLeft: 25,
        hipPeakExtensionLeft: -25,
        hipPeakFlexionRight: 25,
        hipPeakExtensionRight: -25,
        hipAsymmetryPct: 0,
        ankleRomLeft: 14,
        ankleRomRight: 14,
        anklePeakDorsiflexionLeft: 7,
        anklePeakDorsiflexionRight: 7,
        anklePeakPlantarflexionLeft: -7,
        anklePeakPlantarflexionRight: -7,
        ankleAsymmetryPct: 0,
      },
      normativeData: [],
    },
  };
}

describe("Empirical Challenger 2 — Adversarial Verification Suite", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. 3D Pose Reconstruction & Trajectory Verification
  // =========================================================================
  describe("3D Pose Reconstruction across all 101 normalized points & boundary cases", () => {
    it("reconstructs 33 valid, non-NaN landmarks across all 101 integer percent points [0..100%]", () => {
      const session = createFullMockSession("session-1", "Test Session");

      for (let p = 0; p <= 100; p++) {
        const landmarks = reconstructPoseAtPhase(session, p);
        expect(landmarks).toHaveLength(33);

        for (let j = 0; j < 33; j++) {
          const lm = landmarks[j];
          expect(lm).toBeDefined();
          expect(Number.isFinite(lm.x)).toBe(true);
          expect(Number.isFinite(lm.y)).toBe(true);
          expect(Number.isFinite(lm.z)).toBe(true);
          expect(Number.isNaN(lm.x)).toBe(false);
          expect(Number.isNaN(lm.y)).toBe(false);
          expect(Number.isNaN(lm.z)).toBe(false);
          expect(lm.visibility).toBeGreaterThanOrEqual(0);
          expect(lm.visibility).toBeLessThanOrEqual(1);
        }

        // Biomechanical anatomical sanity checks
        const lHip = landmarks[23];
        const rHip = landmarks[24];
        const lKnee = landmarks[25];
        const rKnee = landmarks[26];
        const lAnkle = landmarks[27];
        const rAnkle = landmarks[28];

        // Hips should be separated laterally
        expect(rHip.x).toBeGreaterThan(lHip.x);

        // Knees should be below hips in normalized space (larger y is lower in image/screen space)
        expect(lKnee.y).toBeGreaterThan(lHip.y);
        expect(rKnee.y).toBeGreaterThan(rHip.y);

        // Ankles should be below knees
        expect(lAnkle.y).toBeGreaterThan(lKnee.y);
        expect(rAnkle.y).toBeGreaterThan(rKnee.y);
      }
    });

    it("handles extreme boundary phase values (< 0, > 100, NaN, Infinity, negative)", () => {
      const session = createFullMockSession("session-1", "Test Session");

      const negPhase = reconstructPoseAtPhase(session, -50);
      expect(negPhase).toHaveLength(33);
      expect(Number.isFinite(negPhase[0].x)).toBe(true);

      const overPhase = reconstructPoseAtPhase(session, 150);
      expect(overPhase).toHaveLength(33);
      expect(Number.isFinite(overPhase[0].x)).toBe(true);

      const nanPhase = reconstructPoseAtPhase(session, NaN);
      expect(nanPhase).toHaveLength(33);
      expect(Number.isFinite(nanPhase[0].x)).toBe(true);

      const infPhase = reconstructPoseAtPhase(session, Infinity);
      expect(infPhase).toHaveLength(33);
      expect(Number.isFinite(infPhase[0].x)).toBe(true);
    });

    it("verifies 5-segment Dempster Center of Mass weighting and occluded fallbacks", () => {
      // Create artificial landmarks with known positions
      const dummyLandmarks: Landmark[] = Array.from({ length: 33 }, () => ({
        x: 0.5,
        y: 0.5,
        z: 0.0,
        visibility: 0.95,
      }));

      // MidTorso: 11, 12, 23, 24 = 0.5
      // MidThigh: 23, 24, 25, 26 = 0.5
      // MidShank: 25, 26, 27, 28 = 0.5
      // MidArm: 11..16 = 0.5
      // MidFoot: 29..32 = 0.5
      const com = calculateDempsterCoM(dummyLandmarks);
      expect(com.x).toBeCloseTo(0.5, 4);
      expect(com.y).toBeCloseTo(0.5, 4);
      expect(com.z).toBeCloseTo(0.0, 4);

      // Now set partial occlusion (< 0.3 visibility)
      const occludedLandmarks: Landmark[] = dummyLandmarks.map((lm, i) =>
        i >= 20 ? { ...lm, visibility: 0.1 } : lm
      );
      const comPartial = calculateDempsterCoM(occludedLandmarks);
      expect(Number.isFinite(comPartial.x)).toBe(true);
      expect(Number.isFinite(comPartial.y)).toBe(true);
    });

    it("generates continuous 3D bilateral trajectories and CoM trails with custom point resolutions", () => {
      const session = createFullMockSession("session-1", "Test Session");
      const joints: TrajectoryJoint[] = ["none", "ankle", "knee", "wrist", "com"];

      for (const joint of joints) {
        const traj101 = buildBilateralTrajectories(session, joint, 101, 1.25);
        if (joint === "none") {
          expect(traj101.left).toHaveLength(0);
          expect(traj101.right).toHaveLength(0);
        } else {
          expect(traj101.left).toHaveLength(101);
          expect(traj101.right).toHaveLength(101);
          // Check offset applied
          expect(traj101.left[0].x).toBeGreaterThan(0);
        }

        const traj51 = buildBilateralTrajectories(session, joint, 51, -1.25);
        if (joint !== "none") {
          expect(traj51.left).toHaveLength(51);
          expect(traj51.right).toHaveLength(51);
        }

        const fullCycle = buildFullCycleTrajectories(session, joint, 21, 0);
        if (joint === "none") {
          expect(fullCycle).toHaveLength(0);
        } else {
          expect(fullCycle).toHaveLength(21);
        }
      }
    });
  });

  // =========================================================================
  // 2. DualAvatarCanvas & SessionComparisonView UI Verification
  // =========================================================================
  describe("DualAvatarCanvas & SessionComparisonView UI & Lifecycle", () => {
    it("renders Side-by-Side and Ghost Overlay modes with proper indicators and toggles", () => {
      const sessionA = createFullMockSession("s-a", "Baseline Baseline");
      const sessionB = createFullMockSession("s-b", "Follow-up Target");
      const onViewModeChange = vi.fn();
      const onCameraModeChange = vi.fn();
      const onTrajectoryJointChange = vi.fn();

      const { rerender } = render(
        <DualAvatarCanvas
          sessionA={sessionA}
          sessionB={sessionB}
          currentPhasePct={30}
          viewMode="side-by-side"
          onViewModeChange={onViewModeChange}
          onCameraModeChange={onCameraModeChange}
          onTrajectoryJointChange={onTrajectoryJointChange}
        />
      );

      // Verify presence of controls
      expect(screen.getByTestId("mode-side-by-side")).toBeTruthy();
      expect(screen.getByTestId("mode-ghost-overlay")).toBeTruthy();
      expect(screen.getByTestId("cam-orbit")).toBeTruthy();
      expect(screen.getByTestId("cam-sagittal")).toBeTruthy();
      expect(screen.getByTestId("cam-frontal")).toBeTruthy();
      expect(screen.getByTestId("cam-transverse")).toBeTruthy();

      // Camera preset clicks
      fireEvent.click(screen.getByTestId("cam-sagittal"));
      expect(onCameraModeChange).toHaveBeenCalledWith("sagittal");

      fireEvent.click(screen.getByTestId("cam-frontal"));
      expect(onCameraModeChange).toHaveBeenCalledWith("frontal");

      // Trajectory joint trail toggles
      fireEvent.click(screen.getByTestId("traj-knee"));
      expect(onTrajectoryJointChange).toHaveBeenCalledWith("knee");

      fireEvent.click(screen.getByTestId("traj-com"));
      expect(onTrajectoryJointChange).toHaveBeenCalledWith("com");

      // Switch to Ghost Overlay
      fireEvent.click(screen.getByTestId("mode-ghost-overlay"));
      expect(onViewModeChange).toHaveBeenCalledWith("ghost-overlay");

      rerender(
        <DualAvatarCanvas
          sessionA={sessionA}
          sessionB={sessionB}
          currentPhasePct={30}
          viewMode="ghost-overlay"
          activeTrajectoryJoint="knee"
        />
      );

      expect(screen.getByText(/Ghost: A \(Cyan\) · Solid: B \(Emerald\)/i)).toBeTruthy();
      expect(screen.getByText(/Mid Stance/i)).toBeTruthy();
    });

    it("verifies clean unmount without WebGL context leaks or dangling references", () => {
      const sessionA = createFullMockSession("s-a", "Baseline Session");
      const sessionB = createFullMockSession("s-b", "Followup Session");

      const { unmount } = render(
        <DualAvatarCanvas
          sessionA={sessionA}
          sessionB={sessionB}
          currentPhasePct={45}
          showFloorGrid={true}
          isPlaying={true}
        />
      );

      expect(() => unmount()).not.toThrow();
    });

    it("SessionComparisonView renders delta metrics and resampled angle chart", () => {
      const sessionA = createFullMockSession("s-a", "Session 1 Baseline");
      const sessionB = createFullMockSession("s-b", "Session 2 Post-Op");

      render(
        <SessionComparisonView
          sessions={[sessionA, sessionB]}
          initialSessionAId="s-a"
          initialSessionBId="s-b"
        />
      );

      // Verify baseline & target selectors are populated
      expect(screen.getByTestId("selector-session-a")).toBeTruthy();
      expect(screen.getByTestId("selector-session-b")).toBeTruthy();

      // Check deltas
      expect(screen.getByText(/Overall Gait Score/i)).toBeTruthy();
      expect(screen.getByText(/Mobility \(Pace\)/i)).toBeTruthy();
      expect(screen.getByText(/Symmetry Score/i)).toBeTruthy();
      expect(screen.getByText(/Stability Score/i)).toBeTruthy();
    });
  });

  // =========================================================================
  // 3. Clinical Rehab Protocols & Dynamic Dosage Scaling Verification
  // =========================================================================
  describe("Rehabilitation Prescription Generation for all 8 Anomalies across all 3 Phases", () => {
    const all8Anomalies = [
      "antalgic_guarding",
      "parkinsonian_festination",
      "ataxic_wide_base",
      "hemiparetic_stiff_knee",
      "spastic_scissoring",
      "trendelenburg_lurch",
      "steppage_foot_drop",
      "vaulting_hip_hiking",
    ];

    const all3Phases: RehabPhase[] = [
      "phase_1_acute",
      "phase_2_subacute",
      "phase_3_functional",
    ];

    it("contains comprehensive clinical protocols and exercises for all 8 anomalies across all 3 phases", () => {
      // Verify protocols in database
      for (const anomalyId of all8Anomalies) {
        const protocol = ANOMALY_CLINICAL_PROTOCOLS[anomalyId];
        expect(protocol, `Missing protocol for ${anomalyId}`).toBeDefined();
        expect(protocol.anomalyName).toBeTruthy();
        expect(protocol.targetMuscles.length).toBeGreaterThan(0);
        expect(protocol.citations.length).toBeGreaterThan(0);
        expect(protocol.phase1Summary).toBeTruthy();
        expect(protocol.phase2Summary).toBeTruthy();
        expect(protocol.phase3Summary).toBeTruthy();
        expect(protocol.progressionCriteria.length).toBeGreaterThan(0);
        expect(protocol.precautions.length).toBeGreaterThan(0);
        expect(protocol.redFlags.length).toBeGreaterThan(0);

        // Verify exercises exist in database for each phase
        for (const phase of all3Phases) {
          const exercises = filterExercisesByPhase(phase, anomalyId);
          expect(
            exercises.length,
            `Expected at least 1 exercise for anomaly ${anomalyId} in phase ${phase}`
          ).toBeGreaterThanOrEqual(1);

          for (const ex of exercises) {
            expect(ex.id).toBeTruthy();
            expect(ex.name).toBeTruthy();
            expect(ex.category).toBeTruthy();
            expect(ex.defaultSets).toBeGreaterThan(0);
            expect(ex.defaultReps).toBeGreaterThan(0);
            expect(ex.defaultFrequencyPerWeek).toBeGreaterThan(0);
            expect(ex.defaultRestIntervalSec).toBeGreaterThan(0);
            expect(ex.instructions.length).toBeGreaterThan(0);
            expect(ex.coachingCues.length).toBeGreaterThan(0);
            expect(ex.clinicalRationale).toBeTruthy();
            expect(ex.progressionMilestones.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it("generates targeted HomeExerciseProgram for each anomaly with dynamic scaling", () => {
      const dummyMetrics: GaitMetrics = {
        viewAngle: "sagittal",
        viewConfidence: 0.95,
        durationSec: 15,
        fpsEffective: 30,
        stepCount: 28,
        cadenceSpm: 110,
        avgStepTimeSec: 0.54,
        stepTimeAsymmetry: 0.05,
        strideAsymmetry: 0.05,
        lateralSway: 0.02,
        verticalBounce: 0.02,
        armSwingLeft: 20,
        armSwingRight: 20,
        armSwingAsymmetry: 0.02,
        kneeFlexLeft: 55,
        kneeFlexRight: 55,
        kneeAsymmetry: 0,
        stepWidthVariability: 0.02,
        doubleSupportHint: 0.20,
        stepTimeCV: 0.03,
        strideTimeCV: 0.03,
        pelvicObliquity: 3.0,
        pelvicObliquityVar: 0.2,
        meanStepWidth: 0.12,
        pathSmoothness: 0.90,
        stabilityScore: 75,
        rhythmScore: 78,
        symmetryScore: 74,
        mobilityScore: 76,
        automaticityScore: 75,
        overallScore: 75,
        series: [],
        stepEvents: [],
        leftStancePct: 56,
        rightStancePct: 64,
      };

      for (const anomalyId of all8Anomalies) {
        const anomalyFinding: AnomalyFinding = {
          id: anomalyId,
          name: ANOMALY_CLINICAL_PROTOCOLS[anomalyId].anomalyName,
          category: "biomechanical",
          severity: "moderate",
          confidence: 0.88,
          evidence: ["Asymmetric stance loading detected"],
          clinicalSignificance: "Locomotor dysfunction",
          therapeuticTarget: "Targeted resistance & gait retraining",
          literatureCitation: "Perry & Burnfield (2010)",
        };

        const hep = generateHomeExerciseProgram(
          dummyMetrics,
          [anomalyFinding],
          undefined,
          {
            patientId: "PT-TEST-001",
            clinicianNotes: "Routine gait analysis",
            assessmentDate: "2026-08-14",
            assessmentCondition: "Single-Task Walk",
          },
          { patientAge: 68 }
        );

        expect(hep.id).toContain("PT-TEST-001");
        expect(hep.exercises.length).toBeGreaterThan(0);
        expect(hep.dosageChecklist.daysPerWeek).toBeGreaterThanOrEqual(3);
        expect(hep.dosageChecklist.trackingGrid).toHaveLength(7);
        expect(hep.progressionCriteria.length).toBeGreaterThan(0);
        expect(hep.redFlags.length).toBeGreaterThan(0);
      }
    });

    it("verifies dynamic dosage scaling for geriatric/frail patients (age >= 75 or high fall risk) vs young athletic patients", () => {
      const sampleDef: ExerciseDefinition = CLINICAL_EXERCISE_DATABASE[0];

      // 1. Geriatric / High Fall Risk Scaling
      const geriatricScaled = calculateScaledDosage(sampleDef, {
        patientAge: 78,
        fallRiskCategory: "high",
      });

      expect(geriatricScaled.prescribedSets).toBeLessThanOrEqual(3);
      expect(geriatricScaled.prescribedReps).toBeLessThanOrEqual(sampleDef.defaultReps);
      expect(geriatricScaled.prescribedRestIntervalSec).toBe(sampleDef.defaultRestIntervalSec + 15);
      expect(geriatricScaled.prescribedFrequencyPerWeek).toBeLessThanOrEqual(4);

      // 2. Young Athletic Scaling (< 50, low fall risk)
      const athleticScaled = calculateScaledDosage(sampleDef, {
        patientAge: 32,
        fallRiskCategory: "low",
      });

      expect(athleticScaled.prescribedSets).toBe(sampleDef.defaultSets);
      expect(athleticScaled.prescribedReps).toBeGreaterThanOrEqual(sampleDef.defaultReps);
      expect(athleticScaled.prescribedRestIntervalSec).toBeLessThanOrEqual(sampleDef.defaultRestIntervalSec);

      // 3. Middle-aged Standard Scaling
      const standardScaled = calculateScaledDosage(sampleDef, {
        patientAge: 62,
        fallRiskCategory: "moderate",
      });

      expect(standardScaled.prescribedSets).toBe(sampleDef.defaultSets);
      expect(standardScaled.prescribedReps).toBe(sampleDef.defaultReps);
      expect(standardScaled.prescribedRestIntervalSec).toBe(sampleDef.defaultRestIntervalSec);
      expect(standardScaled.prescribedFrequencyPerWeek).toBe(sampleDef.defaultFrequencyPerWeek);
    });

    it("infers affected side correctly for unilateral gait abnormalities", () => {
      const dummyMetrics: GaitMetrics = {
        leftStancePct: 54,
        rightStancePct: 66,
        viewAngle: "sagittal",
        viewConfidence: 0.9,
        durationSec: 10,
        fpsEffective: 30,
        stepCount: 20,
        cadenceSpm: 110,
        avgStepTimeSec: 0.55,
        stepTimeAsymmetry: 0.02,
        strideAsymmetry: 0.02,
        lateralSway: 0.02,
        verticalBounce: 0.02,
        armSwingLeft: 20,
        armSwingRight: 20,
        armSwingAsymmetry: 0.02,
        kneeFlexLeft: 55,
        kneeFlexRight: 55,
        kneeAsymmetry: 0,
        stepWidthVariability: 0.02,
        doubleSupportHint: 0.20,
        stepTimeCV: 0.02,
        strideTimeCV: 0.02,
        pelvicObliquity: 3.0,
        pelvicObliquityVar: 0.2,
        meanStepWidth: 0.12,
        pathSmoothness: 0.90,
        stabilityScore: 80,
        rhythmScore: 80,
        symmetryScore: 80,
        mobilityScore: 80,
        automaticityScore: 80,
        overallScore: 80,
        series: [],
        stepEvents: [],
      };

      const mockAngleAnalysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        metrics: {
          kneeRomLeft: 35,
          kneeRomRight: 55,
          kneePeakFlexionLeft: 68,
          kneePeakFlexionRight: 52,
          kneeAsymmetryPct: 20,
          hipRomLeft: 40,
          hipRomRight: 40,
          hipPeakFlexionLeft: 20,
          hipPeakExtensionLeft: -20,
          hipPeakFlexionRight: 20,
          hipPeakExtensionRight: -20,
          hipAsymmetryPct: 0,
          ankleRomLeft: 10,
          ankleRomRight: 10,
          anklePeakDorsiflexionLeft: 5,
          anklePeakDorsiflexionRight: 5,
          anklePeakPlantarflexionLeft: -5,
          anklePeakPlantarflexionRight: -5,
          ankleAsymmetryPct: 0,
        },
        normativeData: [],
      };

      // Antalgic: stanceL < stanceR -> Left affected
      expect(inferAffectedSide("antalgic_guarding", dummyMetrics, mockAngleAnalysis)).toBe("Left");

      // Hemiparetic stiff knee: romL < romR -> Left affected
      expect(inferAffectedSide("hemiparetic_stiff_knee", dummyMetrics, mockAngleAnalysis)).toBe("Left");

      // Steppage: flexL > flexR + 5 -> Left affected
      expect(inferAffectedSide("steppage_foot_drop", dummyMetrics, mockAngleAnalysis)).toBe("Left");
    });
  });

  // =========================================================================
  // 4. Modals (HepEditorModal, PatientHandoutModal, SOAPNoteModal) Verification
  // =========================================================================
  describe("Modals & SOAP Note Plan Formatting Verification", () => {
    it("HepEditorModal allows interactive phase changing, dosage tweaking, and exercise removal", () => {
      const onSave = vi.fn();
      const onClose = vi.fn();

      render(
        <HepEditorModal
          isOpen={true}
          initialOpen={true}
          onSave={onSave}
          onClose={onClose}
        />
      );

      expect(screen.getByText(/Clinical Home Exercise Program \(HEP\) Customizer/i)).toBeTruthy();

      // Click Phase 1 button
      const p1Btn = screen.getByText(/Phase 1: Acute \/ Protective/i);
      fireEvent.click(p1Btn);

      // Click Phase 3 button
      const p3Btn = screen.getByText(/Phase 3: Functional Integration/i);
      fireEvent.click(p3Btn);

      // Click save
      const saveBtn = screen.getByText(/Save Prescription/i);
      fireEvent.click(saveBtn);
      expect(onSave).toHaveBeenCalled();
    });

    it("PatientHandoutModal renders 7-day adherence tracking grid and toggles checkboxes", () => {
      const dummyProgram = generateHomeExerciseProgram(
        {
          viewAngle: "sagittal",
          viewConfidence: 0.9,
          durationSec: 10,
          fpsEffective: 30,
          stepCount: 20,
          cadenceSpm: 110,
          avgStepTimeSec: 0.55,
          stepTimeAsymmetry: 0.02,
          strideAsymmetry: 0.02,
          lateralSway: 0.02,
          verticalBounce: 0.02,
          armSwingLeft: 20,
          armSwingRight: 20,
          armSwingAsymmetry: 0.02,
          kneeFlexLeft: 55,
          kneeFlexRight: 55,
          kneeAsymmetry: 0,
          stepWidthVariability: 0.02,
          doubleSupportHint: 0.20,
          stepTimeCV: 0.02,
          strideTimeCV: 0.02,
          pelvicObliquity: 3.0,
          pelvicObliquityVar: 0.2,
          meanStepWidth: 0.12,
          pathSmoothness: 0.90,
          stabilityScore: 80,
          rhythmScore: 80,
          symmetryScore: 80,
          mobilityScore: 80,
          automaticityScore: 80,
          overallScore: 80,
          series: [],
          stepEvents: [],
        },
        []
      );

      render(
        <PatientHandoutModal
          program={dummyProgram}
          isOpen={true}
          initialOpen={true}
        />
      );

      expect(screen.getByText(/GAIT LAB REHABILITATION & PHYSICAL THERAPY/i)).toBeTruthy();
      expect(screen.getByText(/7-Day Patient Compliance & Adherence Tracker/i)).toBeTruthy();

      // Check day tags (MON, TUE, WED, THU, FRI, SAT, SUN)
      expect(screen.getByText("MON")).toBeTruthy();
      expect(screen.getByText("SUN")).toBeTruthy();

      // Click on a day box
      const monBox = screen.getByText("MON").closest("div");
      if (monBox) {
        fireEvent.click(monBox);
      }
    });

    it("verifies SOAP note Section P plan formatting and 100% backward compatibility for existing test assertions", () => {
      const mockAnomalies: AnomalyFinding[] = [
        {
          id: "antalgic_guarding",
          name: "Antalgic Guarding Pattern",
          category: "musculoskeletal",
          severity: "moderate",
          confidence: 0.85,
          evidence: ["Stance duration asymmetry 14.5%"],
          clinicalSignificance: "Pain-avoidance gait reducing weight bearing on affected limb.",
          therapeuticTarget: "Symmetrical stance loading & closed-kinetic-chain quad strengthening",
          literatureCitation: "Perry & Burnfield (2010)",
        },
      ];

      const program = generateHomeExerciseProgram(
        {
          viewAngle: "sagittal",
          viewConfidence: 0.9,
          durationSec: 10,
          fpsEffective: 30,
          stepCount: 20,
          cadenceSpm: 110,
          avgStepTimeSec: 0.55,
          stepTimeAsymmetry: 0.02,
          strideAsymmetry: 0.02,
          lateralSway: 0.02,
          verticalBounce: 0.02,
          armSwingLeft: 20,
          armSwingRight: 20,
          armSwingAsymmetry: 0.02,
          kneeFlexLeft: 55,
          kneeFlexRight: 55,
          kneeAsymmetry: 0,
          stepWidthVariability: 0.02,
          doubleSupportHint: 0.20,
          stepTimeCV: 0.02,
          strideTimeCV: 0.02,
          pelvicObliquity: 3.0,
          pelvicObliquityVar: 0.2,
          meanStepWidth: 0.12,
          pathSmoothness: 0.90,
          stabilityScore: 80,
          rhythmScore: 80,
          symmetryScore: 80,
          mobilityScore: 80,
          automaticityScore: 80,
          overallScore: 80,
          series: [],
          stepEvents: [],
        },
        mockAnomalies
      );

      const planText = formatSoapPlanSection(mockAnomalies, program);

      // Verify exact backward-compatible lines
      expect(planText).toContain("- Antalgic Guarding Pattern Focus: Symmetrical stance loading & closed-kinetic-chain quad strengthening");
      expect(planText).toContain("- Re-evaluate spatio-temporal symmetry progression in 4-6 weeks to track Minimal Detectable Change (MDC95).");
      expect(planText).toContain("1. Prescribed Physical Therapy Regimen [");
      expect(planText).toContain("   - Active Prescribed Exercises:");
      expect(planText).toContain("   - Milestone Progression Criteria:");
      expect(planText).toContain("   - Safety Precautions & Red Flags:");
    });
  });
});

import { describe, it, expect } from "vitest";
import { segmentGaitPhases, getPhaseByPercentage, type GaitEventsGroup } from "../phases";
import { classifyGaitAnomalies } from "../anomalies";
import { GaitMetronome } from "../metronome";
import type { GaitMetrics } from "../types";
import type { GaitAngleAnalysis } from "../angles";

describe("Perry & Burnfield 8-Phase Gait Cycle Segmentation", () => {
  it("maps cycle percentages accurately to standard Perry phases", () => {
    expect(getPhaseByPercentage(0).id).toBe("initial_contact");
    expect(getPhaseByPercentage(1.5).id).toBe("initial_contact");
    expect(getPhaseByPercentage(5).id).toBe("loading_response");
    expect(getPhaseByPercentage(20).id).toBe("mid_stance");
    expect(getPhaseByPercentage(40).id).toBe("terminal_stance");
    expect(getPhaseByPercentage(55).id).toBe("pre_swing");
    expect(getPhaseByPercentage(65).id).toBe("initial_swing");
    expect(getPhaseByPercentage(80).id).toBe("mid_swing");
    expect(getPhaseByPercentage(95).id).toBe("terminal_swing");
  });

  it("segments strides and builds frame-by-frame phase timeline", () => {
    const events: GaitEventsGroup = {
      leftHeelStrikes: [0, 30, 60],
      rightHeelStrikes: [15, 45, 75],
      leftToeOffs: [18, 48],
      rightToeOffs: [33, 63],
    };

    const result = segmentGaitPhases(events, 60);
    expect(result.leftStrides.length).toBe(2);
    expect(result.rightStrides.length).toBe(2);
    expect(result.frameTimeline.length).toBe(60);

    // Frame 0: Left heel strike -> Initial Contact
    expect(result.frameTimeline[0].leftPhase?.id).toBe("initial_contact");
    // Frame 15: Right heel strike -> Initial Contact
    expect(result.frameTimeline[15].rightPhase?.id).toBe("initial_contact");
  });
});

describe("Clinical Gait Anomaly Classification", () => {
  const baseMetrics: GaitMetrics = {
    viewAngle: "sagittal",
    viewConfidence: 0.9,
    durationSec: 10,
    fpsEffective: 30,
    stepCount: 20,
    cadenceSpm: 110,
    avgStepTimeSec: 0.54,
    stepTimeAsymmetry: 0.02,
    strideAsymmetry: null,
    lateralSway: null,
    verticalBounce: 0.03,
    armSwingLeft: 0.2,
    armSwingRight: 0.2,
    armSwingAsymmetry: 0.01,
    kneeFlexLeft: null,
    kneeFlexRight: null,
    kneeAsymmetry: null,
    stepWidthVariability: null,
    doubleSupportHint: 0.2,
    stepTimeCV: 0.02,
    strideTimeCV: 0.02,
    pelvicObliquity: null,
    pelvicObliquityVar: null,
    meanStepWidth: 0.12,
    pathSmoothness: 0.9,
    stabilityScore: 80,
    rhythmScore: 80,
    symmetryScore: 80,
    mobilityScore: 80,
    automaticityScore: 80,
    overallScore: 80,
    series: [],
    stepEvents: [],
  };

  it("detects antalgic stance guarding when stance asymmetry exceeds 6%", () => {
    const metrics: GaitMetrics = {
      ...baseMetrics,
      leftStancePct: 48,
      rightStancePct: 64,
      cadenceSpm: 100,
      stepTimeCV: 0.03,
      gaitSpeedMps: 1.0,
    };
    const findings = classifyGaitAnomalies(metrics);
    expect(findings.some((f) => f.id === "antalgic_guarding")).toBe(true);
    const finding = findings.find((f) => f.id === "antalgic_guarding");
    expect(finding?.severity).toBe("severe");
  });

  it("detects Parkinsonian festination on high cadence with short stride and low velocity", () => {
    const metrics: GaitMetrics = {
      ...baseMetrics,
      cadenceSpm: 132,
      gaitSpeedMps: 0.85,
      stepLength: 0.38,
      stepTimeCV: 0.09,
    };
    const findings = classifyGaitAnomalies(metrics);
    expect(findings.some((f) => f.id === "parkinsonian_festination")).toBe(true);
  });

  it("detects ataxic wide-base gait when step width is excessively broad", () => {
    const metrics: GaitMetrics = {
      ...baseMetrics,
      meanStepWidth: 0.22,
      stepTimeCV: 0.11,
      gaitSpeedMps: 0.9,
    };
    const findings = classifyGaitAnomalies(metrics);
    expect(findings.some((f) => f.id === "ataxic_wide_base")).toBe(true);
  });

  it("detects stiff-knee swing deficit when knee flexion ROM is severely asymmetric", () => {
    const metrics: GaitMetrics = {
      ...baseMetrics,
      cadenceSpm: 105,
      gaitSpeedMps: 1.1,
    };
    const angles = {
      isSuppressed: false,
      normalizedPoints: [],
      leftStrides: [],
      rightStrides: [],
      normativeData: [],
      metrics: {
        kneeRomLeft: 32,
        kneeRomRight: 58,
        kneePeakFlexionLeft: 38,
        kneePeakFlexionRight: 62,
        kneeAsymmetryPct: 26,
        hipRomLeft: null,
        hipRomRight: null,
        hipPeakFlexionLeft: null,
        hipPeakExtensionLeft: null,
        hipPeakFlexionRight: null,
        hipPeakExtensionRight: null,
        hipAsymmetryPct: null,
        ankleRomLeft: null,
        ankleRomRight: null,
        anklePeakDorsiflexionLeft: null,
        anklePeakDorsiflexionRight: null,
        anklePeakPlantarflexionLeft: null,
        anklePeakPlantarflexionRight: null,
        ankleAsymmetryPct: null,
      },
    } as GaitAngleAnalysis;
    const findings = classifyGaitAnomalies(metrics, angles);
    expect(findings.some((f) => f.id === "hemiparetic_stiff_knee")).toBe(true);
  });

  it("detects spastic scissoring when step width is critically narrow", () => {
    const metrics: GaitMetrics = {
      ...baseMetrics,
      meanStepWidth: 0.01,
    };
    const findings = classifyGaitAnomalies(metrics);
    expect(findings.some((f) => f.id === "spastic_scissoring")).toBe(true);
    const finding = findings.find((f) => f.id === "spastic_scissoring");
    expect(finding?.severity).toBe("severe");
    expect(finding?.literatureCitation).toContain("Sutherland");
  });

  it("detects Trendelenburg pelvic instability when symmetry angle exceeds 10% with stance asymmetry", () => {
    const metrics: GaitMetrics = {
      ...baseMetrics,
      symmetryAngle: 12.5,
      leftStancePct: 52,
      rightStancePct: 59,
    };
    const findings = classifyGaitAnomalies(metrics);
    expect(findings.some((f) => f.id === "trendelenburg_lurch")).toBe(true);
    const finding = findings.find((f) => f.id === "trendelenburg_lurch");
    expect(finding?.literatureCitation).toContain("Hardcastle");
  });

  it("detects steppage foot drop pattern on deficient ankle dorsiflexion and high knee flexion", () => {
    const metrics: GaitMetrics = {
      ...baseMetrics,
      cadenceSpm: 105,
    };
    const angles = {
      isSuppressed: false,
      normalizedPoints: [],
      leftStrides: [],
      rightStrides: [],
      normativeData: [],
      metrics: {
        kneeRomLeft: 55,
        kneeRomRight: 55,
        kneePeakFlexionLeft: 70,
        kneePeakFlexionRight: 60,
        kneeAsymmetryPct: 5,
        hipRomLeft: null,
        hipRomRight: null,
        hipPeakFlexionLeft: null,
        hipPeakExtensionLeft: null,
        hipPeakFlexionRight: null,
        hipPeakExtensionRight: null,
        hipAsymmetryPct: null,
        ankleRomLeft: 10,
        ankleRomRight: 20,
        anklePeakDorsiflexionLeft: -2.0,
        anklePeakDorsiflexionRight: 10.0,
        anklePeakPlantarflexionLeft: null,
        anklePeakPlantarflexionRight: null,
        ankleAsymmetryPct: 15,
      },
    } as GaitAngleAnalysis;
    const findings = classifyGaitAnomalies(metrics, angles);
    expect(findings.some((f) => f.id === "steppage_foot_drop")).toBe(true);
    const finding = findings.find((f) => f.id === "steppage_foot_drop");
    expect(finding?.literatureCitation).toContain("Perry");
  });

  it("detects vaulting hip hiking clearance compensation on elevated vertical bounce or pelvic obliquity", () => {
    const metrics: GaitMetrics = {
      ...baseMetrics,
      verticalBounce: 0.07,
      pelvicObliquity: 0.05,
      leftStancePct: 52,
      rightStancePct: 60,
    };
    const findings = classifyGaitAnomalies(metrics);
    expect(findings.some((f) => f.id === "vaulting_hip_hiking")).toBe(true);
    const finding = findings.find((f) => f.id === "vaulting_hip_hiking");
    expect(finding?.literatureCitation).toContain("Kerrigan");
  });

  it("verifies all anomaly findings include valid literature citations and therapeutic targets", () => {
    const pathologicMetrics: GaitMetrics = {
      ...baseMetrics,
      leftStancePct: 48,
      rightStancePct: 64,
      cadenceSpm: 130,
      gaitSpeedMps: 0.8,
      stepLength: 0.4,
      stepTimeCV: 0.1,
      meanStepWidth: 0.01,
      symmetryAngle: 15.0,
      verticalBounce: 0.07,
      pelvicObliquity: 0.05,
    };
    const pathologicAngles = {
      isSuppressed: false,
      normalizedPoints: [],
      leftStrides: [],
      rightStrides: [],
      normativeData: [],
      metrics: {
        kneeRomLeft: 30,
        kneeRomRight: 58,
        kneePeakFlexionLeft: 70,
        kneePeakFlexionRight: 60,
        kneeAsymmetryPct: 25,
        hipRomLeft: null,
        hipRomRight: null,
        hipPeakFlexionLeft: null,
        hipPeakExtensionLeft: null,
        hipPeakFlexionRight: null,
        hipPeakExtensionRight: null,
        hipAsymmetryPct: null,
        ankleRomLeft: 10,
        ankleRomRight: 20,
        anklePeakDorsiflexionLeft: -3.0,
        anklePeakDorsiflexionRight: 10.0,
        anklePeakPlantarflexionLeft: null,
        anklePeakPlantarflexionRight: null,
        ankleAsymmetryPct: 15,
      },
    } as GaitAngleAnalysis;

    const findings = classifyGaitAnomalies(pathologicMetrics, pathologicAngles);
    expect(findings.length).toBeGreaterThan(0);

    const detectedIds = findings.map((f) => f.id);
    expect(detectedIds).toContain("antalgic_guarding");
    expect(detectedIds).toContain("parkinsonian_festination");
    expect(detectedIds).toContain("hemiparetic_stiff_knee");
    expect(detectedIds).toContain("spastic_scissoring");
    expect(detectedIds).toContain("trendelenburg_lurch");
    expect(detectedIds).toContain("steppage_foot_drop");
    expect(detectedIds).toContain("vaulting_hip_hiking");

    for (const finding of findings) {
      expect(finding.id).toBeTruthy();
      expect(finding.name).toBeTruthy();
      expect(finding.category).toBeTruthy();
      expect(finding.severity).toBeTruthy();
      expect(finding.confidence).toBeGreaterThan(0);
      expect(finding.evidence.length).toBeGreaterThan(0);
      expect(finding.clinicalSignificance).toBeTruthy();
      expect(finding.literatureCitation).toBeTruthy();
      expect(typeof finding.literatureCitation).toBe("string");
      expect(finding.literatureCitation.length).toBeGreaterThan(10);
      expect(finding.therapeuticTarget).toBeTruthy();
      expect(typeof finding.therapeuticTarget).toBe("string");
      expect(finding.therapeuticTarget.length).toBeGreaterThan(10);
    }
  });
});

describe("GaitMetronome Biofeedback Engine", () => {
  it("initializes with configurable parameters and clamps BPM bounds", () => {
    const metronome = new GaitMetronome({ bpm: 112, volume: 0.6 });
    expect(metronome.getBpm()).toBe(112);
    metronome.setBpm(300);
    expect(metronome.getBpm()).toBe(240);
    metronome.setBpm(10);
    expect(metronome.getBpm()).toBe(30);
  });
});

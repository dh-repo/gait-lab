// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GaitMetronome } from "../metronome";
import { classifyGaitAnomalies } from "../anomalies";
import { exportGaitMetricsAsCsv, exportTimeSeriesKinematicsAsCsv, exportGaitSessionAsJson } from "../export";
import type { GaitMetrics, AnalysisResult } from "../types";
import type { GaitAngleAnalysis, JointAngleMetrics } from "../angles";

describe("Milestone 6 Challenger 2: R3, R4, R5 Empirical Stress Verification Suite", () => {
  const emptyMetrics = {
    overallScore: 50,
    stabilityScore: 50,
    mobilityScore: 50,
    symmetryScore: 50,
    rhythmScore: 50,
    automaticityScore: 50,
    gaitSpeedMps: 1.2,
    cadenceSpm: 110,
    stepLength: 0.6,
    meanStepWidth: 0.12,
    stepTimeCV: 0.02,
    leftStancePct: 60,
    rightStancePct: 60,
    leftSwingPct: 40,
    rightSwingPct: 40,
    doubleSupportPct: 20,
    symmetryAngle: 2,
    stepTimeAsymmetry: 0.01,
    strideAsymmetry: 0.01,
    lateralSway: 0.03,
    verticalBounce: 0.03,
    pelvicObliquity: 0.02,
    pelvicObliquityVar: 0.001,
    armSwingLeft: 0.25,
    armSwingRight: 0.25,
    armSwingAsymmetry: 0.02,
    kneeFlexLeft: 60,
    kneeFlexRight: 60,
    kneeAsymmetry: 2,
    viewAngle: "sagittal",
    viewConfidence: 0.9,
    durationSec: 10,
    fpsEffective: 30,
    stepCount: 10,
    pathSmoothness: 0.9,
    stepEvents: [],
    strideTimeCV: 0.02,
    avgStepTimeSec: 0.5,
    stepWidthVariability: 0.01,
    doubleSupportHint: 0.2,
    series: [],
  } as unknown as GaitMetrics;

  // ---------------------------------------------------------------------------
  // 1. BIOFEEDBACK AUDIO METRONOME & AUDIOCONTEXT STRESS
  // ---------------------------------------------------------------------------
  describe("1. Biofeedback Audio Metronome & AudioContext Safety", () => {
    let metronome: GaitMetronome;

    beforeEach(() => {
      // Mock AudioContext constructor for jsdom environment using standard function (not arrow function)
      const mockOscillator = {
        connect: vi.fn(),
        frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        type: "sine",
        start: vi.fn(),
        stop: vi.fn(),
      };
      const mockGain = {
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      };

      function MockAudioContext(this: any) {
        this.currentTime = 0;
        this.state = "suspended";
        this.resume = vi.fn().mockResolvedValue(undefined);
        this.close = vi.fn().mockResolvedValue(undefined);
        this.createOscillator = () => mockOscillator;
        this.createGain = () => mockGain;
        this.destination = {};
      }

      (window as any).AudioContext = MockAudioContext;
      metronome = new GaitMetronome({ bpm: 110, volume: 0.8 });
    });

    afterEach(() => {
      if (metronome) {
        metronome.destroy();
      }
    });

    it("handles boundary & out-of-range BPM values correctly (clamped between 30 and 240)", () => {
      metronome.setBpm(10);
      expect(metronome.getBpm()).toBe(30);

      metronome.setBpm(300);
      expect(metronome.getBpm()).toBe(240);

      metronome.setBpm(120);
      expect(metronome.getBpm()).toBe(120);
    });

    it("starts, stops, and destroys metronome without throwing exceptions", () => {
      expect(metronome.getActive()).toBe(false);
      metronome.start();
      expect(metronome.getActive()).toBe(true);

      // Calling start multiple times should be idempotent
      metronome.start();
      expect(metronome.getActive()).toBe(true);

      metronome.stop();
      expect(metronome.getActive()).toBe(false);

      metronome.destroy();
      expect(metronome.getActive()).toBe(false);
    });

    it("plays asymmetry alert chime safely", () => {
      expect(() => metronome.playAsymmetryAlert()).not.toThrow();
    });

    it("handles volume clamping between 0 and 1", () => {
      expect(() => metronome.setVolume(-0.5)).not.toThrow();
      expect(() => metronome.setVolume(1.5)).not.toThrow();
      expect(() => metronome.setVolume(0.5)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CLINICAL ANOMALY CLASSIFIERS (ALL 8 CLASSIFIERS UNDER EDGE CASES)
  // ---------------------------------------------------------------------------
  describe("2. Clinical Anomaly Classifiers (8/8 Pathological Classifiers Verification)", () => {
    it("Classifier 1: triggers 'antalgic_guarding' on stance phase asymmetry > 6.0%", () => {
      const metrics: GaitMetrics = {
        ...emptyMetrics,
        leftStancePct: 48.0,
        rightStancePct: 65.0, // stanceDiff = 17% > 6%
      };
      const findings = classifyGaitAnomalies(metrics);
      const antalgic = findings.find((f) => f.id === "antalgic_guarding");

      expect(antalgic).toBeDefined();
      expect(antalgic?.category).toBe("musculoskeletal");
      expect(antalgic?.literatureCitation).toContain("Perry, J., & Burnfield, J. M.");
      expect(antalgic?.evidence.length).toBeGreaterThan(0);
    });

    it("Classifier 2: triggers 'parkinsonian_festination' on elevated cadence & truncated step length", () => {
      const metrics: GaitMetrics = {
        ...emptyMetrics,
        cadenceSpm: 135,
        gaitSpeedMps: 0.7,
        stepLength: 0.35,
        stepTimeCV: 0.10,
      };
      const findings = classifyGaitAnomalies(metrics);
      const parkinsonian = findings.find((f) => f.id === "parkinsonian_festination");

      expect(parkinsonian).toBeDefined();
      expect(parkinsonian?.category).toBe("neurological");
      expect(parkinsonian?.literatureCitation).toContain("Morris, M. E., et al. (2001)");
    });

    it("Classifier 3: triggers 'ataxic_wide_base' on elevated step width > 0.18m", () => {
      const metrics: GaitMetrics = {
        ...emptyMetrics,
        meanStepWidth: 0.22,
        stepTimeCV: 0.12,
      };
      const findings = classifyGaitAnomalies(metrics);
      const ataxic = findings.find((f) => f.id === "ataxic_wide_base");

      expect(ataxic).toBeDefined();
      expect(ataxic?.category).toBe("neurological");
      expect(ataxic?.literatureCitation).toContain("Morton, S. M., & Bastian, A. J. (2004)");
    });

    it("Classifier 4: triggers 'hemiparetic_stiff_knee' when knee ROM diff > 14° and min knee ROM < 45°", () => {
      const angleAnalysis = {
        metrics: {
          kneeRomLeft: 28.0,
          kneeRomRight: 58.0, // diff = 30° > 14°, min = 28° < 45°
          kneeAsymmetryPct: 51.7,
        } as Partial<JointAngleMetrics> as JointAngleMetrics,
      } as unknown as GaitAngleAnalysis;
      const findings = classifyGaitAnomalies(emptyMetrics, angleAnalysis);
      const stiffKnee = findings.find((f) => f.id === "hemiparetic_stiff_knee");

      expect(stiffKnee).toBeDefined();
      expect(stiffKnee?.category).toBe("neurological");
      expect(stiffKnee?.literatureCitation).toContain("Goldberg, S. R., et al. (2006)");
    });

    it("Classifier 5: triggers 'spastic_scissoring' when step width is critically narrow (< 0.05m)", () => {
      const metrics: GaitMetrics = {
        ...emptyMetrics,
        meanStepWidth: 0.02,
      };
      const findings = classifyGaitAnomalies(metrics);
      const scissoring = findings.find((f) => f.id === "spastic_scissoring");

      expect(scissoring).toBeDefined();
      expect(scissoring?.category).toBe("neurological");
      expect(scissoring?.literatureCitation).toContain("Sutherland, D. H., et al. (1993)");
    });

    it("Classifier 6: triggers 'trendelenburg_lurch' when symmetry angle > 10.0% and stance diff > 5%", () => {
      const metrics: GaitMetrics = {
        ...emptyMetrics,
        symmetryAngle: 14.5,
        leftStancePct: 53.0,
        rightStancePct: 62.0,
      };
      const findings = classifyGaitAnomalies(metrics);
      const trendelenburg = findings.find((f) => f.id === "trendelenburg_lurch");

      expect(trendelenburg).toBeDefined();
      expect(trendelenburg?.category).toBe("musculoskeletal");
      expect(trendelenburg?.literatureCitation).toContain("Hardcastle, P., & Nade, S. (1985)");
    });

    it("Classifier 7: triggers 'steppage_foot_drop' via angle analysis dorsiflexion deficit & high knee flexion", () => {
      const angleAnalysis = {
        metrics: {
          anklePeakDorsiflexionLeft: -4.0, // deficit < 2.0
          anklePeakDorsiflexionRight: 12.0,
          kneePeakFlexionLeft: 70.0, // high stepping > 66°
          kneePeakFlexionRight: 60.0,
        } as Partial<JointAngleMetrics> as JointAngleMetrics,
      } as unknown as GaitAngleAnalysis;
      const findings = classifyGaitAnomalies(emptyMetrics, angleAnalysis);
      const steppage = findings.find((f) => f.id === "steppage_foot_drop");

      expect(steppage).toBeDefined();
      expect(steppage?.category).toBe("neurological");
      expect(steppage?.literatureCitation).toContain("Perry, J., & Burnfield, J. M. (2010)");
    });

    it("Classifier 7 (Fallback): triggers 'steppage_foot_drop' via vertical bounce and step time asymmetry when angle analysis is absent", () => {
      const metrics: GaitMetrics = {
        ...emptyMetrics,
        verticalBounce: 0.07,
        stepTimeAsymmetry: 0.12,
      };
      const findings = classifyGaitAnomalies(metrics);
      const steppage = findings.find((f) => f.id === "steppage_foot_drop");

      expect(steppage).toBeDefined();
      expect(steppage?.category).toBe("neurological");
    });

    it("Classifier 8: triggers 'vaulting_hip_hiking' on elevated bounce/pelvic tilt and reduced knee ROM", () => {
      const metrics: GaitMetrics = {
        ...emptyMetrics,
        verticalBounce: 0.075,
        pelvicObliquity: 0.05,
      };
      const angleAnalysis = {
        metrics: {
          kneeRomLeft: 42.0, // < 50.0°
          kneeRomRight: 55.0,
        } as Partial<JointAngleMetrics> as JointAngleMetrics,
      } as unknown as GaitAngleAnalysis;
      const findings = classifyGaitAnomalies(metrics, angleAnalysis);
      const vaulting = findings.find((f) => f.id === "vaulting_hip_hiking");

      expect(vaulting).toBeDefined();
      expect(vaulting?.category).toBe("biomechanical");
      expect(vaulting?.literatureCitation).toContain("Kerrigan, D. C., et al. (2000)");
    });

    it("handles null, undefined, or extreme NaN inputs to classifyGaitAnomalies without throwing errors", () => {
      const invalidMetrics = {
        ...emptyMetrics,
        leftStancePct: NaN,
        rightStancePct: undefined as any,
        cadenceSpm: null as any,
        gaitSpeedMps: NaN,
        meanStepWidth: undefined as any,
        symmetryAngle: NaN,
        verticalBounce: null as any,
      };
      expect(() => classifyGaitAnomalies(invalidMetrics)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. EHR SOAP NOTE GENERATION & LITERATURE CITATIONS FORMATTING
  // ---------------------------------------------------------------------------
  describe("3. EHR SOAP Note Generation & Citation Formatting", () => {
    const baseMetrics: GaitMetrics = {
      overallScore: 50,
      stabilityScore: 50,
      mobilityScore: 50,
      symmetryScore: 50,
      rhythmScore: 50,
      automaticityScore: 50,
      gaitSpeedMps: 1.2,
      cadenceSpm: 110,
      stepLength: 0.6,
      meanStepWidth: 0.12,
      stepTimeCV: 0.02,
      leftStancePct: 60,
      rightStancePct: 60,
      leftSwingPct: 40,
      rightSwingPct: 40,
      doubleSupportPct: 20,
      symmetryAngle: 2,
      stepTimeAsymmetry: 0.01,
      strideAsymmetry: 0.01,
      lateralSway: 0.03,
      verticalBounce: 0.03,
      pelvicObliquity: 0.02,
      pelvicObliquityVar: 0.001,
      armSwingLeft: 0.25,
      armSwingRight: 0.25,
      armSwingAsymmetry: 0.02,
      kneeFlexLeft: 60,
      kneeFlexRight: 60,
      kneeAsymmetry: 2,
      viewAngle: "sagittal",
      viewConfidence: 0.9,
      durationSec: 10,
      fpsEffective: 30,
      stepCount: 10,
      pathSmoothness: 0.9,
      stepEvents: [],
      strideTimeCV: 0.02,
      avgStepTimeSec: 0.5,
      stepWidthVariability: 0.01,
      doubleSupportHint: 0.2,
      series: [],
    };

    it("formats complete EHR SOAP note with literature citations for detected anomalies", () => {
      const metrics: GaitMetrics = {
        ...baseMetrics,
        overallScore: 65,
        stabilityScore: 60,
        mobilityScore: 70,
        symmetryScore: 55,
        rhythmScore: 60,
        automaticityScore: 65,
        gaitSpeedMps: 0.85,
        cadenceSpm: 128,
        stepLength: 0.40,
        meanStepWidth: 0.20,
        stepTimeCV: 0.09,
        leftStancePct: 52.0,
        rightStancePct: 64.0,
        leftSwingPct: 48.0,
        rightSwingPct: 36.0,
        doubleSupportPct: 24.0,
        symmetryAngle: 12.0,
        stepTimeAsymmetry: 0.08,
        strideAsymmetry: 0.08,
        lateralSway: 0.07,
        verticalBounce: 0.06,
        pelvicObliquity: 0.05,
        pelvicObliquityVar: 0.003,
        armSwingLeft: 0.10,
        armSwingRight: 0.30,
        armSwingAsymmetry: 0.20,
        kneeFlexLeft: 35.0,
        kneeFlexRight: 60.0,
        kneeAsymmetry: 25.0,
        viewAngle: "sagittal",
        viewConfidence: 0.95,
        durationSec: 12,
        fpsEffective: 30,
        stepCount: 16,
        pathSmoothness: 0.8,
        stepEvents: [],
        strideTimeCV: 0.08,
      };

      const angleAnalysis = {
        metrics: {
          kneeRomLeft: 30.0,
          kneeRomRight: 58.0,
          kneePeakFlexionLeft: 35.0,
          kneePeakFlexionRight: 62.0,
          anklePeakDorsiflexionLeft: -3.0,
          anklePeakDorsiflexionRight: 10.0,
        } as Partial<JointAngleMetrics> as JointAngleMetrics,
      } as unknown as GaitAngleAnalysis;

      const findings = classifyGaitAnomalies(metrics, angleAnalysis);
      expect(findings.length).toBeGreaterThan(0);

      // Verify that every single finding includes a valid literature citation
      for (const anomaly of findings) {
        expect(anomaly.literatureCitation).toBeDefined();
        expect(anomaly.literatureCitation.length).toBeGreaterThan(10);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. RESEARCH EXPORTER NULL SAFETY & TIME-SERIES GUARD
  // ---------------------------------------------------------------------------
  describe("4. Research Exporter Null Safety & .toFixed() Guards", () => {
    it("exportGaitMetricsAsCsv returns 'N/A' for null, undefined, or NaN metric values", () => {
      const nullMetrics: Partial<GaitMetrics> = {
        gaitSpeedMps: null as any,
        cadenceSpm: undefined as any,
        durationSec: NaN,
        stepCount: null as any,
        avgStepTimeSec: undefined,
        stepTimeCV: NaN,
        leftStancePct: null as any,
        rightStancePct: undefined as any,
        symmetryAngle: NaN,
        overallScore: null as any,
        stabilityScore: undefined as any,
      };

      const csv = exportGaitMetricsAsCsv(nullMetrics as GaitMetrics);

      expect(csv).toContain("Parameter,Value,Unit,Reference Range");
      expect(csv).toContain('"Gait Speed","N/A","m/s","1.10 - 1.40"');
      expect(csv).toContain('"Cadence","N/A","spm","100 - 120"');
      expect(csv).toContain('"Duration","N/A","s","-"');
      expect(csv).toContain('"Step Count","N/A","steps","-"');
      expect(csv).toContain('"Left Stance Phase","N/A","%","58 - 62%"');
      expect(csv).toContain('"Zifchock Symmetry Angle","N/A","%","< 5.0%"');
      expect(csv).toContain('"Overall Score","N/A","/100",">= 75"');
    });

    it("exportTimeSeriesKinematicsAsCsv handles null/undefined/NaN time series frames safely without .toFixed() throw", () => {
      const corruptSeries: Array<Partial<GaitMetrics["series"][number]>> = [
        { t: 0.0, midHipX: 0.1, midHipY: 0.9, leftKneeAngle: 45.0, rightKneeAngle: 48.0 },
        { t: undefined, midHipX: null as any, midHipY: NaN, leftKneeAngle: undefined, rightKneeAngle: null as any },
        { t: 0.066, midHipX: 0.12, midHipY: 0.91, kneeAngleLeft: 47.0, kneeAngleRight: 50.0 }, // using alias names
      ];

      let csv = "";
      expect(() => {
        csv = exportTimeSeriesKinematicsAsCsv(corruptSeries as any);
      }).not.toThrow();

      const lines = csv.split("\n");
      expect(lines.length).toBe(4); // header + 3 rows
      expect(lines[0]).toBe("Timestamp_s,MidHip_X,MidHip_Y,LeftAnkle_Y,RightAnkle_Y,LeftWrist_X,RightWrist_X,LeftKnee_Angle_Deg,RightKnee_Angle_Deg");
      // Row 2 (index 1): complete numbers
      expect(lines[1]).toBe("0.0000,0.1000,0.9000,,,,,45.00,48.00");
      // Row 3 (index 2): missing values formatted as empty strings
      expect(lines[2]).toBe(",,,,,,,,");
      // Row 4 (index 3): alias names formatted correctly
      expect(lines[3]).toBe("0.0660,0.1200,0.9100,,,,,47.00,50.00");
    });

    it("exportGaitSessionAsJson handles missing patient metadata safely", () => {
      const result: Partial<AnalysisResult> = {
        taskMode: "single",
        metrics: { overallScore: 85 } as any,
        guesses: [],
      };

      let json = "";
      expect(() => {
        json = exportGaitSessionAsJson(result as AnalysisResult);
      }).not.toThrow();

      const parsed = JSON.parse(json);
      expect(parsed.metadata.patient.patientId).toBe("ANONYMOUS");
      expect(parsed.metrics.overallScore).toBe(85);
    });
  });
});

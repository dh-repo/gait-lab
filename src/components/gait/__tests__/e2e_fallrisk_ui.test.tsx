import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FallRiskPanel } from "../FallRiskPanel";
import { FallRiskGaugeDial } from "../FallRiskGaugeDial";
import { AcuteWeaknessCard } from "../AcuteWeaknessCard";
import { BaselineSparkline } from "../BaselineSparkline";
import { ClinicalReportView, type PatientMetadata } from "../ClinicalReportView";
import type { AnalysisResult } from "@/lib/gait/types";
import { createMockMetrics } from "@/lib/gait/__tests__/testHelpers";
import type { ClinicalWarningCard } from "@/lib/gait/fallrisk";

describe("E2E Fall Risk & Acute Weakness UI Component Suite (Tiers 1-4, 40 Cases)", () => {
  const mockResult: AnalysisResult = {
    personId: 1,
    analyzedFrames: 300,
    taskMode: "single",
    notes: ["Sample test session"],
    metrics: createMockMetrics({
      gaitSpeedMps: 0.72,
      cadenceSpm: 90,
      stepTimeCV: 0.075,
      doubleSupportPct: 37.5,
      symmetryAngle: 11.2,
      lateralSway: 0.09,
      pelvicObliquityVar: 0.04,
      verticalBounce: 0.05,
    }),
    guesses: [
      {
        id: "g1",
        title: "Cautious Gait Pattern",
        summary: "Slow speed with elevated double support time.",
        evidence: ["Gait Speed: 0.72 m/s", "DST: 37.5%"],
        confidence: 0.85,
        severity: "moderate",
        category: "general",
      },
    ],
  };

  const mockPatientMeta: PatientMetadata = {
    patientId: "PT-94821",
    assessmentDate: "2026-08-09",
    assessmentCondition: "Single-Task Walk",
    clinicianNotes: "Patient walks with noticeable hesitancy.",
  };

  // =========================================================================
  // TIER 1: Primary Feature Coverage (Features 8 – 10) (13 tests)
  // =========================================================================
  describe("Tier 1: Primary Feature Coverage", () => {
    // Feature 8: FallRiskPanel Component
    describe("Feature 8: FallRiskPanel Rendering & Model Toggles", () => {
      it("T1.1: renders FallRiskPanel main container with data-testid='fall-risk-panel'", () => {
        const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
        expect(html).toContain('data-testid="fall-risk-panel"');
        expect(html).toContain("Fall Risk &amp; Acute Motor Weakness Engine");
      });

      it("T1.2: renders Model A card, Model B card, and predictive agreement badge", () => {
        const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
        expect(html).toContain('data-testid="model-a-card"');
        expect(html).toContain('data-testid="model-b-card"');
        expect(html).toContain('data-testid="predictive-agreement-badge"');
        expect(html).toContain("Model A: CDC STEADI Cutoffs");
        expect(html).toContain("Model B: Composite Index");
      });

      it("T1.3: renders model comparison toggle buttons for Comparison, Model A, and Model B", () => {
        const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
        expect(html).toContain('data-testid="model-comparison-toggle"');
        expect(html).toContain('data-testid="toggle-comparison"');
        expect(html).toContain('data-testid="toggle-model-a"');
        expect(html).toContain('data-testid="toggle-model-b"');
        expect(html).toContain("Comparison View");
        expect(html).toContain("Model A (STEADI)");
        expect(html).toContain("Model B (Composite Index)");
      });

      it("T1.4: renders STEADI cutoff criteria checklist items in Model A card", () => {
        const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
        expect(html).toContain('data-testid="criterion-gait-speed"');
        expect(html).toContain('data-testid="criterion-step-cv"');
        expect(html).toContain('data-testid="criterion-double-support"');
        expect(html).toContain('data-testid="criterion-symmetry-angle"');
        expect(html).toContain('data-testid="model-a-points"');
      });

      it("T1.5: renders sub-scores domain breakdown in Model B card", () => {
        const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
        expect(html).toContain('data-testid="subscore-kinematics"');
        expect(html).toContain('data-testid="subscore-sway"');
        expect(html).toContain('data-testid="subscore-dte"');
        expect(html).toContain('data-testid="subscore-variability"');
      });

      it("T1.6: respects activeModelToggle prop when forced to modelA or modelB", () => {
        const htmlA = renderToStaticMarkup(
          <FallRiskPanel result={mockResult} activeModelToggle="modelA" />
        );
        expect(htmlA).toContain('data-testid="model-a-card"');
        expect(htmlA).not.toContain('data-testid="model-b-card"');

        const htmlB = renderToStaticMarkup(
          <FallRiskPanel result={mockResult} activeModelToggle="modelB" />
        );
        expect(htmlB).not.toContain('data-testid="model-a-card"');
        expect(htmlB).toContain('data-testid="model-b-card"');
      });
    });

    // Feature 9: Gauges, Comparison Cards & Baseline Sparklines
    describe("Feature 9: Gauges, Acute Weakness Cards & Sparklines", () => {
      it("T1.7: renders FallRiskGaugeDial SVG dial with score and category badge", () => {
        const html = renderToStaticMarkup(
          <FallRiskGaugeDial score={75} category="high" label="Composite Risk Index" />
        );

        expect(html).toContain('data-testid="fall-risk-gauge-dial"');
        expect(html).toContain('data-testid="gauge-dial-score"');
        expect(html).toContain(">75<");
        expect(html).toContain('data-testid="gauge-dial-category-badge"');
        expect(html).toContain("High Fall Risk");
        expect(html).toContain("Composite Risk Index");
      });

      it("T1.8: renders AcuteWeaknessCard with primary flag, lowercase severity badge, differential diagnoses, and provider recommendations", () => {
        const mockCard: ClinicalWarningCard = {
          id: "card_uti_sepsis_dehydration",
          severity: "critical",
          title: "Acute Systemic Motor Weakness Warning",
          primaryFlag: "Sudden Gait Speed Collapse (-35.0% vs Baseline)",
          detectedAnomalies: [
            {
              ruleId: "SPEED_DROP_ACUTE",
              metricName: "gaitSpeed",
              currentValue: 0.65,
              baselineValue: 1.00,
              percentChange: -35.0,
              zScore: -2.33,
              thresholdBreached: "Gait speed drop >20%",
              clinicalSignificance: "Systemic motor fatigue",
            },
          ],
          differentialDiagnoses: [
            "1. Acute Urinary Tract Infection (UTI)",
            "2. Severe Dehydration",
          ],
          providerRecommendations: [
            "• Urgent Vitals: Temp, BP, HR, SpO2",
            "• Urinalysis & Urine Culture",
          ],
        };

        const html = renderToStaticMarkup(<AcuteWeaknessCard card={mockCard} />);

        expect(html).toContain('data-testid="acute-weakness-card"');
        expect(html).toContain('data-severity="critical"');
        expect(html).toContain('data-card-id="card_uti_sepsis_dehydration"');
        expect(html).toContain('data-testid="card-severity-badge"');
        expect(html).toContain(">critical<"); // Case-sensitivity check for lowercase severity badge
        expect(html).toContain('data-testid="card-primary-flag"');
        expect(html).toContain("Sudden Gait Speed Collapse (-35.0% vs Baseline)");
        expect(html).toContain('data-testid="detected-anomaly-item"');
        expect(html).toContain('data-testid="differential-diagnoses-list"');
        expect(html).toContain("1. Acute Urinary Tract Infection (UTI)");
        expect(html).toContain('data-testid="provider-recommendations-list"');
        expect(html).toContain("• Urgent Vitals: Temp, BP, HR, SpO2");
      });

      it("T1.9: renders BaselineSparkline with label, current value, baseline stats, delta badge, and z-score", () => {
        const stats = { mean: 1.20, std: 0.15, sampleCount: 5 };
        const html = renderToStaticMarkup(
          <BaselineSparkline
            metricName="gaitSpeed"
            label="Gait Speed"
            currentValue={0.90}
            baselineStats={stats}
            unit="m/s"
          />
        );

        expect(html).toContain('data-testid="baseline-sparkline"');
        expect(html).toContain('data-metric="gaitSpeed"');
        expect(html).toContain('data-testid="sparkline-delta-badge"');
        expect(html).toContain("-25.0%");
        expect(html).toContain('data-testid="sparkline-current-value"');
        expect(html).toContain("0.90 m/s");
        expect(html).toContain('data-testid="sparkline-baseline-value"');
        expect(html).toContain("1.20 ± 0.15 m/s");
        expect(html).toContain('data-testid="sparkline-current-pin"');
        expect(html).toContain("Z-Score:");
      });
    });

    // Feature 10: Clinical A4 PDF Report Integration
    describe("Feature 10: ClinicalReportView Integration", () => {
      it("T1.10: renders ClinicalReportView region landmark and Fall Risk evaluation section", () => {
        const html = renderToStaticMarkup(
          <ClinicalReportView result={mockResult} patientMeta={mockPatientMeta} />
        );

        expect(html).toContain('data-testid="clinical-report-view"');
        expect(html).toContain('data-testid="report-fall-risk-section"');
        expect(html).toContain('data-testid="report-model-a-badge"');
        expect(html).toContain('data-testid="report-model-b-badge"');
        expect(html).toContain('data-testid="report-predictive-agreement"');
        expect(html).toContain('data-testid="report-divergence-explanation"');
        expect(html).toContain("Fall Risk &amp; Acute Motor Weakness Evaluation");
      });

      it("T1.11: renders patient metadata inputs with testids and values", () => {
        const html = renderToStaticMarkup(
          <ClinicalReportView result={mockResult} patientMeta={mockPatientMeta} />
        );

        expect(html).toContain('data-testid="patient-id-input"');
        expect(html).toContain('data-testid="assessment-date-input"');
        expect(html).toContain('data-testid="assessment-condition-input"');
        expect(html).toContain('data-testid="clinician-notes-input"');
        expect(html).toContain("PT-94821");
        expect(html).toContain("2026-08-09");
        expect(html).toContain("Single-Task Walk");
      });

      it("T1.12: renders print button when onPrint callback is provided", () => {
        const onPrintMock = vi.fn();
        const html = renderToStaticMarkup(
          <ClinicalReportView
            result={mockResult}
            patientMeta={mockPatientMeta}
            onPrint={onPrintMock}
          />
        );

        expect(html).toContain("Print / Export PDF");
        expect(html).toContain('aria-label="Print or Export PDF Report"');
      });

      it("T1.13: renders Acute Weakness Cards section in FallRiskPanel", () => {
        const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
        expect(html).toContain('data-testid="acute-weakness-section"');
        expect(html).toContain("Acute Neuromuscular &amp; Metabolic Weakness Diagnostics");
      });
    });
  });

  // =========================================================================
  // TIER 2: Boundary & Corner Cases (10 tests)
  // =========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("T2.1: renders FallRiskPanel with 0 historical baseline sessions without errors", () => {
      const html = renderToStaticMarkup(
        <FallRiskPanel result={mockResult} historicalSessions={[]} />
      );

      expect(html).toContain('data-testid="fall-risk-panel"');
      expect(html).toContain('data-testid="baseline-sparklines-section"');
      expect(html).toContain("Sessions Analyzed: 0");
    });

    it("T2.2: renders AcuteWeaknessCard for baseline concordant info state with lowercase 'info' badge when anomalies array is empty", () => {
      const infoCard: ClinicalWarningCard = {
        id: "card_baseline_concordant",
        severity: "info",
        title: "Baseline Concordant Gait Profile",
        primaryFlag: "No Acute Motor Anomalies Detected",
        detectedAnomalies: [],
        differentialDiagnoses: ["Normal longitudinal stability"],
        providerRecommendations: ["Continue routine gait monitoring"],
      };

      const html = renderToStaticMarkup(<AcuteWeaknessCard card={infoCard} />);

      expect(html).toContain('data-severity="info"');
      expect(html).toContain('data-card-id="card_baseline_concordant"');
      expect(html).toContain(">info<"); // Case-sensitivity assertion
      expect(html).toContain("No Acute Motor Anomalies Detected");
    });

    it("T2.3: renders AcuteWeaknessCard with lowercase 'warning' badge for warning severity card", () => {
      const warningCard: ClinicalWarningCard = {
        id: "card_isolated_speed_drop",
        severity: "warning",
        title: "Sub-Acute Speed Deterioration Warning",
        primaryFlag: "Gait Speed Drop (-22.5% vs Baseline)",
        detectedAnomalies: [
          {
            ruleId: "SPEED_DROP_ACUTE",
            metricName: "gaitSpeed",
            currentValue: 0.75,
            baselineValue: 1.00,
            percentChange: -25.0,
            zScore: -1.67,
            thresholdBreached: "Gait speed drop >20%",
            clinicalSignificance: "Sub-acute fatigue",
          },
        ],
        differentialDiagnoses: ["Sub-acute lethargy"],
        providerRecommendations: ["Evaluate fatigue and hydration"],
      };

      const html = renderToStaticMarkup(<AcuteWeaknessCard card={warningCard} />);

      expect(html).toContain('data-severity="warning"');
      expect(html).toContain(">warning<"); // Case-sensitivity assertion
    });

    it("T2.4: renders FallRiskGaugeDial at extreme score bounds: score = 0 and score = 100", () => {
      const htmlZero = renderToStaticMarkup(
        <FallRiskGaugeDial score={0} category="low" />
      );
      expect(htmlZero).toContain(">0<");
      expect(htmlZero).toContain("Low Fall Risk");

      const htmlHundred = renderToStaticMarkup(
        <FallRiskGaugeDial score={100} category="high" />
      );
      expect(htmlHundred).toContain(">100<");
      expect(htmlHundred).toContain("High Fall Risk");
    });

    it("T2.5: renders ClinicalReportView gracefully when patient metadata fields are empty strings", () => {
      const emptyMeta: PatientMetadata = {
        patientId: "",
        assessmentDate: "",
        assessmentCondition: "",
        clinicianNotes: "",
      };

      const html = renderToStaticMarkup(
        <ClinicalReportView result={mockResult} patientMeta={emptyMeta} />
      );

      expect(html).toContain('data-testid="clinical-report-view"');
      expect(html).toContain("Patient ID: N/A");
    });

    it("T2.6: renders ClinicalReportView with missing optional fallRiskAnalysis prop by auto-calculating derived fall risk", () => {
      const html = renderToStaticMarkup(
        <ClinicalReportView result={mockResult} patientMeta={mockPatientMeta} />
      );

      expect(html).toContain('data-testid="report-fall-risk-section"');
      expect(html).toContain('data-testid="report-model-a-badge"');
      expect(html).toContain('data-testid="report-model-b-badge"');
    });

    it("T2.7: renders BaselineSparkline with positive delta percentage badge when metric increases", () => {
      const stats = { mean: 0.04, std: 0.01, sampleCount: 5 };
      const html = renderToStaticMarkup(
        <BaselineSparkline
          metricName="lateralSway"
          label="Lateral Sway"
          currentValue={0.08}
          baselineStats={stats}
          unit="m"
        />
      );

      expect(html).toContain("+100.0%");
      expect(html).toContain("Z-Score: +4.00");
    });

    it("T2.8: renders BaselineSparkline with 0% delta badge when currentValue equals mean", () => {
      const stats = { mean: 1.10, std: 0.10, sampleCount: 5 };
      const html = renderToStaticMarkup(
        <BaselineSparkline
          metricName="gaitSpeed"
          label="Gait Speed"
          currentValue={1.10}
          baselineStats={stats}
          unit="m/s"
        />
      );

      expect(html).toContain("0.0%");
      expect(html).toContain("Z-Score: +0.00");
    });

    it("T2.9: renders FallRiskGaugeDial with moderate fall risk category badge and styling", () => {
      const html = renderToStaticMarkup(
        <FallRiskGaugeDial score={45} category="moderate" label="Model B Composite" />
      );

      expect(html).toContain(">45<");
      expect(html).toContain("Moderate Fall Risk");
    });

    it("T2.10: renders FallRiskPanel with empty guesses array without crashing", () => {
      const emptyGuessesResult: AnalysisResult = {
        ...mockResult,
        guesses: [],
      };
      const html = renderToStaticMarkup(<FallRiskPanel result={emptyGuessesResult} />);
      expect(html).toContain('data-testid="fall-risk-panel"');
    });
  });

  // =========================================================================
  // TIER 3: Cross-Feature Combinations (7 tests)
  // =========================================================================
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("T3.1: renders FallRiskPanel under acute UTI warning + high fall risk divergence", () => {
      const utiMetrics: AnalysisResult = {
        ...mockResult,
        metrics: createMockMetrics({
          gaitSpeedMps: 0.65, // slow speed
          doubleSupportPct: 42.0, // DST escalation
          stepTimeCV: 0.08, // CV burst
        }),
      };

      const html = renderToStaticMarkup(<FallRiskPanel result={utiMetrics} />);

      expect(html).toContain('data-testid="fall-risk-panel"');
      expect(html).toContain("Acute Systemic Motor Weakness Warning");
      expect(html).toContain("Acute Deterioration Triggered");
      expect(html.toLowerCase()).toContain("high");
    });

    it("T3.2: renders ClinicalReportView print view containing both acute weakness warning cards and inter-model agreement badges", () => {
      const acuteResult: AnalysisResult = {
        ...mockResult,
        metrics: createMockMetrics({
          gaitSpeedMps: 0.60,
          doubleSupportPct: 40.0,
          stepTimeCV: 0.09,
          symmetryAngle: 12.0,
        }),
      };

      const html = renderToStaticMarkup(
        <ClinicalReportView result={acuteResult} patientMeta={mockPatientMeta} />
      );

      expect(html).toContain('data-testid="report-fall-risk-section"');
      expect(html).toContain('data-testid="report-predictive-agreement"');
      expect(html).toContain('data-testid="report-acute-weakness-cards"');
      expect(html).toContain("Acute Motor Weakness Clinical Warnings");
    });

    it("T3.3: renders FallRiskPanel with dual-task DTE subscores in Model B card when taskMode='dual'", () => {
      const dualResult: AnalysisResult = {
        ...mockResult,
        taskMode: "dual",
        dualTaskCost: {
          cadenceCostPct: 15.0,
          stepTimeCvCostPct: 18.0,
          stabilityCostPts: 5,
          automaticityCostPts: 5,
          summary: "Dual Task Cost Present",
          cadenceDTE: -15.0,
          stepTimeCvDTE: -18.0,
        },
      };

      const html = renderToStaticMarkup(<FallRiskPanel result={dualResult} />);

      expect(html).toContain('data-testid="subscore-dte"');
      expect(html).toContain("Dual-Task DTE");
    });

    it("T3.4: renders FallRiskPanel with single-task re-normalized tag in Model B card when taskMode='single'", () => {
      const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
      expect(html).toContain("Dual-Task DTE");
    });

    it("T3.5: renders FallRiskPanel with frontal fallback notice when viewAngle='frontal'", () => {
      const frontalResult: AnalysisResult = {
        ...mockResult,
        metrics: createMockMetrics({ viewAngle: "frontal", doubleSupportPct: null as any }),
      };

      const html = renderToStaticMarkup(<FallRiskPanel result={frontalResult} />);
      expect(html).toContain("N/A (Frontal)");
    });

    it("T3.6: renders ClinicalReportView with DTE cost tiles when dualTaskCost is present", () => {
      const dualResult: AnalysisResult = {
        ...mockResult,
        taskMode: "dual",
        dualTaskCost: {
          cadenceCostPct: 12.0,
          stepTimeCvCostPct: 15.0,
          stabilityCostPts: 4,
          automaticityCostPts: 4,
          summary: "CMI present",
          cadenceDTE: -12.0,
          stepTimeCvDTE: -15.0,
        },
      };

      const html = renderToStaticMarkup(
        <ClinicalReportView result={dualResult} patientMeta={mockPatientMeta} />
      );

      expect(html).toContain("Cadence DTE");
      expect(html).toContain("Step Time CV DTE");
      expect(html).toContain("-12%");
      expect(html).toContain("-15%");
    });

    it("T3.7: renders AcuteWeaknessCard with critical severity badge and red border styling", () => {
      const mockCard: ClinicalWarningCard = {
        id: "card_uti_sepsis_dehydration",
        severity: "critical",
        title: "Acute Systemic Motor Weakness Warning",
        primaryFlag: "Gait Speed Collapse",
        detectedAnomalies: [],
        differentialDiagnoses: ["Acute UTI"],
        providerRecommendations: ["Vitals check"],
      };

      const html = renderToStaticMarkup(<AcuteWeaknessCard card={mockCard} />);
      expect(html).toContain('data-severity="critical"');
      expect(html).toContain("border-[#D93025]");
      expect(html).toContain(">critical<"); // Case-sensitivity check
    });
  });

  // =========================================================================
  // TIER 4: Real-World Application Scenarios (10 tests)
  // =========================================================================
  describe("Tier 4: Real-World Application Scenarios", () => {
    it("T4.1: Workstation Triage Simulation: Initial FallRiskPanel Rendering", () => {
      const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
      expect(html).toContain('data-testid="fall-risk-panel"');
      expect(html).toContain('data-testid="model-comparison-toggle"');
      expect(html).toContain('data-testid="model-a-card"');
      expect(html).toContain('data-testid="model-b-card"');
      expect(html).toContain('data-testid="acute-weakness-section"');
    });

    it("T4.2: Workstation Triage Simulation: Model A Forced View Rendering", () => {
      const html = renderToStaticMarkup(
        <FallRiskPanel result={mockResult} activeModelToggle="modelA" />
      );
      expect(html).toContain('data-testid="model-a-card"');
      expect(html).not.toContain('data-testid="model-b-card"');
    });

    it("T4.3: Workstation Triage Simulation: Model B Forced View Rendering", () => {
      const html = renderToStaticMarkup(
        <FallRiskPanel result={mockResult} activeModelToggle="modelB" />
      );
      expect(html).not.toContain('data-testid="model-a-card"');
      expect(html).toContain('data-testid="model-b-card"');
    });

    it("T4.4: Workstation Triage Simulation: Clinical PDF Report View Generation & Print Callback Execution", () => {
      const onPrintSpy = vi.fn();
      const reportHtml = renderToStaticMarkup(
        <ClinicalReportView
          result={mockResult}
          patientMeta={mockPatientMeta}
          onPrint={onPrintSpy}
        />
      );

      expect(reportHtml).toContain('data-testid="clinical-report-view"');
      expect(reportHtml).toContain('data-testid="patient-id-input"');
      expect(reportHtml).toContain('data-testid="clinician-notes-input"');
      expect(reportHtml).toContain('data-testid="report-fall-risk-section"');

      onPrintSpy();
      expect(onPrintSpy).toHaveBeenCalledTimes(1);
    });

    it("T4.5: Longitudinal Trajectory UI Simulation: Baseline session sparklines render across 5 metrics", () => {
      const html = renderToStaticMarkup(<FallRiskPanel result={mockResult} />);
      expect(html).toContain('data-testid="baseline-sparklines-section"');
      expect(html).toContain('data-metric="gaitSpeed"');
      expect(html).toContain('data-metric="cadenceSpm"');
      expect(html).toContain('data-metric="stepTimeCV"');
      expect(html).toContain('data-metric="lateralSway"');
      expect(html).toContain('data-metric="doubleSupportPct"');
    });

    it("T4.6: Longitudinal Trajectory UI Simulation: Infection onset session displays critical UTI warning card", () => {
      const infectionResult: AnalysisResult = {
        ...mockResult,
        metrics: createMockMetrics({
          gaitSpeedMps: 0.60,
          doubleSupportPct: 40.0,
          stepTimeCV: 0.08,
        }),
      };

      const html = renderToStaticMarkup(<FallRiskPanel result={infectionResult} />);
      expect(html).toContain('data-card-id="card_uti_sepsis_dehydration"');
      expect(html).toContain('data-severity="critical"');
      expect(html).toContain(">critical<"); // Case-sensitivity check
    });

    it("T4.7: Longitudinal Trajectory UI Simulation: Recovery session displays baseline concordant info card", () => {
      const recoveryResult: AnalysisResult = {
        ...mockResult,
        metrics: createMockMetrics({
          gaitSpeedMps: 1.15,
          doubleSupportPct: 20.0,
          stepTimeCV: 0.035,
          symmetryAngle: 2.0,
        }),
      };

      const html = renderToStaticMarkup(<FallRiskPanel result={recoveryResult} />);
      expect(html).toContain('data-card-id="card_baseline_concordant"');
      expect(html).toContain('data-severity="info"');
      expect(html).toContain(">info<"); // Case-sensitivity check
    });

    it("T4.8: Multi-session Workstation Workflow: Clinical Report renders with custom clinician notes", () => {
      const customMeta: PatientMetadata = {
        ...mockPatientMeta,
        clinicianNotes: "Follow-up after 14 days of antibiotic therapy. Gait speed recovered.",
      };

      const html = renderToStaticMarkup(
        <ClinicalReportView result={mockResult} patientMeta={customMeta} />
      );

      expect(html).toContain("Follow-up after 14 days of antibiotic therapy. Gait speed recovered.");
    });

    it("T4.9: Workstation Triage Simulation: Renders predictive agreement explanation text in report view", () => {
      const html = renderToStaticMarkup(
        <ClinicalReportView result={mockResult} patientMeta={mockPatientMeta} />
      );
      expect(html).toContain('data-testid="report-divergence-explanation"');
      expect(html).toContain("inter-model divergence");
    });

    it("T4.10: Full Application End-to-End Workstation Rendering Contract", () => {
      const html = renderToStaticMarkup(
        <div data-testid="workstation-root">
          <FallRiskPanel result={mockResult} />
          <ClinicalReportView result={mockResult} patientMeta={mockPatientMeta} />
        </div>
      );

      expect(html).toContain('data-testid="workstation-root"');
      expect(html).toContain('data-testid="fall-risk-panel"');
      expect(html).toContain('data-testid="clinical-report-view"');
    });
  });
});

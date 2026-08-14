"use client";

import { useState } from "react";
import { FileText, Copy, Check, Printer, Sparkles, X, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AnalysisResult, PatientMetadata } from "@/lib/gait/types";
import { classifyGaitAnomalies } from "@/lib/gait/anomalies";
import { generateHomeExerciseProgram, formatSoapPlanSection } from "@/lib/gait/rehab/generator";
import type { HomeExerciseProgram } from "@/lib/gait/rehab/types";
import { HepEditorModal } from "./rehab/HepEditorModal";

export interface SOAPNoteModalProps {
  analysis: AnalysisResult;
  patientMetadata?: PatientMetadata;
  trigger?: React.ReactNode;
  initialOpen?: boolean;
}

export function SOAPNoteModal({ analysis, patientMetadata, trigger, initialOpen = false }: SOAPNoteModalProps) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isHepEditorOpen, setIsHepEditorOpen] = useState(false);

  const { metrics, angleAnalysis } = analysis;
  const anomalies = classifyGaitAnomalies(metrics, angleAnalysis);

  const [currentProgram, setCurrentProgram] = useState<HomeExerciseProgram>(() =>
    generateHomeExerciseProgram(metrics, anomalies, angleAnalysis, patientMetadata)
  );

  const patientId = patientMetadata?.patientId || "PT-ANONYMOUS";
  const notes = patientMetadata?.clinicianNotes || "General mobility and stability evaluation.";
  const condition = patientMetadata?.assessmentCondition || "Single-Task Walk";
  const sessionDate = patientMetadata?.assessmentDate || new Date().toISOString().split("T")[0];

  const formattedPlan = formatSoapPlanSection(anomalies, currentProgram);

  // Compose structured SOAP Note
  const soapNote = `
================================================================================
CLINICAL GAIT BIOMECHANICS CONSULTATION & SOAP NOTE
================================================================================
PATIENT ID: ${patientId}
AGE / SEX: ${patientMetadata?.age !== undefined ? `${patientMetadata.age} years old` : "Unspecified"} / ${patientMetadata?.sex || "Unspecified"}
DATE OF ASSESSMENT: ${sessionDate}
ASSESSMENT PROTOCOL: ${condition} (Computer Vision Multi-Planar Kinematics)
FACILITY: Gait Lab Quantitative Biomechanics Suite

--------------------------------------------------------------------------------
S (SUBJECTIVE):
--------------------------------------------------------------------------------
- Patient evaluated for objective spatio-temporal locomotion metrics.
- Clinician Intake Notes: ${notes}
- Recording Mode: ${analysis.taskMode === "dual" ? "Dual-Task (Cognitive Motor Interference)" : "Single-Task Walk"}

--------------------------------------------------------------------------------
O (OBJECTIVE KINEMATICS & TELEMETRY):
--------------------------------------------------------------------------------
1. Spatio-Temporal Parameters:
   - Gait Speed: ${(metrics.gaitSpeedMps ?? 0).toFixed(2)} m/s (Normative: 1.10 - 1.40 m/s)
   - Cadence: ${(metrics.cadenceSpm ?? 0).toFixed(0)} steps/min (Normative: 100 - 120 spm)
   - Step Length: ${(metrics.stepLength ?? 0).toFixed(2)} m (Normative: 0.60 - 0.75 m)
   - Step Width: ${((metrics.meanStepWidth ?? 0.12) * 100).toFixed(1)} cm (Normative: 8.0 - 12.0 cm)
   - Step Time Variability (CV): ${((metrics.stepTimeCV ?? 0) * 100).toFixed(1)}% (Threshold: < 3.5%)

2. Bilateral Phase Symmetry & Loading:
   - Stance Phase: Left ${(metrics.leftStancePct ?? 60).toFixed(1)}% | Right ${(metrics.rightStancePct ?? 60).toFixed(1)}%
   - Swing Phase: Left ${(metrics.leftSwingPct ?? 40).toFixed(1)}% | Right ${(metrics.rightSwingPct ?? 40).toFixed(1)}%
   - Zifchock Symmetry Angle (SA): ${(metrics.symmetryAngle ?? 0).toFixed(1)}% (Normal < 5.0%)

3. Sagittal Joint Kinematics:
   - Peak Knee Flexion: Left ${(angleAnalysis?.metrics?.kneePeakFlexionLeft ?? 0).toFixed(1)}° | Right ${(angleAnalysis?.metrics?.kneePeakFlexionRight ?? 0).toFixed(1)}°
   - Knee Sagittal ROM: Left ${(angleAnalysis?.metrics?.kneeRomLeft ?? 0).toFixed(1)}° | Right ${(angleAnalysis?.metrics?.kneeRomRight ?? 0).toFixed(1)}°
   - Knee ROM Asymmetry: ${(angleAnalysis?.metrics?.kneeAsymmetryPct ?? 0).toFixed(1)}%

4. Clinical Composite Ratings:
   - Overall Score: ${Math.round(metrics.overallScore)}/100
   - Stability Score: ${Math.round(metrics.stabilityScore)}/100
   - Mobility Score: ${Math.round(metrics.mobilityScore)}/100
   - Symmetry Score: ${Math.round(metrics.symmetryScore)}/100

--------------------------------------------------------------------------------
A (ASSESSMENT & CLINICAL IMPRESSIONS):
--------------------------------------------------------------------------------
${
  anomalies.length > 0
    ? anomalies
        .map(
          (a, idx) =>
            `${idx + 1}. [${a.severity.toUpperCase()}] ${a.name}:\n   - Evidence: ${a.evidence.join(" ")}\n   - Clinical Significance: ${a.clinicalSignificance}\n   - Literature Citation: ${a.literatureCitation}`
        )
        .join("\n\n")
    : "Overall gait kinematics within normal normative biological envelopes. No acute unilateral antalgic guarding or spastic deficits noted."
}

--------------------------------------------------------------------------------
P (PLAN & THERAPEUTIC RECOMMENDATIONS):
--------------------------------------------------------------------------------
${formattedPlan}

================================================================================
CONFIDENTIAL MEDICAL DOCUMENTATION — EHR INTEGRATED
================================================================================
`.trim();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(soapNote);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <div onClick={() => setIsOpen(true)}>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5 border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700">
            <FileText className="w-4 h-4 text-sky-400" />
            <span>Generate EHR SOAP Note</span>
          </Button>
        )}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 text-slate-100">
                  <Sparkles className="w-5 h-5 text-sky-400" />
                  Automated Clinical SOAP Note
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  EHR-ready Subjective, Objective, Assessment & Plan documentation derived from biomechanical telemetry.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsHepEditorOpen(true)}
                  className="gap-1.5 border-sky-700 bg-sky-950/40 text-sky-300 hover:bg-sky-900/50 text-xs"
                >
                  <Sliders className="w-3.5 h-3.5 text-sky-400" />
                  <span>Customize HEP</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 border-slate-700 text-xs">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied" : "Copy to Clipboard"}</span>
                </Button>
                <Button variant="default" size="sm" onClick={handlePrint} className="gap-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs">
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / PDF</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-8 w-8 p-0 rounded-full text-slate-400 hover:text-slate-100">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Formatted Monospace Note View */}
            <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed select-text">
              {soapNote}
            </div>
          </div>
        </div>
      )}

      {/* Embedded HEP Editor Modal */}
      <HepEditorModal
        initialProgram={currentProgram}
        metrics={metrics}
        anomalies={anomalies}
        angleAnalysis={angleAnalysis}
        patientMetadata={patientMetadata}
        isOpen={isHepEditorOpen}
        onClose={() => setIsHepEditorOpen(false)}
        onSave={(updated) => {
          setCurrentProgram(updated);
          setIsHepEditorOpen(false);
        }}
      />
    </>
  );
}


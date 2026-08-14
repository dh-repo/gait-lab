import { useState, useMemo } from "react";
import { Printer, Download, FileJson, Table, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClinicalReportView, type PatientMetadata } from "./ClinicalReportView";
import { computeGaitAngleAnalysis } from "@/lib/gait/angles";
import type { AnalysisResult } from "@/lib/gait/types";
import { classifyGaitAnomalies } from "@/lib/gait/anomalies";
import { generateHomeExerciseProgram } from "@/lib/gait/rehab/generator";
import { PatientHandoutModal } from "./rehab/PatientHandoutModal";
import {
  exportGaitSessionAsJson,
  exportGaitMetricsAsCsv,
  exportTimeSeriesKinematicsAsCsv,
  downloadBlob,
} from "@/lib/gait/export";
import { SOAPNoteModal } from "./SOAPNoteModal";

export function ReportPanel({
  result,
  patientMeta: propPatientMeta,
  onUpdateMeta,
}: {
  result: AnalysisResult;
  patientMeta?: PatientMetadata;
  onUpdateMeta?: (meta: Partial<PatientMetadata>) => void;
}) {
  const [localMeta, setLocalMeta] = useState<PatientMetadata>({
    patientId: "PT-" + Math.floor(10000 + Math.random() * 90000),
    assessmentDate: new Date().toISOString().slice(0, 10),
    assessmentCondition: result.taskMode === "dual" ? "Dual-Task Walk" : "Single-Task Walk",
    clinicianNotes: "",
  });

  const patientMeta = propPatientMeta || result.patientMeta || localMeta;

  const angleAnalysis =
    result.angleAnalysis ||
    computeGaitAngleAnalysis(
      [],
      result.metrics.stepEvents || [],
      result.metrics.viewAngle || "unknown",
    );

  const handleUpdateMeta = (updated: Partial<PatientMetadata>) => {
    if (onUpdateMeta) {
      onUpdateMeta(updated);
    } else {
      setLocalMeta((prev) => ({ ...prev, ...updated }));
    }
  };

  const handleExportJson = () => {
    const jsonStr = exportGaitSessionAsJson(result, patientMeta);
    downloadBlob(jsonStr, `gait_session_${patientMeta.patientId}_${patientMeta.assessmentDate}.json`, "application/json");
  };

  const handleExportMetricsCsv = () => {
    const csvStr = exportGaitMetricsAsCsv(result.metrics);
    downloadBlob(csvStr, `gait_metrics_${patientMeta.patientId}.csv`, "text/csv");
  };

  const handleExportSeriesCsv = () => {
    const csvStr = exportTimeSeriesKinematicsAsCsv(result.metrics.series);
    downloadBlob(csvStr, `gait_kinematics_timeseries_${patientMeta.patientId}.csv`, "text/csv");
  };

  const anomalies = useMemo(
    () => classifyGaitAnomalies(result.metrics, angleAnalysis),
    [result.metrics, angleAnalysis]
  );

  const hepProgram = useMemo(
    () => generateHomeExerciseProgram(result.metrics, anomalies, angleAnalysis, patientMeta),
    [result.metrics, anomalies, angleAnalysis, patientMeta]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print print:hidden flex flex-wrap items-center justify-between gap-3 bg-[var(--color-surface)] p-3 rounded-xl border border-[var(--color-border)]">
        <p className="text-[13px] text-[var(--color-muted)]">
          Clinical summary report · add metadata, then print
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SOAPNoteModal analysis={result} patientMetadata={patientMeta} />
          <PatientHandoutModal
            program={hepProgram}
            patientMetadata={patientMeta}
            trigger={
              <Button size="sm" variant="outline" className="gap-1.5 text-xs border-emerald-800 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40">
                <HeartPulse className="w-3.5 h-3.5 text-emerald-400" /> Rehab HEP Handout
              </Button>
            }
          />
          <Button onClick={handleExportMetricsCsv} size="sm" variant="outline" className="gap-1.5 text-xs">
            <Table className="w-3.5 h-3.5 text-sky-400" /> Summary CSV
          </Button>
          <Button onClick={handleExportSeriesCsv} size="sm" variant="outline" className="gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5 text-emerald-400" /> Series CSV
          </Button>
          <Button onClick={handleExportJson} size="sm" variant="outline" className="gap-1.5 text-xs">
            <FileJson className="w-3.5 h-3.5 text-purple-400" /> JSON
          </Button>
          <Button onClick={() => window.print()} size="sm" variant="default" className="gap-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs">
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="clinical-document w-full p-5 sm:p-8 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <ClinicalReportView
          result={result}
          patientMeta={patientMeta}
          angleAnalysis={angleAnalysis}
          onUpdateMeta={handleUpdateMeta}
          onPrint={() => window.print()}
        />
      </div>
    </div>
  );
}

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClinicalReportView, type PatientMetadata } from "./ClinicalReportView";
import { computeGaitAngleAnalysis } from "@/lib/gait/angles";
import type { AnalysisResult } from "@/lib/gait/types";

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

  return (
    <div className="flex flex-col gap-4">
      {/* Top Action Bar */}
      <div className="no-print print:hidden flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Clinical summary report</h3>
          <p className="text-xs text-[var(--color-muted)]">
            Add session metadata and print a document-style report. Not for diagnostic medical records alone.
          </p>
        </div>
        <Button onClick={() => window.print()} size="sm">
          <Printer className="w-4 h-4 mr-2" /> Print / export PDF
        </Button>
      </div>

      {/* Document-style on-screen preview (matches print) */}
      <div className="clinical-document mx-auto w-full max-w-3xl p-4 sm:p-6 print:max-w-none print:p-0 print:border-0 print:shadow-none">
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

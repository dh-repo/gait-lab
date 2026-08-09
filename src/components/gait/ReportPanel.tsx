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
    <div className="flex flex-col gap-5">
      <div className="no-print print:hidden flex items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--color-muted)]">
          Clinical summary report · add metadata, then print
        </p>
        <Button onClick={() => window.print()} size="sm" variant="outline">
          <Printer className="w-4 h-4 mr-2" /> Print / export PDF
        </Button>
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

import { cn } from "@/lib/utils";
import type { ClinicalWarningCard } from "@/lib/gait/fallrisk";
import { AlertTriangle, AlertCircle, Info, Stethoscope, CheckCircle2 } from "lucide-react";

export interface AcuteWeaknessCardProps {
  card: ClinicalWarningCard;
  className?: string;
}

export function AcuteWeaknessCard({ card, className }: AcuteWeaknessCardProps) {
  const isCritical = card.severity === "critical";
  const isWarning = card.severity === "warning";

  const cardBorder = isCritical
    ? "border-[#D93025] bg-[#FFF8F7]"
    : isWarning
    ? "border-[#F9AB00] bg-[#FEFDF9]"
    : "border-[#DADCE0] bg-[#F8F9FA]";

  const headerBg = isCritical
    ? "bg-[#FCE8E6] text-[#C5221F]"
    : isWarning
    ? "bg-[#FEF7E0] text-[#B06000]"
    : "bg-[#E8F0FE] text-[#1967D2]";

  const IconComponent = isCritical
    ? AlertTriangle
    : isWarning
    ? AlertCircle
    : card.id === "card_baseline_concordant"
    ? CheckCircle2
    : Info;

  return (
    <div
      data-testid="acute-weakness-card"
      data-severity={card.severity}
      data-card-id={card.id}
      className={cn(
        "flex flex-col rounded-lg border shadow-xs overflow-hidden transition-all",
        cardBorder,
        className
      )}
    >
      {/* Header Banner */}
      <div className={cn("flex items-center justify-between px-4 py-3 border-b border-inherit", headerBg)}>
        <div className="flex items-center gap-2.5">
          <IconComponent className="size-5 shrink-0" />
          <h4 className="text-sm font-bold tracking-tight">{card.title}</h4>
        </div>
        <span
          data-testid="card-severity-badge"
          className="uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded bg-white/70 backdrop-blur-xs"
        >
          {card.severity}
        </span>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3 text-xs text-[#202124]">
        {/* Primary Flag Banner */}
        <div className="rounded-md border border-inherit bg-white p-2.5 shadow-2xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5F6368] block">
            Primary Deterioration Flag
          </span>
          <p data-testid="card-primary-flag" className="text-sm font-bold text-[#202124] mt-0.5">
            {card.primaryFlag}
          </p>
        </div>

        {/* Detected Anomalies */}
        {card.detectedAnomalies.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5F6368]">
              Triggered Biomarkers ({card.detectedAnomalies.length})
            </span>
            <ul className="space-y-1 pl-1">
              {card.detectedAnomalies.map((anom) => (
                <li
                  key={anom.ruleId}
                  data-testid="detected-anomaly-item"
                  className="rounded border border-[#DADCE0] bg-white p-2 text-xs"
                >
                  <div className="flex justify-between font-semibold text-[#202124]">
                    <span>{anom.ruleId}</span>
                    <span className="tabular text-[#D93025]">
                      {anom.percentChange > 0 ? `+${anom.percentChange}%` : `${anom.percentChange}%`} (Z={anom.zScore})
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5F6368] mt-0.5">{anom.thresholdBreached}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Differential Diagnoses */}
        {card.differentialDiagnoses.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5F6368]">
              Differential Diagnoses to Evaluate
            </span>
            <ul data-testid="differential-diagnoses-list" className="space-y-0.5 rounded-md bg-white p-2.5 border border-[#DADCE0]">
              {card.differentialDiagnoses.map((diag, i) => (
                <li key={i} className="text-xs font-medium text-[#202124]">
                  {diag}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Provider Recommendations */}
        {card.providerRecommendations.length > 0 && (
          <div className="space-y-1 border-t border-[#DADCE0] pt-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1A73E8]">
              <Stethoscope className="size-3.5" />
              <span>Actionable Provider Recommendations</span>
            </div>
            <ul data-testid="provider-recommendations-list" className="space-y-0.5 text-xs text-[#3C4043] pl-2">
              {card.providerRecommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

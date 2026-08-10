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
    : "border-[var(--color-border)] bg-[var(--color-bg)]";

  const headerBg = isCritical
    ? "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]"
    : isWarning
    ? "bg-[var(--color-warn-bg)] text-[var(--color-warn-text)]"
    : "bg-[var(--color-info-bg)] text-[var(--color-info-text)]";

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
        "flex flex-col rounded-lg border shadow-[var(--shadow-card)] overflow-hidden transition-all",
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
          className="uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--color-surface)]/70 backdrop-blur-xs"
        >
          {card.severity}
        </span>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3 text-xs text-[var(--color-fg)]">
        {/* Primary Flag Banner */}
        <div className="rounded-md border border-inherit bg-[var(--color-surface)] p-2.5 shadow-[var(--shadow-card)]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)] block">
            Primary Deterioration Flag
          </span>
          <p data-testid="card-primary-flag" className="text-sm font-bold text-[var(--color-fg)] mt-0.5">
            {card.primaryFlag}
          </p>
        </div>

        {/* Detected Anomalies */}
        {card.detectedAnomalies.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Triggered Biomarkers ({card.detectedAnomalies.length})
            </span>
            <ul className="space-y-1 pl-1">
              {card.detectedAnomalies.map((anom) => (
                <li
                  key={anom.ruleId}
                  data-testid="detected-anomaly-item"
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs"
                >
                  <div className="flex justify-between font-semibold text-[var(--color-fg)]">
                    <span>{anom.ruleId}</span>
                    <span className="tabular text-[#D93025]">
                      {anom.percentChange > 0 ? `+${anom.percentChange}%` : `${anom.percentChange}%`} (Z={anom.zScore})
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{anom.thresholdBreached}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Differential Diagnoses */}
        {card.differentialDiagnoses.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Differential Diagnoses to Evaluate
            </span>
            <ul data-testid="differential-diagnoses-list" className="space-y-0.5 rounded-md bg-[var(--color-surface)] p-2.5 border border-[var(--color-border)]">
              {card.differentialDiagnoses.map((diag, i) => (
                <li key={i} className="text-xs font-medium text-[var(--color-fg)]">
                  {diag}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Provider Recommendations */}
        {card.providerRecommendations.length > 0 && (
          <div className="space-y-1 border-t border-[var(--color-border)] pt-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-primary)]">
              <Stethoscope className="size-3.5" />
              <span>Actionable Provider Recommendations</span>
            </div>
            <ul data-testid="provider-recommendations-list" className="space-y-0.5 text-xs text-[var(--color-muted)] pl-2">
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

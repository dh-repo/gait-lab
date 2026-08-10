import { cn } from "@/lib/utils";
import type { MetricBaselineStats } from "@/lib/gait/fallrisk";

export interface BaselineSparklineProps {
  metricName: string;
  label: string;
  currentValue: number;
  baselineStats: MetricBaselineStats;
  unit?: string;
  className?: string;
}

export function BaselineSparkline({
  metricName,
  label,
  currentValue,
  baselineStats,
  unit = "",
  className,
}: BaselineSparklineProps) {
  const mean = baselineStats.mean;
  const std = baselineStats.std;
  const sampleCount = baselineStats.sampleCount;

  const pctChange = mean > 0 ? ((currentValue - mean) / mean) * 100 : 0;
  const zScore = std > 0 ? (currentValue - mean) / std : 0;

  const isDegraded =
    metricName === "gaitSpeed" || metricName === "cadenceSpm"
      ? pctChange <= -15
      : pctChange >= 25;

  const badgeColor = isDegraded
    ? "bg-[#FCE8E6] text-[#C5221F] border-[#D93025]/30"
    : "bg-[#E6F4EA] text-[#137333] border-[#188038]/30";

  // Visual Bounds for SVG Sparkline [-2.5 std, +2.5 std]
  const minVal = Math.max(0, mean - 2.5 * std);
  const maxVal = mean + 2.5 * std;
  const range = maxVal - minVal > 0 ? maxVal - minVal : 1;

  const normalMinX = Math.max(0, Math.min(100, ((mean - 1.0 * std - minVal) / range) * 100));
  const normalMaxX = Math.max(0, Math.min(100, ((mean + 1.0 * std - minVal) / range) * 100));
  const meanX = Math.max(0, Math.min(100, ((mean - minVal) / range) * 100));
  const currentX = Math.max(0, Math.min(100, ((currentValue - minVal) / range) * 100));

  return (
    <div
      data-testid="baseline-sparkline"
      data-metric={metricName}
      className={cn("flex flex-col gap-1.5 rounded-md border border-[#DADCE0] bg-white p-3 shadow-xs", className)}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#202124]">{label}</span>
        <span
          data-testid="sparkline-delta-badge"
          className={cn("tabular text-[11px] font-bold px-2 py-0.5 rounded border", badgeColor)}
        >
          {pctChange >= 0 ? `+${pctChange.toFixed(1)}%` : `${pctChange.toFixed(1)}%`}
        </span>
      </div>

      <div className="flex items-baseline justify-between text-xs text-[#5F6368]">
        <div>
          <span className="text-[10px] uppercase font-medium">Current: </span>
          <span data-testid="sparkline-current-value" className="tabular font-bold text-[#202124]">
            {currentValue.toFixed(2)} {unit}
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-medium">Baseline ({sampleCount}s): </span>
          <span data-testid="sparkline-baseline-value" className="tabular">
            {mean.toFixed(2)} ± {std.toFixed(2)} {unit}
          </span>
        </div>
      </div>

      {/* SVG Range Bar */}
      <div className="relative h-4 w-full bg-[#F1F3F4] rounded overflow-hidden border border-[#DADCE0]">
        {/* Normal Range Band (1 Std Dev) */}
        <div
          className="absolute top-0 bottom-0 bg-[#E8F0FE]"
          style={{ left: `${normalMinX}%`, width: `${normalMaxX - normalMinX}%` }}
        />
        {/* Mean Marker Line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[#1967D2]"
          style={{ left: `${meanX}%` }}
        />
        {/* Current Value Marker Pin */}
        <div
          data-testid="sparkline-current-pin"
          className={cn(
            "absolute top-0 bottom-0 w-2 rounded-full border border-white shadow-xs -ml-1",
            isDegraded ? "bg-[#D93025]" : "bg-[#188038]"
          )}
          style={{ left: `${currentX}%` }}
        />
      </div>

      <div className="flex justify-between text-[9px] text-[#70757A] font-mono">
        <span>Z-Score: {zScore >= 0 ? `+${zScore.toFixed(2)}` : zScore.toFixed(2)}</span>
        <span>Norm Band: [{mean.toFixed(1)} ± {std.toFixed(1)}]</span>
      </div>
    </div>
  );
}

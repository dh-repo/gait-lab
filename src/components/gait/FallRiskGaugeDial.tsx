import { cn } from "@/lib/utils";
import type { RiskCategory } from "@/lib/gait/fallrisk";

export interface FallRiskGaugeDialProps {
  score: number;
  size?: number;
  label?: string;
  category?: RiskCategory;
  className?: string;
}

export function FallRiskGaugeDial({
  score,
  size = 140,
  label = "Fall Risk Index",
  category,
  className,
}: FallRiskGaugeDialProps) {
  const safeScore = Math.min(100, Math.max(0, Math.round(score)));

  // Derive risk category if not explicitly provided
  const derivedCategory: RiskCategory =
    category || (safeScore >= 66 ? "high" : safeScore >= 33 ? "moderate" : "low");

  // Category colors matching Google Workspace palette
  const strokeColor =
    derivedCategory === "high"
      ? "#D93025" // Google Danger Red
      : derivedCategory === "moderate"
      ? "#F9AB00" // Google Warning Amber
      : "#188038"; // Google Success Green

  const categoryLabel =
    derivedCategory === "high"
      ? "High Fall Risk"
      : derivedCategory === "moderate"
      ? "Moderate Fall Risk"
      : "Low Fall Risk";

  const badgeBg =
    derivedCategory === "high"
      ? "bg-[#FCE8E6] text-[#C5221F] border-[#D93025]/30"
      : derivedCategory === "moderate"
      ? "bg-[#FEF7E0] text-[#B06000] border-[#F9AB00]/30"
      : "bg-[#E6F4EA] text-[#137333] border-[#188038]/30";

  // SVG Gauge dimensions (half dial: -180 deg to 0 deg)
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // Half circumference
  const strokeDashoffset = circumference - (safeScore / 100) * circumference;

  return (
    <div
      data-testid="fall-risk-gauge-dial"
      className={cn("flex flex-col items-center justify-center gap-2 text-center", className)}
    >
      <div className="relative flex items-center justify-center" style={{ width: size, height: size / 2 + 20 }}>
        <svg
          width={size}
          height={size / 2 + 10}
          viewBox={`0 0 ${size} ${size / 2 + 10}`}
          className="overflow-visible"
        >
          {/* Background Arc */}
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke="#E8EAED"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Progress Arc */}
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Center Score Text */}
        <div className="absolute bottom-1 flex flex-col items-center justify-center">
          <span
            data-testid="gauge-dial-score"
            className="tabular-nums text-3xl font-bold tracking-tight text-[#202124]"
          >
            {safeScore}
          </span>
          <span className="text-[11px] font-medium text-[#5F6368]">{label}</span>
        </div>
      </div>

      {/* Category Badge */}
      <span
        data-testid="gauge-dial-category-badge"
        className={cn(
          "inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold tracking-wide shadow-xs",
          badgeBg
        )}
      >
        {categoryLabel}
      </span>
    </div>
  );
}

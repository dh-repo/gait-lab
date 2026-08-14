import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Area,
  Line,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AlertTriangle, Activity } from "lucide-react";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";
import { cn } from "@/lib/utils";

export interface JointAnglesChartProps {
  angleAnalysis?: GaitAngleAnalysis | null;
  currentTimeSec?: number;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  currentGaitCyclePct?: number;
  title?: string;
  className?: string;
}

export type JointTab = "knee" | "hip" | "ankle";

// Custom Dark Popover Tooltip for Google Workspace/Console design
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data = payload[0]?.payload;
    if (!data) return null;

    const leftVal = data.leftAngle != null && !isNaN(data.leftAngle) ? `${Number(data.leftAngle).toFixed(1)}°` : "—";
    const rightVal = data.rightAngle != null && !isNaN(data.rightAngle) ? `${Number(data.rightAngle).toFixed(1)}°` : "—";
    const normMin = data.normativeMin != null ? `${Number(data.normativeMin).toFixed(1)}°` : "—";
    const normMax = data.normativeMax != null ? `${Number(data.normativeMax).toFixed(1)}°` : "—";

    return (
      <div className="rounded-lg bg-[var(--color-surface)] p-3 shadow-dropdown border border-[var(--color-border)] font-['Google_Sans',sans-serif] text-xs">
        <p className="font-semibold text-[var(--color-fg)] mb-1.5 border-b border-[#E8EAED] pb-1">
          {label}% Gait Cycle
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[var(--color-primary)] font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-primary)]" />
              Left Leg:
            </span>
            <span className="font-mono font-semibold text-[var(--color-fg)] tabular-nums">{leftVal}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[#34A853] font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-[#34A853]" />
              Right Leg:
            </span>
            <span className="font-mono font-semibold text-[var(--color-fg)] tabular-nums">{rightVal}</span>
          </div>
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-[#E8EAED] text-[var(--color-muted)]">
            <span>Normative Bounds:</span>
            <span className="font-mono tabular-nums">{normMin} to {normMax}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export function JointAnglesChart({
  angleAnalysis,
  currentTimeSec = 0,
  isPlaying = false,
  onTogglePlay,
  currentGaitCyclePct,
  title = "Joint Kinematic Angle Trajectories",
  className,
}: JointAnglesChartProps) {
  const [activeJoint, setActiveJoint] = useState<JointTab>("knee");

  const chartData = useMemo(() => {
    if (!angleAnalysis) return [];
    const points = angleAnalysis.normalizedPoints || [];
    const normative = angleAnalysis.normativeData || [];

    return points.map((pt, index) => {
      const norm = normative[index] || normative[0] || {};
      const gaitCyclePct = pt.gaitCyclePct;

      let leftAngle: number | undefined;
      let rightAngle: number | undefined;
      let normMin = 0;
      let normMax = 0;

      if (activeJoint === "knee") {
        leftAngle = pt.kneeAngleLeft ?? undefined;
        rightAngle = pt.kneeAngleRight ?? undefined;
        normMin = norm.kneeMin ?? 0;
        normMax = norm.kneeMax ?? 0;
      } else if (activeJoint === "hip") {
        leftAngle = pt.hipAngleLeft ?? undefined;
        rightAngle = pt.hipAngleRight ?? undefined;
        normMin = norm.hipMin ?? 0;
        normMax = norm.hipMax ?? 0;
      } else {
        leftAngle = pt.ankleAngleLeft ?? undefined;
        rightAngle = pt.ankleAngleRight ?? undefined;
        normMin = norm.ankleMin ?? 0;
        normMax = norm.ankleMax ?? 0;
      }

      return {
        gaitCyclePct,
        leftAngle,
        rightAngle,
        normativeRange: [normMin, normMax],
        normativeMin: normMin,
        normativeMax: normMax,
      };
    });
  }, [angleAnalysis, activeJoint]);

  const jointMeta = useMemo(() => {
    switch (activeJoint) {
      case "knee":
        return {
          title: "Knee Kinematics (Flexion / Extension)",
          description: "Perry & Burnfield (2010) normative range (0–70° flexion)",
          leftName: "Left Knee Flexion",
          rightName: "Right Knee Flexion",
          flexLabel: "Peak Flexion",
          extLabel: "Peak Extension",
        };
      case "hip":
        return {
          title: "Hip Kinematics (Flexion / Extension)",
          description: "Perry & Burnfield (2010) normative range (-18° extension to +38° flexion)",
          leftName: "Left Hip Flexion",
          rightName: "Right Hip Flexion",
          flexLabel: "Peak Flexion",
          extLabel: "Peak Extension",
        };
      case "ankle":
        return {
          title: "Ankle Kinematics (Dorsiflexion / Plantarflexion)",
          description: "Perry & Burnfield (2010) normative range (-22° plantarflexion to +15° dorsiflexion)",
          leftName: "Left Ankle Angle",
          rightName: "Right Ankle Angle",
          flexLabel: "Peak Dorsiflexion",
          extLabel: "Peak Plantarflexion",
        };
    }
  }, [activeJoint]);

  const romStats = useMemo(() => {
    const m = angleAnalysis?.metrics;
    if (!m) return null;

    if (activeJoint === "knee") {
      const minLeft = m.kneePeakFlexionLeft != null && m.kneeRomLeft != null
        ? Number((m.kneePeakFlexionLeft - m.kneeRomLeft).toFixed(1))
        : null;
      const minRight = m.kneePeakFlexionRight != null && m.kneeRomRight != null
        ? Number((m.kneePeakFlexionRight - m.kneeRomRight).toFixed(1))
        : null;

      return {
        leftRom: m.kneeRomLeft,
        rightRom: m.kneeRomRight,
        flexLeft: m.kneePeakFlexionLeft,
        flexRight: m.kneePeakFlexionRight,
        extLeft: minLeft,
        extRight: minRight,
        asymmetryPct: m.kneeAsymmetryPct,
      };
    } else if (activeJoint === "hip") {
      return {
        leftRom: m.hipRomLeft,
        rightRom: m.hipRomRight,
        flexLeft: m.hipPeakFlexionLeft,
        flexRight: m.hipPeakFlexionRight,
        extLeft: m.hipPeakExtensionLeft,
        extRight: m.hipPeakExtensionRight,
        asymmetryPct: m.hipAsymmetryPct,
      };
    } else {
      return {
        leftRom: m.ankleRomLeft,
        rightRom: m.ankleRomRight,
        flexLeft: m.anklePeakDorsiflexionLeft,
        flexRight: m.anklePeakDorsiflexionRight,
        extLeft: m.anklePeakPlantarflexionLeft,
        extRight: m.anklePeakPlantarflexionRight,
        asymmetryPct: m.ankleAsymmetryPct,
      };
    }
  }, [angleAnalysis, activeJoint]);

  const isSuppressed = angleAnalysis?.isSuppressed ?? false;
  const suppressionReason = angleAnalysis?.suppressionReason ||
    "Joint kinematic angles in the sagittal plane (flexion/extension) cannot be reliably computed from a frontal camera view. Please record from a side (sagittal) or 45° oblique view.";

  return (
    <Card className={cn("w-full border border-[var(--color-border)] bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-card)] font-['Google_Sans',sans-serif]", className)}>
      <CardHeader className="border-b border-[var(--color-surface-2)] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[var(--color-primary)]" />
            <CardTitle className="text-base font-medium text-[var(--color-fg)]">{title}</CardTitle>
          </div>
          <div className="inline-flex items-center p-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)]">
            <button
              type="button"
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium font-['Google_Sans',sans-serif] transition-colors cursor-pointer",
                activeJoint === "knee"
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-[var(--shadow-card)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-3)]"
              )}
              onClick={() => setActiveJoint("knee")}
              data-testid="tab-knee"
            >
              Knee
            </button>
            <button
              type="button"
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium font-['Google_Sans',sans-serif] transition-colors cursor-pointer",
                activeJoint === "hip"
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-[var(--shadow-card)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-3)]"
              )}
              onClick={() => setActiveJoint("hip")}
              data-testid="tab-hip"
            >
              Hip
            </button>
            <button
              type="button"
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium font-['Google_Sans',sans-serif] transition-colors cursor-pointer",
                activeJoint === "ankle"
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-[var(--shadow-card)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-3)]"
              )}
              onClick={() => setActiveJoint("ankle")}
              data-testid="tab-ankle"
            >
              Ankle
            </button>
          </div>
        </div>
        <CardDescription className="text-xs text-[var(--color-muted)] mt-1">{jointMeta.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-4">
        {isSuppressed && (
          <div
            data-testid="view-suppression-banner"
            className="flex items-start gap-3 rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_22%,transparent)] bg-[var(--color-danger-bg)]/40 p-4 text-sm text-[var(--color-danger-text)]"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[var(--color-danger-text)]">2D Kinematic View Angle Suppressed</p>
              <p className="mt-1 text-xs opacity-90 text-[var(--color-muted)]">{suppressionReason}</p>
            </div>
          </div>
        )}

        {!isSuppressed && romStats && (
          <div
            data-testid="rom-stat-badges"
            className="flex flex-wrap items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
          >
            <div
              data-testid="left-peak-rom"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[var(--color-info-bg)] text-[var(--color-primary)] border border-[color-mix(in_srgb,var(--color-info)_25%,transparent)]"
            >
              Left Peak ROM: {romStats.leftRom != null ? `${romStats.leftRom.toFixed(1)}°` : "—"}
            </div>
            <div
              data-testid="right-peak-rom"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[var(--color-success-bg)] text-[var(--color-success-text)] border border-[#CEEAD6]"
            >
              Right Peak ROM: {romStats.rightRom != null ? `${romStats.rightRom.toFixed(1)}°` : "—"}
            </div>
            <div
              data-testid="peak-flexion"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-muted)] border border-[var(--color-border)]"
            >
              {jointMeta.flexLabel}: L {romStats.flexLeft != null ? `${romStats.flexLeft.toFixed(1)}°` : "—"} / R {romStats.flexRight != null ? `${romStats.flexRight.toFixed(1)}°` : "—"}
            </div>
            <div
              data-testid="peak-extension"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-muted)] border border-[var(--color-border)]"
            >
              {jointMeta.extLabel}: L {romStats.extLeft != null ? `${romStats.extLeft.toFixed(1)}°` : "—"} / R {romStats.extRight != null ? `${romStats.extRight.toFixed(1)}°` : "—"}
            </div>
            <div
              data-testid="rom-asymmetry"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] border border-[color-mix(in_srgb,var(--color-danger)_22%,transparent)]"
            >
              ROM Asymmetry: {romStats.asymmetryPct != null ? `${romStats.asymmetryPct.toFixed(1)}%` : "—"}
            </div>
          </div>
        )}

        <div className="h-80 w-full min-w-0 border border-[var(--color-border)] rounded-lg overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
            >
              <CartesianGrid stroke="#E8EAED" />
              <XAxis
                dataKey="gaitCyclePct"
                type="number"
                unit="%"
                domain={[0, 100]}
                tick={{ fontSize: 11, fontFamily: "Roboto, sans-serif", fill: "#5F6368", style: { fontVariantNumeric: "tabular-nums" } }}
                label={{
                  value: "Gait Cycle (%)",
                  position: "insideBottom",
                  offset: -10,
                  fill: "#202124",
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "Google Sans, Roboto, sans-serif",
                }}
              />
              <YAxis
                unit="°"
                tick={{ fontSize: 11, fontFamily: "Roboto, sans-serif", fill: "#5F6368", style: { fontVariantNumeric: "tabular-nums" } }}
                label={{
                  value: "Joint Angle (°)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#202124",
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "Google Sans, Roboto, sans-serif",
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                content={({ payload }) => (
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    {payload?.map((entry, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)] font-['Roboto',sans-serif]">
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                        {entry.value}
                      </span>
                    ))}
                  </div>
                )}
              />
              <Area
                type="monotone"
                dataKey="normativeRange"
                stroke="none"
                fill="#00897B"
                fillOpacity={0.08}
                name="Perry & Burnfield Normative Range"
              />
              <Line
                type="monotone"
                dataKey="normativeMin"
                stroke="#BDC1C6"
                strokeDasharray="3 3"
                strokeWidth={1}
                dot={false}
                legendType="none"
                isAnimationActive={false}
                tooltipType="none"
              />
              <Line
                type="monotone"
                dataKey="normativeMax"
                stroke="#BDC1C6"
                strokeDasharray="3 3"
                strokeWidth={1}
                dot={false}
                legendType="none"
                isAnimationActive={false}
                tooltipType="none"
              />
              <Line
                type="monotone"
                dataKey="leftAngle"
                stroke="#1A73E8"
                strokeWidth={2.5}
                dot={false}
                name={jointMeta.leftName}
              />
              <Line
                type="monotone"
                dataKey="rightAngle"
                stroke="#34A853"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={false}
                name={jointMeta.rightName}
              />
              {currentGaitCyclePct !== undefined && currentGaitCyclePct >= 0 && currentGaitCyclePct <= 100 && (
                <ReferenceLine
                  x={currentGaitCyclePct}
                  stroke="#00E5FF"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  isFront={true}
                  label={{
                    value: `${Math.round(currentGaitCyclePct)}%`,
                    position: "top",
                    fill: "#00E5FF",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

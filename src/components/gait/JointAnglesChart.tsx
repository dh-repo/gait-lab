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
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Activity } from "lucide-react";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";
import { cn } from "@/lib/utils";

export interface JointAnglesChartProps {
  angleAnalysis: GaitAngleAnalysis;
  className?: string;
}

export type JointTab = "knee" | "hip" | "ankle";

export function JointAnglesChart({ angleAnalysis, className }: JointAnglesChartProps) {
  const [activeJoint, setActiveJoint] = useState<JointTab>("knee");

  const chartData = useMemo(() => {
    if (!angleAnalysis) return [];
    const points = angleAnalysis.normalizedPoints || [];
    const normative = angleAnalysis.normativeData || [];

    return points.map((pt, index) => {
      const norm = normative[index] || normative[0] || {};
      const gaitCyclePct = pt.gaitCyclePct;

      if (activeJoint === "knee") {
        return {
          gaitCyclePct,
          leftAngle: pt.kneeAngleLeft,
          rightAngle: pt.kneeAngleRight,
          normativeRange: [norm.kneeMin ?? 0, norm.kneeMax ?? 0],
          normativeMean: norm.kneeMean,
        };
      } else if (activeJoint === "hip") {
        return {
          gaitCyclePct,
          leftAngle: pt.hipAngleLeft,
          rightAngle: pt.hipAngleRight,
          normativeRange: [norm.hipMin ?? 0, norm.hipMax ?? 0],
          normativeMean: norm.hipMean,
        };
      } else {
        return {
          gaitCyclePct,
          leftAngle: pt.ankleAngleLeft,
          rightAngle: pt.ankleAngleRight,
          normativeRange: [norm.ankleMin ?? 0, norm.ankleMax ?? 0],
          normativeMean: norm.ankleMean,
        };
      }
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
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[var(--color-primary)]" />
            <CardTitle>Joint Kinematic Angle Trajectories</CardTitle>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-1 bg-[var(--color-surface-2)]">
            <Button
              variant={activeJoint === "knee" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveJoint("knee")}
              data-testid="tab-knee"
            >
              Knee
            </Button>
            <Button
              variant={activeJoint === "hip" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveJoint("hip")}
              data-testid="tab-hip"
            >
              Hip
            </Button>
            <Button
              variant={activeJoint === "ankle" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveJoint("ankle")}
              data-testid="tab-ankle"
            >
              Ankle
            </Button>
          </div>
        </div>
        <CardDescription>{jointMeta.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {isSuppressed && (
          <div
            data-testid="view-suppression-banner"
            className="flex items-start gap-3 rounded-lg border border-[color-mix(in_oklab,var(--color-warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-warn)_12%,transparent)] p-4 text-sm text-[var(--color-warn)]"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">2D Kinematic View Angle Suppressed</p>
              <p className="mt-1 text-xs opacity-90">{suppressionReason}</p>
            </div>
          </div>
        )}

        {!isSuppressed && romStats && (
          <div
            data-testid="rom-stat-badges"
            className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
          >
            <Badge tone="primary" data-testid="left-peak-rom">
              Left Peak ROM: {romStats.leftRom != null ? `${romStats.leftRom.toFixed(1)}°` : "—"}
            </Badge>
            <Badge tone="accent" data-testid="right-peak-rom">
              Right Peak ROM: {romStats.rightRom != null ? `${romStats.rightRom.toFixed(1)}°` : "—"}
            </Badge>
            <Badge tone="neutral" data-testid="peak-flexion">
              {jointMeta.flexLabel}: L {romStats.flexLeft != null ? `${romStats.flexLeft.toFixed(1)}°` : "—"} / R {romStats.flexRight != null ? `${romStats.flexRight.toFixed(1)}°` : "—"}
            </Badge>
            <Badge tone="neutral" data-testid="peak-extension">
              {jointMeta.extLabel}: L {romStats.extLeft != null ? `${romStats.extLeft.toFixed(1)}°` : "—"} / R {romStats.extRight != null ? `${romStats.extRight.toFixed(1)}°` : "—"}
            </Badge>
            <Badge
              tone={
                romStats.asymmetryPct != null && romStats.asymmetryPct > 10
                  ? "warn"
                  : "success"
              }
              data-testid="rom-asymmetry"
            >
              ROM Asymmetry: {romStats.asymmetryPct != null ? `${romStats.asymmetryPct.toFixed(1)}%` : "—"}
            </Badge>
          </div>
        )}

        <div className="h-80 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
              <XAxis
                dataKey="gaitCyclePct"
                unit="%"
                domain={[0, 100]}
                tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                label={{
                  value: "Gait Cycle (%)",
                  position: "insideBottom",
                  offset: -10,
                  fill: "var(--color-fg)",
                  fontSize: 12,
                }}
              />
              <YAxis
                unit="°"
                tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                label={{
                  value: "Joint Angle (°)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--color-fg)",
                  fontSize: 12,
                }}
              />
              <Tooltip
                formatter={(value: any, name: any) => [
                  typeof value === "number" ? `${value.toFixed(1)}°` : value,
                  name,
                ]}
                labelFormatter={(label: any) => `${label}% Gait Cycle`}
                contentStyle={{
                  backgroundColor: "var(--color-surface, #ffffff)",
                  borderColor: "var(--color-border, #e2e8f0)",
                  color: "var(--color-fg, #0f172a)",
                  borderRadius: "8px",
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
                }}
              />
              <Legend verticalAlign="top" height={36} />
              <Area
                type="monotone"
                dataKey="normativeRange"
                stroke="none"
                fill="#94a3b8"
                fillOpacity={0.25}
                name="Perry & Burnfield Normative Range"
              />
              <Line
                type="monotone"
                dataKey="leftAngle"
                stroke="#0369a1"
                strokeWidth={2}
                dot={false}
                name={jointMeta.leftName}
              />
              <Line
                type="monotone"
                dataKey="rightAngle"
                stroke="#0f766e"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name={jointMeta.rightName}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

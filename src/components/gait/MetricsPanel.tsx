import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "./ScoreRing";
import type { GaitMetrics } from "@/lib/gait/types";

export function MetricsPanel({ metrics }: { metrics: GaitMetrics }) {
  const series = metrics.series.map((s) => ({
    t: Number(s.t.toFixed(2)),
    hipX: Number((s.midHipX * 100).toFixed(2)),
    hipY: Number((s.midHipY * 100).toFixed(2)),
    Lankle: Number((s.leftAnkleY * 100).toFixed(2)),
    Rankle: Number((s.rightAnkleY * 100).toFixed(2)),
    Lknee: Number(s.leftKneeAngle.toFixed(1)),
    Rknee: Number(s.rightKneeAngle.toFixed(1)),
  }));

  // Variability error scales as 1/sqrt(strides): measured on synthetic walks with a
  // known true CV, ~9 strides gives ~24% relative error and a ~17% low bias, ~18
  // strides roughly halves both. Show the count, and flag it when it is too small.
  const strideCount = Math.floor(metrics.stepCount / 2);
  const strideBasis =
    strideCount > 0
      ? strideCount < 12
        ? `from ${strideCount} strides — wide margin, treat as indicative`
        : `from ${strideCount} strides`
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Exploratory composite scores</CardTitle>
            <Badge tone="primary">{metrics.viewAngle} view</Badge>
            <Badge tone="neutral">
              {(metrics.viewConfidence * 100).toFixed(0)}% view confidence
            </Badge>
          </div>
          <CardDescription>
            Secondary exploratory indices (0–100) — non-diagnostic research scores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap justify-around gap-4">
            <ScoreRing score={metrics.overallScore} label="Overall" />
            <ScoreRing score={metrics.stabilityScore} label="Stability" />
            <ScoreRing score={metrics.symmetryScore} label="Symmetry" />
            <ScoreRing score={metrics.rhythmScore} label="Rhythm" />
            <ScoreRing score={metrics.mobilityScore} label="Mobility" />
            <ScoreRing score={metrics.automaticityScore} label="Automaticity" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Cadence"
          value={`${metrics.cadenceSpm.toFixed(0)}`}
          unit="spm"
          ci={metrics.confidenceIntervals?.cadenceSpm}
        />
        <Stat label="Steps detected" value={`${metrics.stepCount}`} unit="steps" />
        <Stat
          label="Avg step time"
          value={metrics.avgStepTimeSec ? metrics.avgStepTimeSec.toFixed(2) : "—"}
          unit="s"
        />
        <Stat
          label="Clip duration"
          value={metrics.durationSec.toFixed(1)}
          unit="s"
        />
        <Stat
          label="Symmetry Angle (SA)"
          value={metrics.symmetryAngle != null ? metrics.symmetryAngle.toFixed(2) : "—"}
          unit="%"
          ci={metrics.confidenceIntervals?.symmetryAngle}
        />
        <Stat
          label="Stance Phase (L / R)"
          value={
            metrics.leftStancePct != null && metrics.rightStancePct != null
              ? `${metrics.leftStancePct.toFixed(0)} / ${metrics.rightStancePct.toFixed(0)}`
              : "N/A (Requires Side View)"
          }
          unit={metrics.leftStancePct != null ? "%" : ""}
          ci={metrics.confidenceIntervals?.leftStancePct}
        />
        <Stat
          label="Double Support"
          value={
            metrics.doubleSupportPct != null
              ? `${metrics.doubleSupportPct.toFixed(1)}`
              : "N/A (Requires Side View)"
          }
          unit={metrics.doubleSupportPct != null ? "%" : ""}
          ci={metrics.confidenceIntervals?.doubleSupportPct}
        />
        <Stat
          label="Step-time asymmetry"
          value={(metrics.stepTimeAsymmetry * 100).toFixed(0)}
          unit="%"
        />
        <Stat
          label="Stride asymmetry"
          value={
            metrics.strideAsymmetry != null
              ? (metrics.strideAsymmetry * 100).toFixed(0)
              : "N/A (Requires Side View)"
          }
          unit={metrics.strideAsymmetry != null ? "%" : ""}
        />
        <Stat
          label="Lateral sway"
          value={metrics.lateralSway != null ? metrics.lateralSway.toFixed(3) : "N/A (Requires Front View)"}
          unit={metrics.lateralSway != null ? "idx" : ""}
          ci={metrics.confidenceIntervals?.lateralSway}
        />
        <Stat label="Vertical bounce" value={metrics.verticalBounce.toFixed(3)} unit="idx" />
        <Stat label="Arm swing L" value={metrics.armSwingLeft.toFixed(2)} unit="rng" />
        <Stat label="Arm swing R" value={metrics.armSwingRight.toFixed(2)} unit="rng" />
        <Stat
          label="Knee flex L"
          value={metrics.kneeFlexLeft != null ? metrics.kneeFlexLeft.toFixed(0) : "N/A (Requires Side View)"}
          unit={metrics.kneeFlexLeft != null ? "°" : ""}
          ci={metrics.confidenceIntervals?.kneeFlexLeft}
        />
        <Stat
          label="Knee flex R"
          value={metrics.kneeFlexRight != null ? metrics.kneeFlexRight.toFixed(0) : "N/A (Requires Side View)"}
          unit={metrics.kneeFlexRight != null ? "°" : ""}
          ci={metrics.confidenceIntervals?.kneeFlexRight}
        />
        <Stat
          label="Step-time CV"
          value={(metrics.stepTimeCV * 100).toFixed(0)}
          unit="%"
          ci={metrics.confidenceIntervals?.stepTimeCV}
          basis={strideBasis}
        />
        <Stat
          label="Stride-time CV"
          value={(metrics.strideTimeCV * 100).toFixed(0)}
          unit="%"
          ci={metrics.confidenceIntervals?.strideTimeCV}
          basis={strideBasis}
        />
        <Stat
          label="Pelvic obliquity"
          value={metrics.pelvicObliquity != null ? metrics.pelvicObliquity.toFixed(3) : "N/A (Requires Front View)"}
          unit={metrics.pelvicObliquity != null ? "idx" : ""}
          ci={metrics.confidenceIntervals?.pelvicObliquity}
        />
        <Stat
          label="Mean step width"
          value={metrics.meanStepWidth != null ? metrics.meanStepWidth.toFixed(3) : "N/A (Requires Front View)"}
          unit={metrics.meanStepWidth != null ? "idx" : ""}
          ci={metrics.confidenceIntervals?.meanStepWidth}
        />
        <Stat label="Path smoothness" value={(metrics.pathSmoothness * 100).toFixed(0)} unit="%" />
        <Stat label="Automaticity" value={metrics.automaticityScore.toFixed(0)} unit="/100" />
      </div>

      {series.length > 2 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Ankle height over time</CardTitle>
              <CardDescription>
                Image Y (higher = lower on screen). Peaks often align with foot contact.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="t"
                    tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                    stroke="var(--color-border)"
                  />
                  <YAxis
                    tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                    stroke="var(--color-border)"
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-fg)",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Lankle"
                    name="Left ankle"
                    stroke="var(--color-primary)"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="Rankle"
                    name="Right ankle"
                    stroke="var(--color-accent)"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trunk path (hip center)</CardTitle>
              <CardDescription>Normalized position — used for sway and bounce estimates.</CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="t"
                    tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                    stroke="var(--color-border)"
                  />
                  <YAxis
                    tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                    stroke="var(--color-border)"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-fg)",
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="hipX"
                    name="Hip X"
                    stroke="var(--color-primary)"
                    fill="color-mix(in oklab, var(--color-primary) 25%, transparent)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="hipY"
                    name="Hip Y"
                    stroke="var(--color-warn)"
                    fill="color-mix(in oklab, var(--color-warn) 18%, transparent)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Knee flexion angle</CardTitle>
              <CardDescription>
                {metrics.kneeFlexLeft != null
                  ? "Degrees at hip–knee–ankle. Larger range often means freer swing."
                  : "Suppressed for frontal camera view (requires side view)."}
              </CardDescription>
            </CardHeader>
            {metrics.kneeFlexLeft != null ? (
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                      stroke="var(--color-border)"
                    />
                    <YAxis
                      tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                      stroke="var(--color-border)"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-surface-2)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        color: "var(--color-fg)",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="Lknee"
                      name="Left knee"
                      stroke="var(--color-primary)"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="Rknee"
                      name="Right knee"
                      stroke="var(--color-accent)"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            ) : (
              <CardContent className="h-24 flex items-center justify-center text-xs text-[var(--color-subtle)]">
                Knee flexion kinematic chart suppressed for frontal camera perspective.
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  ci,
  basis,
}: {
  label: string;
  value: string;
  unit: string;
  ci?: { ci95Lower: number | null; ci95Upper: number | null };
  /** Sample size this estimate rests on. Shown for variability metrics, whose
   *  error scales as 1/sqrt(strides) — the count is as important as the value. */
  basis?: string;
}) {
  const hasCI = ci && ci.ci95Lower != null && ci.ci95Upper != null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="tabular text-2xl font-semibold tracking-tight">{value}</span>
          {unit ? <span className="text-xs text-[var(--color-subtle)]">{unit}</span> : null}
        </div>
        {hasCI && (
          <span className="tabular text-[10px] text-[var(--color-subtle)] font-normal">
            [95% CI: {ci.ci95Lower?.toFixed(1)} - {ci.ci95Upper?.toFixed(1)}]
          </span>
        )}
        {basis && (
          <span className="tabular text-[10px] text-[var(--color-subtle)] font-normal">
            {basis}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

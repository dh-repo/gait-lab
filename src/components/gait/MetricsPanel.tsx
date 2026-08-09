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

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Composite scores</CardTitle>
            <Badge tone="primary">{metrics.viewAngle} view</Badge>
            <Badge tone="neutral">
              {(metrics.viewConfidence * 100).toFixed(0)}% view confidence
            </Badge>
          </div>
          <CardDescription>
            Normalized 0–100 scores from pose kinematics in this clip (not clinical grades).
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
        <Stat label="Cadence" value={`${metrics.cadenceSpm.toFixed(0)}`} unit="spm" />
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
        />
        <Stat
          label="Harmonic Ratio (HR)"
          value={metrics.harmonicRatio != null ? metrics.harmonicRatio.toFixed(2) : "—"}
          unit="idx"
        />
        <Stat
          label="Stance Phase (L / R)"
          value={`${(metrics.leftStancePct ?? 60).toFixed(0)} / ${(metrics.rightStancePct ?? 60).toFixed(0)}`}
          unit="%"
        />
        <Stat
          label="Double Support"
          value={`${(metrics.doubleSupportPct ?? 20).toFixed(1)}`}
          unit="%"
        />
        <Stat
          label="Step-time asymmetry"
          value={(metrics.stepTimeAsymmetry * 100).toFixed(0)}
          unit="%"
        />
        <Stat
          label="Stride asymmetry"
          value={(metrics.strideAsymmetry * 100).toFixed(0)}
          unit="%"
        />
        <Stat label="Lateral sway" value={metrics.lateralSway.toFixed(3)} unit="idx" />
        <Stat label="Vertical bounce" value={metrics.verticalBounce.toFixed(3)} unit="idx" />
        <Stat label="Arm swing L" value={metrics.armSwingLeft.toFixed(2)} unit="rng" />
        <Stat label="Arm swing R" value={metrics.armSwingRight.toFixed(2)} unit="rng" />
        <Stat label="Knee flex L" value={metrics.kneeFlexLeft.toFixed(0)} unit="°" />
        <Stat label="Knee flex R" value={metrics.kneeFlexRight.toFixed(0)} unit="°" />
        <Stat label="Step-time CV" value={(metrics.stepTimeCV * 100).toFixed(0)} unit="%" />
        <Stat label="Stride-time CV" value={(metrics.strideTimeCV * 100).toFixed(0)} unit="%" />
        <Stat label="Pelvic obliquity" value={metrics.pelvicObliquity.toFixed(3)} unit="idx" />
        <Stat label="Mean step width" value={metrics.meanStepWidth.toFixed(3)} unit="idx" />
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
              <CardDescription>Degrees at hip–knee–ankle. Larger range often means freer swing.</CardDescription>
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
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="tabular text-2xl font-semibold tracking-tight">{value}</span>
          <span className="text-xs text-[var(--color-subtle)]">{unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}

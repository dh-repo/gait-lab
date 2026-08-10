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
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "./ScoreRing";
import type { GaitMetrics } from "@/lib/gait/types";

function CustomChartTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg bg-[#202124] p-2.5 text-white shadow-lg border border-[#3C4043] font-['Google_Sans',sans-serif] text-xs">
        <p className="font-semibold text-[#E8EAED] mb-1 border-b border-[#3C4043] pb-0.5">
          Time: {label} s
        </p>
        <div className="space-y-1 pt-0.5">
          {payload.map((item: any) => (
            <div key={item.name} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: item.color || item.stroke }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: item.color || item.stroke }} />
                {item.name}:
              </span>
              <span className="font-mono font-semibold">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

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
    <div className="flex flex-col gap-4 font-['Google_Sans',sans-serif]" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info" className="capitalize bg-[#E8F0FE] text-[#1967D2] border-[#D2E3FC]">
          {metrics.viewAngle} view
        </Badge>
        <Badge tone="neutral" className="bg-[#F1F3F4] text-[#3C4043] border-[#DADCE0]">
          {(metrics.viewConfidence * 100).toFixed(0)}% view confidence
        </Badge>
      </div>

      <Band
        title="Directly measured"
        caption="Estimated directly from the detected pose landmarks in this clip."
      >
        <Stat
          label="Cadence"
          value={`${metrics.cadenceSpm.toFixed(0)}`}
          unit="spm"
          ci={metrics.confidenceIntervals?.cadenceSpm}
          statusType="measured"
        />
        <Stat
          label="Avg step time"
          value={metrics.avgStepTimeSec ? metrics.avgStepTimeSec.toFixed(2) : "—"}
          unit="s"
          statusType="measured"
        />
        <Stat
          label="Symmetry Angle (SA)"
          value={metrics.symmetryAngle != null ? metrics.symmetryAngle.toFixed(2) : "—"}
          unit="%"
          ci={metrics.confidenceIntervals?.symmetryAngle}
          statusType="measured"
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
          statusType="measured"
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
          statusType="measured"
        />
        <Stat
          label="Step-time asymmetry"
          value={(metrics.stepTimeAsymmetry * 100).toFixed(0)}
          unit="%"
          statusType="measured"
        />
        <Stat
          label="Stride asymmetry"
          value={
            metrics.strideAsymmetry != null
              ? (metrics.strideAsymmetry * 100).toFixed(0)
              : "N/A (Requires Side View)"
          }
          unit={metrics.strideAsymmetry != null ? "%" : ""}
          statusType="measured"
        />
        <Stat
          label="Knee flex L"
          value={metrics.kneeFlexLeft != null ? metrics.kneeFlexLeft.toFixed(0) : "N/A (Requires Side View)"}
          unit={metrics.kneeFlexLeft != null ? "°" : ""}
          ci={metrics.confidenceIntervals?.kneeFlexLeft}
          statusType="measured"
        />
        <Stat
          label="Knee flex R"
          value={metrics.kneeFlexRight != null ? metrics.kneeFlexRight.toFixed(0) : "N/A (Requires Side View)"}
          unit={metrics.kneeFlexRight != null ? "°" : ""}
          ci={metrics.confidenceIntervals?.kneeFlexRight}
          statusType="measured"
        />
        <Stat
          label="Step-time CV"
          value={(metrics.stepTimeCV * 100).toFixed(0)}
          unit="%"
          ci={metrics.confidenceIntervals?.stepTimeCV}
          basis={strideBasis}
          statusType="measured"
        />
        <Stat
          label="Stride-time CV"
          value={(metrics.strideTimeCV * 100).toFixed(0)}
          unit="%"
          ci={metrics.confidenceIntervals?.strideTimeCV}
          basis={strideBasis}
          statusType="measured"
        />
      </Band>

      <Band
        title="Uncalibrated indices"
        caption="No calibrated scale. Interpret only as change against this subject's own earlier session; the absolute value has no reference range."
      >
        <Stat
          label="Lateral sway"
          value={metrics.lateralSway != null ? metrics.lateralSway.toFixed(3) : "N/A (Requires Front View)"}
          unit={metrics.lateralSway != null ? "idx" : ""}
          ci={metrics.confidenceIntervals?.lateralSway}
          statusType="uncalibrated"
        />
        <Stat
          label="Vertical bounce"
          value={metrics.verticalBounce.toFixed(3)}
          unit="idx"
          statusType="uncalibrated"
        />
        <Stat
          label="Pelvic obliquity"
          value={metrics.pelvicObliquity != null ? metrics.pelvicObliquity.toFixed(3) : "N/A (Requires Front View)"}
          unit={metrics.pelvicObliquity != null ? "idx" : ""}
          ci={metrics.confidenceIntervals?.pelvicObliquity}
          statusType="uncalibrated"
        />
        <Stat
          label="Mean step width"
          value={metrics.meanStepWidth != null ? metrics.meanStepWidth.toFixed(3) : "N/A (Requires Front View)"}
          unit={metrics.meanStepWidth != null ? "idx" : ""}
          ci={metrics.confidenceIntervals?.meanStepWidth}
          statusType="uncalibrated"
        />
        <Stat
          label="Arm swing L"
          value={metrics.armSwingLeft.toFixed(2)}
          unit="rng"
          statusType="uncalibrated"
        />
        <Stat
          label="Arm swing R"
          value={metrics.armSwingRight.toFixed(2)}
          unit="rng"
          statusType="uncalibrated"
        />
        <Stat
          label="Path smoothness"
          value={(metrics.pathSmoothness * 100).toFixed(0)}
          unit="%"
          statusType="uncalibrated"
        />
      </Band>

      <section className="flex flex-col gap-2">
        <BandHeading title="Composite research indices (unvalidated weighting)" />
        <Card className="border border-[#DADCE0] bg-white rounded-xl shadow-xs">
          <CardHeader className="border-b border-[#F1F3F4] pb-3">
            <CardTitle className="text-base font-medium text-[#202124]">Exploratory domain indices</CardTitle>
            <CardDescription className="text-xs text-[#5F6368]">
              Secondary 0–100 research indices — not clinical scores or a diagnosis.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
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
      </section>

      <Band
        title="Recording context (not scored)"
        caption="Describes the clip itself, not the walk (context, not scored)."
      >
        <Stat
          label="Steps detected"
          value={`${metrics.stepCount}`}
          unit="steps"
          statusType="context"
        />
        <Stat
          label="Clip duration"
          value={metrics.durationSec.toFixed(1)}
          unit="s"
          statusType="context"
        />
      </Band>

      {series.length > 2 && (
        <>
          <Card className="border border-[#DADCE0] bg-white rounded-xl shadow-xs">
            <CardHeader className="border-b border-[#F1F3F4] pb-3">
              <CardTitle className="text-base font-medium text-[#202124]">Ankle height over time</CardTitle>
              <CardDescription className="text-xs text-[#5F6368]">
                Image Y (higher = lower on screen). Peaks often align with foot contact.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-56 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid stroke="#DADCE0" strokeDasharray="0" opacity={0.6} />
                  <XAxis
                    dataKey="t"
                    tick={{ fill: "#5F6368", fontSize: 11, fontFamily: "Google Sans, Roboto, sans-serif" }}
                    stroke="#DADCE0"
                  />
                  <YAxis
                    tick={{ fill: "#5F6368", fontSize: 11, fontFamily: "Google Sans, Roboto, sans-serif" }}
                    stroke="#DADCE0"
                    domain={["auto", "auto"]}
                  />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "12px", fontFamily: "Google Sans, Roboto, sans-serif", color: "#3C4043" }} />
                  <Line
                    type="monotone"
                    dataKey="Lankle"
                    name="Left ankle"
                    stroke="#1A73E8"
                    dot={false}
                    strokeWidth={2.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="Rankle"
                    name="Right ankle"
                    stroke="#34A853"
                    strokeDasharray="6 4"
                    dot={false}
                    strokeWidth={2.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border border-[#DADCE0] bg-white rounded-xl shadow-xs">
            <CardHeader className="border-b border-[#F1F3F4] pb-3">
              <CardTitle className="text-base font-medium text-[#202124]">Trunk path (hip center)</CardTitle>
              <CardDescription className="text-xs text-[#5F6368]">Normalized position — used for sway and bounce estimates.</CardDescription>
            </CardHeader>
            <CardContent className="h-56 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <CartesianGrid stroke="#DADCE0" strokeDasharray="0" opacity={0.6} />
                  <XAxis
                    dataKey="t"
                    tick={{ fill: "#5F6368", fontSize: 11, fontFamily: "Google Sans, Roboto, sans-serif" }}
                    stroke="#DADCE0"
                  />
                  <YAxis
                    tick={{ fill: "#5F6368", fontSize: 11, fontFamily: "Google Sans, Roboto, sans-serif" }}
                    stroke="#DADCE0"
                  />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "12px", fontFamily: "Google Sans, Roboto, sans-serif", color: "#3C4043" }} />
                  <Area
                    type="monotone"
                    dataKey="hipX"
                    name="Hip X"
                    stroke="#1A73E8"
                    fill="#E8F0FE"
                    fillOpacity={0.6}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="hipY"
                    name="Hip Y"
                    stroke="#B06000"
                    fill="#FEF7E0"
                    fillOpacity={0.6}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border border-[#DADCE0] bg-white rounded-xl shadow-xs">
            <CardHeader className="border-b border-[#F1F3F4] pb-3">
              <CardTitle className="text-base font-medium text-[#202124]">Knee flexion angle</CardTitle>
              <CardDescription className="text-xs text-[#5F6368]">
                {metrics.kneeFlexLeft != null
                  ? "Degrees at hip–knee–ankle. Larger range often means freer swing."
                  : "Suppressed for frontal camera view (requires side view)."}
              </CardDescription>
            </CardHeader>
            {metrics.kneeFlexLeft != null ? (
              <CardContent className="h-56 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid stroke="#DADCE0" strokeDasharray="0" opacity={0.6} />
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "#5F6368", fontSize: 11, fontFamily: "Google Sans, Roboto, sans-serif" }}
                      stroke="#DADCE0"
                    />
                    <YAxis
                      tick={{ fill: "#5F6368", fontSize: 11, fontFamily: "Google Sans, Roboto, sans-serif" }}
                      stroke="#DADCE0"
                    />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: "12px", fontFamily: "Google Sans, Roboto, sans-serif", color: "#3C4043" }} />
                    <Line
                      type="monotone"
                      dataKey="Lknee"
                      name="Left knee"
                      stroke="#1A73E8"
                      dot={false}
                      strokeWidth={2.5}
                    />
                    <Line
                      type="monotone"
                      dataKey="Rknee"
                      name="Right knee"
                      stroke="#34A853"
                      strokeDasharray="6 4"
                      dot={false}
                      strokeWidth={2.5}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            ) : (
              <CardContent className="h-24 flex items-center justify-center text-xs text-[#5F6368]">
                Knee flexion kinematic chart suppressed for frontal camera perspective.
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function BandHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="text-sm font-semibold tracking-tight text-[#202124]">{title}</h3>
      {caption ? (
        <p className="text-xs text-[#5F6368]">{caption}</p>
      ) : null}
    </div>
  );
}

/** A labelled provenance band. Always renders its children — no collapsing. */
function Band({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <BandHeading title={title} caption={caption} />
      <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-xs">
        <table className="clinical-table w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#F8F9FA] text-[#5F6368] font-medium border-b border-[#DADCE0]">
              <th className="px-3 py-2 border-b border-[#DADCE0] font-medium text-[#5F6368]">Parameter / Metric</th>
              <th className="px-3 py-2 border-b border-[#DADCE0] font-medium text-[#5F6368]">Measured Value</th>
              <th className="px-3 py-2 border-b border-[#DADCE0] font-medium text-[#5F6368]">95% CI / Basis</th>
              <th className="px-3 py-2 border-b border-[#DADCE0] font-medium text-[#5F6368]">Provenance / Status</th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
  ci,
  basis,
  statusType = "measured",
}: {
  label: string;
  value: string;
  unit: string;
  ci?: { ci95Lower: number | null; ci95Upper: number | null };
  /** Sample size this estimate rests on. Shown for variability metrics, whose
   *  error scales as 1/sqrt(strides) — the count is as important as the value. */
  basis?: string;
  statusType?: "measured" | "uncalibrated" | "context";
}) {
  const hasCI = ci && ci.ci95Lower != null && ci.ci95Upper != null;

  let statusBadge = (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]">
      Directly Measured
    </span>
  );
  if (statusType === "uncalibrated") {
    statusBadge = (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#FEF7E0] text-[#B06000] border border-[#FCE8E6]">
        Uncalibrated Index
      </span>
    );
  } else if (statusType === "context") {
    statusBadge = (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#E8F0FE] text-[#1967D2] border border-[#D2E3FC]">
        Recording Context
      </span>
    );
  }

  return (
    <tr className="h-[32px] border-b border-[#DADCE0] hover:bg-[#F1F3F4] transition-colors">
      <td className="px-3 py-1 font-medium text-[#202124] border-b border-[#DADCE0]">{label}</td>
      <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[#202124] border-b border-[#DADCE0]">
        {value} {unit ? <span className="font-normal text-xs text-[#5F6368]">{unit}</span> : null}
      </td>
      <td className="px-3 py-1 font-mono text-[11px] tabular-nums text-[#5F6368] border-b border-[#DADCE0]">
        {hasCI && <div>[95% CI: {ci.ci95Lower?.toFixed(1)} – {ci.ci95Upper?.toFixed(1)}]</div>}
        {basis && <div>{basis}</div>}
        {!hasCI && !basis && "—"}
      </td>
      <td className="px-3 py-1 border-b border-[#DADCE0]">
        {statusBadge}
      </td>
    </tr>
  );
}

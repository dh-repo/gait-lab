"use client";

import React, { useMemo } from "react";
import type { AnalysisResult, PatientMetadata } from "@/lib/gait/types";
import { estimateKineticLoadingProxy, type KineticProxyResult } from "@/lib/gait/kineticProxy";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { cn } from "@/lib/utils";
import { Zap, Scale, Activity, ArrowUpRight } from "lucide-react";

export interface KineticLoadingChartProps {
  analysis: AnalysisResult;
  patientMeta?: PatientMetadata;
  className?: string;
}

export function KineticLoadingChart({ analysis, patientMeta, className }: KineticLoadingChartProps) {
  const meta = patientMeta || analysis.patientMeta;
  const kinetics: KineticProxyResult = useMemo(() => {
    return estimateKineticLoadingProxy(analysis.metrics, analysis.angleAnalysis, meta);
  }, [analysis, meta]);

  return (
    <Card
      data-testid="kinetic-loading-chart"
      className={cn(
        "overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-md rounded-2xl",
        className
      )}
    >
      <CardHeader className="bg-[var(--color-surface-2)]/70 px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-[var(--color-fg)]">
                  Vertical Ground Reaction Force (vGRF)
                </CardTitle>
                <Badge tone="warn" className="text-[10px] uppercase font-bold">
                  Ground Force Modeling
                </Badge>
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                Bimodal M-wave body-weight loading curves &amp; push-off propulsion symmetry (Winter 2009)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[11px] text-[var(--color-muted)] uppercase tracking-wider font-semibold">
                Loading Asymmetry
              </span>
              <div className="text-sm font-extrabold text-[var(--color-fg)]">
                {kinetics.loadingAsymmetryIndexPct}% LAI
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Metric Summary Stat Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border)]">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-subtle)]">Left Peak Impact</span>
            <div className="text-sm font-bold text-sky-400 mt-0.5">{kinetics.leftPeakImpact_BW}x BW</div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border)]">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-subtle)]">Right Peak Impact</span>
            <div className="text-sm font-bold text-amber-400 mt-0.5">{kinetics.rightPeakImpact_BW}x BW</div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border)]">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-subtle)]">Left Push-Off (F2)</span>
            <div className="text-sm font-bold text-sky-400 mt-0.5">{kinetics.leftPeakPushOff_BW}x BW</div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border)]">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-subtle)]">Right Push-Off (F2)</span>
            <div className="text-sm font-bold text-amber-400 mt-0.5">{kinetics.rightPeakPushOff_BW}x BW</div>
          </div>
        </div>

        {/* Recharts Continuous GRF Waveform */}
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={kinetics.grfWaveform} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis
                dataKey="gaitCyclePct"
                unit="%"
                stroke="var(--color-muted)"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                unit="x BW"
                domain={[0, 1.4]}
                stroke="var(--color-muted)"
                fontSize={11}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                  borderRadius: "0.75rem",
                  fontSize: "12px",
                }}
              />
              <ReferenceLine y={1.0} stroke="var(--color-subtle)" strokeDasharray="3 3" label={{ value: "1.0x BW (Body Weight)", fill: "var(--color-subtle)", fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="leftGRF_BW"
                name="Left Limb GRF"
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="rightGRF_BW"
                name="Right Limb GRF"
                stroke="#fbbf24"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="normativeMean_BW"
                name="Normative M-Wave"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Clinical Interpretation Card */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border)] text-xs text-[var(--color-fg)] leading-relaxed flex items-start gap-3">
          <Scale className="size-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-400">Force Loading Summary: </span>
            {kinetics.clinicalInterpretation}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

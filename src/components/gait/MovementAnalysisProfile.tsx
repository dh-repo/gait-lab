"use client";

import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  computeFullGPSAndMAP,
  type FullGPSResult,
  type GPSAnatomicalPlane,
  type GPSKinematicVariable,
  type GVSScoreEntry,
  type GPSSeverity,
  GPS_CONTROL_THRESHOLD_DEG,
  GPS_MCID_THRESHOLD_DEG,
} from "@/lib/gait/gpsNormatives";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";
import { cn } from "@/lib/utils";
import { Activity, Compass, Layers, Info, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle } from "lucide-react";

export interface MovementAnalysisProfileProps {
  /** Pre-computed FullGPSResult or will calculate dynamically from angleAnalysis */
  gpsResult?: FullGPSResult;
  /** Angle analysis containing normalized points */
  angleAnalysis?: GaitAngleAnalysis;
  /** Patient age and sex for stratified normative lookup */
  patientMeta?: { age?: number; sex?: string };
  /** Initial plane filter */
  initialPlaneFilter?: "all" | GPSAnatomicalPlane;
  /** Whether to show the detailed table (default: true) */
  showTable?: boolean;
  /** Additional container CSS class names */
  className?: string;
}

type PlaneFilter = "all" | GPSAnatomicalPlane;

export function MovementAnalysisProfile({
  gpsResult: externalGpsResult,
  angleAnalysis,
  patientMeta,
  initialPlaneFilter = "all",
  showTable = true,
  className,
}: MovementAnalysisProfileProps) {
  const [activePlaneFilter, setActivePlaneFilter] = useState<PlaneFilter>(initialPlaneFilter);
  const [isTableExpanded, setIsTableExpanded] = useState<boolean>(true);

  // Compute or resolve GPS result
  const gps: FullGPSResult = useMemo(() => {
    if (externalGpsResult) return externalGpsResult;
    return computeFullGPSAndMAP(angleAnalysis, patientMeta);
  }, [externalGpsResult, angleAnalysis, patientMeta]);

  // Filter GVS entries by active plane
  const filteredEntries = useMemo(() => {
    if (activePlaneFilter === "all") return gps.gvsEntries;
    return gps.gvsEntries.filter((entry) => entry.meta.plane === activePlaneFilter);
  }, [gps.gvsEntries, activePlaneFilter]);

  // Transform data for Recharts Bar Chart
  const chartData = useMemo(() => {
    return filteredEntries.map((entry) => ({
      variableId: entry.variable,
      name: entry.meta.shortLabel,
      fullName: entry.meta.label,
      plane: entry.meta.plane,
      joint: entry.meta.joint,
      leftGVS: entry.leftGVS ?? 0,
      rightGVS: entry.rightGVS ?? 0,
      overallGVS: entry.overallGVS ?? 0,
      hasLeft: entry.leftGVS !== null,
      hasRight: entry.rightGVS !== null,
      isSuppressed: entry.isSuppressed,
      severity: entry.severity,
      positiveMotion: entry.meta.positiveMotion,
      negativeMotion: entry.meta.negativeMotion,
    }));
  }, [filteredEntries]);

  // Severity badge mapping
  const getSeverityBadgeTone = (severity: GPSSeverity, isSuppressed?: boolean): "neutral" | "success" | "warn" | "danger" => {
    if (isSuppressed) return "neutral";
    switch (severity) {
      case "normal":
        return "success";
      case "mild":
        return "warn";
      case "moderate":
        return "warn";
      case "severe":
        return "danger";
      default:
        return "neutral";
    }
  };

  const getSeverityLabel = (severity: GPSSeverity, isSuppressed?: boolean): string => {
    if (isSuppressed) return "Suppressed";
    switch (severity) {
      case "normal":
        return "Normal (<5.0°)";
      case "mild":
        return "Mild (5.0–7.0°)";
      case "moderate":
        return "Moderate (7.0–10.0°)";
      case "severe":
        return "Severe (≥10.0°)";
      default:
        return "Unevaluated";
    }
  };

  // Count per plane
  const sagittalCount = gps.gvsEntries.filter((e) => e.meta.plane === "sagittal" && !e.isSuppressed).length;
  const frontalCount = gps.gvsEntries.filter((e) => e.meta.plane === "frontal" && !e.isSuppressed).length;
  const transverseCount = gps.gvsEntries.filter((e) => e.meta.plane === "transverse" && !e.isSuppressed).length;

  return (
    <Card
      data-testid="movement-analysis-profile"
      className={cn(
        "border-[var(--color-border)] bg-[var(--color-surface)] shadow-card overflow-hidden print-card",
        className,
      )}
    >
      {/* Header */}
      <CardHeader className="pb-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-info-bg)] text-[var(--color-info-text)]">
              <Activity className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-[var(--color-fg)]">
                Movement Analysis Profile (MAP) &amp; Gait Profile Score (GPS)
              </CardTitle>
              <CardDescription className="text-xs text-[var(--color-muted)]">
                Baker et al. (2009) 9-variable kinematic deviation analysis (RMSE over 101-point gait cycle)
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              data-testid="gps-overall-badge"
              tone={getSeverityBadgeTone(gps.severity, gps.evaluatedVariableCount === 0)}
              className="text-xs font-semibold py-1 px-3"
            >
              Overall GPS: {gps.overallGPS.toFixed(1)}° · {gps.severity.toUpperCase()}
            </Badge>
            {gps.asymmetryDeltaGPS !== null && (
              <Badge
                data-testid="gps-asymmetry-badge"
                tone={gps.asymmetryDeltaGPS >= GPS_MCID_THRESHOLD_DEG ? "warn" : "neutral"}
                className="text-xs py-1 px-2.5"
              >
                Δ L/R: {gps.asymmetryDeltaGPS.toFixed(1)}°
                {gps.asymmetryDeltaGPS >= GPS_MCID_THRESHOLD_DEG ? " (Asymmetric)" : ""}
              </Badge>
            )}
          </div>
        </div>

        {/* Executive Summary Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-muted)] block">
              Overall GPS
            </span>
            <span className="tabular text-lg font-bold text-[var(--color-fg)]">
              {gps.overallGPS.toFixed(1)}°
            </span>
            <span className="text-[10px] text-[var(--color-muted)] block mt-0.5">
              Normative: &lt;{gps.controlThresholdDeg.toFixed(1)} deg
            </span>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-muted)] block">
              Left Leg GPS
            </span>
            <span data-testid="gps-left-value" className="tabular text-lg font-bold text-[#1A73E8]">
              {gps.leftGPS !== null ? `${gps.leftGPS.toFixed(1)}°` : "N/A"}
            </span>
            <span className="text-[10px] text-[var(--color-muted)] block mt-0.5">
              Left limb kinematic RMS
            </span>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-muted)] block">
              Right Leg GPS
            </span>
            <span data-testid="gps-right-value" className="tabular text-lg font-bold text-[#34A853]">
              {gps.rightGPS !== null ? `${gps.rightGPS.toFixed(1)}°` : "N/A"}
            </span>
            <span className="text-[10px] text-[var(--color-muted)] block mt-0.5">
              Right limb kinematic RMS
            </span>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-muted)] block">
              Evaluated Variables
            </span>
            <span className="tabular text-lg font-bold text-[var(--color-fg)]">
              {gps.evaluatedVariableCount} / 9
            </span>
            <span className="text-[10px] text-[var(--color-muted)] block mt-0.5">
              Multi-planar coverage
            </span>
          </div>
        </div>

        <p className="text-xs text-[var(--color-muted)] pt-2 leading-relaxed">
          {gps.interpretation}
        </p>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-5">
        {/* Plane Filter Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
          <div className="inline-flex rounded-lg bg-[var(--color-bg)] p-1 border border-[var(--color-border)]" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activePlaneFilter === "all"}
              data-testid="plane-filter-all"
              onClick={() => setActivePlaneFilter("all")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                activePlaneFilter === "all"
                  ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
              )}
            >
              All Variables (9)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activePlaneFilter === "sagittal"}
              data-testid="plane-filter-sagittal"
              onClick={() => setActivePlaneFilter("sagittal")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                activePlaneFilter === "sagittal"
                  ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
              )}
            >
              Sagittal ({sagittalCount}/4)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activePlaneFilter === "frontal"}
              data-testid="plane-filter-frontal"
              onClick={() => setActivePlaneFilter("frontal")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                activePlaneFilter === "frontal"
                  ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
              )}
            >
              Frontal ({frontalCount}/2)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activePlaneFilter === "transverse"}
              data-testid="plane-filter-transverse"
              onClick={() => setActivePlaneFilter("transverse")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                activePlaneFilter === "transverse"
                  ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
              )}
            >
              Transverse ({transverseCount}/3)
            </button>
          </div>

          {/* Reference Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-muted)]">
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#1A73E8]" />
              <span>Left GVS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#34A853]" />
              <span>Right GVS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-[#EA4335] border-t border-dashed" />
              <span>Control (5.2°) &amp; MCID (1.6°)</span>
            </div>
          </div>
        </div>

        {/* Grouped Bar Chart */}
        <div data-testid="map-chart-container" className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 20, left: -10, bottom: 25 }}
              barGap={4}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EAED" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#5F6368", fontSize: 11, fontFamily: "Roboto, sans-serif" }}
                interval={0}
                angle={-20}
                textAnchor="end"
              />
              <YAxis
                tick={{ fill: "#70757A", fontSize: 10 }}
                domain={[0, (dataMax: number) => Math.max(14, Math.ceil(dataMax + 2))]}
                unit="°"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg text-xs space-y-1.5 z-50">
                      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-1">
                        <span className="font-bold text-[var(--color-fg)]">{item.fullName}</span>
                        <Badge tone={getSeverityBadgeTone(item.severity, item.isSuppressed)} className="text-[10px]">
                          {item.isSuppressed ? "Suppressed" : item.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-[var(--color-muted)]">
                        Joint: <strong className="text-[var(--color-fg)] capitalize">{item.joint}</strong> · Plane: <strong className="text-[var(--color-fg)] capitalize">{item.plane}</strong>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--color-border)]">
                        <div>
                          <span className="text-[#1A73E8] font-semibold block">Left GVS:</span>
                          <span className="tabular font-bold">{item.hasLeft ? `${item.leftGVS.toFixed(1)}°` : "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-[#34A853] font-semibold block">Right GVS:</span>
                          <span className="tabular font-bold">{item.hasRight ? `${item.rightGVS.toFixed(1)}°` : "N/A"}</span>
                        </div>
                      </div>
                      <div className="pt-1 text-[10px] text-[var(--color-muted)]">
                        Overall GVS: <strong>{item.overallGVS.toFixed(1)}°</strong> (Normative Control: &lt;5.2°)
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={GPS_CONTROL_THRESHOLD_DEG}
                stroke="#EA4335"
                strokeDasharray="4 4"
              />
              <ReferenceLine
                y={GPS_MCID_THRESHOLD_DEG}
                stroke="#FBBC04"
                strokeDasharray="2 2"
              />
              <Bar dataKey="leftGVS" name="Left GVS" fill="#1A73E8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="rightGVS" name="Right GVS" fill="#34A853" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Detailed Breakdown Table */}
        {showTable && (
          <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsTableExpanded(!isTableExpanded)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-fg)] hover:text-[var(--color-primary)] transition-colors focus:outline-none"
              >
                <span>Kinematic Variables &amp; GVS Score Breakdown</span>
                {isTableExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </button>
              <span className="text-[11px] text-[var(--color-muted)]">
                Showing {filteredEntries.length} of 9 variables
              </span>
            </div>

            {isTableExpanded && (
              <div className="overflow-x-auto">
                <table data-testid="map-breakdown-table" className="clinical-table w-full text-xs" aria-label="MAP Kinematic Variables Breakdown">
                  <thead>
                    <tr>
                      <th scope="col" className="text-left">Variable</th>
                      <th scope="col" className="text-left">Joint</th>
                      <th scope="col" className="text-left">Plane</th>
                      <th scope="col" className="text-right">Left GVS</th>
                      <th scope="col" className="text-right">Right GVS</th>
                      <th scope="col" className="text-right">Overall GVS</th>
                      <th scope="col" className="text-center">Severity</th>
                      <th scope="col" className="text-left">Kinematic Direction (+ / -)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => {
                      const isNormal = entry.overallGVS !== null && entry.overallGVS < GPS_CONTROL_THRESHOLD_DEG;
                      return (
                        <tr key={entry.variable} className="hover:bg-[var(--color-bg)]/50 transition-colors">
                          <th scope="row" className="font-medium text-[var(--color-fg)] text-left">
                            {entry.meta.label}
                          </th>
                          <td className="capitalize text-[var(--color-muted)]">{entry.meta.joint}</td>
                          <td>
                            <span className="capitalize px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-surface-2)] text-[var(--color-muted)] font-medium">
                              {entry.meta.plane}
                            </span>
                          </td>
                          <td className="tabular text-right text-[#1A73E8] font-semibold">
                            {entry.leftGVS !== null ? `${entry.leftGVS.toFixed(1)}` : "—"}
                          </td>
                          <td className="tabular text-right text-[#34A853] font-semibold">
                            {entry.rightGVS !== null ? `${entry.rightGVS.toFixed(1)}` : "—"}
                          </td>
                          <td className="tabular text-right font-bold text-[var(--color-fg)]">
                            {entry.overallGVS !== null ? `${entry.overallGVS.toFixed(1)}` : "—"}
                          </td>
                          <td className="text-center">
                            <Badge
                              tone={getSeverityBadgeTone(entry.severity, entry.isSuppressed)}
                              className="text-[10px] capitalize px-2"
                            >
                              {entry.isSuppressed ? "Suppressed" : entry.severity}
                            </Badge>
                          </td>
                          <td className="text-[11px] text-[var(--color-muted)]">
                            {entry.meta.positiveMotion} (+) / {entry.meta.negativeMotion} (-)
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

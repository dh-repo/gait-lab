"use client";

import React, { useMemo } from "react";
import {
  type MobilitySummaryData,
  type TakeawayItem,
  type DisclosureTier,
  deriveMobilitySummaryData,
} from "./types";
import type { AnalysisResult, TaskMode, DualTaskCost } from "@/lib/gait/types";
import { ScoreRing } from "../ScoreRing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  TrendingUp,
  Activity,
  Sparkles,
  Dumbbell,
} from "lucide-react";

export interface HumanCenteredSummaryProps {
  data?: MobilitySummaryData;
  summary?: MobilitySummaryData;
  analysis?: AnalysisResult;
  taskMode?: TaskMode;
  dualTaskCost?: DualTaskCost;
  onOpenHep?: () => void;
  onSelectTier?: (tier: DisclosureTier) => void;
  onTakeawayClick?: (id: string) => void;
  onExploreDeepDive?: () => void;
  className?: string;
}

const TAKEAWAY_ICONS: Record<string, React.ElementType> = {
  positive: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
};

export function HumanCenteredSummary({
  data,
  summary,
  analysis,
  taskMode,
  dualTaskCost,
  onOpenHep,
  onSelectTier,
  onTakeawayClick,
  onExploreDeepDive,
  className,
}: HumanCenteredSummaryProps) {
  const currentSummary = useMemo<MobilitySummaryData>(() => {
    if (data) return data;
    if (summary) return summary;
    if (analysis) {
      return deriveMobilitySummaryData(
        analysis.metrics,
        analysis.angleAnalysis,
        analysis.guesses,
        analysis.dualTaskCost || dualTaskCost
      );
    }
    return {
      overallScore: 75,
      readinessLabel: "Good",
      readinessTone: "info",
      readinessDescription: "Functional walking pattern.",
      symmetryScore: 75,
      smoothnessScore: 75,
      paceScore: 75,
      cadenceSpm: 105,
      speedMps: 1.2,
      symmetryAnglePct: 3.0,
      stepTimeCVPct: 2.5,
      stepCount: 20,
      keyTakeaways: [],
      takeaways: [],
    };
  }, [data, summary, analysis, dualTaskCost]);

  const handleDeepDiveClick = () => {
    if (onExploreDeepDive) {
      onExploreDeepDive();
    }
    if (onSelectTier) {
      onSelectTier("level2_biomechanics");
    }
  };

  const getTone = (label: string): "success" | "info" | "warn" | "danger" => {
    switch (label) {
      case "Excellent":
        return "success";
      case "Good":
        return "info";
      case "Fair":
        return "warn";
      case "Needs Attention":
        return "danger";
      default:
        return "info";
    }
  };

  const formatScoreValue = (score: number) => {
    if (score === 0 && currentSummary.overallScore === 0) {
      return "0 / 100";
    }
    if (score === 100 && currentSummary.overallScore === 100) {
      return "100 / 100";
    }
    return String(score);
  };

  return (
    <Card
      data-testid="human-centered-summary"
      className={cn(
        "overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm rounded-2xl",
        className
      )}
    >
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center">
          {/* Left Column: Overall Readiness Ring & Status */}
          <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border)]">
            <div className="relative">
              <ScoreRing
                score={currentSummary.overallScore}
                label="Overall Score"
                size={100}
              />
            </div>

            <div className="flex flex-col items-center sm:items-start text-center sm:text-left space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
                  Overall Readiness
                </span>
                <Badge
                  tone={getTone(currentSummary.readinessLabel)}
                  className="px-2.5 py-0.5 text-xs font-bold"
                  data-testid="readiness-status-badge"
                >
                  {currentSummary.readinessLabel}
                </Badge>
                {analysis?.patientMeta?.age && analysis.patientMeta.age < 18 && (
                  <Badge
                    tone="info"
                    data-testid="pediatric-summary-badge"
                    className="px-2 py-0.5 text-[10px] font-semibold border-sky-500/40 text-sky-400 bg-sky-500/10"
                  >
                    Pediatric (Age {analysis.patientMeta.age})
                  </Badge>
                )}
              </div>

              <p className="text-xs text-[var(--color-muted)] max-w-xs leading-relaxed">
                {currentSummary.readinessDescription ||
                  "Functional walking pattern with balanced motion."}
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {onOpenHep && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenHep}
                    className="h-7 text-xs gap-1.5"
                  >
                    <Dumbbell className="size-3.5 text-emerald-500" />
                    <span>Home Exercises</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeepDiveClick}
                  className="h-7 text-xs gap-1 text-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  <span>Explore Telemetry</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column: Key Layman Metric Chips & Takeaways */}
          <div className="flex flex-col gap-4 min-w-0">
            {/* Domain Score Chips */}
            <div
              data-testid="domain-chips"
              className="grid grid-cols-3 gap-2.5"
            >
              {/* Pace Chip */}
              <div className="flex flex-col p-2.5 rounded-xl bg-[var(--color-surface-2)]/40 border border-[var(--color-border)]">
                <div className="flex items-center justify-between text-xs text-[var(--color-subtle)] mb-1">
                  <span className="font-medium">Pace</span>
                  <TrendingUp className="size-3.5 text-sky-500" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold font-mono text-[var(--color-fg)]">
                    {formatScoreValue(currentSummary.paceScore)}
                  </span>
                  <span className="text-[10px] text-[var(--color-subtle)]">/100</span>
                </div>
                <span className="text-[11px] text-[var(--color-muted)] truncate">
                  Active Tempo
                </span>
              </div>

              {/* Symmetry Chip */}
              <div className="flex flex-col p-2.5 rounded-xl bg-[var(--color-surface-2)]/40 border border-[var(--color-border)]">
                <div className="flex items-center justify-between text-xs text-[var(--color-subtle)] mb-1">
                  <span className="font-medium">Balance</span>
                  <Activity className="size-3.5 text-emerald-500" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold font-mono text-[var(--color-fg)]">
                    {formatScoreValue(currentSummary.symmetryScore)}
                  </span>
                  <span className="text-[10px] text-[var(--color-subtle)]">/100</span>
                </div>
                <span className="text-[11px] text-[var(--color-muted)] truncate">
                  {currentSummary.symmetryAnglePct != null && currentSummary.symmetryAnglePct >= 5.0
                    ? "Asymmetric"
                    : "Balanced"}
                </span>
              </div>

              {/* Smoothness Chip */}
              <div className="flex flex-col p-2.5 rounded-xl bg-[var(--color-surface-2)]/40 border border-[var(--color-border)]">
                <div className="flex items-center justify-between text-xs text-[var(--color-subtle)] mb-1">
                  <span className="font-medium">Smoothness</span>
                  <Sparkles className="size-3.5 text-indigo-500" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold font-mono text-[var(--color-fg)]">
                    {formatScoreValue(currentSummary.smoothnessScore)}
                  </span>
                  <span className="text-[10px] text-[var(--color-subtle)]">/100</span>
                </div>
                <span className="text-[11px] text-[var(--color-muted)] truncate">
                  {currentSummary.stepTimeCVPct != null
                    ? `CV ${currentSummary.stepTimeCVPct.toFixed(1)}%`
                    : "Steady"}
                </span>
              </div>
            </div>

            {/* Key Layman Takeaways List */}
            <div data-testid="key-takeaways-list" className="space-y-2">
              {(!currentSummary.takeaways || currentSummary.takeaways.length === 0) && (!currentSummary.keyTakeaways || currentSummary.keyTakeaways.length === 0) ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--color-surface-2)]/30 border border-dashed border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                  <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  <span>No significant deviations detected — Gait is within healthy parameters.</span>
                </div>
              ) : (
                ((currentSummary.takeaways && currentSummary.takeaways.length > 0 ? currentSummary.takeaways : currentSummary.keyTakeaways) as any[]).map((item: any, index: number) => {
                  const isObj = typeof item === "object" && item !== null;
                  const text = isObj ? (item.text || item.title || String(item)) : String(item);
                  const id = isObj && item.id ? item.id : `takeaway-${index}`;
                  const type = isObj && item.type ? item.type : "info";
                  const IconComp = TAKEAWAY_ICONS[type] || Info;
                  const borderTone =
                    type === "positive"
                      ? "border-l-emerald-500 bg-emerald-500/5"
                      : type === "warning"
                        ? "border-l-amber-500 bg-amber-500/5"
                        : "border-l-sky-500 bg-sky-500/5";

                  return (
                    <div
                      key={id}
                      onClick={() => onTakeawayClick?.(id)}
                      className={cn(
                        "flex items-start gap-2.5 p-2.5 rounded-lg border border-[var(--color-border)] border-l-4 transition-all duration-150 cursor-pointer hover:bg-[var(--color-surface-2)]",
                        borderTone
                      )}
                    >
                      <IconComp
                        className={cn(
                          "size-4 shrink-0 mt-0.5",
                          type === "positive"
                            ? "text-emerald-500"
                            : type === "warning"
                              ? "text-amber-500"
                              : "text-sky-500"
                        )}
                      />
                      <div className="flex flex-col gap-0.5">
                        <p className="text-xs font-medium text-[var(--color-fg)] leading-relaxed">
                          {text}
                        </p>
                        {isObj && item.laymanExplanation && (
                          <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
                            {item.laymanExplanation}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

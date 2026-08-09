"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  GitCompare,
  AlertTriangle,
  Activity,
  ArrowLeft,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  Clock,
  Info,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { listGaitSessions, type GaitSessionRecord } from "@/lib/gait/persistence";
import type { GaitMetrics } from "@/lib/gait/types";
import type { JointAnglePoint, NormativeRangePoint } from "@/lib/gait/angles";
import {
  resampleAngleCurve,
  resampleNormativeCurve,
  type ResampledAnglePoint,
  type ResampledNormativePoint,
} from "@/lib/gait/curveResample";
import { cn } from "@/lib/utils";

/** Fixed 0–100 integer percent-of-gait-cycle grid every overlaid curve is projected onto. */
const GAIT_CYCLE_GRID_SIZE = 101;

/**
 * Metrics reported for context only. They have no clinically meaningful
 * direction of improvement (a longer walk or more steps is neither better nor
 * worse), so their delta badge is deliberately neutral and the table says so
 * rather than implying an unscored metric was scored.
 */
const CONTEXT_ONLY_METRIC_KEYS = new Set(["durationSec", "stepCount"]);

/** Dimensionless engine ratio -> percent, matching ratings.ts and MetricsPanel. */
function pct(v: number | undefined | null): number | undefined {
  return v == null ? undefined : v * 100;
}

/**
 * Change thresholds below which a metric is shown as "unchanged".
 *
 * IMPORTANT — these are NOT clinical minimal detectable change (MDC) values, with
 * one exception. No MDC has been established for this pipeline, so a badge here
 * means "larger than this tool's own measurement noise", never "clinically
 * meaningful improvement". The UI wording must not promise more than that.
 *
 * EPS_CV_PCT is the one empirically grounded threshold. Measured on synthetic
 * walks with a known true step-time CV of 0.060 (40 runs per point), the
 * between-run SD at ~18 strides — the yield of this app's 20 s window — was
 * 0.0086, i.e. 0.86 percentage points. MDC95 = 1.96 * sqrt(2) * SE ~= 2.4 pp, so
 * a CV change smaller than that is indistinguishable from re-measuring the same
 * walk. Shorter clips are noisier still; see the stride-count basis shown in
 * MetricsPanel.
 */
const EPS_CV_PCT = 2.4;
/** Not empirically derived: one display decimal on a percentage. */
const EPS_ASYM_PCT = 1.0;
/** Not empirically derived: one display unit at 3 decimals on a 0-1 index. */
const EPS_INDEX = 0.02;

export interface SessionComparisonViewProps {
  /** Optional pre-loaded array of sessions; if omitted, component fetches via listGaitSessions() */
  sessions?: GaitSessionRecord[];
  /** Optional initial session ID for Baseline (Session A) */
  initialSessionAId?: string;
  /** Optional pre-selected Session A object */
  initialSessionA?: GaitSessionRecord | null;
  /** Optional initial session ID for Target (Session B) */
  initialSessionBId?: string;
  /** Optional pre-selected Session B object */
  initialSessionB?: GaitSessionRecord | null;
  /** Callback when user clicks back or close comparison */
  onClose?: () => void;
  /** Callback when user clicks back button */
  onBack?: () => void;
  /** Callback to open session history drawer */
  onOpenHistory?: () => void;
  /** Callback to start/analyze a new session */
  onNewSession?: () => void;
  /** Additional container CSS class names */
  className?: string;
}

export type JointTab = "knee" | "hip" | "ankle";

export interface MetricDelta {
  key: string;
  name: string;
  unit: string;
  valA: number | null;
  valB: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
  badgeTone: "success" | "danger" | "neutral";
  interpretation: "improved" | "degraded" | "unchanged" | "neutral";
  formattedValA: string;
  formattedValB: string;
  formattedDelta: string;
}

/**
 * Calculates absolute and percentage deltas and assigns clinical favorability badges.
 */
/* eslint-disable-next-line react-refresh/only-export-components */
export function computeDelta(
  key: string,
  name: string,
  unit: string,
  valA: number | null | undefined,
  valB: number | null | undefined,
  options: {
    higherIsBetter?: boolean;
    lowerIsBetter?: boolean;
    epsilon?: number;
    decimals?: number;
  } = {},
): MetricDelta {
  const { higherIsBetter, lowerIsBetter, epsilon = 0.5, decimals = 1 } = options;

  if (valA == null || valB == null || isNaN(valA) || isNaN(valB)) {
    return {
      key,
      name,
      unit,
      valA: valA ?? null,
      valB: valB ?? null,
      deltaAbs: null,
      deltaPct: null,
      badgeTone: "neutral",
      interpretation: "neutral",
      formattedValA: valA != null ? valA.toFixed(decimals) + (unit ? ` ${unit}` : "") : "—",
      formattedValB: valB != null ? valB.toFixed(decimals) + (unit ? ` ${unit}` : "") : "—",
      formattedDelta: "—",
    };
  }

  const deltaAbs = valB - valA;
  const deltaPct = valA !== 0 ? (deltaAbs / Math.abs(valA)) * 100 : null;

  let badgeTone: "success" | "danger" | "neutral" = "neutral";
  let interpretation: "improved" | "degraded" | "unchanged" | "neutral" = "neutral";

  if (higherIsBetter) {
    if (deltaAbs >= epsilon) {
      badgeTone = "success";
      interpretation = "improved";
    } else if (deltaAbs <= -epsilon) {
      badgeTone = "danger";
      interpretation = "degraded";
    } else {
      badgeTone = "neutral";
      interpretation = "unchanged";
    }
  } else if (lowerIsBetter) {
    if (deltaAbs <= -epsilon) {
      badgeTone = "success";
      interpretation = "improved";
    } else if (deltaAbs >= epsilon) {
      badgeTone = "danger";
      interpretation = "degraded";
    } else {
      badgeTone = "neutral";
      interpretation = "unchanged";
    }
  }

  const sign = deltaAbs > 0 ? "+" : "";
  const absStr = `${sign}${deltaAbs.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
  const pctStr = deltaPct != null ? ` (${sign}${deltaPct.toFixed(1)}%)` : "";
  const formattedDelta = `${absStr}${pctStr}`;

  return {
    key,
    name,
    unit,
    valA,
    valB,
    deltaAbs,
    deltaPct,
    badgeTone,
    interpretation,
    formattedValA: `${valA.toFixed(decimals)}${unit ? ` ${unit}` : ""}`,
    formattedValB: `${valB.toFixed(decimals)}${unit ? ` ${unit}` : ""}`,
    formattedDelta,
  };
}

export function SessionComparisonView({
  sessions: initialSessionsProp,
  initialSessionAId,
  initialSessionA,
  initialSessionBId,
  initialSessionB,
  onClose,
  onBack,
  onOpenHistory,
  onNewSession,
  className,
}: SessionComparisonViewProps) {
  const [sessions, setSessions] = useState<GaitSessionRecord[]>(initialSessionsProp || []);
  const [loading, setLoading] = useState(!initialSessionsProp);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionAId, setSessionAId] = useState<string | null>(
    initialSessionA?.id || initialSessionAId || null,
  );
  const [sessionBId, setSessionBId] = useState<string | null>(
    initialSessionB?.id || initialSessionBId || null,
  );
  const [activeJoint, setActiveJoint] = useState<JointTab>("knee");

  // The caller-preferred initial selections are read once, at mount. Keeping
  // them in a ref means the load effect does not have to depend on them (and
  // therefore cannot re-run and clobber a user's later re-selection).
  const preferredIdsRef = useRef({
    a: initialSessionA?.id || initialSessionAId || null,
    b: initialSessionB?.id || initialSessionBId || null,
  });

  /**
   * Applies default A/B selections for a freshly loaded list. The functional
   * `prev || …` guards make this a no-op once the user has picked a session.
   */
  const applyDefaultSelections = useCallback((list: GaitSessionRecord[]) => {
    const { a, b } = preferredIdsRef.current;
    if (list.length >= 2) {
      setSessionAId((prev) => prev || a || list[1].id);
      setSessionBId((prev) => prev || b || list[0].id);
    } else if (list.length === 1) {
      setSessionAId((prev) => prev || a || list[0].id);
    }
  }, []);

  const loadSessions = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listGaitSessions()
      .then((list) => {
        setSessions(list);
        applyDefaultSelections(list);
      })
      .catch((e) => {
        console.error("Failed to load gait sessions:", e);
        setSessions([]);
        setLoadError("Sign-in required or failed to load sessions.");
      })
      .finally(() => setLoading(false));
  }, [applyDefaultSelections]);

  // Load sessions from persistence if not provided in props. Depends only on
  // the sessions prop (plus stable callbacks) — never on the current selection.
  useEffect(() => {
    if (!initialSessionsProp) {
      loadSessions();
    } else {
      setSessions(initialSessionsProp);
      applyDefaultSelections(initialSessionsProp);
    }
  }, [initialSessionsProp, loadSessions, applyDefaultSelections]);

  // Selected session objects
  const sessionA = useMemo(() => {
    if (initialSessionA && initialSessionA.id === sessionAId) return initialSessionA;
    return sessions.find((s) => s.id === sessionAId) || null;
  }, [sessions, sessionAId, initialSessionA]);

  const sessionB = useMemo(() => {
    if (initialSessionB && initialSessionB.id === sessionBId) return initialSessionB;
    return sessions.find((s) => s.id === sessionBId) || null;
  }, [sessions, sessionBId, initialSessionB]);

  // Metric deltas calculation
  const domainDeltas = useMemo(() => {
    if (!sessionA || !sessionB) return [];
    return [
      computeDelta("overallScore", "Overall Gait Score", "/100", sessionA.overallScore, sessionB.overallScore, {
        higherIsBetter: true,
        epsilon: 0.5,
      }),
      computeDelta("mobilityScore", "Mobility (Pace)", "/100", sessionA.mobilityScore, sessionB.mobilityScore, {
        higherIsBetter: true,
        epsilon: 0.5,
      }),
      computeDelta("symmetryScore", "Symmetry Score", "/100", sessionA.symmetryScore, sessionB.symmetryScore, {
        higherIsBetter: true,
        epsilon: 0.5,
      }),
      computeDelta("stabilityScore", "Stability Score", "/100", sessionA.stabilityScore, sessionB.stabilityScore, {
        higherIsBetter: true,
        epsilon: 0.5,
      }),
      computeDelta("rhythmScore", "Rhythm Score", "/100", sessionA.rhythmScore, sessionB.rhythmScore, {
        higherIsBetter: true,
        epsilon: 0.5,
      }),
      computeDelta("automaticityScore", "Automaticity Score", "/100", sessionA.automaticityScore, sessionB.automaticityScore, {
        higherIsBetter: true,
        epsilon: 0.5,
      }),
    ];
  }, [sessionA, sessionB]);

  const spatioTemporalDeltas = useMemo(() => {
    if (!sessionA || !sessionB) return [];
    const mA: Partial<GaitMetrics> = sessionA.metricsJson || {};
    const mB: Partial<GaitMetrics> = sessionB.metricsJson || {};

    return [
      computeDelta("cadenceSpm", "Cadence", "spm", sessionA.cadenceSpm ?? mA.cadenceSpm, sessionB.cadenceSpm ?? mB.cadenceSpm, {
        higherIsBetter: true,
        epsilon: 1.0,
      }),
      computeDelta("stepCount", "Step Count", "steps", sessionA.stepCount ?? mA.stepCount, sessionB.stepCount ?? mB.stepCount, {
        decimals: 0,
      }),
      computeDelta("durationSec", "Duration", "s", sessionA.durationSec ?? mA.durationSec, sessionB.durationSec ?? mB.durationSec, {
        decimals: 1,
      }),
      computeDelta("avgStepTimeSec", "Avg Step Time", "s", mA.avgStepTimeSec, mB.avgStepTimeSec, {
        decimals: 3,
      }),
      computeDelta("doubleSupportPct", "Double Support", "%", mA.doubleSupportPct, mB.doubleSupportPct, {
        lowerIsBetter: true,
        epsilon: 0.5,
      }),
    ];
  }, [sessionA, sessionB]);

  const symmetryAndVariabilityDeltas = useMemo(() => {
    if (!sessionA || !sessionB) return [];
    const mA: Partial<GaitMetrics> = sessionA.metricsJson || {};
    const mB: Partial<GaitMetrics> = sessionB.metricsJson || {};

    return [
      computeDelta("symmetryAngle", "Symmetry Angle (SA)", "%", sessionA.symmetryAngle ?? mA.symmetryAngle, sessionB.symmetryAngle ?? mB.symmetryAngle, {
        lowerIsBetter: true,
        epsilon: 0.2,
      }),
      // stepTimeCV/strideTimeCV are dimensionless ratios (std/mean, ~0.02-0.10).
      // Scale to percent here, exactly as ratings.ts and MetricsPanel already do,
      // so the "%" label is true and epsilon is expressed in percentage points.
      computeDelta("stepTimeCV", "Step Time CV", "%", pct(mA.stepTimeCV), pct(mB.stepTimeCV), {
        lowerIsBetter: true,
        epsilon: EPS_CV_PCT,
        decimals: 1,
      }),
      computeDelta("strideTimeCV", "Stride Time CV", "%", pct(mA.strideTimeCV), pct(mB.strideTimeCV), {
        lowerIsBetter: true,
        epsilon: EPS_CV_PCT,
        decimals: 1,
      }),
      // Asymmetry is a dimensionless ratio, NOT seconds.
      computeDelta("stepTimeAsymmetry", "Step Time Asymmetry", "%", pct(mA.stepTimeAsymmetry), pct(mB.stepTimeAsymmetry), {
        lowerIsBetter: true,
        epsilon: EPS_ASYM_PCT,
        decimals: 1,
      }),
      computeDelta("pathSmoothness", "Path Smoothness", "AU", mA.pathSmoothness, mB.pathSmoothness, {
        higherIsBetter: true,
        epsilon: EPS_INDEX,
        decimals: 3,
      }),
      // Vertical bounce is the std of torso-normalized hip-Y residuals in MediaPipe
      // image coordinates. There is no metric scale in this pipeline — labelling it
      // "m" invented a physical quantity. "idx" matches MetricsPanel.
      computeDelta("verticalBounce", "Vertical Bounce", "idx", mA.verticalBounce, mB.verticalBounce, {
        lowerIsBetter: true,
        epsilon: EPS_INDEX,
        decimals: 3,
      }),
    ];
  }, [sessionA, sessionB]);

  // Field selectors for the active joint. Kept as key lookups so the
  // knee/hip/ankle switch stays a single source of truth.
  const jointFields = useMemo(() => {
    if (activeJoint === "knee") {
      return {
        left: "kneeAngleLeft",
        right: "kneeAngleRight",
        min: "kneeMin",
        max: "kneeMax",
        mean: "kneeMean",
      } as const;
    }
    if (activeJoint === "hip") {
      return {
        left: "hipAngleLeft",
        right: "hipAngleRight",
        min: "hipMin",
        max: "hipMax",
        mean: "hipMean",
      } as const;
    }
    return {
      left: "ankleAngleLeft",
      right: "ankleAngleRight",
      min: "ankleMin",
      max: "ankleMax",
      mean: "ankleMean",
    } as const;
  }, [activeJoint]);

  // Combined Overlaid Recharts Data.
  //
  // Both sessions' curves and the normative band are resampled onto one shared
  // 0–100 integer grid (linear interpolation on each point's own
  // `gaitCyclePct`) before being zipped together, so row `i` of the chart means
  // the same percentage of the gait cycle for every series regardless of how
  // many raw points each session stored.
  const chartData = useMemo(() => {
    if (!sessionA || !sessionB) return [];

    const rawA: JointAnglePoint[] = sessionA.angleAnalysisJson?.normalizedPoints || [];
    const rawB: JointAnglePoint[] = sessionB.angleAnalysisJson?.normalizedPoints || [];
    const rawNormative: NormativeRangePoint[] =
      sessionA.angleAnalysisJson?.normativeData ||
      sessionB.angleAnalysisJson?.normativeData ||
      [];

    const gridA: ResampledAnglePoint[] = resampleAngleCurve(rawA, GAIT_CYCLE_GRID_SIZE);
    const gridB: ResampledAnglePoint[] = resampleAngleCurve(rawB, GAIT_CYCLE_GRID_SIZE);
    const gridNorm: ResampledNormativePoint[] = resampleNormativeCurve(
      rawNormative,
      GAIT_CYCLE_GRID_SIZE,
    );

    const { left, right, min, max, mean } = jointFields;

    return Array.from({ length: GAIT_CYCLE_GRID_SIZE }, (_, i) => {
      const a = gridA[i];
      const b = gridB[i];
      const n = gridNorm[i];
      const normMin = n ? n[min] : null;
      const normMax = n ? n[max] : null;

      return {
        // gridSize 101 makes the grid exactly the integers 0..100.
        gaitCyclePct: i,
        sessionALeft: a ? a[left] : null,
        sessionARight: a ? a[right] : null,
        sessionBLeft: b ? b[left] : null,
        sessionBRight: b ? b[right] : null,
        // A missing normative sample emits null, not 0: a zero-width band
        // pinned at 0° would be a fabricated reference envelope.
        normativeRange:
          normMin != null && normMax != null ? ([normMin, normMax] as [number, number]) : null,
        normativeMean: n ? n[mean] : null,
      };
    });
  }, [sessionA, sessionB, jointFields]);

  /** True only when at least one grid position carries a real normative band. */
  const hasNormativeBand = useMemo(
    () => chartData.some((row) => row.normativeRange != null),
    [chartData],
  );

  // Joint Kinematic ROM Comparison Stats
  const jointRomStats = useMemo(() => {
    if (!sessionA || !sessionB) return null;
    const mA = sessionA.angleAnalysisJson?.metrics;
    const mB = sessionB.angleAnalysisJson?.metrics;
    if (!mA || !mB) return null;

    if (activeJoint === "knee") {
      return {
        leftRomA: mA.kneeRomLeft,
        leftRomB: mB.kneeRomLeft,
        rightRomA: mA.kneeRomRight,
        rightRomB: mB.kneeRomRight,
        asymmetryA: mA.kneeAsymmetryPct,
        asymmetryB: mB.kneeAsymmetryPct,
        title: "Knee Joint ROM Comparison (Flexion/Extension)",
      };
    } else if (activeJoint === "hip") {
      return {
        leftRomA: mA.hipRomLeft,
        leftRomB: mB.hipRomLeft,
        rightRomA: mA.hipRomRight,
        rightRomB: mB.hipRomRight,
        asymmetryA: mA.hipAsymmetryPct,
        asymmetryB: mB.hipAsymmetryPct,
        title: "Hip Joint ROM Comparison (Flexion/Extension)",
      };
    } else {
      return {
        leftRomA: mA.ankleRomLeft,
        leftRomB: mB.ankleRomLeft,
        rightRomA: mA.ankleRomRight,
        rightRomB: mB.ankleRomRight,
        asymmetryA: mA.ankleAsymmetryPct,
        asymmetryB: mB.ankleAsymmetryPct,
        title: "Ankle Joint ROM Comparison (Dorsiflexion/Plantarflexion)",
      };
    }
  }, [sessionA, sessionB, activeJoint]);

  // View suppression status
  const isSuppressedA = sessionA?.angleAnalysisJson?.isSuppressed ?? false;
  const isSuppressedB = sessionB?.angleAnalysisJson?.isSuppressed ?? false;
  const isSuppressedAny = isSuppressedA || isSuppressedB;
  const suppressionReason =
    sessionA?.angleAnalysisJson?.suppressionReason ||
    sessionB?.angleAnalysisJson?.suppressionReason ||
    "One or both selected sessions were captured from a frontal camera view. Sagittal plane joint kinematic angles (flexion/extension) are suppressed for frontal view recordings.";

  const handleClose = onClose || onBack;

  // ----------------------------------------------------
  // Load failure — deliberately distinct from a genuine 0-session result.
  // A failed fetch tells us nothing about how many sessions exist, so it must
  // never be rendered as "you have no sessions".
  // ----------------------------------------------------
  if (!loading && loadError) {
    return (
      <Card
        data-testid="comparison-load-error"
        role="alert"
        aria-live="assertive"
        className={cn("w-full max-w-4xl mx-auto my-8 p-6", className)}
      >
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-danger)_15%,transparent)] text-[var(--color-danger)]">
            <ShieldAlert className="size-6" />
          </div>
          <CardTitle className="mt-3 text-xl font-bold">Could Not Load Saved Sessions</CardTitle>
          <CardDescription className="max-w-md mx-auto mt-1">
            {loadError} This is a load failure, not an empty session list — your saved sessions may
            still exist.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 mt-2">
          <div className="flex flex-wrap justify-center gap-3">
            <Button data-testid="comparison-load-retry" onClick={loadSessions} className="gap-2">
              <RefreshCw className="size-4" /> Retry
            </Button>
            {handleClose && (
              <Button variant="ghost" onClick={handleClose} className="gap-2">
                <ArrowLeft className="size-4" /> Back to Workflow
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // Fallback 0 Sessions
  // ----------------------------------------------------
  if (!loading && sessions.length === 0) {
    return (
      <Card data-testid="fallback-0-sessions" className={cn("w-full max-w-4xl mx-auto my-8 p-6", className)}>
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-primary)_15%,transparent)] text-[var(--color-primary)]">
            <Layers className="size-6" />
          </div>
          <CardTitle className="mt-3 text-xl font-bold">Dual Session Comparison Requires 2 Gait Sessions</CardTitle>
          <CardDescription className="max-w-md mx-auto mt-1">
            Side-by-side gait comparison enables clinical tracking of baseline vs. follow-up or single vs. dual-task walks. Currently, no saved sessions exist in the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 mt-2">
          <div className="flex flex-wrap justify-center gap-3">
            {onNewSession && (
              <Button onClick={onNewSession} className="gap-2">
                <Activity className="size-4" /> Analyze New Video
              </Button>
            )}
            {onOpenHistory && (
              <Button variant="secondary" onClick={onOpenHistory} className="gap-2">
                <Clock className="size-4" /> Open Session History
              </Button>
            )}
            {handleClose && (
              <Button variant="ghost" onClick={handleClose} className="gap-2">
                <ArrowLeft className="size-4" /> Back to Workflow
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // Fallback 1 Session
  // ----------------------------------------------------
  if (!loading && sessions.length === 1 && !sessionB) {
    const singleSession = sessions[0];
    return (
      <Card data-testid="fallback-1-session" className={cn("w-full max-w-4xl mx-auto my-8 p-6", className)}>
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-warn)_15%,transparent)] text-[var(--color-warn)]">
            <Info className="size-6" />
          </div>
          <CardTitle className="mt-3 text-xl font-bold">Only 1 Saved Session Found</CardTitle>
          <CardDescription className="max-w-md mx-auto mt-1">
            Session A (Baseline) is loaded as <strong>"{singleSession.sessionName}"</strong>. Save a second session (e.g. Follow-up or Dual-Task) to compute metric deltas and joint angle curve overlays.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6 mt-2">
          <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] p-4 bg-[var(--color-surface-2)] text-left">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-semibold text-sm">{singleSession.sessionName}</h4>
                <p className="text-xs text-[var(--color-subtle)]">
                  {new Date(singleSession.createdAt).toLocaleString()}
                </p>
              </div>
              <Badge tone="primary">{singleSession.overallScore.toFixed(0)} / 100</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--color-muted)]">
              <div>Cadence: {singleSession.cadenceSpm.toFixed(0)} spm</div>
              <div>Mode: {singleSession.taskMode}</div>
              <div>Steps: {singleSession.stepCount}</div>
              <div>SA: {singleSession.symmetryAngle != null ? `${singleSession.symmetryAngle.toFixed(1)}%` : "—"}</div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {onNewSession && (
              <Button onClick={onNewSession} className="gap-2">
                <Activity className="size-4" /> Record / Analyze 2nd Video
              </Button>
            )}
            {onOpenHistory && (
              <Button variant="secondary" onClick={onOpenHistory} className="gap-2">
                <Clock className="size-4" /> View Saved Sessions
              </Button>
            )}
            {handleClose && (
              <Button variant="ghost" onClick={handleClose} className="gap-2">
                <ArrowLeft className="size-4" /> Back to Workflow
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // 2+ Sessions Comparison Workstation
  // ----------------------------------------------------
  return (
    <div data-testid="session-comparison-view" className={cn("w-full max-w-6xl mx-auto space-y-6 py-6 px-4 sm:px-6", className)}>
      {/* Header & Controls */}
      <Card className="p-4 sm:p-6 border-[var(--color-border)]">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            {handleClose && (
              <Button variant="secondary" size="sm" onClick={handleClose} aria-label="Back">
                <ArrowLeft className="size-4 mr-1" /> Back
              </Button>
            )}
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 text-[var(--color-fg)]">
                <GitCompare className="size-5 text-[var(--color-primary)]" />
                Side-by-Side Dual Session Comparison
              </h2>
              <p className="text-xs text-[var(--color-subtle)]">
                Quantitative metric deltas & overlaid joint angle kinematic trajectories
              </p>
            </div>
          </div>
          {onOpenHistory && (
            <Button variant="secondary" size="sm" onClick={onOpenHistory}>
              <Clock className="size-3.5 mr-1.5" /> History Drawer
            </Button>
          )}
        </div>

        {/* Dropdown Selectors Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {/* Baseline Session A Selector */}
          <div className="space-y-1.5 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <div className="flex items-center justify-between">
              <label htmlFor="selector-session-a" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)] flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-blue-500" /> Baseline (Session A)
              </label>
              {sessionA && <Badge tone="primary" className="text-[10px]">{sessionA.taskMode}</Badge>}
            </div>
            <select
              id="selector-session-a"
              data-testid="selector-session-a"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              value={sessionAId ?? ""}
              onChange={(e) => setSessionAId(e.target.value || null)}
            >
              <option value="">Select Baseline Session A...</option>
              {sessions.map((s) => (
                <option key={`a-${s.id}`} value={s.id}>
                  {s.sessionName} ({new Date(s.createdAt).toLocaleDateString()}) — Score: {s.overallScore.toFixed(0)}
                </option>
              ))}
            </select>
            {sessionA && (
              <p className="text-[11px] text-[var(--color-muted)] flex items-center gap-3 pt-1">
                <span><Calendar className="inline size-3 mr-1" />{new Date(sessionA.createdAt).toLocaleString()}</span>
                <span><Activity className="inline size-3 mr-1" />{sessionA.cadenceSpm.toFixed(0)} spm</span>
              </p>
            )}
          </div>

          {/* Target Session B Selector */}
          <div className="space-y-1.5 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <div className="flex items-center justify-between">
              <label htmlFor="selector-session-b" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-success)] flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-emerald-500" /> Target / Follow-up (Session B)
              </label>
              {sessionB && <Badge tone="accent" className="text-[10px]">{sessionB.taskMode}</Badge>}
            </div>
            <select
              id="selector-session-b"
              data-testid="selector-session-b"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              value={sessionBId ?? ""}
              onChange={(e) => setSessionBId(e.target.value || null)}
            >
              <option value="">Select Target Session B...</option>
              {sessions.map((s) => (
                <option key={`b-${s.id}`} value={s.id}>
                  {s.sessionName} ({new Date(s.createdAt).toLocaleDateString()}) — Score: {s.overallScore.toFixed(0)}
                </option>
              ))}
            </select>
            {sessionB && (
              <p className="text-[11px] text-[var(--color-muted)] flex items-center gap-3 pt-1">
                <span><Calendar className="inline size-3 mr-1" />{new Date(sessionB.createdAt).toLocaleString()}</span>
                <span><Activity className="inline size-3 mr-1" />{sessionB.cadenceSpm.toFixed(0)} spm</span>
              </p>
            )}
          </div>
        </div>

        {/* Identical Session Warning */}
        {sessionAId && sessionBId && sessionAId === sessionBId && (
          <div data-testid="same-session-warning" className="mt-3 flex items-center gap-2 rounded-md border border-[color-mix(in_oklab,var(--color-warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-warn)_10%,transparent)] p-3 text-xs text-[var(--color-warn)]">
            <AlertTriangle className="size-4 shrink-0" />
            <span>Baseline (Session A) and Target (Session B) are identical. Select two different sessions for meaningful clinical delta analysis.</span>
          </div>
        )}
      </Card>

      {/* Main Dual Comparison Content (When both sessions are selected) */}
      {sessionA && sessionB && (
        <>
          {/* Domain Gait Health Scores Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {domainDeltas.map((d) => (
              <Card key={d.key} data-testid={`card-${d.key}`} className="p-3 border-[var(--color-border)] flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-medium text-[var(--color-subtle)] truncate block">{d.name}</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-xs text-[var(--color-muted)]">A: {d.formattedValA}</span>
                    <span className="text-xs font-semibold text-[var(--color-fg)]">B: {d.formattedValB}</span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-[var(--color-border)] flex items-center justify-between">
                  <Badge tone={d.badgeTone} className="text-[10px] px-1.5 py-0 font-mono">
                    {d.formattedDelta}
                  </Badge>
                  {/* Wording is deliberately "moved beyond measurement noise", not
                      "improved": no clinical MDC exists for this pipeline. */}
                  {d.interpretation === "improved" ? (
                    <TrendingUp
                      className="size-3.5 text-[var(--color-success)]"
                      role="img"
                      aria-label={`${d.name}: moved in the favourable direction, beyond measurement noise`}
                    />
                  ) : d.interpretation === "degraded" ? (
                    <TrendingDown
                      className="size-3.5 text-[var(--color-danger)]"
                      role="img"
                      aria-label={`${d.name}: moved in the unfavourable direction, beyond measurement noise`}
                    />
                  ) : (
                    <Minus
                      className="size-3.5 text-[var(--color-muted)]"
                      role="img"
                      aria-label={`${d.name}: within measurement noise, no detectable change`}
                    />
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Comparison Metric Tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Spatio-Temporal Parameters Table */}
            <Card className="border-[var(--color-border)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Activity className="size-4 text-[var(--color-primary)]" /> Spatio-Temporal Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--color-surface-2)] text-[var(--color-subtle)] uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4">Metric</th>
                        <th className="py-2.5 px-3 text-right">Baseline A</th>
                        <th className="py-2.5 px-3 text-right">Target B</th>
                        <th className="py-2.5 px-4 text-right">Clinical Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {spatioTemporalDeltas.map((d) => {
                        const isContextOnly = CONTEXT_ONLY_METRIC_KEYS.has(d.key);
                        return (
                          <tr key={d.key} data-testid={`row-${d.key}`} className="hover:bg-[var(--color-surface-2)]/50 transition-colors">
                            <td className="py-2.5 px-4 font-medium text-[var(--color-fg)]">
                              {d.name}
                              {isContextOnly && (
                                <span
                                  data-testid={`context-only-${d.key}`}
                                  className="ml-1.5 align-middle text-[10px] font-normal uppercase tracking-wide text-[var(--color-subtle)]"
                                  title="Recording context: this value has no clinically better or worse direction, so its delta is reported but not scored."
                                >
                                  (context, not scored)
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[var(--color-muted)]">{d.formattedValA}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--color-fg)]">{d.formattedValB}</td>
                            <td className="py-2.5 px-4 text-right">
                              <Badge tone={d.badgeTone} className="text-[10px] px-1.5 py-0 font-mono">
                                {d.formattedDelta}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Symmetry & Variability Table */}
            <Card className="border-[var(--color-border)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <GitCompare className="size-4 text-[var(--color-accent)]" /> Symmetry & Variability Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--color-surface-2)] text-[var(--color-subtle)] uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4">Metric</th>
                        <th className="py-2.5 px-3 text-right">Baseline A</th>
                        <th className="py-2.5 px-3 text-right">Target B</th>
                        <th className="py-2.5 px-4 text-right">Clinical Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {symmetryAndVariabilityDeltas.map((d) => (
                        <tr key={d.key} data-testid={`row-${d.key}`} className="hover:bg-[var(--color-surface-2)]/50 transition-colors">
                          <td className="py-2.5 px-4 font-medium text-[var(--color-fg)]">{d.name}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-[var(--color-muted)]">{d.formattedValA}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--color-fg)]">{d.formattedValB}</td>
                          <td className="py-2.5 px-4 text-right">
                            <Badge tone={d.badgeTone} className="text-[10px] px-1.5 py-0 font-mono">
                              {d.formattedDelta}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Overlaid Joint Kinematic Trajectory Curves Section */}
          <Card className="border-[var(--color-border)]">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="size-5 text-[var(--color-primary)]" />
                  <CardTitle className="text-base font-bold">Overlaid Joint Kinematic Trajectories</CardTitle>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-1 bg-[var(--color-surface-2)]">
                  <Button
                    variant={activeJoint === "knee" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveJoint("knee")}
                    data-testid="joint-tab-knee"
                  >
                    Knee
                  </Button>
                  <Button
                    variant={activeJoint === "hip" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveJoint("hip")}
                    data-testid="joint-tab-hip"
                  >
                    Hip
                  </Button>
                  <Button
                    variant={activeJoint === "ankle" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveJoint("ankle")}
                    data-testid="joint-tab-ankle"
                  >
                    Ankle
                  </Button>
                </div>
              </div>
              <CardDescription>
                Comparison of Session A (Solid lines) vs. Session B (Dashed lines) normalized joint trajectories (0–100% Gait Cycle) overlaid against Perry &amp; Burnfield (2010) normative reference envelope.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* View Suppression Alert Banner */}
              {isSuppressedAny && (
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

              {/* Joint ROM Comparison Stat Badges */}
              {!isSuppressedAny && jointRomStats && (
                <div
                  data-testid="joint-rom-badges"
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs"
                >
                  <span className="font-semibold text-[var(--color-fg)] mr-2">{jointRomStats.title}:</span>
                  <Badge tone="primary" data-testid="rom-left-a">
                    Left ROM A: {jointRomStats.leftRomA != null ? `${jointRomStats.leftRomA.toFixed(1)}°` : "—"}
                  </Badge>
                  <Badge tone="success" data-testid="rom-left-b">
                    Left ROM B: {jointRomStats.leftRomB != null ? `${jointRomStats.leftRomB.toFixed(1)}°` : "—"}
                  </Badge>
                  <Badge tone="accent" data-testid="rom-right-a">
                    Right ROM A: {jointRomStats.rightRomA != null ? `${jointRomStats.rightRomA.toFixed(1)}°` : "—"}
                  </Badge>
                  <Badge tone="warn" data-testid="rom-right-b">
                    Right ROM B: {jointRomStats.rightRomB != null ? `${jointRomStats.rightRomB.toFixed(1)}°` : "—"}
                  </Badge>
                  <Badge tone="neutral" data-testid="asymmetry-comp">
                    Asymmetry: A {jointRomStats.asymmetryA != null ? `${jointRomStats.asymmetryA.toFixed(1)}%` : "—"} vs B {jointRomStats.asymmetryB != null ? `${jointRomStats.asymmetryB.toFixed(1)}%` : "—"}
                  </Badge>
                </div>
              )}

              {/* Recharts Chart Container */}
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
                      }}
                    />
                    <Legend verticalAlign="top" height={40} />
                    {hasNormativeBand && (
                      <Area
                        type="monotone"
                        dataKey="normativeRange"
                        stroke="none"
                        fill="#94a3b8"
                        fillOpacity={0.18}
                        name="Normative Range (Perry & Burnfield)"
                        connectNulls={false}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="sessionALeft"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                      name={`Session A (${sessionA.sessionName.slice(0, 12)}) Left`}
                    />
                    <Line
                      type="monotone"
                      dataKey="sessionARight"
                      stroke="#0369a1"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      name={`Session A (${sessionA.sessionName.slice(0, 12)}) Right`}
                    />
                    <Line
                      type="monotone"
                      dataKey="sessionBLeft"
                      stroke="#0f766e"
                      strokeWidth={2}
                      dot={false}
                      name={`Session B (${sessionB.sessionName.slice(0, 12)}) Left`}
                    />
                    <Line
                      type="monotone"
                      dataKey="sessionBRight"
                      stroke="#64748b"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      name={`Session B (${sessionB.sessionName.slice(0, 12)}) Right`}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {!hasNormativeBand && (
                <p
                  data-testid="normative-band-unavailable"
                  className="text-[11px] text-[var(--color-subtle)]"
                >
                  No normative reference envelope is stored for either session, so the shaded
                  normative band is omitted rather than drawn at 0°.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  Compass,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Maximize2,
  Sliders,
  Check,
  RefreshCw,
  X,
  Eye,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  estimateCameraPerspective,
  type CameraPerspectiveParams,
  type CalibrationOptions,
  DEFAULT_SUBJECT_HEIGHT_M,
  DEFAULT_TILT_THRESHOLD_DEG,
  DEFAULT_CRITICAL_THRESHOLD_DEG,
} from "@/lib/gait/perspective";
import type { PoseFrame } from "@/lib/gait/types";
import { cn } from "@/lib/utils";

export interface CameraCalibrationAssistantProps {
  frames?: PoseFrame[];
  perspectiveParams?: CameraPerspectiveParams;
  enablePerspectiveCorrection?: boolean;
  onTogglePerspectiveCorrection?: (enabled: boolean) => void;
  onUpdateCalibrationOptions?: (options: CalibrationOptions) => void;
  trigger?: React.ReactNode;
  isOpen?: boolean;
  onClose?: () => void;
  initialOpen?: boolean;
}

export function CameraCalibrationAssistant({
  frames = [],
  perspectiveParams: customParams,
  enablePerspectiveCorrection = true,
  onTogglePerspectiveCorrection,
  onUpdateCalibrationOptions,
  trigger,
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
  initialOpen = false,
}: CameraCalibrationAssistantProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(initialOpen);
  const [targetView, setTargetView] = useState<"sagittal" | "frontal">("sagittal");
  const [subjectHeightM, setSubjectHeightM] = useState<number>(DEFAULT_SUBJECT_HEIGHT_M);
  const [correctionActive, setCorrectionActive] = useState<boolean>(enablePerspectiveCorrection);
  const [customPitchOffset, setCustomPitchOffset] = useState<number>(0);
  const [customYawOffset, setCustomYawOffset] = useState<number>(0);

  const isModalOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const handleClose = () => {
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  const computedParams = useMemo(() => {
    if (customParams) return customParams;
    const base = estimateCameraPerspective(frames, {
      targetView,
      subjectHeightM,
      tiltThresholdDeg: DEFAULT_TILT_THRESHOLD_DEG,
      criticalThresholdDeg: DEFAULT_CRITICAL_THRESHOLD_DEG,
    });
    if (customPitchOffset !== 0 || customYawOffset !== 0) {
      const pitch = base.pitchDeg + customPitchOffset;
      const yaw = base.yawDeg + customYawOffset;
      const yawDev = Math.abs(yaw - (targetView === "sagittal" ? 90 : 0));
      const dev = Math.max(Math.abs(pitch), yawDev);
      const isOrth = dev <= DEFAULT_TILT_THRESHOLD_DEG;
      const lvl = dev > DEFAULT_CRITICAL_THRESHOLD_DEG ? "critical" : dev > DEFAULT_TILT_THRESHOLD_DEG ? "warning" : "nominal";
      return {
        ...base,
        pitchDeg: pitch,
        yawDeg: yaw,
        obliqueDeviationDeg: dev,
        isOrthogonal: isOrth,
        warningLevel: lvl,
      };
    }
    return base;
  }, [customParams, frames, targetView, subjectHeightM, customPitchOffset, customYawOffset]);

  const handleToggle = (val: boolean) => {
    setCorrectionActive(val);
    onTogglePerspectiveCorrection?.(val);
  };

  const handleTargetViewChange = (view: "sagittal" | "frontal") => {
    setTargetView(view);
    onUpdateCalibrationOptions?.({ targetView: view, subjectHeightM });
  };

  const handleHeightChange = (h: number) => {
    setSubjectHeightM(h);
    onUpdateCalibrationOptions?.({ targetView, subjectHeightM: h });
  };

  const handleResetCalibration = () => {
    setCustomPitchOffset(0);
    setCustomYawOffset(0);
    setSubjectHeightM(DEFAULT_SUBJECT_HEIGHT_M);
    setTargetView("sagittal");
  };

  // Dual-Axis Spirit Level Bubble Gauge Coordinates (normalized between -1 and 1)
  // Max scale is +/- 30 degrees
  const maxVisualDeg = 30;
  const bubbleX = Math.max(-1, Math.min(1, (computedParams.rollDeg || (computedParams.yawDeg - (targetView === "sagittal" ? 90 : 0))) / maxVisualDeg));
  const bubbleY = Math.max(-1, Math.min(1, computedParams.pitchDeg / maxVisualDeg));

  // Pixel radius for spirit level gauge canvas (gauge size: 180x180 px, radius: 80 px)
  const gaugeRadius = 76;
  const bubblePixelX = 90 + bubbleX * (gaugeRadius - 14);
  const bubblePixelY = 90 + bubbleY * (gaugeRadius - 14);

  return (
    <>
      {trigger ? (
        <div onClick={() => setInternalIsOpen(true)} className="inline-block">
          {trigger}
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setInternalIsOpen(true)}
          className="gap-2 border-slate-700 bg-slate-900/80 text-slate-200 hover:bg-slate-800 hover:text-white"
          data-testid="open-camera-calibration-btn"
        >
          <Compass className="size-4 text-sky-400" />
          <span>Camera Calibration</span>
          {computedParams.warningLevel !== "nominal" && (
            <span
              className={cn(
                "size-2 rounded-full",
                computedParams.warningLevel === "critical"
                  ? "bg-rose-500 animate-ping"
                  : "bg-amber-400"
              )}
            />
          )}
        </Button>
      )}

      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-calibration-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100 flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                  <Compass className="size-5" />
                </div>
                <div>
                  <h2 id="camera-calibration-title" className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    Markerless Optical Camera Perspective & Calibration
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Winter/Dempster segment invariants & ground contact geometry with 3D homography attitude rectification.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                aria-label="Close Calibration Assistant"
                className="h-8 w-8 p-0 rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* 3-Tier Clinical Warning Banner */}
            <div
              data-testid="calibration-warning-banner"
              className={cn(
                "flex items-start gap-3 p-4 rounded-xl border transition-colors",
                computedParams.warningLevel === "nominal"
                  ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-300"
                  : computedParams.warningLevel === "warning"
                    ? "bg-amber-950/30 border-amber-800/50 text-amber-300"
                    : "bg-rose-950/30 border-rose-800/50 text-rose-300"
              )}
            >
              {computedParams.warningLevel === "nominal" ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-400 mt-0.5" />
              ) : computedParams.warningLevel === "warning" ? (
                <AlertTriangle className="size-5 shrink-0 text-amber-400 mt-0.5" />
              ) : (
                <AlertOctagon className="size-5 shrink-0 text-rose-400 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    {computedParams.warningLevel === "nominal"
                      ? "Orthogonal Alignment Verified"
                      : computedParams.warningLevel === "warning"
                        ? "Non-Orthogonal Optical View (>10° Tilt)"
                        : "Severe Oblique Angle (>20° Tilt)"}
                  </span>
                  <Badge
                    tone="neutral"
                    className={cn(
                      "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5",
                      computedParams.warningLevel === "nominal"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-600"
                        : computedParams.warningLevel === "warning"
                          ? "bg-amber-500/20 text-amber-300 border-amber-600"
                          : "bg-rose-500/20 text-rose-300 border-rose-600"
                    )}
                  >
                    {computedParams.warningLevel}
                  </Badge>
                </div>
                <p className="text-xs mt-1 text-slate-300 leading-relaxed">
                  {computedParams.warningMessage}
                </p>
              </div>
            </div>

            {/* Inclinometer Gauge & Telemetry Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              {/* Dual-Axis Spirit Level / Inclinometer */}
              <div className="md:col-span-5 bg-slate-950 border border-slate-800/90 rounded-xl p-4 flex flex-col items-center justify-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <Maximize2 className="size-3.5 text-sky-400" />
                  Dual-Axis Spirit Level Gauge
                </span>

                {/* SVG Inclinometer Bubble Display */}
                <div className="relative size-[180px] my-1 flex items-center justify-center">
                  <svg
                    width="180"
                    height="180"
                    viewBox="0 0 180 180"
                    aria-label="Spirit level inclinometer gauge"
                    className="overflow-visible select-none"
                  >
                    {/* Outer Gauge Frame */}
                    <circle cx="90" cy="90" r={gaugeRadius} fill="#0f172a" stroke="#334155" strokeWidth="2" />

                    {/* Critical Zone Outer Ring (>20°) */}
                    <circle cx="90" cy="90" r="70" fill="none" stroke="#e11d48" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />

                    {/* Warning Zone Middle Ring (10°-20°) */}
                    <circle cx="90" cy="90" r="48" fill="none" stroke="#d97706" strokeWidth="1" strokeDasharray="4 2" opacity="0.5" />

                    {/* Target Bullseye Center Ring (<=10°) */}
                    <circle cx="90" cy="90" r="26" fill="#064e3b" fillOpacity="0.25" stroke="#10b981" strokeWidth="1.5" />

                    {/* Crosshair Grids */}
                    <line x1="90" y1="10" x2="90" y2="170" stroke="#475569" strokeWidth="1" strokeDasharray="2 2" />
                    <line x1="10" y1="90" x2="170" y2="90" stroke="#475569" strokeWidth="1" strokeDasharray="2 2" />

                    {/* Pitch & Yaw Degree Markings */}
                    <text x="90" y="24" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">-20° (Up)</text>
                    <text x="90" y="162" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">+20° (Down)</text>
                    <text x="24" y="93" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">-20°</text>
                    <text x="156" y="93" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">+20°</text>

                    {/* Spirit Level Bubble */}
                    <circle
                      cx={bubblePixelX}
                      cy={bubblePixelY}
                      r="12"
                      fill={
                        computedParams.warningLevel === "nominal"
                          ? "#34d399"
                          : computedParams.warningLevel === "warning"
                            ? "#fbbf24"
                            : "#f43f5e"
                      }
                      fillOpacity="0.85"
                      stroke="#ffffff"
                      strokeWidth="2"
                      className="transition-all duration-200"
                    />
                    <circle cx={bubblePixelX} cy={bubblePixelY} r="4" fill="#ffffff" fillOpacity="0.75" />
                  </svg>
                </div>

                <div className="mt-2 text-center">
                  <span className="text-[11px] text-slate-400 font-mono">
                    Target: Green Bullseye (≤10° Orthogonal)
                  </span>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className="text-xs font-semibold text-slate-200">
                      Pitch: {computedParams.pitchDeg >= 0 ? `+${computedParams.pitchDeg.toFixed(1)}°` : `${computedParams.pitchDeg.toFixed(1)}°`}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs font-semibold text-slate-200">
                      Dev: {computedParams.obliqueDeviationDeg.toFixed(1)}°
                    </span>
                  </div>
                </div>
              </div>

              {/* Real-time Optical Telemetry & Anthropometrics */}
              <div className="md:col-span-7 flex flex-col gap-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Pitch Elevation</span>
                    <p className="text-sm font-mono font-bold text-slate-100 mt-0.5">
                      {computedParams.pitchDeg >= 0 ? `+${computedParams.pitchDeg.toFixed(1)}°` : `${computedParams.pitchDeg.toFixed(1)}°`}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {computedParams.pitchDeg > 2 ? "Tilted Down" : computedParams.pitchDeg < -2 ? "Tilted Up" : "Level"}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Yaw Azimuth</span>
                    <p className="text-sm font-mono font-bold text-slate-100 mt-0.5">
                      {computedParams.yawDeg.toFixed(1)}°
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {targetView === "sagittal" ? "Sagittal (90° target)" : "Frontal (0° target)"}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Roll Tilt</span>
                    <p className="text-sm font-mono font-bold text-slate-100 mt-0.5">
                      {computedParams.rollDeg.toFixed(1)}°
                    </p>
                    <span className="text-[10px] text-slate-400">Horizon Level</span>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Subject Distance</span>
                    <p className="text-sm font-mono font-bold text-sky-400 mt-0.5">
                      {computedParams.distanceMeters.toFixed(2)} m
                    </p>
                    <span className="text-[10px] text-slate-400">Optical Center</span>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Camera Height</span>
                    <p className="text-sm font-mono font-bold text-sky-400 mt-0.5">
                      {computedParams.cameraHeightMeters.toFixed(2)} m
                    </p>
                    <span className="text-[10px] text-slate-400">Above Floor</span>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Foreshortening</span>
                    <p className="text-sm font-mono font-bold text-slate-100 mt-0.5">
                      {computedParams.foreshorteningFactor.toFixed(3)}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {((1 - computedParams.foreshorteningFactor) * 100).toFixed(1)}% compression
                    </span>
                  </div>
                </div>

                {/* Anthropometric Diagnostic Card */}
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 text-xs text-slate-300">
                  <div className="flex items-center justify-between font-semibold text-slate-200 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Info className="size-3.5 text-sky-400" />
                      Anthropometric Segment Diagnostic (Winter 2009 / Dempster 1955)
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Conf: {Math.round(computedParams.confidence * 100)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400">Thigh : Shank Ratio: </span>
                      <span className="font-mono font-semibold text-slate-200">
                        {computedParams.anthropometrics.thighShankRatio.toFixed(2)}
                      </span>
                      <span className="text-slate-500"> (Norm: 1.05)</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Torso : Leg Ratio: </span>
                      <span className="font-mono font-semibold text-slate-200">
                        {computedParams.anthropometrics.torsoLegRatio.toFixed(2)}
                      </span>
                      <span className="text-slate-500"> (Norm: 0.59)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actionable Physical Alignment Guidance */}
            <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center gap-1.5">
                <Sliders className="size-3.5 text-sky-400" />
                Actionable Physical Alignment Guidance
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {computedParams.guidance.guidanceText.map((guide, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-200"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    <span className="leading-snug">{guide}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Perspective Correction Toggle & Calibration Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enable-perspective-rectification"
                  checked={correctionActive}
                  onChange={(e) => handleToggle(e.target.checked)}
                  className="size-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-400 cursor-pointer"
                  data-testid="toggle-perspective-rectification"
                />
                <label
                  htmlFor="enable-perspective-rectification"
                  className="text-xs cursor-pointer select-none"
                >
                  <span className="font-semibold text-slate-200 block">
                    Enable Real-Time Perspective & Homography Rectification
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    Transforms joint angles using 3D rotation matrix R_rect = R_z(-γ) R_x(-φ) R_y(-δ).
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetCalibration}
                  className="text-xs gap-1 border-slate-700 hover:bg-slate-800"
                  data-testid="reset-calibration-btn"
                >
                  <RefreshCw className="size-3 text-slate-400" />
                  Reset
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleClose}
                  className="text-xs bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold gap-1"
                  data-testid="apply-calibration-btn"
                >
                  <Check className="size-3.5" />
                  Apply & Close
                </Button>
              </div>
            </div>

            {/* View Mode & Patient Height Configuration Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <span>Target Plane:</span>
                <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                  <button
                    type="button"
                    onClick={() => handleTargetViewChange("sagittal")}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                      targetView === "sagittal"
                        ? "bg-sky-500 text-slate-950 font-semibold"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Sagittal (90°)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTargetViewChange("frontal")}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                      targetView === "frontal"
                        ? "bg-sky-500 text-slate-950 font-semibold"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Frontal (0°)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span>Subject Height:</span>
                <input
                  type="number"
                  min="1.0"
                  max="2.3"
                  step="0.01"
                  value={subjectHeightM}
                  onChange={(e) => handleHeightChange(parseFloat(e.target.value) || DEFAULT_SUBJECT_HEIGHT_M)}
                  className="w-16 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-sky-500"
                />
                <span>m</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

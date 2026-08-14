"use client";

import React, { useState } from "react";
import type { CameraPerspectiveParams } from "@/lib/gait/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  Compass,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  Play,
  Pause,
  StepForward,
  StepBack,
  Eye,
  Sliders,
} from "lucide-react";

export interface ViewportHUDProps {
  fps?: number;
  confidence?: number;
  pitchDeg?: number;
  rollDeg?: number;
  currentPhase?: any;
  currentCyclePct?: number;
  cameraPerspective?: CameraPerspectiveParams;
  isCollapsible?: boolean;
  defaultExpanded?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  showSkeleton?: boolean;
  onToggleSkeleton?: (show: boolean) => void;
  showJointArcs?: boolean;
  onToggleJointArcs?: (show: boolean) => void;
  showSwayVector?: boolean;
  onToggleSwayVector?: (show: boolean) => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onStepFrame?: (delta: number) => void;
  currentFrameIndex?: number;
  totalFrames?: number;
  className?: string;
}

export function ViewportHUD({
  fps = 30,
  confidence = 0.95,
  pitchDeg: propPitch,
  rollDeg: propRoll,
  currentPhase,
  currentCyclePct,
  cameraPerspective,
  isCollapsible = false,
  defaultExpanded,
  isExpanded: controlledExpanded,
  onToggleExpand,
  showSkeleton = true,
  onToggleSkeleton,
  showJointArcs = true,
  onToggleJointArcs,
  showSwayVector = false,
  onToggleSwayVector,
  isPlaying,
  onTogglePlay,
  onStepFrame,
  currentFrameIndex,
  totalFrames,
  className,
}: ViewportHUDProps) {
  const initialExpanded = defaultExpanded !== undefined ? defaultExpanded : !isCollapsible;
  const [internalExpanded, setInternalExpanded] = useState(initialExpanded);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const handleMouseEnter = () => {
    if (isCollapsible && controlledExpanded === undefined) {
      setInternalExpanded(true);
    }
  };

  const handleMouseLeave = () => {
    if (isCollapsible && controlledExpanded === undefined) {
      setInternalExpanded(false);
    }
  };

  const pitch = propPitch ?? cameraPerspective?.pitchDeg ?? 0;
  const roll = propRoll ?? cameraPerspective?.rollDeg ?? 0;
  const confPct = Math.round((confidence <= 1 ? confidence * 100 : confidence) || 0);

  const phaseName =
    typeof currentPhase === "string"
      ? currentPhase
      : currentPhase?.name || currentPhase?.phase || "Initial Contact";

  const isLowConfidence = confidence < 0.5;
  const isHighTilt = Math.abs(pitch) > 5.0 || Math.abs(roll) > 5.0;

  return (
    <div
      data-testid="viewport-hud-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "z-20 transition-all duration-200 pointer-events-auto",
        className
      )}
    >
      {/* HUD Header Bar / Status Pill */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700/80 shadow-md text-xs text-white">
        {/* Core Status Summary */}
        <div className="flex items-center gap-2 px-2">
          {/* FPS Badge */}
          <span className="font-mono font-semibold text-sky-400">
            {fps} FPS
          </span>

          <span className="text-slate-600">·</span>

          {/* Confidence Badge */}
          <span
            className={cn(
              "font-mono font-medium",
              isLowConfidence ? "text-amber-400" : "text-emerald-400"
            )}
          >
            {confPct}% {isLowConfidence ? "Low Confidence" : "Confidence"}
          </span>

          {/* Active Phase Pill */}
          {phaseName && (!isCollapsible || isExpanded) && (
            <>
              <span className="text-slate-600">·</span>
              <Badge tone="primary" className="text-[10px] font-mono py-0 px-2">
                {phaseName}
              </Badge>
            </>
          )}

          {isHighTilt && !isExpanded && (
            <Badge tone="danger" className="text-[10px] py-0 px-1.5 font-mono">
              Tilt Warning ({pitch.toFixed(1)}°)
            </Badge>
          )}
        </div>

        {/* Expand / Collapse Button if collapsible */}
        {isCollapsible && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Toggle HUD"
            aria-expanded={isExpanded}
            onClick={handleToggle}
            className="size-6 p-0 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 ml-auto"
          >
            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
        )}
      </div>

      {/* Expanded HUD Telemetry Drawer */}
      {isExpanded && (
        <div className="mt-1.5 p-3 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-xl text-xs text-slate-200 space-y-2.5">
          {/* Spirit Level & Camera Tilt */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-700/60">
            <div className="flex items-center gap-2">
              <Compass className="size-4 text-purple-400" />
              <span className="font-medium text-slate-300">Camera Spirit Level</span>
            </div>

            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className={cn(Math.abs(pitch) > 5 ? "text-amber-400 font-bold" : "text-slate-300")}>
                Pitch: {pitch.toFixed(1)}°
              </span>
              <span className={cn(Math.abs(roll) > 5 ? "text-amber-400 font-bold" : "text-slate-300")}>
                Roll: {roll.toFixed(1)}°
              </span>
            </div>
          </div>

          {/* Detailed Alert Banner if Misaligned */}
          {isHighTilt && (
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-2">
              <AlertTriangle className="size-3.5 text-amber-400 shrink-0" />
              <span>
                Optical angle exceeds 5° threshold. Camera alignment alert.
              </span>
            </div>
          )}

          {/* Quick Overlays Toggle Controls */}
          {(onToggleSkeleton || onToggleJointArcs || onToggleSwayVector) && (
            <div className="flex items-center gap-4 text-[11px] text-slate-300 pt-1">
              {onToggleSkeleton && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSkeleton}
                    onChange={(e) => onToggleSkeleton(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800 accent-sky-500"
                  />
                  <span>Skeleton</span>
                </label>
              )}

              {onToggleJointArcs && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showJointArcs}
                    onChange={(e) => onToggleJointArcs(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800 accent-sky-500"
                  />
                  <span>Joint Arcs</span>
                </label>
              )}

              {onToggleSwayVector && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSwayVector}
                    onChange={(e) => onToggleSwayVector(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800 accent-sky-500"
                  />
                  <span>Sway Vector</span>
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { Play, Pause, SkipBack, SkipForward, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PERRY_GAIT_PHASES, type FramePhaseInfo } from "@/lib/gait/phases";

export interface GaitTimelineScrubberProps {
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onFrameChange: (frame: number) => void;
  onStepBack: () => void;
  onStepForward: () => void;
  fps?: number;
  phaseTimeline?: FramePhaseInfo[];
  className?: string;
}

export function GaitTimelineScrubber({
  currentFrame,
  totalFrames,
  isPlaying,
  onPlayToggle,
  onFrameChange,
  onStepBack,
  onStepForward,
  fps = 30,
  phaseTimeline,
  className = "",
}: GaitTimelineScrubberProps) {
  const currentTimeSec = totalFrames > 0 ? (currentFrame / fps).toFixed(2) : "0.00";
  const totalTimeSec = totalFrames > 0 ? (totalFrames / fps).toFixed(2) : "0.00";

  const currentPhase = useMemo(() => {
    if (!phaseTimeline || phaseTimeline.length <= currentFrame) return null;
    return phaseTimeline[currentFrame];
  }, [phaseTimeline, currentFrame]);

  return (
    <div className={`flex flex-col gap-2 p-3 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-800 shadow-xl ${className}`}>
      {/* Top Bar: Controls + Current Phase & Time */}
      <div className="flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 rounded-full border-slate-700 bg-slate-800 hover:bg-slate-700 p-0"
            onClick={onStepBack}
            title="Step 1 frame backward"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-8 w-8 rounded-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold p-0"
            onClick={onPlayToggle}
            title={isPlaying ? "Pause video" : "Play video"}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 rounded-full border-slate-700 bg-slate-800 hover:bg-slate-700 p-0"
            onClick={onStepForward}
            title="Step 1 frame forward"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </Button>

          <div className="flex items-center gap-1.5 ml-2 font-mono text-slate-400">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>
              {currentTimeSec}s / {totalTimeSec}s
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              F: {currentFrame} / {Math.max(0, totalFrames - 1)}
            </span>
          </div>
        </div>

        {/* Active Gait Cycle Phases */}
        <div className="flex items-center gap-2">
          {currentPhase?.leftPhase && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-950/80 border border-sky-600/40 text-sky-300">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span className="font-semibold text-[11px]">L: {currentPhase.leftPhase.name}</span>
              {currentPhase.leftCyclePct !== undefined && (
                <span className="font-mono text-[10px] text-sky-400">({currentPhase.leftCyclePct.toFixed(0)}%)</span>
              )}
            </div>
          )}
          {currentPhase?.rightPhase && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-600/40 text-rose-300">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="font-semibold text-[11px]">R: {currentPhase.rightPhase.name}</span>
              {currentPhase.rightCyclePct !== undefined && (
                <span className="font-mono text-[10px] text-rose-400">({currentPhase.rightCyclePct.toFixed(0)}%)</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Perry 8-Phase Color-Coded Timeline Ribbon */}
      <div className="relative w-full h-2 rounded-full bg-slate-800 overflow-hidden flex">
        {PERRY_GAIT_PHASES.map((p) => (
          <div
            key={p.id}
            style={{
              width: `${p.endPct - p.startPct}%`,
              backgroundColor: p.color,
              opacity: 0.8,
            }}
            title={`${p.name} (${p.startPct}% - ${p.endPct}%)`}
          />
        ))}
      </div>

      {/* Scrubber Input Range */}
      <input
        type="range"
        min={0}
        max={Math.max(1, totalFrames - 1)}
        step={1}
        value={currentFrame}
        onChange={(e) => onFrameChange(Number(e.target.value))}
        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none"
      />
    </div>
  );
}

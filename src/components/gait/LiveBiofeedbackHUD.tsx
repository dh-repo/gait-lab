"use client";

import { useEffect, useState, useRef } from "react";
import { Volume2, VolumeX, Activity, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GaitMetronome } from "@/lib/gait/metronome";

export interface LiveBiofeedbackHUDProps {
  currentCadence?: number;
  targetCadence?: number;
  stanceBalanceLeft?: number; // 0..100 (%)
  stanceBalanceRight?: number; // 0..100 (%)
  asymmetryAngle?: number; // deg
  comSwayDistance?: number; // m
  className?: string;
}

export function LiveBiofeedbackHUD({
  currentCadence = 108,
  targetCadence = 110,
  stanceBalanceLeft = 50,
  stanceBalanceRight = 50,
  comSwayDistance = 0.04,
  className = "",
}: LiveBiofeedbackHUDProps) {
  const [metronomeActive, setMetronomeActive] = useState(false);
  const [targetBpm, setTargetBpm] = useState(targetCadence);
  const [currentBeat, setCurrentBeat] = useState(0);
  const metronomeRef = useRef<GaitMetronome | null>(null);
  const lastAlertTimeRef = useRef<number>(0);

  useEffect(() => {
    const met = new GaitMetronome({ bpm: targetBpm, volume: 0.5 });
    met.onBeat((b) => setCurrentBeat(b));
    metronomeRef.current = met;

    return () => {
      met.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (metronomeRef.current) {
      metronomeRef.current.setBpm(targetBpm);
    }
  }, [targetBpm]);

  const toggleMetronome = () => {
    if (!metronomeRef.current) return;
    if (metronomeActive) {
      metronomeRef.current.stop();
      setMetronomeActive(false);
    } else {
      metronomeRef.current.start();
      setMetronomeActive(true);
    }
  };

  const isAsymmetric = Math.abs(stanceBalanceLeft - stanceBalanceRight) > 6.0;
  const isHighSway = comSwayDistance > 0.08;

  useEffect(() => {
    if (isAsymmetric && metronomeRef.current) {
      const now = Date.now();
      if (now - lastAlertTimeRef.current > 3000) {
        metronomeRef.current.playAsymmetryAlert();
        lastAlertTimeRef.current = now;
      }
    }
  }, [isAsymmetric]);

  return (
    <div className={`p-4 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-800 shadow-2xl flex flex-col gap-4 ${className}`}>
      {/* Top Header: Title & Metronome Control */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <h4 className="text-sm font-semibold text-slate-100">Live Clinical Biofeedback</h4>
        </div>
        <Button
          variant={metronomeActive ? "default" : "outline"}
          size="sm"
          className={`h-7 px-2.5 text-xs gap-1.5 ${
            metronomeActive ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold" : "border-slate-700"
          }`}
          onClick={toggleMetronome}
        >
          {metronomeActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span>{metronomeActive ? `Audio Pacing: ${targetBpm} SPM` : "Start Pacing Metronome"}</span>
        </Button>
      </div>

      {/* Rhythmic Visual Beat Flasher */}
      {metronomeActive && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full transition-all duration-100 ${
                currentBeat % 2 === 0
                  ? "bg-sky-400 shadow-[0_0_12px_#38bdf8] scale-125"
                  : "bg-slate-700"
              }`}
            />
            <span className="text-xs font-mono text-slate-300">Left Stride (880Hz)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-300">Right Stride (660Hz)</span>
            <span
              className={`w-3 h-3 rounded-full transition-all duration-100 ${
                currentBeat % 2 === 1
                  ? "bg-rose-500 shadow-[0_0_12px_#f43f5e] scale-125"
                  : "bg-slate-700"
              }`}
            />
          </div>
        </div>
      )}

      {/* Grid: Cadence Target vs Real-time Asymmetry Balance */}
      <div className="grid grid-cols-2 gap-3">
        {/* Cadence Telemetry */}
        <div className="flex flex-col gap-1 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span className="text-[11px] text-slate-400">Cadence Pacing (spm)</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">{currentCadence.toFixed(0)}</span>
            <span className="text-xs text-slate-400 font-mono">/ Target: {targetBpm}</span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <input
              type="range"
              min={60}
              max={160}
              value={targetBpm}
              onChange={(e) => setTargetBpm(Number(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
          </div>
        </div>

        {/* Real-time Asymmetry Balance Bar */}
        <div className="flex flex-col gap-1 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">L/R Stance Balance</span>
            <Badge tone={isAsymmetric ? "danger" : "neutral"} className="text-[10px] h-4 px-1">
              {isAsymmetric ? "Asymmetric" : "Balanced"}
            </Badge>
          </div>

          <div className="flex items-center justify-between text-xs font-mono font-semibold mt-1">
            <span className="text-sky-400">{stanceBalanceLeft.toFixed(0)}% L</span>
            <span className="text-rose-400">{stanceBalanceRight.toFixed(0)}% R</span>
          </div>

          {/* Visual balance bar */}
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden flex">
            <div style={{ width: `${stanceBalanceLeft}%` }} className="bg-sky-400" />
            <div style={{ width: `${stanceBalanceRight}%` }} className="bg-rose-500" />
          </div>
        </div>
      </div>

      {/* Stability & Sway Warning Alert */}
      {isHighSway && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs">
          <BellRing className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Elevated trunk lateral sway ({(comSwayDistance * 100).toFixed(1)} cm). Provide lateral stability support.</span>
        </div>
      )}
    </div>
  );
}

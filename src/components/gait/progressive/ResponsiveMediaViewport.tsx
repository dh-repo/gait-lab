import React, { useState } from "react";
import type {
  Landmark,
  TrackedPerson,
  CameraPerspectiveParams,
  ViewAngle,
} from "@/lib/gait/types";
import type { FramePhaseInfo } from "@/lib/gait/phases";
import { SkeletonCanvas } from "../SkeletonCanvas";
import { DigitalTwinCanvas } from "../DigitalTwinCanvas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ResponsiveMediaViewportProps {
  aspectRatio?: "16:9" | "9:16" | "auto" | string;
  orientation?: "portrait" | "landscape";
  hudOverlay?: React.ReactNode;
  children?: React.ReactNode;
  videoElement?: HTMLVideoElement | null;
  poses?: { id: number; landmarks: Landmark[] }[];
  allFrames?: Landmark[][];
  currentFrameIndex?: number;
  totalFrames?: number;
  effectiveFps?: number;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onSeekToTime?: (timeSec: number) => void;
  onStepFrame?: (delta: number) => void;
  selectedPersonId?: number | null;
  personColors?: Record<number, string>;
  people?: TrackedPerson[];
  onSelectPersonId?: (id: number) => void;
  cameraPerspective?: CameraPerspectiveParams;
  currentFrameInfo?: any;
  viewConfidence?: number;
  viewAngle?: ViewAngle;
  perspectiveCorrectionEnabled?: boolean;
  onTogglePerspectiveCorrection?: (enabled: boolean) => void;
  allowModeToggle?: boolean;
  className?: string;
}

export function ResponsiveMediaViewport({
  aspectRatio = "16:9",
  orientation,
  hudOverlay,
  children,
  videoElement,
  poses = [],
  allFrames,
  currentFrameIndex = 0,
  totalFrames = 100,
  effectiveFps = 30,
  isPlaying = false,
  onTogglePlay,
  onSeekToTime,
  onStepFrame,
  selectedPersonId,
  personColors = {},
  people,
  onSelectPersonId,
  cameraPerspective,
  currentFrameInfo,
  viewConfidence = 0.95,
  viewAngle,
  perspectiveCorrectionEnabled,
  onTogglePerspectiveCorrection,
  allowModeToggle = false,
  className,
}: ResponsiveMediaViewportProps) {
  const [viewportMode, setViewportMode] = useState<"2d" | "3d">("2d");
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showJointArcs, setShowJointArcs] = useState(true);
  const [showSwayVector, setShowSwayVector] = useState(true);

  // Determine aspect ratio class
  const aspectClass =
    aspectRatio === "9:16" || orientation === "portrait"
      ? "aspect-[9/16] max-h-[80vh]"
      : aspectRatio === "16:9" || orientation === "landscape"
        ? "aspect-video max-h-[70vh]"
        : "aspect-video";

  return (
    <Card
      data-testid="responsive-media-viewport"
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-slate-950 shadow-md flex items-center justify-center min-h-[300px]",
        aspectClass,
        className
      )}
    >
      {/* HUD Overlay Layer */}
      {hudOverlay && (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div className="pointer-events-auto">
            {hudOverlay}
          </div>
        </div>
      )}

      {/* 2D / 3D Mode Toggle Controls */}
      {allowModeToggle && (
        <div className="absolute top-4 right-4 z-30 flex items-center p-1 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-700 shadow-lg">
          <Button
            variant={viewportMode === "2d" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewportMode("2d")}
            className={cn(
              "text-xs h-7 px-2.5 rounded-lg",
              viewportMode === "2d"
                ? "bg-[var(--color-primary)] text-white shadow-sm font-semibold"
                : "text-slate-400 hover:text-white"
            )}
          >
            2D Video
          </Button>
          <Button
            variant={viewportMode === "3d" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewportMode("3d")}
            className={cn(
              "text-xs h-7 px-2.5 rounded-lg",
              viewportMode === "3d"
                ? "bg-[var(--color-primary)] text-white shadow-sm font-semibold"
                : "text-slate-400 hover:text-white"
            )}
          >
            3D Avatar
          </Button>
        </div>
      )}

      {/* Main Viewport Content Surface */}
      {children ? (
        children
      ) : viewportMode === "2d" ? (
        <div className="w-full h-full relative flex items-center justify-center">
          <SkeletonCanvas
            video={videoElement ?? null}
            poses={poses}
            selectedId={selectedPersonId ?? null}
            personColors={personColors}
            interactive={false}
            showSkeleton={showSkeleton}
            showJointArcs={showJointArcs}
            showSwayVector={showSwayVector}
            perspectiveParams={cameraPerspective ?? undefined}
            showSpiritLevel={false}
            showTiltWarning={false}
          />
        </div>
      ) : (
        <div className="w-full h-full relative flex items-center justify-center bg-slate-950">
          <DigitalTwinCanvas
            landmarks={poses[0]?.landmarks}
            allFrames={allFrames}
            currentFrameIndex={currentFrameIndex}
            isPlaying={isPlaying}
          />
        </div>
      )}
    </Card>
  );
}

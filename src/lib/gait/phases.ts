/**
 * Perry & Burnfield (2010) 8-Phase Gait Cycle Segmentation Engine
 *
 * Deconstructs the standard gait cycle into:
 * 1. Initial Contact (0% - 2%)
 * 2. Loading Response (2% - 12%)
 * 3. Mid Stance (12% - 31%)
 * 4. Terminal Stance (31% - 50%)
 * 5. Pre-Swing (50% - 60%)
 * 6. Initial Swing (60% - 73%)
 * 7. Mid Swing (73% - 87%)
 * 8. Terminal Swing (87% - 100%)
 */

export interface GaitEventsGroup {
  leftHeelStrikes?: number[];
  rightHeelStrikes?: number[];
  leftToeOffs?: number[];
  rightToeOffs?: number[];
}

export type GaitPhaseName =
  | "initial_contact"
  | "loading_response"
  | "mid_stance"
  | "terminal_stance"
  | "pre_swing"
  | "initial_swing"
  | "mid_swing"
  | "terminal_swing";

export interface GaitPhaseDefinition {
  id: GaitPhaseName;
  name: string;
  startPct: number;
  endPct: number;
  period: "stance" | "swing";
  description: string;
  color: string;
}

export const PERRY_GAIT_PHASES: GaitPhaseDefinition[] = [
  {
    id: "initial_contact",
    name: "Initial Contact",
    startPct: 0,
    endPct: 2,
    period: "stance",
    description: "Moment foot touches the ground; initiates heel rocker.",
    color: "#3b82f6", // blue-500
  },
  {
    id: "loading_response",
    name: "Loading Response",
    startPct: 2,
    endPct: 12,
    period: "stance",
    description: "Initial double support; shock absorption & forward momentum deceleration.",
    color: "#0ea5e9", // sky-500
  },
  {
    id: "mid_stance",
    name: "Mid Stance",
    startPct: 12,
    endPct: 31,
    period: "stance",
    description: "Single-limb support; body progresses forward over stationary foot (ankle rocker).",
    color: "#10b981", // emerald-500
  },
  {
    id: "terminal_stance",
    name: "Terminal Stance",
    startPct: 31,
    endPct: 50,
    period: "stance",
    description: "Heel rise to contralateral initial contact (forefoot rocker).",
    color: "#84cc16", // lime-500
  },
  {
    id: "pre_swing",
    name: "Pre-Swing",
    startPct: 50,
    endPct: 60,
    period: "stance",
    description: "Terminal double support; rapid unloading and preparation for swing.",
    color: "#eab308", // yellow-500
  },
  {
    id: "initial_swing",
    name: "Initial Swing",
    startPct: 60,
    endPct: 73,
    period: "swing",
    description: "Foot lift-off to maximum knee flexion; limb acceleration.",
    color: "#f97316", // orange-500
  },
  {
    id: "mid_swing",
    name: "Mid Swing",
    startPct: 73,
    endPct: 87,
    period: "swing",
    description: "Maximum knee flexion to vertical tibia; foot clearance.",
    color: "#a855f7", // purple-500
  },
  {
    id: "terminal_swing",
    name: "Terminal Swing",
    startPct: 87,
    endPct: 100,
    period: "swing",
    description: "Tibia vertical to foot contact; limb deceleration for heel strike.",
    color: "#ec4899", // pink-500
  },
];

export interface StridePhaseSegment {
  strideIndex: number;
  side: "left" | "right";
  startFrame: number;
  endFrame: number;
  phases: {
    phase: GaitPhaseDefinition;
    startFrame: number;
    endFrame: number;
  }[];
}

export interface FramePhaseInfo {
  frameIndex: number;
  leftPhase?: GaitPhaseDefinition;
  leftCyclePct?: number;
  rightPhase?: GaitPhaseDefinition;
  rightCyclePct?: number;
}

/**
 * Maps a continuous cycle percentage [0, 100) to its corresponding Perry phase.
 */
export function getPhaseByPercentage(pct: number): GaitPhaseDefinition {
  const normalizedPct = Math.max(0, Math.min(99.999, pct));
  for (const phase of PERRY_GAIT_PHASES) {
    if (normalizedPct >= phase.startPct && normalizedPct < phase.endPct) {
      return phase;
    }
  }
  return PERRY_GAIT_PHASES[PERRY_GAIT_PHASES.length - 1];
}

/**
 * Segments gait events into full per-frame phase timelines for left and right limbs.
 */
export function segmentGaitPhases(
  events: GaitEventsGroup,
  totalFrames: number
): {
  leftStrides: StridePhaseSegment[];
  rightStrides: StridePhaseSegment[];
  frameTimeline: FramePhaseInfo[];
} {
  const leftStrides: StridePhaseSegment[] = [];
  const rightStrides: StridePhaseSegment[] = [];

  // Helper to build stride segments from consecutive heel strikes
  function processStrikes(strikes: number[], side: "left" | "right"): StridePhaseSegment[] {
    const segments: StridePhaseSegment[] = [];
    if (strikes.length < 2) return segments;

    for (let i = 0; i < strikes.length - 1; i++) {
      const start = strikes[i];
      const end = strikes[i + 1];
      const duration = end - start;
      if (duration <= 0) continue;

      const phases = PERRY_GAIT_PHASES.map((p) => {
        const pStart = Math.round(start + (p.startPct / 100) * duration);
        const pEnd = Math.round(start + (p.endPct / 100) * duration);
        return {
          phase: p,
          startFrame: pStart,
          endFrame: Math.max(pStart, Math.min(end, pEnd)),
        };
      });

      segments.push({
        strideIndex: i,
        side,
        startFrame: start,
        endFrame: end,
        phases,
      });
    }
    return segments;
  }

  const lSegments = processStrikes(events.leftHeelStrikes || [], "left");
  const rSegments = processStrikes(events.rightHeelStrikes || [], "right");
  leftStrides.push(...lSegments);
  rightStrides.push(...rSegments);

  // Build per-frame timeline
  const frameTimeline: FramePhaseInfo[] = [];
  for (let f = 0; f < totalFrames; f++) {
    let leftPhase: GaitPhaseDefinition | undefined;
    let leftCyclePct: number | undefined;
    let rightPhase: GaitPhaseDefinition | undefined;
    let rightCyclePct: number | undefined;

    // Find active left stride
    for (const stride of lSegments) {
      if (f >= stride.startFrame && f <= stride.endFrame) {
        const pct = ((f - stride.startFrame) / Math.max(1, stride.endFrame - stride.startFrame)) * 100;
        leftCyclePct = Math.min(100, Math.max(0, pct));
        leftPhase = getPhaseByPercentage(leftCyclePct);
        break;
      }
    }

    // Find active right stride
    for (const stride of rSegments) {
      if (f >= stride.startFrame && f <= stride.endFrame) {
        const pct = ((f - stride.startFrame) / Math.max(1, stride.endFrame - stride.startFrame)) * 100;
        rightCyclePct = Math.min(100, Math.max(0, pct));
        rightPhase = getPhaseByPercentage(rightCyclePct);
        break;
      }
    }

    frameTimeline.push({
      frameIndex: f,
      leftPhase,
      leftCyclePct,
      rightPhase,
      rightCyclePct,
    });
  }

  return {
    leftStrides,
    rightStrides,
    frameTimeline,
  };
}

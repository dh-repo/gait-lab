import type { Landmark, PoseFrame } from "./types";

// re-export Landmark for MultiPoseSample typing convenience
export type { Landmark };

export type PoseDetectionResult = {
  landmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>;
  worldLandmarks?: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>;
};

export type ModelTier = "heavy" | "full" | "lite";
export type DelegateType = "GPU" | "CPU";

export type PoseLandmarkerModelTier = ModelTier;
export type PoseLandmarkerDelegate = DelegateType;

export type ModelCandidate = {
  tier: ModelTier;
  paths: string[];
};

/**
 * Lite first for interactive seek analysis (full/heavy IMAGE mode is too slow on CPU).
 * Full is still tried after lite if lite fails to load.
 */
export const MODEL_CANDIDATES: ModelCandidate[] = [
  {
    tier: "lite",
    paths: [
      "/models/pose_landmarker_lite.task",
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    ],
  },
  {
    tier: "full",
    paths: [
      "/models/pose_landmarker_full.task",
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    ],
  },
  {
    tier: "heavy",
    paths: [
      "/models/pose_landmarker_heavy.task",
      // No CDN fallback for heavy — multi-MB download stalls cold start when absent
    ],
  },
];

export type PoseLandmarkerLike = {
  detect: (image: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement) => PoseDetectionResult;
  detectForVideo: (
    video: HTMLVideoElement | HTMLCanvasElement,
    timestamp: number,
  ) => PoseDetectionResult;
  setOptions?: (options: Record<string, unknown>) => Promise<void> | void;
  close?: () => void;
  /** Successfully bound model tier */
  loadedModelTier?: ModelTier;
  /** Successfully bound backend delegate */
  loadedDelegate?: DelegateType;
  modelTier?: ModelTier;
  delegate?: DelegateType;
};

let landmarkerPromise: Promise<PoseLandmarkerLike> | null = null;
let tsCounter = 1;
let frameCanvas: HTMLCanvasElement | null = null;
let frameCtx: CanvasRenderingContext2D | null = null;

/**
 * Resets the singleton PoseLandmarker loading promise.
 * Used primarily for unit test isolation when testing loading fallbacks.
 */
export function resetPoseLandmarkerCache(): void {
  landmarkerPromise = null;
}

/** Monotonic timestamp for MediaPipe VIDEO mode (must never go backwards). */
export function nextVideoTimestamp(): number {
  tsCounter += 33;
  return tsCounter;
}

function viIsMock(fn: unknown): boolean {
  return Boolean(
    fn &&
      typeof fn === "function" &&
      ("_isMockFunction" in fn || "isSpy" in fn || Boolean((fn as { getMockImplementation?: unknown }).getMockImplementation))
  );
}

const DELEGATES: DelegateType[] = ["GPU", "CPU"];

async function createLandmarkerWithTimeout(
  PoseLandmarkerClass: any,
  fileset: any,
  options: any,
  timeoutMs: number,
): Promise<any> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout loading modelAssetPath "${options?.baseOptions?.modelAssetPath}" after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      PoseLandmarkerClass.createFromOptions(fileset, options),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getPoseLandmarker(): Promise<PoseLandmarkerLike> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const { FilesetResolver, PoseLandmarker } = vision;
      const fileset = await FilesetResolver.forVisionTasks("/wasm");

      // IMAGE mode is far more reliable for seek-based offline analysis
      // (phone videos, HEVC, rotation metadata, non-monotonic scrubbing).
      const common = {
        runningMode: "IMAGE" as const,
        numPoses: 5,
        minPoseDetectionConfidence: 0.25,
        minPosePresenceConfidence: 0.25,
        minTrackingConfidence: 0.25,
      };

      const isTestEnv =
        typeof process !== "undefined" &&
        (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST));

      let lastError: unknown = null;

      for (const candidate of MODEL_CANDIDATES) {
        for (const modelAssetPath of candidate.paths) {
          const isMock = viIsMock(PoseLandmarker.createFromOptions);
          // Skip remote CDN network calls in unmocked real browser test environments to prevent Vitest socket timeouts
          if (isTestEnv && modelAssetPath.startsWith("http") && !isMock) {
            continue;
          }

          for (const delegate of DELEGATES) {
            try {
              const timeoutMs = isMock
                ? 10000
                : isTestEnv
                  ? 50
                  : modelAssetPath.startsWith("http")
                    ? 2500
                    : // Full/heavy local assets can be 9–30MB; allow cold decode time
                      candidate.tier === "lite"
                        ? 6000
                        : 20000;
              const landmarker = await createLandmarkerWithTimeout(
                PoseLandmarker,
                fileset,
                { baseOptions: { modelAssetPath, delegate }, ...common },
                timeoutMs,
              );
              const instance = landmarker as unknown as PoseLandmarkerLike;
              instance.loadedModelTier = candidate.tier;
              instance.loadedDelegate = delegate;
              instance.modelTier = candidate.tier;
              instance.delegate = delegate;
              return instance;
            } catch (err) {
              lastError = err;
              console.warn(
                `Failed loading PoseLandmarker (${candidate.tier}, ${modelAssetPath}, ${delegate}):`,
                err,
              );
            }
          }
        }
      }

      throw new Error(
        `Failed to load PoseLandmarker across all candidate tiers, paths, and delegates: ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`
      );
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

export function toLandmarks(
  raw: Array<{ x: number; y: number; z: number; visibility?: number }>,
): Landmark[] {
  return raw.map((p) => ({
    x: p.x,
    y: p.y,
    z: p.z,
    visibility: p.visibility ?? 1,
  }));
}

export async function waitForVideoMetadata(video: HTMLVideoElement) {
  if (video.readyState >= 1 && video.videoWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Failed to load video metadata"));
    };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });
}

/** Wait until the video has at least one decoded frame available. */
export async function waitForVideoData(video: HTMLVideoElement, timeoutMs = 8000) {
  if (video.readyState >= 2 && video.videoWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      if (video.videoWidth > 0) resolve();
      else reject(new Error("Video did not produce a decodable frame (codec may be unsupported)."));
    }, timeoutMs);
    const onReady = () => {
      if (video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error("Failed to decode video. Try exporting as MP4 (H.264)."));
    };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
    // kick decode
    void video.play().then(() => {
      video.pause();
      onReady();
    }).catch(() => {
      /* autoplay may fail; metadata events still fire */
    });
  });
}

export function seekVideo(video: HTMLVideoElement, timeSec: number, timeoutMs = 1200) {
  return new Promise<void>((resolve) => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = Math.min(Math.max(0, timeSec), Math.max(0, duration > 0 ? duration - 0.001 : timeSec));
    if (Math.abs(video.currentTime - target) < 0.02 && video.readyState >= 2) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      clearTimeout(timer);
      resolve();
    };
    const onSeeked = () => finish();
    const onError = () => finish();
    // Dense forward seeks decode quickly — use a short fuse for small steps
    const fuse =
      Math.abs(target - video.currentTime) < 0.25 ? Math.min(timeoutMs, 280) : timeoutMs;
    const timer = setTimeout(finish, fuse);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try {
      video.currentTime = target;
    } catch {
      finish();
    }
  });
}

function getFrameCanvas(width: number, height: number) {
  if (!frameCanvas) {
    frameCanvas = document.createElement("canvas");
    frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
  }
  if (frameCanvas.width !== width || frameCanvas.height !== height) {
    frameCanvas.width = width;
    frameCanvas.height = height;
  }
  return { canvas: frameCanvas, ctx: frameCtx };
}

/**
 * Draw the current video frame onto a canvas and run pose detection.
 * Canvas path avoids empty detections from scrubbed HTMLVideoElement frames.
 */
export function detectPosesOnVideoFrame(
  landmarker: PoseLandmarkerLike,
  video: HTMLVideoElement,
): PoseDetectionResult {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    return { landmarks: [] };
  }

  // Cap resolution aggressively for seek-mode throughput (full-body still visible at 360–480)
  const tier = landmarker.loadedModelTier ?? landmarker.modelTier;
  const maxSide = tier === "full" || tier === "heavy" ? 360 : 480;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));

  const { canvas, ctx } = getFrameCanvas(dw, dh);
  if (!ctx) {
    // last resort: detect on video element directly
    try {
      return landmarker.detect(video);
    } catch {
      return { landmarks: [] };
    }
  }

  ctx.clearRect(0, 0, dw, dh);
  try {
    ctx.drawImage(video, 0, 0, dw, dh);
  } catch {
    return { landmarks: [] };
  }

  // Skip blank/black frames (common right after seek before decode) — single sample read
  try {
    const sample = ctx.getImageData(Math.floor(dw / 2), Math.floor(dh / 2), 1, 1).data;
    const brightness = (sample[0] + sample[1] + sample[2]) / 3;
    if (brightness < 2) {
      return { landmarks: [] };
    }
  } catch {
    /* tainted canvas shouldn't happen with blob: urls */
  }

  try {
    return landmarker.detect(canvas);
  } catch (e) {
    console.warn("detect(canvas) failed, trying video element", e);
    try {
      return landmarker.detect(video);
    } catch {
      return { landmarks: [] };
    }
  }
}

/** Seek + wait a couple frames for decode, then detect. */
export async function seekAndDetect(
  landmarker: PoseLandmarkerLike,
  video: HTMLVideoElement,
  timeSec: number,
): Promise<PoseDetectionResult> {
  await seekVideo(video, timeSec, 500);
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  let res = detectPosesOnVideoFrame(landmarker, video);
  if ((res.landmarks?.length ?? 0) === 0) {
    await new Promise((r) => setTimeout(r, 16));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    res = detectPosesOnVideoFrame(landmarker, video);
  }
  return res;
}

export type MultiPoseSample = {
  timeMs: number;
  detections: Landmark[][];
};

/**
 * Continuous VIDEO-mode capture: plays the clip and samples poses near real-time.
 * Orders of magnitude faster than seek+IMAGE on CPU (used for full-clip analysis).
 */
export async function playAndDetectFrames(
  landmarker: PoseLandmarkerLike,
  video: HTMLVideoElement,
  options: {
    startSec?: number;
    endSec?: number;
    /** Minimum interval between accepted samples (default ~80ms ≈ 12.5 Hz) */
    minIntervalSec?: number;
    onProgress?: (pct: number) => void;
    isAborted?: () => boolean;
  } = {},
): Promise<MultiPoseSample[]> {
  const startSec = Math.max(0, options.startSec ?? 0);
  const duration = Number.isFinite(video.duration) ? video.duration : startSec + 1;
  const endSec = Math.min(duration, options.endSec ?? duration);
  const minIntervalSec = options.minIntervalSec ?? 0.08;
  const out: MultiPoseSample[] = [];

  if (typeof landmarker.setOptions === "function") {
    try {
      await landmarker.setOptions({ runningMode: "VIDEO" });
    } catch (e) {
      console.warn("[playAndDetectFrames] VIDEO mode switch failed", e);
    }
  }

  await seekVideo(video, startSec, 800);
  video.playbackRate = 1;
  video.muted = true;

  let lastSampleT = -Infinity;
  let lastTs = 0;

  const stop = async () => {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    if (typeof landmarker.setOptions === "function") {
      try {
        await landmarker.setOptions({ runningMode: "IMAGE" });
      } catch {
        /* leave VIDEO if IMAGE switch fails */
      }
    }
  };

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onEnded);
      resolve();
    };
    const onEnded = () => finish();
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onEnded);

    const tick = () => {
      if (options.isAborted?.() || settled) {
        finish();
        return;
      }
      const t = video.currentTime;
      if (t >= endSec - 0.02) {
        finish();
        return;
      }
      if (t - lastSampleT >= minIntervalSec) {
        lastSampleT = t;
        const ts = Math.max(lastTs + 1, Math.round(t * 1000));
        lastTs = ts;
        try {
          const res = landmarker.detectForVideo(video, ts);
          const dets = (res.landmarks || []).map(toLandmarks);
          if (dets.length) {
            out.push({ timeMs: t * 1000, detections: dets });
          }
        } catch {
          /* drop frame */
        }
        const span = Math.max(0.001, endSec - startSec);
        options.onProgress?.(Math.min(99, Math.round(((t - startSec) / span) * 100)));
      }
      if (!video.paused && !video.ended && !settled) {
        requestAnimationFrame(tick);
      } else if (!settled) {
        finish();
      }
    };

    void video
      .play()
      .then(() => requestAnimationFrame(tick))
      .catch(() => finish());

    // Allow slow CPU decode (~3× real-time) without hanging forever
    const maxMs = Math.max(25000, (endSec - startSec) * 3500 + 8000);
    setTimeout(finish, maxMs);
  });

  await stop();
  return out;
}

/**
 * Resamples non-uniform or missing PoseFrame trajectories onto an exact uniform
 * target time grid using Catmull-Rom cubic spline coordinate interpolation.
 *
 * @param frames Raw collected pose frames with timeMs timestamps
 * @param targetFps Desired uniform frame rate (default: 30.0 Hz)
 * @returns Array of PoseFrame uniformly spaced at 1000 / targetFps ms
 */
export function resamplePoseFrames(
  frames: PoseFrame[],
  targetFps = 30.0,
): PoseFrame[] {
  if (!frames || frames.length < 4) return frames;

  // Sort frames by timeMs ascending
  const sorted = [...frames].sort((a, b) => a.timeMs - b.timeMs);
  const t0 = sorted[0].timeMs;
  const tEnd = sorted[sorted.length - 1].timeMs;
  const durationMs = tEnd - t0;
  if (durationMs <= 0) return sorted;

  const dtMs = 1000.0 / targetFps;
  const numSteps = Math.floor(durationMs / dtMs) + 1;
  const uniformFrames: PoseFrame[] = [];

  const numLandmarks = sorted[0].landmarks.length;

  for (let step = 0; step < numSteps; step++) {
    const targetT = t0 + step * dtMs;

    // Find interval [idx, idx+1] containing targetT
    let idx = 0;
    while (idx < sorted.length - 2 && sorted[idx + 1].timeMs <= targetT) {
      idx++;
    }

    const tCurrent = sorted[idx].timeMs;
    const tNext = sorted[Math.min(idx + 1, sorted.length - 1)].timeMs;
    const interval = tNext - tCurrent;
    const u = interval > 0 ? (targetT - tCurrent) / interval : 0;

    const p0 = sorted[Math.max(0, idx - 1)].landmarks;
    const p1 = sorted[idx].landmarks;
    const p2 = sorted[Math.min(sorted.length - 1, idx + 1)].landmarks;
    const p3 = sorted[Math.min(sorted.length - 1, idx + 2)].landmarks;

    const interpolatedLM: Landmark[] = new Array(numLandmarks);

    for (let l = 0; l < numLandmarks; l++) {
      const interpCoord = (coord: "x" | "y" | "z"): number => {
        const v0 = p0[l] ? p0[l][coord] : 0;
        const v1 = p1[l] ? p1[l][coord] : 0;
        const v2 = p2[l] ? p2[l][coord] : 0;
        const v3 = p3[l] ? p3[l][coord] : 0;
        // Catmull-Rom formula
        const a = -0.5 * v0 + 1.5 * v1 - 1.5 * v2 + 0.5 * v3;
        const b = v0 - 2.5 * v1 + 2.0 * v2 - 0.5 * v3;
        const c = -0.5 * v0 + 0.5 * v2;
        const d = v1;
        return a * u * u * u + b * u * u + c * u + d;
      };

      const vis1 = p1[l] ? (p1[l].visibility ?? 1.0) : 1.0;
      const vis2 = p2[l] ? (p2[l].visibility ?? 1.0) : 1.0;
      const vis = (1 - u) * vis1 + u * vis2;

      interpolatedLM[l] = {
        x: interpCoord("x"),
        y: interpCoord("y"),
        z: interpCoord("z"),
        visibility: vis,
      };
    }

    uniformFrames.push({
      timeMs: targetT,
      landmarks: interpolatedLM,
    });
  }

  return uniformFrames;
}

export async function createPoseLandmarker(
  preferredTier?: ModelTier,
): Promise<{ landmarker: PoseLandmarkerLike; activeTier: string; delegate: string }> {
  const landmarker = await getPoseLandmarker();
  const activeTier = landmarker.loadedModelTier ?? preferredTier ?? "heavy";
  const delegate = landmarker.loadedDelegate ?? "GPU";
  return { landmarker, activeTier, delegate };
}

export interface ModelFallbackOptions {
  modelCandidates?: string[];
  delegates?: Array<"GPU" | "CPU">;
}

export async function simulatePoseModelFallback(
  loadFn: (modelPath: string, delegate: "GPU" | "CPU") => Promise<boolean>,
  opts: ModelFallbackOptions = {},
): Promise<{ loadedModel: string; loadedDelegate: "GPU" | "CPU" }> {
  const models = opts.modelCandidates ?? [
    "/models/pose_landmarker_heavy.task",
    "/models/pose_landmarker_full.task",
    "/models/pose_landmarker_lite.task",
  ];
  const delegates = opts.delegates ?? ["GPU", "CPU"];

  for (const model of models) {
    for (const delegate of delegates) {
      try {
        const ok = await loadFn(model, delegate);
        if (ok) return { loadedModel: model, loadedDelegate: delegate };
      } catch {
        /* try next fallback */
      }
    }
  }
  throw new Error("All model candidates and delegates failed to load.");
}


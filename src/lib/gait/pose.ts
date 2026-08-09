import type { Landmark } from "./types";

export type PoseDetectionResult = {
  landmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>;
  worldLandmarks?: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>;
};

export type PoseLandmarkerLike = {
  detect: (image: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement) => PoseDetectionResult;
  detectForVideo: (
    video: HTMLVideoElement | HTMLCanvasElement,
    timestamp: number,
  ) => PoseDetectionResult;
  setOptions?: (options: Record<string, unknown>) => Promise<void> | void;
  close?: () => void;
};

let landmarkerPromise: Promise<PoseLandmarkerLike> | null = null;
let tsCounter = 1;
let frameCanvas: HTMLCanvasElement | null = null;
let frameCtx: CanvasRenderingContext2D | null = null;

/** Monotonic timestamp for MediaPipe VIDEO mode (must never go backwards). */
export function nextVideoTimestamp(): number {
  tsCounter += 33;
  return tsCounter;
}

export async function getPoseLandmarker(): Promise<PoseLandmarkerLike> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const { FilesetResolver, PoseLandmarker } = vision;
      const fileset = await FilesetResolver.forVisionTasks("/wasm");
      const modelAssetPath = "/models/pose_landmarker_lite.task";

      // IMAGE mode is far more reliable for seek-based offline analysis
      // (phone videos, HEVC, rotation metadata, non-monotonic scrubbing).
      const common = {
        runningMode: "IMAGE" as const,
        numPoses: 5,
        minPoseDetectionConfidence: 0.25,
        minPosePresenceConfidence: 0.25,
        minTrackingConfidence: 0.25,
      };

      try {
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate: "GPU" },
          ...common,
        });
        return landmarker as unknown as PoseLandmarkerLike;
      } catch {
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate: "CPU" },
          ...common,
        });
        return landmarker as unknown as PoseLandmarkerLike;
      }
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
    if (Math.abs(video.currentTime - target) < 0.03 && video.readyState >= 2) {
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
    const timer = setTimeout(finish, timeoutMs);
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

  // Cap resolution for speed while keeping body detail
  const maxSide = 720;
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

  // Skip blank/black frames (common right after seek before decode)
  try {
    const sample = ctx.getImageData(Math.floor(dw / 2), Math.floor(dh / 2), 1, 1).data;
    const mid = ctx.getImageData(Math.floor(dw * 0.25), Math.floor(dh * 0.25), 1, 1).data;
    const brightness =
      (sample[0] + sample[1] + sample[2] + mid[0] + mid[1] + mid[2]) / 6;
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
  await seekVideo(video, timeSec, 800);
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  let res = detectPosesOnVideoFrame(landmarker, video);
  if ((res.landmarks?.length ?? 0) === 0) {
    await new Promise((r) => setTimeout(r, 25));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    res = detectPosesOnVideoFrame(landmarker, video);
  }
  return res;
}

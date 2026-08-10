import { getPoseLandmarker, toLandmarks, type PoseLandmarkerLike } from "./pose";
import type { Landmark, PoseFrame } from "./types";
import { boundingBox, hipCenter } from "./landmarks";

export interface WebcamOptions {
  deviceId?: string;
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
  targetFps?: number;
}

export type FrameCallback = (
  frame: PoseFrame | null,
  rawResult: unknown,
  fps: number,
) => void;

export type WebcamErrorCode =
  | "NOT_ALLOWED"
  | "NOT_FOUND"
  | "NOT_READABLE"
  | "OVERCONSTRAINED"
  | "SECURITY"
  | "ABORTED"
  | "UNKNOWN";

export class WebcamError extends Error {
  public code: WebcamErrorCode;
  public originalError?: unknown;

  constructor(message: string, code: WebcamErrorCode, originalError?: unknown) {
    super(message);
    this.name = "WebcamError";
    this.code = code;
    this.originalError = originalError;
  }
}

export function parseWebcamError(err: unknown): WebcamError {
  if (err instanceof WebcamError) return err;

  const errorName = (err as DOMException)?.name || (err as Error)?.name || "";
  const errorMessage = (err as Error)?.message || String(err);

  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return new WebcamError(
      "Camera access was denied. Please allow camera permissions in your browser settings.",
      "NOT_ALLOWED",
      err,
    );
  }
  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return new WebcamError(
      "No video input camera device detected on your device.",
      "NOT_FOUND",
      err,
    );
  }
  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return new WebcamError(
      "Camera is currently in use by another application or operating system process.",
      "NOT_READABLE",
      err,
    );
  }
  if (errorName === "OverconstrainedError") {
    return new WebcamError(
      "Camera resolution or framerate constraints are not supported by the requested device.",
      "OVERCONSTRAINED",
      err,
    );
  }
  if (errorName === "SecurityError") {
    return new WebcamError(
      "Webcam stream acquisition requires a secure HTTPS connection or localhost.",
      "SECURITY",
      err,
    );
  }

  return new WebcamError(errorMessage || "Failed to start webcam stream.", "UNKNOWN", err);
}

export class PoseTracker {
  private landmarker: PoseLandmarkerLike | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private isActive = false;

  private lastTimestampMs = -1;
  private lastProcessedTimeMs = 0;
  private targetIntervalMs: number;

  private rollingBuffer: PoseFrame[] = [];
  private maxBufferFrames: number;

  private frameCount = 0;
  private fpsStartTime = 0;
  private effectiveFps = 0;

  private sessionId = 0;
  private onFrameCallback: FrameCallback | null = null;
  private lastTargetHip: Landmark | null = null;

  constructor(targetFps = 30, maxBufferFrames = 900) {
    this.targetIntervalMs = 1000 / targetFps;
    this.maxBufferFrames = maxBufferFrames;
  }

  public setLandmarker(landmarker: PoseLandmarkerLike): void {
    this.landmarker = landmarker;
  }

  public async startWebcam(
    videoElement: HTMLVideoElement,
    options: WebcamOptions = {},
  ): Promise<MediaStream> {
    const currentSession = ++this.sessionId;

    // 1. Initialize or obtain MediaPipe PoseLandmarker
    if (!this.landmarker) {
      this.landmarker = await getPoseLandmarker();
    }

    // 2. Ensure VIDEO mode configuration for MediaPipe landmarker
    if (this.landmarker && typeof this.landmarker.setOptions === "function") {
      try {
        await this.landmarker.setOptions({ runningMode: "VIDEO" });
      } catch (err) {
        console.warn("[PoseTracker] setOptions({ runningMode: 'VIDEO' }) failed:", err);
      }
    }

    if (this.sessionId !== currentSession) {
      throw new WebcamError(
        "Webcam initialization aborted due to rapid state change.",
        "ABORTED",
      );
    }

    // 3. Construct constraints
    const requestedTargetFps = options.targetFps ?? 30;
    this.targetIntervalMs = 1000 / requestedTargetFps;

    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        facingMode: options.facingMode || "user",
        width: options.width ? { ideal: options.width } : { ideal: 1280 },
        height: options.height ? { ideal: options.height } : { ideal: 720 },
        frameRate: { ideal: requestedTargetFps, max: 60 },
      },
      audio: false,
    };

    let acquiredStream: MediaStream;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new DOMException("navigator.mediaDevices.getUserMedia unavailable", "NotFoundError");
      }
      acquiredStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const parsed = parseWebcamError(err);
      if (parsed.code === "OVERCONSTRAINED") {
        console.warn("[PoseTracker] OverconstrainedError, retrying basic video constraints.");
        try {
          acquiredStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } catch (fallbackErr) {
          throw parseWebcamError(fallbackErr);
        }
      } else {
        throw parsed;
      }
    }

    if (this.sessionId !== currentSession) {
      acquiredStream.getTracks().forEach((track) => track.stop());
      throw new WebcamError("Webcam stream acquisition aborted.", "ABORTED");
    }

    // 4. Teardown any prior active stream session
    this.stopWebcam();
    this.sessionId = currentSession;

    // 5. Bind stream to HTMLVideoElement
    this.stream = acquiredStream;
    this.videoElement = videoElement;
    this.videoElement.srcObject = acquiredStream;
    this.videoElement.setAttribute("playsinline", "true");
    this.videoElement.muted = true;

    try {
      await this.videoElement.play();
    } catch (err) {
      console.warn("[PoseTracker] videoElement.play() warning:", err);
    }

    // play() is the last suspension point: a stopWebcam() during it has already
    // torn down and bumped sessionId, so activating here would resurrect a
    // stopped tracker. Same guard as above.
    if (this.sessionId !== currentSession) {
      acquiredStream.getTracks().forEach((track) => track.stop());
      return acquiredStream;
    }

    // 6. Reset per-session state and start real-time animation loop.
    // The buffer must be dropped here (after the final abort guard, so an
    // aborted start never wipes a live session) — otherwise a Stop -> Start
    // sequence concatenates two recordings whose performance.now() timestamps
    // are separated by the dead interval, and the resampler interpolates
    // garbage across the join.
    this.clearBuffer();
    this.isActive = true;
    this.lastTimestampMs = -1;
    this.lastProcessedTimeMs = 0;
    this.frameCount = 0;
    this.fpsStartTime = typeof performance !== "undefined" ? performance.now() : Date.now();

    this.loop(this.fpsStartTime);

    return acquiredStream;
  }

  public stopWebcam(): void {
    this.sessionId++;
    this.isActive = false;

    if (this.animFrameId !== null) {
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(this.animFrameId);
      } else if (typeof clearTimeout !== "undefined") {
        clearTimeout(this.animFrameId);
      }
      this.animFrameId = null;
    }

    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => {
          track.stop();
        });
      } catch (err) {
        console.warn("[PoseTracker] Error stopping stream tracks:", err);
      }
      this.stream = null;
    }

    if (this.videoElement) {
      try {
        this.videoElement.pause();
        this.videoElement.srcObject = null;
      } catch (err) {
        console.warn("[PoseTracker] Error clearing video element:", err);
      }
      this.videoElement = null;
    }

    this.lastTimestampMs = -1;
  }

  public setCallback(callback: FrameCallback | null): void {
    this.onFrameCallback = callback;
  }

  public getRollingFrames(): PoseFrame[] {
    return [...this.rollingBuffer];
  }

  public clearBuffer(): void {
    this.rollingBuffer = [];
    this.lastTargetHip = null;
  }

  public getEffectiveFps(): number {
    return this.effectiveFps;
  }

  public isRunning(): boolean {
    return this.isActive;
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  private addFrameToBuffer(frame: PoseFrame): void {
    this.rollingBuffer.push(frame);
    if (this.rollingBuffer.length > this.maxBufferFrames) {
      this.rollingBuffer.shift();
    }
  }

  private updateFps(nowMs: number): void {
    this.frameCount++;
    const elapsed = nowMs - this.fpsStartTime;
    if (elapsed >= 1000) {
      this.effectiveFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.fpsStartTime = nowMs;
    }
  }

  private loop = (_nowMs: DOMHighResTimeStamp) => {
    if (!this.isActive || !this.videoElement || !this.landmarker) return;

    const clockNow = typeof performance !== "undefined" ? performance.now() : Date.now();
    const timestampMs = Math.max(Math.floor(clockNow), this.lastTimestampMs + 1);

    if (timestampMs - this.lastProcessedTimeMs >= this.targetIntervalMs) {
      if (
        this.videoElement.readyState >= 2 &&
        !this.videoElement.paused &&
        !this.videoElement.ended &&
        this.videoElement.videoWidth > 0
      ) {
        this.lastTimestampMs = timestampMs;
        this.lastProcessedTimeMs = timestampMs;

        try {
          const result = this.landmarker.detectForVideo(this.videoElement, timestampMs);
          let poseFrame: PoseFrame | null = null;

          if (result && result.landmarks && result.landmarks.length > 0) {
            let bestIdx = 0;
            if (result.landmarks.length > 1) {
              let maxScore = -Infinity;
              for (let pIdx = 0; pIdx < result.landmarks.length; pIdx++) {
                const lms = toLandmarks(result.landmarks[pIdx]);
                const hip = hipCenter(lms);
                const box = boundingBox(lms);
                const area = box.w * box.h;

                let score = area * 2;
                if (this.lastTargetHip) {
                  const d = Math.hypot(hip.x - this.lastTargetHip.x, hip.y - this.lastTargetHip.y);
                  score = d <= 0.35 ? area * 2 - d * 4 + 1.0 : area * 2 - d * 2;
                }
                if (score > maxScore) {
                  maxScore = score;
                  bestIdx = pIdx;
                }
              }
            }

            const rawLandmarks = result.landmarks[bestIdx];
            const convertedLms = toLandmarks(rawLandmarks);
            this.lastTargetHip = hipCenter(convertedLms);

            poseFrame = {
              timeMs: timestampMs,
              landmarks: convertedLms,
              worldLandmarks: result.worldLandmarks?.[bestIdx]
                ? toLandmarks(result.worldLandmarks[bestIdx])
                : undefined,
            };
            this.addFrameToBuffer(poseFrame);
          }

          this.updateFps(timestampMs);
          this.onFrameCallback?.(poseFrame, result, this.effectiveFps);
        } catch (err) {
          console.warn("[PoseTracker] detectForVideo execution error:", err);
        }
      }
    }

    if (this.isActive) {
      if (typeof requestAnimationFrame !== "undefined") {
        this.animFrameId = requestAnimationFrame(this.loop);
      } else if (typeof setTimeout !== "undefined") {
        this.animFrameId = setTimeout(() => this.loop(Date.now()), this.targetIntervalMs) as unknown as number;
      }
    }
  };
}

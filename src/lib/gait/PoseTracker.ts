import { getPoseLandmarker, toLandmarks, type PoseLandmarkerLike } from "./pose";
import type { Landmark, PoseFrame } from "./types";
import { boundingBox, hipCenter } from "./landmarks";
import { OneEuroFilter } from "./signal";
import { computeBiometricSignature, biometricDistance, type BiometricSignature } from "./analysis";

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
  private targetVelocity = { vx: 0, vy: 0 };
  private lastTargetTimeMs = 0;

  // One Euro adaptive filters for hip smoothing (Casiez et al., CHI 2012)
  private hipFilterX = new OneEuroFilter(30, 1.0, 0.007, 1.0);
  private hipFilterY = new OneEuroFilter(30, 1.0, 0.007, 1.0);

  // Biometric-aware target lock
  private targetBiometrics: BiometricSignature | undefined = undefined;
  private occlusionFrames = 0;
  private readonly maxOcclusionFrames = 30; // ~1s at 30fps → reset lock

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
    this.targetVelocity = { vx: 0, vy: 0 };
    this.lastTargetTimeMs = 0;
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
              const dtSec =
                this.lastTargetTimeMs > 0 && timestampMs > this.lastTargetTimeMs
                  ? (timestampMs - this.lastTargetTimeMs) / 1000
                  : 0;
              const predX = this.lastTargetHip
                ? this.lastTargetHip.x + this.targetVelocity.vx * dtSec
                : 0;
              const predY = this.lastTargetHip
                ? this.lastTargetHip.y + this.targetVelocity.vy * dtSec
                : 0;

              for (let pIdx = 0; pIdx < result.landmarks.length; pIdx++) {
                const lms = toLandmarks(result.landmarks[pIdx]);
                const hip = hipCenter(lms);
                const box = boundingBox(lms);
                const area = box.w * box.h;

                // Biometric-aware multi-factor scoring (R4 upgrade)
                let score = Math.min(1, area * 3) * 0.15; // area component (15%)
                if (this.lastTargetHip) {
                  const dLast = Math.hypot(hip.x - this.lastTargetHip.x, hip.y - this.lastTargetHip.y);
                  const dPred = dtSec > 0 ? Math.hypot(hip.x - predX, hip.y - predY) : dLast;
                  const d = Math.min(dLast, dPred);

                  // Spatial proximity (40%)
                  score += Math.max(0, 1 - d * 5) * 0.40;

                  // Biometric similarity (30%)
                  const candidateBio = computeBiometricSignature(lms);
                  if (candidateBio && this.targetBiometrics) {
                    const bioDist = biometricDistance(candidateBio, this.targetBiometrics);
                    score += Math.max(0, 1 - bioDist * 3) * 0.30;
                  } else {
                    score += 0.15; // neutral when no template yet
                  }

                  // Position continuity (15%)
                  score += Math.max(0, 1 - d * 3) * 0.15;
                } else {
                  // No prior target — use area dominance for initial lock
                  score = area * 2;
                }
                if (score > maxScore) {
                  maxScore = score;
                  bestIdx = pIdx;
                }
              }
            }

            const rawLandmarks = result.landmarks[bestIdx];
            const convertedLms = toLandmarks(rawLandmarks);
            const rawHip = hipCenter(convertedLms);

            // One Euro adaptive filtering for hip smoothing
            const tSec = timestampMs / 1000;
            const filteredHip: Landmark = {
              x: this.hipFilterX.filter(rawHip.x, tSec),
              y: this.hipFilterY.filter(rawHip.y, tSec),
              z: rawHip.z,
              visibility: rawHip.visibility,
            };

            const dtSec =
              this.lastTargetTimeMs > 0 && timestampMs > this.lastTargetTimeMs
                ? (timestampMs - this.lastTargetTimeMs) / 1000
                : 0;

            // Velocity update with clamping (max 0.15 normalized units per frame)
            if (this.lastTargetHip && dtSec > 0 && dtSec < 0.5) {
              const vxStep = (filteredHip.x - this.lastTargetHip.x) / dtSec;
              const vyStep = (filteredHip.y - this.lastTargetHip.y) / dtSec;
              const maxV = 0.15 / Math.max(0.016, dtSec); // ~0.15 norm-units per frame
              const clampedVx = Math.max(-maxV, Math.min(maxV, vxStep));
              const clampedVy = Math.max(-maxV, Math.min(maxV, vyStep));
              this.targetVelocity = {
                vx: 0.6 * this.targetVelocity.vx + 0.4 * clampedVx,
                vy: 0.6 * this.targetVelocity.vy + 0.4 * clampedVy,
              };
            }
            this.lastTargetHip = filteredHip;
            this.lastTargetTimeMs = timestampMs;
            this.occlusionFrames = 0;

            // Update biometric template (EMA)
            const newBio = computeBiometricSignature(convertedLms);
            if (newBio) {
              if (!this.targetBiometrics) {
                this.targetBiometrics = newBio;
              } else {
                this.targetBiometrics = {
                  aspectRatio: 0.7 * this.targetBiometrics.aspectRatio + 0.3 * newBio.aspectRatio,
                  torsoLegRatio: 0.7 * this.targetBiometrics.torsoLegRatio + 0.3 * newBio.torsoLegRatio,
                  shoulderHipRatio: 0.7 * this.targetBiometrics.shoulderHipRatio + 0.3 * newBio.shoulderHipRatio,
                };
              }
            }

            poseFrame = {
              timeMs: timestampMs,
              landmarks: convertedLms,
              worldLandmarks: result.worldLandmarks?.[bestIdx]
                ? toLandmarks(result.worldLandmarks[bestIdx])
                : undefined,
            };
            this.addFrameToBuffer(poseFrame);
          } else {
            // No detections — occlusion coasting
            this.occlusionFrames++;
            if (this.occlusionFrames >= this.maxOcclusionFrames) {
              // Reset target lock after prolonged occlusion
              this.lastTargetHip = null;
              this.targetVelocity = { vx: 0, vy: 0 };
              this.targetBiometrics = undefined;
              this.hipFilterX.reset();
              this.hipFilterY.reset();
              this.occlusionFrames = 0;
            } else {
              // Coast with velocity decay
              const decay = Math.pow(0.9, this.occlusionFrames);
              this.targetVelocity = {
                vx: this.targetVelocity.vx * decay,
                vy: this.targetVelocity.vy * decay,
              };
            }
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

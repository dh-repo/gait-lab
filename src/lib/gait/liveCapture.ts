import type { PoseFrame } from "./types";

/** Wall-clock span covered by a frame buffer, in seconds. */
export function bufferedSpanSec(frames: PoseFrame[]): number {
  if (frames.length < 2) return 0;
  return (frames[frames.length - 1].timeMs - frames[0].timeMs) / 1000;
}

/**
 * Largest gap between consecutive detections that still counts as continuous, in
 * seconds. At the 30 Hz target a dropped frame or two is normal; 0.35 s is about a
 * third of a step, beyond which Catmull-Rom interpolation is inventing gait rather
 * than smoothing it.
 */
const MAX_LIVE_GAP_SEC = 0.35;

/**
 * Longest run of frames with no gap exceeding MAX_LIVE_GAP_SEC.
 *
 * First-to-last span is not a usable admission test: a subject who steps out of
 * frame and returns 20 s later leaves two clusters whose span reads 20 s while the
 * buffer holds almost no walking. Resampling that onto a uniform grid fabricates
 * the hole. Gate on — and analyse — the longest continuous run instead.
 */
export function longestContinuousRun(frames: PoseFrame[]): PoseFrame[] {
  if (frames.length < 2) return frames.slice();
  let bestStart = 0;
  let bestEnd = 0;
  let runStart = 0;
  for (let i = 1; i < frames.length; i++) {
    const gapSec = (frames[i].timeMs - frames[i - 1].timeMs) / 1000;
    if (gapSec > MAX_LIVE_GAP_SEC) {
      if (i - 1 - runStart > bestEnd - bestStart) {
        bestStart = runStart;
        bestEnd = i - 1;
      }
      runStart = i;
    }
  }
  if (frames.length - 1 - runStart > bestEnd - bestStart) {
    bestStart = runStart;
    bestEnd = frames.length - 1;
  }
  return frames.slice(bestStart, bestEnd + 1);
}

/**
 * Which camera to open when the user has not picked a specific device.
 *
 * Gait capture films someone else walking, so on a handheld the rear camera is
 * the right one — a phone defaulting to the selfie camera cannot see the subject
 * at all. Coarse pointer is the proxy for "handheld with more than one camera";
 * desktops keep the user-facing default because that is all they have.
 *
 * Guarded for SSR and for jsdom, neither of which implements matchMedia.
 */
export function defaultFacingMode(): "user" | "environment" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "user";
  }
  return window.matchMedia("(pointer: coarse)").matches ? "environment" : "user";
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type DragEvent } from "react";
import {
  ArrowRight,
  Bookmark,
  Check,
  Upload,
  Film,
  Loader2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Sliders,
  ClipboardCheck,
  Users,
  Camera,
  Square,
  RefreshCw,
  SwitchCamera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SkeletonCanvas } from "./SkeletonCanvas";
import { MetricsPanel } from "./MetricsPanel";
import { GuessesPanel } from "./GuessesPanel";
import { GuidePanel } from "./GuidePanel";
import { ReportPanel } from "./ReportPanel";
import { CognitiveClusters } from "./CognitiveClusters";
import { ScoreRing } from "./ScoreRing";
import { SamplePicker } from "./SamplePicker";
import { SessionHistoryDrawer } from "./SessionHistoryDrawer";
import { SessionComparisonView } from "./SessionComparisonView";
import { WorkflowHeader, type WorkflowStage } from "./WorkflowHeader";
import { computeDualTaskCost, computeGaitMetrics, matchPeople, tracksToPeople } from "@/lib/gait/analysis";
import { computeGaitAngleAnalysis, calculateKneeFlexion } from "@/lib/gait/angles";
import { detectGaitEventsZeni } from "@/lib/gait/events";
import { buildEducatedGuesses, resolveDteValues } from "@/lib/gait/guesses";
import { PERSON_COLORS, boundingBox } from "@/lib/gait/landmarks";
import { saveGaitSession, type GaitSessionRecord } from "@/lib/gait/persistence";
import { PoseTracker, parseWebcamError } from "@/lib/gait/PoseTracker";
import {
  getPoseLandmarker,
  resamplePoseFrames,
  seekAndDetect,
  toLandmarks,
  waitForVideoData,
  waitForVideoMetadata,
  type PoseLandmarkerLike,
} from "@/lib/gait/pose";
import { bufferedSpanSec, defaultFacingMode, longestContinuousRun } from "@/lib/gait/liveCapture";
import type {
  AnalysisResult,
  GaitMetrics,
  Landmark,
  PatientMetadata,
  PoseFrame,
  TaskMode,
  TrackedPerson,
} from "@/lib/gait/types";
import { cn } from "@/lib/utils";

type Phase =
  | "idle"
  | "loading_model"
  | "scanning"
  | "select_person"
  | "analyzing"
  | "results"
  | "error";

type Tab = "clusters" | "report" | "guesses" | "metrics" | "guide";

/**
 * The webcam station renders exactly one tracked subject. Hoisted to module scope so
 * SkeletonCanvas receives a stable object identity: an inline literal changes identity
 * on every render, which tears down and restarts the canvas rAF loop 30x/second.
 */
const WEBCAM_PERSON_COLOR = "#5b8def";
const WEBCAM_PERSON_COLORS: Record<number, string> = { 1: WEBCAM_PERSON_COLOR };

/**
 * Sampling window the uploaded-video path targets (see runAnalysis). Variability error
 * scales as 1/sqrt(strides), so this is the length at which stepTimeCV stops being both
 * noisy and biased low. It is a quality target, not an admission gate: shorter clips are
 * still analysed whole.
 */
const ANALYSIS_WINDOW_SEC = 20;

/**
 * Shortest recording the live path will analyse. Unlike an uploaded clip — whose length
 * the user cannot change by the time they reach the app — a live capture can simply be
 * kept running, so there is no reason to accept less than the window the analysis is
 * documented to need. Same number, no new constant.
 */
const MIN_LIVE_CLIP_SEC = ANALYSIS_WINDOW_SEC;

/** Rolling buffer capacity for the live tracker: 900 frames at the 30 Hz target. */
const WEBCAM_BUFFER_FRAMES = 900;
const WEBCAM_TARGET_FPS = 30;
const WEBCAM_BUFFER_SEC = WEBCAM_BUFFER_FRAMES / WEBCAM_TARGET_FPS;

/**
 * HUD repaint stride, in detected frames. 3 frames is ~100 ms at the 30 Hz target — the
 * point is to stop the 30 Hz per-frame full-tree re-render, and a frame stride does that
 * deterministically regardless of wall-clock jitter.
 */
const HUD_FRAME_STRIDE = 3;
/**
 * Gait-event stride, in detected frames (~1 s at 30 Hz). Running the Zeni detector over
 * the whole rolling buffer is O(n) with four Butterworth passes, so it runs an order of
 * magnitude less often than the HUD — step count and cadence move far slower than that.
 */
const EVENT_FRAME_STRIDE = 30;

/**
 * Live telemetry. Every field is a directly measured quantity: fps and buffered span
 * come from the tracker, the knee angles from the current frame's landmarks, and
 * steps/cadence from the same Zeni detector the frozen analysis runs — so the HUD
 * cannot disagree with the report. steps/cadence are null until the detector has
 * found enough events to report, rather than showing a fabricated zero.
 */
interface LiveMetrics {
  /** Heel strikes the Zeni detector found in the rolling buffer. */
  fps: number;
  stepCount: number;
  /**
   * Steps per minute over the buffered span. Null until at least two heel strikes are
   * available — a rate derived from a single event is not a measurement.
   */
  cadence: number | null;
  kneeAngleLeft: number;
  kneeAngleRight: number;
  confidence: number;
  /** Seconds of pose data currently retained in the rolling buffer. */
  recordedSec: number;
}

const EMPTY_LIVE_METRICS: LiveMetrics = {
  fps: 0,
  stepCount: 0,
  cadence: null,
  kneeAngleLeft: 0,
  kneeAngleRight: 0,
  confidence: 0,
  recordedSec: 0,
};

/** Seconds of pose data currently held in a tracker's rolling buffer. */


export function GaitApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const landmarkerRef = useRef<PoseLandmarkerLike | null>(null);
  const abortRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [people, setPeople] = useState<TrackedPerson[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [scanPoses, setScanPoses] = useState<{ id: number; landmarks: Landmark[] }[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [tab, setTab] = useState<Tab>("report");
  const [dragOver, setDragOver] = useState(false);
  const [taskMode, setTaskMode] = useState<TaskMode>("single");
  const [baselineSingle, setBaselineSingle] = useState<GaitMetrics | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  /**
   * Why a save failed, or null. persistence.saveGaitSession throws when the row's
   * user_id ownership guard rejects the upsert; without this the failure was only
   * ever logged to the console and the clinician assumed the session was stored.
   */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<WorkflowStage | null>(null);
  const [viewMode, setViewMode] = useState<"workflow" | "comparison">("workflow");
  const [compareSessionA, setCompareSessionA] = useState<GaitSessionRecord | null>(null);
  const [compareSessionB, setCompareSessionB] = useState<GaitSessionRecord | null>(null);

  // Live WebCam State
  const [inputMode, setInputMode] = useState<"file" | "webcam">("file");
  const [webcamState, setWebcamState] = useState<"idle" | "requesting" | "streaming" | "paused" | "error">("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  /**
   * Which camera to open when no specific device was picked. Phones and tablets
   * default to the rear camera: gait capture films someone else walking, so the
   * front camera is the wrong one. Desktops have only a user-facing camera.
   * `matchMedia` is guarded for SSR and for jsdom, which does not implement it.
   */
  const [facingMode, setFacingMode] = useState<"user" | "environment">(defaultFacingMode);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [webcamFallbackNotice, setWebcamFallbackNotice] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>(EMPTY_LIVE_METRICS);

  const poseTrackerRef = useRef<PoseTracker | null>(null);
  /** Detected-frame counter driving the HUD and gait-event strides. */
  const liveFrameCounterRef = useRef<number>(0);
  /**
   * Monotonic token for the webcam start/stop lifecycle. startWebcam awaits permission,
   * model load and play(); a Stop or a second Start during any of those awaits must
   * invalidate the in-flight attempt so its setStates cannot land on a dead tracker.
   */
  const webcamSessionRef = useRef(0);
  /** id of the session row currently loaded / last saved, so re-saving updates it. */
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const [patientMeta, setPatientMeta] = useState<PatientMetadata>({
    patientId: "PT-" + Math.floor(10000 + Math.random() * 90000),
    assessmentDate: new Date().toISOString().slice(0, 10),
    assessmentCondition: "Single-Task Walk",
    clinicianNotes: "",
  });

  const handleUpdateMeta = useCallback((updated: Partial<PatientMetadata>) => {
    setPatientMeta((prev) => {
      const next = { ...prev, ...updated };
      setResult((prevRes) => (prevRes ? { ...prevRes, patientMeta: next } : null));
      return next;
    });
  }, []);

  const [overlaySkeleton, setOverlaySkeleton] = useState(true);
  const [overlayJointArcs, setOverlayJointArcs] = useState(true);
  const [overlaySwayVector, setOverlaySwayVector] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const enumerateDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
      setDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.warn("Camera device enumeration failed:", err);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    if (inputMode === "webcam") {
      void enumerateDevices();
    }
  }, [inputMode, enumerateDevices]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTimeUpdate = () => setCurrentTime(v.currentTime);
    const onLoadedMetadata = () => setDuration(v.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);

    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [videoUrl]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  }, []);

  const stepFrame = useCallback((deltaFrames: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    const dt = deltaFrames * (1 / 30);
    v.currentTime = Math.min(Math.max(0, v.currentTime + dt), v.duration || 0);
  }, []);

  const seekToTime = useCallback((timeSec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(0, timeSec), v.duration || 0);
  }, []);

  const formatTimecode = (timeSec: number) => {
    const mins = Math.floor(timeSec / 60);
    const secs = Math.floor(timeSec % 60);
    const ms = Math.floor((timeSec % 1) * 100);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const personColors = useMemo(() => {
    const map: Record<number, string> = {};
    people.forEach((p, i) => {
      map[p.id] = p.color || PERSON_COLORS[i % PERSON_COLORS.length];
    });
    return map;
  }, [people]);

  // Derived 4-stage workflow step
  const computedStage: WorkflowStage = useMemo(() => {
    if (activeStage !== null) return activeStage;
    if (phase === "idle") return 1;
    if (
      phase === "loading_model" ||
      phase === "scanning" ||
      phase === "select_person" ||
      phase === "analyzing" ||
      phase === "error"
    ) {
      return 2;
    }
    if (phase === "results") {
      return tab === "report" ? 4 : 3;
    }
    return 1;
  }, [activeStage, phase, tab]);

  useEffect(() => {
    if (computedStage !== 3) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepFrame(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepFrame(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [computedStage, togglePlay, stepFrame]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    const ref = abortRef;
    return () => {
      ref.current++;
    };
  }, []);

  const stopWebcam = useCallback(() => {
    // Invalidate any start attempt still sitting in an await, so it cannot flip the
    // UI back to "streaming" (or raise an error banner) over a torn-down tracker.
    webcamSessionRef.current++;
    if (poseTrackerRef.current) {
      poseTrackerRef.current.stopWebcam();
    }
    setWebcamState("idle");
    // Leave nothing stale behind: the last skeleton and the last telemetry values are
    // no longer being produced by anything.
    setScanPoses([]);
    setLiveMetrics(EMPTY_LIVE_METRICS);
  }, []);

  useEffect(() => {
    return () => {
      if (poseTrackerRef.current) {
        poseTrackerRef.current.stopWebcam();
      }
    };
  }, []);

  const resetAll = useCallback(() => {
    stopWebcam();
    abortRef.current++;
    setActiveStage(null);
    setPhase("idle");
    setProgress(0);
    setMessage("");
    setError(null);
    setPeople([]);
    setSelectedPersonId(null);
    setScanPoses([]);
    setResult(null);
    setCurrentSessionId(null);
    setWebcamError(null);
    setWebcamFallbackNotice(null);
    setTab("report");
    setTaskMode("single");
    setViewMode("workflow");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [videoUrl, stopWebcam]);

  const ensureModel = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    setPhase("loading_model");
    setMessage("Loading pose model (first time may take a few seconds)…");
    setProgress(8);
    const lm = await getPoseLandmarker();
    landmarkerRef.current = lm;
    return lm;
  }, []);

  const startWebcam = useCallback(
    async (deviceId?: string) => {
      const video = videoRef.current;
      if (!video) return;

      // Claim this attempt. A Stop, or a second Start, bumps the counter and this
      // token stops matching — every post-await setState below is gated on it.
      const sessionToken = ++webcamSessionRef.current;

      setWebcamError(null);
      setWebcamFallbackNotice(null);
      setWebcamState("requesting");

      if (!poseTrackerRef.current) {
        poseTrackerRef.current = new PoseTracker(WEBCAM_TARGET_FPS, WEBCAM_BUFFER_FRAMES);
      }
      const tracker = poseTrackerRef.current;

      // A new capture is a new recording: never let the previous session's frames leak
      // into it, or "Freeze" would analyse two walks stitched together.
      tracker.clearBuffer();
      liveFrameCounterRef.current = 0;
      setLiveMetrics(EMPTY_LIVE_METRICS);
      setScanPoses([]);

      try {
        // Deliberately NOT ensureModel(): that setter drives `phase`, which is the
        // file-analysis workflow's state machine. Moving it to "loading_model" jumps the
        // UI to Stage 2 and unmounts the capture station the user is standing in front
        // of. The live path owns webcamState and leaves phase alone.
        if (!landmarkerRef.current) {
          landmarkerRef.current = await getPoseLandmarker();
        }
        if (webcamSessionRef.current !== sessionToken) return;
        tracker.setLandmarker(landmarkerRef.current);

        tracker.setCallback((poseFrame, _raw, fps) => {
          if (!poseFrame || !poseFrame.landmarks) return;

          const frameIndex = liveFrameCounterRef.current++;
          if (frameIndex % HUD_FRAME_STRIDE !== 0) return;

          // Throttled to the HUD tick: at 30 Hz these two setStates re-render the whole
          // tree (and the canvas) faster than the detector can keep up with the camera.
          setScanPoses([{ id: 1, landmarks: poseFrame.landmarks }]);
          setSelectedPersonId(1);

          const frames = tracker.getRollingFrames();
          setPeople([
            {
              id: 1,
              color: WEBCAM_PERSON_COLOR,
              sampleBox: { x: 0.2, y: 0.1, w: 0.6, h: 0.8 },
              sampleFrameIndex: 0,
              frameCount: frames.length,
            },
          ]);

          const lm = poseFrame.landmarks;
          const kLeft = calculateKneeFlexion(lm[23], lm[25], lm[27]);
          const kRight = calculateKneeFlexion(lm[24], lm[26], lm[28]);

          const lowerBodyIndices = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
          const validCount = lowerBodyIndices.filter(
            (idx) => lm[idx] && (lm[idx].visibility ?? 1) >= 0.5,
          ).length;
          const confidence = validCount / lowerBodyIndices.length;

          const recordedSec = bufferedSpanSec(frames);

          // Steps and cadence come from the engine's Zeni detector over the rolling
          // buffer — the same detector computeGaitMetrics runs — so the live readout
          // and the frozen report cannot disagree. It is O(n) with four Butterworth
          // passes, so it runs on its own slower tick and the previous value is carried
          // forward in between.
          const runEvents = frameIndex % EVENT_FRAME_STRIDE === 0;

          setLiveMetrics((prev) => {
            let stepCount = prev.stepCount;
            let cadence = prev.cadence;

            if (runEvents) {
              const effFps = tracker.getEffectiveFps() || WEBCAM_TARGET_FPS;
              const heelStrikes = detectGaitEventsZeni(frames, effFps).stepEvents.filter(
                (e) => e.type === "heel_strike",
              );
              stepCount = heelStrikes.length;
              // Same definition as computeGaitMetrics: heel strikes over the analysed
              // span. Below two events there is no rate to report.
              cadence =
                heelStrikes.length >= 2 && recordedSec > 0
                  ? (heelStrikes.length / recordedSec) * 60
                  : null;
            }

            return {
              fps,
              stepCount,
              cadence,
              kneeAngleLeft: kLeft,
              kneeAngleRight: kRight,
              confidence,
              recordedSec,
            };
          });
        });

        const requestedDeviceId = deviceId || selectedDeviceId || undefined;
        const stream = await tracker.startWebcam(video, {
          deviceId: requestedDeviceId,
          // Only meaningful when no explicit device was chosen. On a phone the
          // subject is filmed by the person holding it, so the rear camera is the
          // right default — PoseTracker's "user" default opens the selfie camera,
          // which cannot see someone walking.
          facingMode: requestedDeviceId ? undefined : facingMode,
          targetFps: WEBCAM_TARGET_FPS,
        });

        // A Stop (or a newer Start) landed while we were awaiting: that tracker is
        // already torn down, so claiming "streaming" here would be a lie.
        if (webcamSessionRef.current !== sessionToken) return;

        setWebcamState("streaming");

        // The tracker retries with plain {video:true} when an exact deviceId is
        // overconstrained, which can hand back a different camera than the one shown
        // selected. Compare what we asked for against what we got.
        const videoTrack = stream?.getVideoTracks?.()?.[0];
        const actualDeviceId = videoTrack?.getSettings?.()?.deviceId;
        if (requestedDeviceId && actualDeviceId && actualDeviceId !== requestedDeviceId) {
          const actualLabel =
            videoTrack?.label ||
            devices.find((d) => d.deviceId === actualDeviceId)?.label ||
            "a different camera";
          setWebcamFallbackNotice(
            `The selected camera could not be opened with the requested settings. Recording from ${actualLabel} instead — the camera shown in the dropdown is not the one in use.`,
          );
        }

        void enumerateDevices();
      } catch (err) {
        const parsed = parseWebcamError(err);
        // A user-initiated abort (Stop, or a second Start superseding this one) is not
        // a camera failure and must not raise the permission-style banner.
        if ((parsed.code as string) === "ABORTED") {
          // Superseded attempts leave the UI to whoever superseded them; an abort that
          // is still the current attempt just returns the station to idle.
          if (webcamSessionRef.current === sessionToken) setWebcamState("idle");
          return;
        }
        if (webcamSessionRef.current !== sessionToken) return;
        console.error("Failed to start webcam:", err);
        setWebcamState("error");
        setWebcamError(parsed.message);
      }
    },
    // facingMode belongs here: without it startWebcam closes over the value at
    // mount, so flipping front/rear would restart the camera with the old facing.
    [selectedDeviceId, enumerateDevices, devices, facingMode],
  );

  const freezeAndAnalyzeSession = useCallback(async () => {
    const tracker = poseTrackerRef.current;
    const bufferedFrames = tracker ? tracker.getRollingFrames() : [];
    // Analyse the longest CONTINUOUS run, not the whole buffer: a gap the subject
    // spent out of frame would otherwise be filled in by the resampler.
    const recordedFrames = longestContinuousRun(bufferedFrames);
    const recordedSpanSec = bufferedSpanSec(recordedFrames);

    // Refuse rather than report. A raw frame count says nothing about how much walking
    // was captured — 5 frames can be 0.2 s — so the gate is on the span the buffered
    // frames actually cover.
    if (recordedSpanSec < MIN_LIVE_CLIP_SEC) {
      // Report through the LIVE error channel, not setPhase("error"): phase drives
      // computedStage, so failing here used to unmount the capture station while the
      // camera, the rAF loop and the HUD updates all kept running with no visible
      // Stop control. The message tells the user to keep walking and freeze again —
      // that is only possible if the station stays mounted and streaming.
      setWebcamError(
        `Only ${recordedSpanSec.toFixed(1)} seconds of continuous pose data was captured. ` +
          `Gait metrics need at least ${MIN_LIVE_CLIP_SEC} seconds of walking in view — that is ` +
          `the analysis window this app uses, and below it step- and stride-time ` +
          `variability rest on too few strides to mean anything. Keep the camera ` +
          `running, stay fully in frame, then freeze again.`,
      );
      return;
    }

    stopWebcam();

    try {
      setPhase("analyzing");
      setMessage("Resampling webcam session frames onto uniform 30 Hz grid...");
      setProgress(30);

      const uniformFrames = resamplePoseFrames(recordedFrames, 30.0);
      setMessage("Computing kinematic metrics and symmetry analysis...");
      setProgress(70);

      const metrics = computeGaitMetrics(uniformFrames);
      let dualTaskCost = undefined as AnalysisResult["dualTaskCost"];
      if (taskMode === "dual" && baselineSingle) {
        dualTaskCost = computeDualTaskCost(baselineSingle, metrics);
      }

      const guesses = buildEducatedGuesses(metrics, { taskMode, dualTaskCost });
      if (taskMode === "single") {
        setBaselineSingle(metrics);
      }

      const angleAnalysis = computeGaitAngleAnalysis(
        uniformFrames,
        metrics.stepEvents || [],
        metrics.viewAngle || "unknown",
      );

      const analysis: AnalysisResult = {
        metrics,
        guesses,
        personId: 1,
        analyzedFrames: uniformFrames.length,
        taskMode,
        dualTaskCost,
        angleAnalysis,
        patientMeta,
        notes: [
          `Live WebCam Real-Time Gait Session (${recordedFrames.length} raw frames resampled to ${uniformFrames.length} uniform 30Hz frames)`,
          `Analysed the most recent ${recordedSpanSec.toFixed(1)}s retained in the rolling buffer (capacity ~${WEBCAM_BUFFER_SEC.toFixed(0)}s); anything recorded before that was discarded`,
          `Effective session duration: ${metrics.durationSec.toFixed(1)}s`,
          `View angle estimate: ${metrics.viewAngle}`,
          `Task mode: ${taskMode === "dual" ? "walk + cognitive" : "walk only"}`,
        ],
      };

      setResult(analysis);
      setCurrentSessionId(null); // fresh analysis: saving it creates a new row
      setProgress(100);
      setPhase("results");
      setMessage("Webcam gait analysis complete");
      setTab("clusters");
      setActiveStage(3);
    } catch (err) {
      console.error("Webcam analysis error:", err);
      setError(err instanceof Error ? err.message : "Live webcam analysis failed");
      setPhase("error");
    }
  }, [stopWebcam, taskMode, baselineSingle, patientMeta]);

  const processFile = useCallback(
    async (file: File) => {
      const looksVideo =
        file.type.startsWith("video/") ||
        file.type === "" ||
        /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name);
      if (!looksVideo) {
        setError("Please upload a video file (mp4, webm, mov, etc.).");
        setPhase("error");
        return;
      }
      abortRef.current++;
      const runId = abortRef.current;
      setActiveStage(null);
      setError(null);
      setResult(null);
      setPeople([]);
      setSelectedPersonId(null);
      setScanPoses([]);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setFileName(file.name);

      try {
        const landmarker = await ensureModel();
        if (runId !== abortRef.current) return;

        const video = videoRef.current;
        if (!video) throw new Error("Video element missing");
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        video.load();
        await waitForVideoMetadata(video);
        await waitForVideoData(video);
        if (runId !== abortRef.current) return;

        if (!video.videoWidth || !video.videoHeight) {
          throw new Error(
            "Could not decode video frames. On iPhone, try exporting as MP4 (Most Compatible / H.264) in Photos.",
          );
        }

        // Scan pass: detect people
        setPhase("scanning");
        setMessage("Scanning video for people…");
        setProgress(15);

        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        const sampleCount = Math.min(40, Math.max(16, Math.floor(duration * 3.5)));
        const tracks: {
          id: number;
          lastHip: Landmark;
          frames: number;
          box: ReturnType<typeof boundingBox>;
          areaSum: number;
          hipYSum: number;
        }[] = [];
        const nextId = { value: 0 };
        let lastPoses: { id: number; landmarks: Landmark[] }[] = [];
        let sampleIdx = 0;
        let totalDetections = 0;
        let bestFramePoses: { id: number; landmarks: Landmark[] }[] = [];

        for (let i = 0; i < sampleCount; i++) {
          if (runId !== abortRef.current) return;
          const timeSec = (i / Math.max(1, sampleCount - 1)) * Math.max(0, duration - 0.05);
          const res = await seekAndDetect(landmarker, video, timeSec);
          const dets = (res.landmarks || []).map(toLandmarks);
          if (dets.length) {
            totalDetections += dets.length;
            const ids = matchPeople(dets, tracks, nextId);
            lastPoses = dets.map((landmarks, di) => ({
              id: ids[di],
              landmarks,
            }));
            if (dets.length >= bestFramePoses.length) {
              bestFramePoses = lastPoses;
            }
            setScanPoses(lastPoses);
          }
          const pct = 15 + Math.round((i / sampleCount) * 35);
          setProgress(pct);
          if (i % 3 === 0) {
            setMessage(
              totalDetections > 0
                ? `Scanning… found people in ${totalDetections} detections (${i + 1}/${sampleCount})`
                : `Scanning frames… ${i + 1}/${sampleCount}`,
            );
          }
          sampleIdx = i;
        }

        let found = tracksToPeople(tracks, sampleIdx);
        if (!found.length && bestFramePoses.length) {
          found = bestFramePoses.map((p, i) => ({
            id: p.id,
            color: PERSON_COLORS[i % PERSON_COLORS.length],
            sampleBox: boundingBox(p.landmarks),
            sampleFrameIndex: sampleIdx,
            frameCount: 1,
          }));
        }
        if (!found.length && lastPoses.length) {
          found = lastPoses.map((p, i) => ({
            id: p.id,
            color: PERSON_COLORS[i % PERSON_COLORS.length],
            sampleBox: boundingBox(p.landmarks),
            sampleFrameIndex: sampleIdx,
            frameCount: 1,
          }));
        }
        if (!found.length) {
          throw new Error(
            totalDetections === 0
              ? "No people detected in any frame. Tips: keep the full body in view, avoid extreme blur, and for iPhone videos export as MP4 (H.264 / Most Compatible)."
              : "People appeared briefly but could not be tracked. Try a longer clip with the subject continuously in frame.",
          );
        }
        setPeople(found);
        setSelectedPersonId(found[0].id);

        setProgress(52);
        setPhase("select_person");
        setMessage(
          found.length > 1
            ? `Found ${found.length} people — Person 1 is the best primary-track guess. Confirm or switch.`
            : "Person found — confirm subject and run gait analysis",
        );
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "Analysis failed");
        setPhase("error");
      }
    },
    [ensureModel, videoUrl],
  );

  const runAnalysis = useCallback(async () => {
    if (selectedPersonId === null) return;
    const runId = ++abortRef.current;
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker) return;

    try {
      setActiveStage(null);
      setPhase("analyzing");
      setMessage("Extracting gait kinematics…");
      setProgress(55);
      setResult(null);

      const duration = video.duration || 1;
      const targetFps = 30;
      // 20s target: a variability estimate's error scales as 1/sqrt(strides), so a 10s
      // window (~9 strides) carries ~24% relative error on stepTimeCV plus a ~17% low
      // bias. 20s (~18 strides) roughly halves both. Beyond 20s returns diminish (4x the
      // strides to halve the error again) while seek cost grows linearly.
      const WINDOW_TARGET_SEC = ANALYSIS_WINDOW_SEC;
      const windowDuration = duration > WINDOW_TARGET_SEC ? WINDOW_TARGET_SEC : duration;
      const windowStart = duration > WINDOW_TARGET_SEC ? (duration - windowDuration) / 2 : 0;
      const sampleCount = Math.max(15, Math.floor(windowDuration * targetFps));
      const dt = windowDuration > 0 && sampleCount > 1 ? windowDuration / sampleCount : 1 / targetFps;
      const rawFrames: PoseFrame[] = [];

      const selectedMeta = people.find((p) => p.id === selectedPersonId);
      let lastHip: Landmark | null = selectedMeta
        ? {
            x: selectedMeta.sampleBox.x + selectedMeta.sampleBox.w / 2,
            y: selectedMeta.sampleBox.y + selectedMeta.sampleBox.h * 0.55,
            z: 0,
          }
        : null;

      for (let i = 0; i < sampleCount; i++) {
        if (runId !== abortRef.current) return;
        const t = Math.min(Math.max(0, duration - 0.033), windowStart + i * dt);
        const res = await seekAndDetect(landmarker, video, t);
        const dets = (res.landmarks || []).map(toLandmarks);
        if (!dets.length) {
          setProgress(55 + Math.round((i / sampleCount) * 35));
          continue;
        }

        let best = -1;
        let bestScore = -Infinity;
        for (let di = 0; di < dets.length; di++) {
          const hip = {
            x: (dets[di][23].x + dets[di][24].x) / 2,
            y: (dets[di][23].y + dets[di][24].y) / 2,
            z: 0,
          };
          const b = boundingBox(dets[di]);
          const area = b.w * b.h;
          if (lastHip) {
            const d = Math.hypot(hip.x - lastHip.x, hip.y - lastHip.y);
            if (d > 0.2) continue;
            const score = area * 2 - d * 3;
            if (score > bestScore) {
              bestScore = score;
              best = di;
            }
          } else {
            if (area > bestScore) {
              bestScore = area;
              best = di;
            }
          }
        }

        if (best < 0) {
          setProgress(55 + Math.round((i / sampleCount) * 35));
          continue;
        }

        const lm = dets[best];
        lastHip = {
          x: (lm[23].x + lm[24].x) / 2,
          y: (lm[23].y + lm[24].y) / 2,
          z: 0,
        };
        rawFrames.push({ timeMs: t * 1000, landmarks: lm });
        setScanPoses([{ id: selectedPersonId, landmarks: lm }]);
        setProgress(55 + Math.round((i / sampleCount) * 35));
      }

      if (rawFrames.length < 8) {
        throw new Error(
          "Not enough pose frames for the selected person. Try a longer clip or better lighting.",
        );
      }

      setMessage("Resampling trajectory onto uniform 30 Hz grid & filtering…");
      setProgress(92);
      const frames = resamplePoseFrames(rawFrames, 30.0);

      setMessage("Computing metrics and educated guesses…");
      setProgress(96);
      const metrics = computeGaitMetrics(frames);
      let dualTaskCost = undefined as AnalysisResult["dualTaskCost"];
      if (taskMode === "dual" && baselineSingle) {
        dualTaskCost = computeDualTaskCost(baselineSingle, metrics);
      }
      const guesses = buildEducatedGuesses(metrics, { taskMode, dualTaskCost });
      if (taskMode === "single") {
        setBaselineSingle(metrics);
      }
      const angleAnalysis = computeGaitAngleAnalysis(
        frames,
        metrics.stepEvents || [],
        metrics.viewAngle || "unknown",
      );
      const analysis: AnalysisResult = {
        metrics,
        guesses,
        personId: selectedPersonId,
        analyzedFrames: frames.length,
        taskMode,
        dualTaskCost,
        angleAnalysis,
        patientMeta,
        notes: [
          `Analyzed ${frames.length} uniform 30Hz frames over ${metrics.durationSec.toFixed(1)}s`,
          `Effective sample rate ~${(((metrics as Record<string, unknown>).samplingFps as number) ?? metrics.fpsEffective).toFixed(1)} fps`,
          `View angle estimate: ${metrics.viewAngle}`,
          `Task mode: ${taskMode === "dual" ? "walk + cognitive" : "walk only"}`,
          dualTaskCost
            ? `Dual-task cadence DTE ${resolveDteValues(dualTaskCost).cadenceDte.toFixed(1)}% (${dualTaskCost.cmiClassification})`
            : taskMode === "single"
              ? "Saved as walk-only baseline for dual-task pairing"
              : "No walk-only baseline in session yet",
        ],
      };
      setResult(analysis);
      setCurrentSessionId(null); // fresh analysis: saving it creates a new row
      setProgress(100);
      setPhase("results");
      setMessage("Analysis complete");
      setTab("clusters");
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("error");
    }
  }, [selectedPersonId, people, taskMode, baselineSingle, patientMeta]);

  const handleSaveSession = useCallback(async () => {
    if (!result) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const sessionName = fileName ? fileName.replace(/\.[^/.]+$/, "") : "Gait Session";
      // Pass the id of the row this result already lives in, so the server's
      // ON CONFLICT (id) DO UPDATE branch is taken. Without it every save mints a new
      // id and re-saving after a metadata edit duplicates the session.
      const saved = await saveGaitSession({
        data: {
          ...(currentSessionId ? { id: currentSessionId } : {}),
          sessionName,
          result,
        },
      });
      if (saved?.id) setCurrentSessionId(saved.id);
      setSaveError(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error("Failed to save session:", e);
      setSaveSuccess(false);
      setSaveError(
        e instanceof Error && e.message
          ? e.message
          : "Session could not be saved. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [result, fileName, currentSessionId]);

  const handleSelectStage = useCallback(
    (stage: WorkflowStage) => {
      setViewMode("workflow");
      setActiveStage(stage);
      if (stage === 3 && result) {
        if (tab === "report") setTab("clusters");
      } else if (stage === 4 && result) {
        setTab("report");
      }
    },
    [result, tab],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const busy =
    phase === "loading_model" || phase === "scanning" || phase === "analyzing";

  return (
    <div className="relative min-h-dvh bg-[var(--color-bg)] text-[var(--color-fg)]">
      {/* Sticky Semantic Workflow Header */}
      <WorkflowHeader
        currentStage={computedStage}
        onSelectStage={handleSelectStage}
        hasResults={Boolean(result)}
        onReset={resetAll}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenCompare={() => setViewMode("comparison")}
        fileName={fileName}
      />

      <main className="relative mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 pb-20 pt-[calc(var(--grok-banner-h,0px)+1.5rem)] sm:px-8">
        {/* Hidden / active video element */}
        <video
          ref={videoRef}
          className="pointer-events-none fixed h-px w-px opacity-0"
          playsInline
          muted
          preload="auto"
        />

        {viewMode === "comparison" ? (
          <SessionComparisonView
            initialSessionA={compareSessionA}
            initialSessionB={compareSessionB}
            onBack={() => setViewMode("workflow")}
            onClose={() => setViewMode("workflow")}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onNewSession={() => {
              setViewMode("workflow");
              resetAll();
            }}
          />
        ) : (
          <>
            {/* STAGE 1 — single focus: start a session */}
        {computedStage === 1 && (
          <section
            role="region"
            aria-label="Stage 1: Capture"
            className="mx-auto w-full max-w-xl space-y-8"
          >
            <header className="space-y-3 text-center sm:text-left">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-subtle)]">
                Capture
              </p>
              <h1 className="text-[1.75rem] font-semibold tracking-tight text-[var(--color-fg)] sm:text-[2rem] leading-tight">
                New gait session
              </h1>
              <p className="text-[15px] leading-relaxed text-[var(--color-muted)] max-w-md mx-auto sm:mx-0">
                One continuous walk. Analysis runs entirely in this browser.
              </p>
            </header>

            {/* Protocol + source as quiet controls, not competing cards */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-subtle)]">
                  Assessment protocol
                </p>
                <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setTaskMode("single")}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                      taskMode === "single"
                        ? "bg-[var(--color-fg)] text-white"
                        : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
                    )}
                  >
                    Single-Task (Walk Only)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskMode("dual")}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                      taskMode === "dual"
                        ? "bg-[var(--color-fg)] text-white"
                        : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
                    )}
                  >
                    Dual-Task (Walk + Cognitive)
                  </button>
                </div>
              </div>

              <div className="inline-flex self-start rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (webcamState === "streaming") stopWebcam();
                    setInputMode("file");
                  }}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:min-h-0 sm:min-w-0",
                    inputMode === "file"
                      ? "bg-[var(--color-fg)] text-white"
                      : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
                  )}
                >
                  <Film className="size-3.5" />
                  Video file
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("webcam")}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:min-h-0 sm:min-w-0",
                    inputMode === "webcam"
                      ? "bg-[var(--color-fg)] text-white"
                      : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
                  )}
                >
                  <Camera className="size-3.5" />
                  Webcam
                </button>
              </div>
            </div>

            {inputMode === "file" ? (
              <>
                {/* Hero dropzone — the only primary surface */}
                <Card
                  className={cn(
                    "border-dashed border-2 shadow-none transition-colors",
                    dragOver
                      ? "border-[var(--color-fg)] bg-[var(--color-surface)]"
                      : "border-[var(--color-border-strong)] bg-[var(--color-surface)]",
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                >
                  <CardContent className="flex flex-col items-center gap-6 px-6 py-14 text-center sm:py-16">
                    <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-fg)]">
                      <Upload className="size-5" strokeWidth={1.75} />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-[17px] font-semibold tracking-tight">Drop walking video here</h2>
                      <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-[var(--color-muted)]">
                        MP4, WebM, or MOV. About {ANALYSIS_WINDOW_SEC}s of continuous walking
                        improves reliability of variability measures.
                      </p>
                    </div>
                    <Button size="lg" onClick={() => fileRef.current?.click()} className="min-w-[11rem]">
                      <Film className="size-4" />
                      Choose video file
                    </Button>
                    {/* Kept for product capability disclosure + tests; visual weight minimized */}
                    <ul className="sr-only">
                      <li>Multi-person tracking and subject selection</li>
                      <li>Sagittal and frontal view adaptation</li>
                      <li>Kinematic event detection and domain ratings</li>
                    </ul>
                    <p className="max-w-sm text-[12px] leading-relaxed text-[var(--color-subtle)]">
                      Multi-person tracking and subject selection · sagittal and frontal views ·
                      kinematic events
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="video/*"
                      aria-label="Upload walking video file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void processFile(f);
                      }}
                    />
                  </CardContent>
                </Card>

                <div className="pt-2">
                  <SamplePicker
                    onSelectSample={processFile}
                    onCustomUploadClick={() => fileRef.current?.click()}
                    isLoading={false}
                  />
                </div>
              </>
            ) : (
              /* Webcam capture station */
              <Card className="border-[var(--color-border)] bg-[var(--color-surface)]">
                <CardHeader>
                  <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Camera className="size-4 text-[var(--color-primary)]" />
                      Webcam capture
                    </span>
                    <Badge tone={webcamState === "streaming" ? "success" : webcamState === "requesting" ? "info" : "neutral"}>
                      {webcamState === "streaming"
                        ? "Camera on"
                        : webcamState === "requesting"
                          ? "Starting camera…"
                          : "Camera ready"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Record walking with the device camera. Pose estimation runs in this browser —
                    video and landmarks stay on your device.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Camera Selection & Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--color-surface-2)] p-3 rounded-[var(--radius-md)] border border-[var(--color-border)]">
                    <div className="flex flex-wrap items-center gap-3">
                      <label htmlFor="webcam-device-select" className="text-xs font-medium text-[var(--color-muted)]">
                        Camera Input:
                      </label>
                      <select
                        id="webcam-device-select"
                        aria-label="Select camera input device"
                        value={selectedDeviceId}
                        onChange={(e) => {
                          setSelectedDeviceId(e.target.value);
                          if (webcamState === "streaming") {
                            stopWebcam();
                            void startWebcam(e.target.value);
                          }
                        }}
                        disabled={webcamState === "requesting"}
                        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      >
                        {devices.length > 0 ? (
                          devices.map((d, i) => (
                            <option key={d.deviceId || i} value={d.deviceId}>
                              {d.label || `Camera Device ${i + 1}`}
                            </option>
                          ))
                        ) : (
                          <option value="">Default WebCam</option>
                        )}
                      </select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
                        onClick={() => void enumerateDevices()}
                        title="Refresh camera devices"
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                      {/* Front/rear flip. Only useful where more than one camera
                          exists, i.e. phones and tablets — hidden on fine-pointer
                          devices to keep the desktop control strip uncluttered. */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
                        aria-label={
                          facingMode === "environment"
                            ? "Switch to front camera"
                            : "Switch to rear camera"
                        }
                        title={
                          facingMode === "environment"
                            ? "Using rear camera — tap to switch to front"
                            : "Using front camera — tap to switch to rear"
                        }
                        onClick={() => {
                          const next = facingMode === "environment" ? "user" : "environment";
                          setFacingMode(next);
                          // Flipping means "ignore the explicit device pick", otherwise
                          // deviceId keeps winning and the button does nothing.
                          setSelectedDeviceId("");
                          if (webcamState === "streaming") {
                            stopWebcam();
                            void startWebcam();
                          }
                        }}
                      >
                        <SwitchCamera className="size-3.5" />
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {webcamState === "requesting" ? (
                        /* The start handler awaits permission, model load and play().
                           Give the user a way out of that wait — cancelling invalidates
                           the in-flight attempt instead of leaving a dead "requesting". */
                        <>
                          <span className="flex items-center text-xs text-[var(--color-muted)]">
                            <Loader2 className="size-4 mr-1.5 animate-spin" />
                            Requesting camera…
                          </span>
                          <Button variant="secondary" onClick={stopWebcam}>
                            <Square className="size-4 mr-1.5 text-[var(--color-danger)]" /> Stop camera
                          </Button>
                        </>
                      ) : webcamState !== "streaming" ? (
                        <Button onClick={() => void startWebcam(selectedDeviceId)}>
                          <Camera className="size-4 mr-1.5" />
                          Start camera
                        </Button>
                      ) : (
                        <>
                          <Button variant="secondary" onClick={stopWebcam}>
                            <Square className="size-4 mr-1.5 text-[var(--color-danger)]" /> Stop camera
                          </Button>
                          <Button onClick={() => void freezeAndAnalyzeSession()}>
                            <ClipboardCheck className="size-4 mr-1.5" /> Stop & analyze
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Recording length & rolling-buffer retention disclosure */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-muted)]">Recorded:</span>
                      <span className="tabular font-mono font-semibold text-[var(--color-fg)]">
                        {liveMetrics.recordedSec.toFixed(1)}s
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          liveMetrics.recordedSec >= MIN_LIVE_CLIP_SEC
                            ? "text-[var(--color-success)]"
                            : "text-[var(--color-muted)]",
                        )}
                      >
                        {liveMetrics.recordedSec >= MIN_LIVE_CLIP_SEC
                          ? `${MIN_LIVE_CLIP_SEC}s minimum met`
                          : `needs ${MIN_LIVE_CLIP_SEC}s before analysis is possible`}
                      </span>
                    </div>
                    <p className="text-[var(--color-subtle)]">
                      Only the most recent ~{WEBCAM_BUFFER_SEC.toFixed(0)}s of pose data is retained
                      ({WEBCAM_BUFFER_FRAMES} frames at {WEBCAM_TARGET_FPS} Hz). Anything recorded
                      before that is discarded and is not analysed.
                    </p>
                  </div>

                  {/* Camera fallback notice (non-blocking) */}
                  {webcamFallbackNotice && (
                    <div className="rounded-[var(--radius-md)] border border-[#fde68a] bg-[#fffbeb] p-3 text-xs text-[var(--color-warn)] flex flex-wrap items-center justify-between gap-2">
                      <p>{webcamFallbackNotice}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setWebcamFallbackNotice(null)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}

                  {/* Dual-task protocol without a walk-only baseline in this session */}
                  {taskMode === "dual" && !baselineSingle && (
                    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-muted)]">
                      <span className="font-semibold text-[var(--color-fg)]">
                        No single-task baseline recorded
                      </span>{" "}
                      — dual-task cost will be unavailable for this run. Baselines live only in the
                      current page session: run a Single-Task (Walk Only) assessment first, without
                      reloading, to get a dual-task effect.
                    </div>
                  )}

                  {/* Camera Error Fallback Banner */}
                  {webcamError && (
                    <div className="rounded-[var(--radius-md)] border border-[#fecaca] bg-[#fef2f2] p-4 text-xs text-[var(--color-danger)] space-y-2">
                      <p className="font-semibold">{webcamError}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setWebcamError(null);
                            setInputMode("file");
                          }}
                        >
                          Switch to video file
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void startWebcam(selectedDeviceId)}
                        >
                          Retry camera
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Skeleton Overlay & Video Canvas Box */}
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-[var(--color-border)]">
                    <SkeletonCanvas
                      video={videoRef.current}
                      poses={scanPoses}
                      selectedId={1}
                      personColors={WEBCAM_PERSON_COLORS}
                      showSkeleton={overlaySkeleton}
                      showJointArcs={overlayJointArcs}
                      showSwayVector={overlaySwayVector}
                    />

                    {/* Live capture status panel (restrained clinical HUD) */}
                    {webcamState === "streaming" && (
                      <div className="absolute top-3 right-3 flex flex-col gap-1.5 bg-white/95 backdrop-blur-sm p-3 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-fg)] text-xs font-mono shadow-sm pointer-events-none min-w-[170px]">
                        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-1.5 mb-0.5">
                          <span className="text-[var(--color-muted)] text-[10px] font-sans font-semibold tracking-wide">
                            Recording
                          </span>
                          <span className="size-2 rounded-full bg-[var(--color-success)] animate-pulse" />
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[var(--color-muted)]">FPS</span>
                          <span className={cn("font-semibold tabular", liveMetrics.fps >= 25 ? "text-[var(--color-fg)]" : "text-[var(--color-warn)]")}>
                            {liveMetrics.fps.toFixed(1)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[var(--color-muted)]">Recorded</span>
                          <span className="font-semibold tabular text-[var(--color-fg)]">
                            {liveMetrics.recordedSec.toFixed(1)}s
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[var(--color-muted)]">Steps</span>
                          <span className="font-semibold tabular text-[var(--color-fg)]">{liveMetrics.stepCount}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[var(--color-muted)]">Cadence</span>
                          <span className="tabular text-[var(--color-fg)]">
                            {liveMetrics.cadence != null
                              ? `${liveMetrics.cadence.toFixed(0)} spm`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[var(--color-muted)]">L / R knee</span>
                          <span className="tabular text-[var(--color-fg)]">
                            {liveMetrics.kneeAngleLeft.toFixed(0)}° / {liveMetrics.kneeAngleRight.toFixed(0)}°
                          </span>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-[var(--color-border)] pt-1 mt-0.5">
                          <span className="text-[var(--color-muted)]">Confidence</span>
                          <span className={cn("tabular font-semibold", liveMetrics.confidence >= 0.7 ? "text-[var(--color-fg)]" : "text-[var(--color-warn)]")}>
                            {(liveMetrics.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        )}

        {/* STAGE 2 — video is the product; chrome is quiet */}
        {computedStage === 2 && (
          <section role="region" aria-label="Stage 2: Process" className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-subtle)]">
                  Process
                </p>
                <h2 className="text-[1.35rem] font-semibold tracking-tight">
                  Pose tracking and subject selection
                </h2>
              </div>
              {result && (
                <Button variant="outline" size="sm" onClick={() => handleSelectStage(3)}>
                  View findings <ArrowRight className="size-3.5 ml-1" />
                </Button>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.6fr)] lg:items-start">
              <div className="flex flex-col gap-3">
                <Card className="overflow-hidden p-0 border-[var(--color-border)] shadow-none">
                  <div className="relative aspect-video bg-black">
                    {videoUrl ? (
                      <SkeletonCanvas
                        video={videoRef.current}
                        poses={
                          phase === "results" && result
                            ? scanPoses.filter((p) => p.id === selectedPersonId || scanPoses.length === 1)
                            : scanPoses
                        }
                        selectedId={selectedPersonId}
                        personColors={personColors}
                        interactive={phase === "select_person"}
                        onSelectPerson={setSelectedPersonId}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-[var(--color-subtle)]">
                        No video loaded
                      </div>
                    )}
                    {busy && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
                        <div className="mb-2 flex items-center gap-2 text-sm text-white/90">
                          <Loader2 className="size-4 animate-spin text-[var(--color-primary)]" />
                          {message}
                        </div>
                        <Progress
                          value={progress}
                          role="progressbar"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Pose estimation progress"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{fileName ?? "Video Clip"}</p>
                      <p className="text-xs text-[var(--color-subtle)]">{message || phaseLabel(phase)}</p>
                    </div>

                    {phase === "select_person" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-[var(--radius-md)] border border-[var(--color-border)] p-0.5">
                          <button
                            type="button"
                            onClick={() => setTaskMode("single")}
                            className={cn(
                              "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                              taskMode === "single"
                                ? "bg-[var(--color-surface-3)] text-[var(--color-fg)] font-semibold"
                                : "text-[var(--color-muted)]",
                            )}
                          >
                            Walk only
                          </button>
                          <button
                            type="button"
                            onClick={() => setTaskMode("dual")}
                            className={cn(
                              "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                              taskMode === "dual"
                                ? "bg-[var(--color-surface-3)] text-[var(--color-fg)] font-semibold"
                                : "text-[var(--color-muted)]",
                            )}
                          >
                            Walk + cognitive
                          </button>
                        </div>
                        <Button onClick={() => void runAnalysis()} disabled={selectedPersonId === null}>
                          <Play className="size-4" />
                          Analyze Selected Person
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Candidate Selection Chips */}
                {people.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Select Subject Person</span>
                        <Badge tone="neutral">{people.length} Candidate{people.length > 1 ? "s" : ""}</Badge>
                      </CardTitle>
                      <CardDescription>
                        {people.length > 1
                          ? "Multiple candidates detected — click a chip below or the bounding box in video."
                          : "Primary subject locked for kinematic extraction."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent role="listbox" aria-label="Candidate subject persons" className="flex flex-wrap gap-2">
                      {people.map((p, i) => (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected={selectedPersonId === p.id}
                          aria-label={`Select Person ${i + 1}`}
                          onClick={() => setSelectedPersonId(p.id)}
                          className={cn(
                            "flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                            selectedPersonId === p.id
                              ? "border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_12%,var(--color-surface))] font-semibold"
                              : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]",
                          )}
                        >
                          <span
                            className="size-2.5 rounded-full"
                            style={{ background: p.color || PERSON_COLORS[i % PERSON_COLORS.length] }}
                          />
                          Person {i + 1}
                          <Badge tone="neutral" className="ml-1">
                            {p.frameCount} hits
                          </Badge>
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {error && (
                  <Card className="border-[color-mix(in_oklab,var(--color-danger)_45%,var(--color-border))]">
                    <CardContent className="space-y-3 p-5">
                      <p className="text-sm text-[var(--color-danger)]">{error}</p>
                      <Button variant="secondary" onClick={resetAll}>
                        Try another video
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Status & Processing Explanation Card */}
              <aside aria-label="Processing status and guidelines" className="lg:sticky lg:top-28">
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-5">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-subtle)]">
                      Status
                    </p>
                    <p className="mt-1.5 text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
                      {message || phaseLabel(phase)}
                    </p>
                  </div>
                  <dl className="space-y-2.5 text-[12px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--color-muted)]">Model</dt>
                      <dd className="font-medium text-[var(--color-fg)]">MediaPipe Pose</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--color-muted)]">Sampling</dt>
                      <dd className="font-medium text-[var(--color-fg)]">30 Hz grid</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--color-muted)]">Filter</dt>
                      <dd className="font-medium text-[var(--color-fg)]">Butterworth 6 Hz</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--color-muted)]">Events</dt>
                      <dd className="font-medium text-[var(--color-fg)]">Zeni kinematic</dd>
                    </div>
                  </dl>
                  <div className="border-t border-[var(--color-border)] pt-4 text-[12px] leading-relaxed text-[var(--color-muted)] space-y-2">
                    <p className="font-medium text-[var(--color-fg)]">Capture tips</p>
                    <ul className="list-disc space-y-1.5 pl-4">
                      <li>Full body from ankles to shoulders.</li>
                      <li>Hold a consistent camera angle.</li>
                      <li>
                        Prefer ~{ANALYSIS_WINDOW_SEC}s continuous walking for cleaner variability.
                      </li>
                    </ul>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        )}

        {/* STAGE 3 — true workstation: sticky video | findings */}
        {computedStage === 3 && result && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-subtle)]">
                  Analyze
                </p>
                <h2 className="text-[1.35rem] font-semibold tracking-tight">
                  Session findings
                </h2>
                <p className="text-[13px] text-[var(--color-muted)] max-w-xl">
                  {result.metrics.overallScore >= 65
                    ? `Overall ${Math.round(result.metrics.overallScore)}/100 · generally favorable mechanics`
                    : `Overall ${Math.round(result.metrics.overallScore)}/100 · review domains below`}
                  {" · "}
                  Cadence {result.metrics.cadenceSpm.toFixed(0)} spm · SA{" "}
                  {result.metrics.symmetryAngle != null
                    ? `${result.metrics.symmetryAngle.toFixed(1)}%`
                    : "N/A"}{" "}
                  · CV{" "}
                  {(result.metrics.stepTimeCV * 100).toFixed(1)}%
                </p>
                <p className="text-[11px] text-[var(--color-subtle)]">
                  Research / educational output · Not a medical device · Not a diagnosis
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-1 hidden flex-wrap gap-1.5 sm:flex">
                  <Badge tone="neutral" className="tabular capitalize">
                    {result.metrics.viewAngle || "view unknown"}
                  </Badge>
                  <Badge tone="neutral" className="tabular">
                    {result.metrics.stepCount} steps
                  </Badge>
                  <Badge tone="neutral" className="tabular">
                    ~{Math.floor(result.metrics.stepCount / 2)} strides
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSaveSession()}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : saveSuccess ? (
                    <Check className="size-4 text-[var(--color-success)]" />
                  ) : (
                    <Bookmark className="size-4" />
                  )}
                  {saveSuccess ? "Saved" : "Save session"}
                </Button>
                {saveError && (
                  <p
                    role="alert"
                    className="max-w-xs text-[12px] leading-snug text-[var(--color-danger)]"
                  >
                    {saveError}
                  </p>
                )}
                <Button size="sm" onClick={() => handleSelectStage(4)}>
                  Open report <ArrowRight className="size-3.5 ml-1.5" />
                </Button>
              </div>
            </div>

            {/* Underline tabs — not a boxed control strip */}
            <div
              role="tablist"
              aria-label="Analysis tabs"
              className="flex gap-0 border-b border-[var(--color-border)]"
            >
              <TabBtn active={tab === "clusters"} onClick={() => setTab("clusters")}>
                Findings
              </TabBtn>
              <TabBtn active={tab === "guesses"} onClick={() => setTab("guesses")}>
                Hypotheses
              </TabBtn>
              <TabBtn active={tab === "metrics"} onClick={() => setTab("metrics")}>
                Charts
              </TabBtn>
              <TabBtn active={tab === "guide"} onClick={() => setTab("guide")}>
                Guide
              </TabBtn>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
              {/* Sticky video column */}
              <section
                aria-label="Video Canvas Viewer and Playback Controls"
                className="flex flex-col gap-3 lg:sticky lg:top-28"
              >
                <Card className="overflow-hidden p-0 border-[var(--color-border)] shadow-none">
                  <div className="relative aspect-video bg-black">
                    <SkeletonCanvas
                      video={videoRef.current}
                      poses={scanPoses.filter((p) => p.id === selectedPersonId || scanPoses.length === 1)}
                      selectedId={selectedPersonId}
                      personColors={personColors}
                      interactive={false}
                      showSkeleton={overlaySkeleton}
                      showJointArcs={overlayJointArcs}
                      showSwayVector={overlaySwayVector}
                    />
                  </div>

                  {/* Interactive Frame Scrubber & Timeline */}
                  <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={togglePlay} aria-label={isPlaying ? "Pause video" : "Play video"} className="h-8 px-2.5">
                        {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => stepFrame(-1)} aria-label="Step back 1 frame" className="h-8 px-2 text-xs">
                        <SkipBack className="size-3 mr-1" /> -1f
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => stepFrame(1)} aria-label="Step forward 1 frame" className="h-8 px-2 text-xs">
                        +1f <SkipForward className="size-3 ml-1" />
                      </Button>
                      <input
                        type="range"
                        role="slider"
                        aria-label="Video timeline scrubber"
                        aria-valuenow={currentTime}
                        aria-valuemin={0}
                        aria-valuemax={duration || 1}
                        aria-valuetext={`${formatTimecode(currentTime)} of ${formatTimecode(duration)}`}
                        min={0}
                        max={duration || 1}
                        step={0.033}
                        value={currentTime}
                        onChange={(e) => seekToTime(parseFloat(e.target.value))}
                        className="flex-1 accent-[var(--color-primary)] cursor-pointer h-1.5 bg-[var(--color-border)] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                      />
                      <span className="tabular text-xs font-mono text-[var(--color-subtle)] min-w-[110px] text-right">
                        {formatTimecode(currentTime)} / {formatTimecode(duration)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--color-border)] text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[var(--color-fg)]">{fileName ?? "Video Clip"}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => void runAnalysis()} className="h-7 text-xs">
                        Re-run Analysis
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Person Track Selector Chips */}
                {people.length > 0 && (
                  <Card className="border-[var(--color-border)]">
                    <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Users className="size-4 text-[var(--color-muted)]" />
                        <span className="text-xs font-semibold text-[var(--color-fg)]">Person Track Selector:</span>
                      </div>
                      <div role="listbox" aria-label="Person tracks" className="flex flex-wrap gap-2">
                        {people.map((p, i) => (
                          <button
                            key={p.id}
                            type="button"
                            role="option"
                            aria-selected={selectedPersonId === p.id}
                            aria-label={`Select Person track ${i + 1}`}
                            onClick={() => {
                              setSelectedPersonId(p.id);
                              void runAnalysis();
                            }}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full px-3 py-1 border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                              selectedPersonId === p.id
                                ? "border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_15%,transparent)] font-semibold text-[var(--color-fg)]"
                                : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-fg)]",
                            )}
                          >
                            <span
                              className="size-2 rounded-full"
                              style={{ background: p.color || PERSON_COLORS[i % PERSON_COLORS.length] }}
                            />
                            Person {i + 1}
                            <Badge tone="neutral" className="text-[10px] px-1 py-0 h-4">
                              {p.frameCount} hits
                            </Badge>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Canvas Overlay Checkboxes */}
                <Card className="border-[var(--color-border)]">
                  <CardContent className="p-3 flex flex-wrap items-center justify-between gap-4">
                    <span className="text-xs font-semibold text-[var(--color-fg)] flex items-center gap-1.5">
                      <Sliders className="size-3.5 text-[var(--color-muted)]" /> Canvas Overlays:
                    </span>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-[var(--color-fg)]">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={overlaySkeleton}
                          onChange={(e) => setOverlaySkeleton(e.target.checked)}
                          aria-label="Toggle skeleton overlay"
                          className="rounded border-[var(--color-border)] accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        />
                        Skeleton
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={overlayJointArcs}
                          onChange={(e) => setOverlayJointArcs(e.target.checked)}
                          aria-label="Toggle joint arcs overlay"
                          className="rounded border-[var(--color-border)] accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        />
                        Joint Arcs
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={overlaySwayVector}
                          onChange={(e) => setOverlaySwayVector(e.target.checked)}
                          aria-label="Toggle sway vector overlay"
                          className="rounded border-[var(--color-border)] accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        />
                        Sway Vector
                      </label>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Findings column */}
              <section aria-label="Findings and domain metrics" className="flex min-w-0 flex-col gap-4">
                {/* Compact domain strip — not a second hero card */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <ScoreRing score={Math.round(result.metrics.overallScore)} label="Overall" size={52} />
                    <div>
                      <p className="text-[12px] font-medium text-[var(--color-muted)]">Domain indices</p>
                      <p className="text-[11px] text-[var(--color-subtle)]">Exploratory · non-diagnostic</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                      <Badge tone={result.metrics.mobilityScore >= 70 ? "success" : result.metrics.mobilityScore >= 50 ? "neutral" : "info"}>
                        Pace: {Math.round(result.metrics.mobilityScore)}/100
                      </Badge>
                      <Badge tone={result.metrics.symmetryScore >= 70 ? "success" : result.metrics.symmetryScore >= 50 ? "neutral" : "info"}>
                        Symmetry: {Math.round(result.metrics.symmetryScore)}/100
                      </Badge>
                      <Badge tone={result.metrics.stabilityScore >= 70 ? "success" : result.metrics.stabilityScore >= 50 ? "neutral" : "info"}>
                        Stability: {Math.round(result.metrics.stabilityScore)}/100
                      </Badge>
                      {(() => {
                        // One canonical value for both the tone and the number. analysis.ts
                        // defines cadenceCostPct = -cadenceDTE, so reading the badge tone
                        // from one and the label from the other let them disagree in sign.
                        const cadenceDte = result.dualTaskCost
                          ? resolveDteValues(result.dualTaskCost).cadenceDte
                          : null;
                        return (
                          <Badge
                            tone={
                              cadenceDte != null
                                ? Math.abs(cadenceDte) < 5
                                  ? "success"
                                  : "warn"
                                : "neutral"
                            }
                          >
                            Dual-Task:{" "}
                            {cadenceDte != null
                              ? `${cadenceDte.toFixed(1)}%`
                              : result.taskMode === "dual"
                                ? "unavailable"
                                : "Baseline"}
                          </Badge>
                        );
                      })()}
                  </div>
                </div>

                {/* A dual-task run with no paired single-task baseline yields no DTE.
                    Say so explicitly instead of leaving the reader with a bare badge. */}
                {result.taskMode === "dual" && !result.dualTaskCost && (
                  <Card className="border-[color-mix(in_oklab,var(--color-warn,var(--color-danger))_35%,var(--color-border))]">
                    <CardContent className="p-4 text-xs leading-relaxed text-[var(--color-muted)]">
                      <p className="text-sm font-semibold text-[var(--color-fg)]">
                        No single-task baseline recorded — dual-task cost unavailable
                      </p>
                      <p className="mt-1">
                        Dual-task effect is a comparison, so it cannot be computed from this run
                        alone. The metrics below describe the walk under cognitive load only; they
                        are not a measure of interference. Baselines are held in the current page
                        session only, so a reload clears them. Run a Single-Task (Walk Only)
                        assessment and then repeat the dual-task walk without reloading.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Tab Content Output */}
                {tab === "clusters" ? (
                  <CognitiveClusters
                    metrics={result.metrics}
                    dualTaskCost={result.dualTaskCost}
                    angleAnalysis={result.angleAnalysis}
                  />
                ) : tab === "guesses" ? (
                  <GuessesPanel guesses={result.guesses} dualTaskCost={result.dualTaskCost} />
                ) : tab === "metrics" ? (
                  <MetricsPanel metrics={result.metrics} />
                ) : (
                  <GuidePanel />
                )}
              </section>
            </div>
          </div>
        )}

        {/* STAGE 4 — document is the only surface */}
        {(computedStage === 4 || (phase === "results" && tab === "report" && computedStage !== 1 && computedStage !== 2 && computedStage !== 3)) && result && (
          <section
            role="region"
            aria-label="Stage 4: Export Report & Documentation"
            className="mx-auto w-full max-w-3xl space-y-6"
          >
            <div className="flex items-end justify-between gap-4 no-print print:hidden">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-subtle)]">
                  Report
                </p>
                <h2 className="text-[1.35rem] font-semibold tracking-tight">
                  Clinical summary & export
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleSelectStage(3)}>
                Back to findings
              </Button>
            </div>

            <ReportPanel
              result={result}
              patientMeta={patientMeta}
              onUpdateMeta={handleUpdateMeta}
            />
          </section>
        )}
          </>
        )}
      </main>

      <footer className="no-print print:hidden px-5 pb-10 pt-4 text-center text-[11px] text-[var(--color-subtle)] sm:px-8">
        Gait Lab · Research / educational spatio-temporal analysis · Not a medical device
      </footer>

      <SessionHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onLoadSession={(loadedResult, name, sessionId?: string) => {
          setResult(loadedResult);
          // A loaded session carries numbers only — no video and no pose frames. Anything
          // still on screen belongs to the previously analysed clip, so it must go, or the
          // stage-2 canvas paints clip A's skeleton beside session B's metrics.
          //
          // Clearing videoUrl state is NOT enough: the <video> element is permanently
          // mounted and its source is assigned imperatively (video.src = url), so state
          // alone leaves clip A decoded in the element. Stage 3 draws that element
          // directly via SkeletonCanvas, and the transport controls drive it. Tear the
          // element down explicitly, and do it BEFORE revoking the blob URL so the
          // element is not still holding a revoked source.
          const vid = videoRef.current;
          if (vid) {
            vid.pause();
            vid.removeAttribute("src");
            vid.srcObject = null;
            vid.load();
          }
          if (videoUrl) URL.revokeObjectURL(videoUrl);
          setVideoUrl(null);
          setCurrentTime(0);
          setDuration(0);
          setIsPlaying(false);
          // Invalidate any in-flight file analysis: without this its completion handler
          // lands after the load and overwrites the session the user just opened.
          abortRef.current++;
          stopWebcam();
          setScanPoses([]);
          setPeople([]);
          setSelectedPersonId(null);
          setSaveError(null);
          // Re-saving a loaded session must update its row, not clone it. The drawer
          // does not pass the row id yet; until it does this falls back to null and a
          // re-save creates a new row (the pre-existing behaviour).
          setCurrentSessionId(sessionId ?? null);
          if (loadedResult.patientMeta) {
            setPatientMeta(loadedResult.patientMeta);
          }
          setPhase("results");
          setTab("report");
          setActiveStage(4);
          if (name) setFileName(name);
          setViewMode("workflow");
        }}
        onCompareSessions={(sessionA, sessionB) => {
          setCompareSessionA(sessionA);
          setCompareSessionB(sessionB);
          setViewMode("comparison");
        }}
      />
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative -mb-px px-4 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
        active
          ? "text-[var(--color-fg)]"
          : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
      )}
    >
      {children}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--color-fg)]"
        />
      ) : null}
    </button>
  );
}

function phaseLabel(phase: Phase) {
  switch (phase) {
    case "loading_model":
      return "Loading model";
    case "scanning":
      return "Scanning";
    case "select_person":
      return "Select a person";
    case "analyzing":
      return "Analyzing gait";
    case "results":
      return "Results ready";
    case "error":
      return "Error";
    default:
      return "";
  }
}

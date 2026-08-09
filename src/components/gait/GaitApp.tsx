"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type DragEvent } from "react";
import {
  ArrowRight,
  Bookmark,
  Check,
  Upload,
  UserRound,
  Film,
  Loader2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  Users,
  BarChart3,
  Lightbulb,
  BookOpen,
  Activity,
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
import { WorkflowHeader, type WorkflowStage } from "./WorkflowHeader";
import { computeDualTaskCost, computeGaitMetrics, matchPeople, tracksToPeople } from "@/lib/gait/analysis";
import { buildEducatedGuesses } from "@/lib/gait/guesses";
import { PERSON_COLORS, boundingBox } from "@/lib/gait/landmarks";
import { saveGaitSession } from "@/lib/gait/persistence";
import {
  getPoseLandmarker,
  resamplePoseFrames,
  seekAndDetect,
  toLandmarks,
  waitForVideoData,
  waitForVideoMetadata,
  type PoseLandmarkerLike,
} from "@/lib/gait/pose";
import type {
  AnalysisResult,
  GaitMetrics,
  Landmark,
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
  const [activeStage, setActiveStage] = useState<WorkflowStage | null>(null);

  const [overlaySkeleton, setOverlaySkeleton] = useState(true);
  const [overlayJointArcs, setOverlayJointArcs] = useState(true);
  const [overlaySwayVector, setOverlaySwayVector] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

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

  const resetAll = useCallback(() => {
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
    setTab("report");
    setTaskMode("single");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [videoUrl]);

  const ensureModel = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    setPhase("loading_model");
    setMessage("Loading pose model (first time may take a few seconds)…");
    setProgress(8);
    const lm = await getPoseLandmarker();
    landmarkerRef.current = lm;
    return lm;
  }, []);

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
      const WINDOW_TARGET_SEC = 20;
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
      const analysis: AnalysisResult = {
        metrics,
        guesses,
        personId: selectedPersonId,
        analyzedFrames: frames.length,
        taskMode,
        dualTaskCost,
        notes: [
          `Analyzed ${frames.length} uniform 30Hz frames over ${metrics.durationSec.toFixed(1)}s`,
          `Effective sample rate ~${(((metrics as Record<string, unknown>).samplingFps as number) ?? metrics.fpsEffective).toFixed(1)} fps`,
          `View angle estimate: ${metrics.viewAngle}`,
          `Task mode: ${taskMode === "dual" ? "walk + cognitive" : "walk only"}`,
          dualTaskCost
            ? `Dual-task cadence DTE ${dualTaskCost.cadenceDTE?.toFixed(1)}% (${dualTaskCost.cmiClassification})`
            : taskMode === "single"
              ? "Saved as walk-only baseline for dual-task pairing"
              : "No walk-only baseline in session yet",
        ],
      };
      setResult(analysis);
      setProgress(100);
      setPhase("results");
      setMessage("Analysis complete");
      setTab("clusters");
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("error");
    }
  }, [selectedPersonId, people, taskMode, baselineSingle]);

  const handleSaveSession = useCallback(async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      const sessionName = fileName ? fileName.replace(/\.[^/.]+$/, "") : "Gait Session";
      await saveGaitSession({
        data: {
          sessionName,
          result,
        },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error("Failed to save session:", e);
    } finally {
      setIsSaving(false);
    }
  }, [result, fileName]);

  const handleSelectStage = useCallback(
    (stage: WorkflowStage) => {
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
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />

      {/* Sticky Semantic Workflow Header */}
      <WorkflowHeader
        currentStage={computedStage}
        onSelectStage={handleSelectStage}
        hasResults={Boolean(result)}
        onReset={resetAll}
        onOpenHistory={() => setIsHistoryOpen(true)}
        fileName={fileName}
      />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-[calc(var(--grok-banner-h,0px)+1.25rem)] sm:px-6">
        {/* Hidden / active video element */}
        <video
          ref={videoRef}
          className="pointer-events-none fixed h-px w-px opacity-0"
          playsInline
          muted
          preload="auto"
        />

        {/* STAGE 1 VIEW: Input & Sample Selection */}
        {computedStage === 1 && (
          <section role="region" aria-label="Stage 1: Input and Sample Selection" className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge tone="primary">Stage 1 of 4</Badge>
                <span className="text-xs text-[var(--color-muted)] font-medium">
                  Input & Sample Selection
                </span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Walking Video Ingestion & Clinical Benchmark Selection
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">
                Upload a video clip of a patient walking or choose a standard clinical sample. The system detects people, isolates the subject, and derives spatio-temporal gait metrics.
              </p>
            </div>

            {/* Protocol Selection Toggle */}
            <Card className="border-[var(--color-border)] bg-[var(--color-surface)]">
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5">
                <div>
                  <h3 className="text-sm font-semibold">Assessment Protocol Mode</h3>
                  <p className="text-xs text-[var(--color-muted)]">
                    Choose between standard single-task walk or dual-task cognitive interference protocol
                  </p>
                </div>
                <div className="flex rounded-[var(--radius-md)] border border-[var(--color-border)] p-1 bg-[var(--color-surface-2)]">
                  <button
                    type="button"
                    onClick={() => setTaskMode("single")}
                    className={cn(
                      "rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                      taskMode === "single"
                        ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] font-semibold shadow-xs"
                        : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
                    )}
                  >
                    Single-Task (Walk Only)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskMode("dual")}
                    className={cn(
                      "rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                      taskMode === "dual"
                        ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] font-semibold shadow-xs"
                        : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
                    )}
                  >
                    Dual-Task (Walk + Cognitive)
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Video Dropzone */}
            <Card
              className={cn(
                "border-dashed transition-colors",
                dragOver && "border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_8%,var(--color-surface))]",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <CardContent className="flex flex-col items-center gap-5 px-6 py-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                  <Upload className="size-6 text-[var(--color-primary)]" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">Drop walking video file here</h2>
                  <p className="mx-auto max-w-md text-sm text-[var(--color-muted)]">
                    MP4, WebM, or MOV formats supported. 5–15 seconds of continuous walking produces optimal spatio-temporal reliability.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    size="lg"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Film className="size-4" />
                    Browse Video File
                  </Button>
                </div>
                <ul className="mt-2 grid w-full max-w-lg gap-2 text-left text-xs text-[var(--color-subtle)] sm:grid-cols-3">
                  <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                    <Users className="mb-1.5 size-3.5 text-[var(--color-accent)]" />
                    Multi-person tracking & candidate selection
                  </li>
                  <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                    <UserRound className="mb-1.5 size-3.5 text-[var(--color-accent)]" />
                    Sagittal & Frontal camera angle adaptation
                  </li>
                  <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                    <Sparkles className="mb-1.5 size-3.5 text-[var(--color-accent)]" />
                    Zeni kinematic event detection & ratings
                  </li>
                </ul>
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

            {/* Pre-Validated Benchmark Sample Picker */}
            <SamplePicker
              onSelectSample={processFile}
              onCustomUploadClick={() => fileRef.current?.click()}
              isLoading={false}
            />
          </section>
        )}

        {/* STAGE 2 VIEW: Video Processing & Subject Tracking */}
        {computedStage === 2 && (
          <section role="region" aria-label="Stage 2: Video Processing and Tracking" className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="primary">Stage 2 of 4</Badge>
                  <span className="text-xs text-[var(--color-muted)] font-medium">
                    Video Processing & Tracking
                  </span>
                </div>
                <h2 className="text-xl font-semibold tracking-tight mt-1">
                  Pose Estimation & Subject Identification
                </h2>
              </div>
              {result && (
                <Button variant="secondary" size="sm" onClick={() => handleSelectStage(3)}>
                  View Insights <ArrowRight className="size-3.5 ml-1" />
                </Button>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="flex flex-col gap-4">
                <Card className="overflow-hidden p-0 border-[var(--color-border)]">
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
              <aside aria-label="Stage 2 Telemetry & Processing Rules" className="flex flex-col gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Stage 2 Telemetry & Status</CardTitle>
                    <CardDescription>MediaPipe Pose WASM pipeline execution</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-[var(--color-muted)]">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>Model Pipeline</span>
                        <span className="font-semibold text-[var(--color-fg)]">MediaPipe Tasks Vision</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Sampling Target</span>
                        <span className="font-semibold text-[var(--color-fg)]">30 Hz Uniform Grid</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Filter Configuration</span>
                        <span className="font-semibold text-[var(--color-fg)]">4th-Order Butterworth (6 Hz)</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Event Engine</span>
                        <span className="font-semibold text-[var(--color-fg)]">Zeni Kinematic AP Algorithm</span>
                      </div>
                    </div>

                    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs leading-relaxed text-[var(--color-subtle)] space-y-1">
                      <p className="font-semibold text-[var(--color-fg)]">Processing Rules:</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Ensure full-body visibility from ankles to shoulders.</li>
                        <li>Maintain consistent camera perspective during clip.</li>
                        <li>Continuous 10–12s window sampling ensures maximum split-half reliability.</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </section>
        )}

        {/* STAGE 3 VIEW: Clinical Insights & Domain Scores (Dual-Pane Workstation Layout) */}
        {computedStage === 3 && result && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="primary">Stage 3 of 4</Badge>
                  <span className="text-xs text-[var(--color-muted)] font-medium">
                    Clinical Insights & Workstation
                  </span>
                </div>
                <h2 className="text-xl font-semibold tracking-tight mt-1">
                  Quantitative Gait Telemetry & Workstation
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
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
                  {saveSuccess ? "Saved!" : "Save Session"}
                </Button>
                <Button size="sm" onClick={() => handleSelectStage(4)}>
                  Export / Share Report <ArrowRight className="size-3.5 ml-1.5" />
                </Button>
              </div>
            </div>

            {/* Stage 3 Sub-Navigation Tabs */}
            <div role="tablist" aria-label="Clinical Workstation Tabs" className="flex flex-wrap gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
              <TabBtn active={tab === "clusters"} onClick={() => setTab("clusters")}>
                <Activity className="size-3.5 mr-1.5 inline-block" />
                Cognitive Clusters
              </TabBtn>
              <TabBtn active={tab === "guesses"} onClick={() => setTab("guesses")}>
                <Lightbulb className="size-3.5 mr-1.5 inline-block" />
                Guesses & Hypotheses
              </TabBtn>
              <TabBtn active={tab === "metrics"} onClick={() => setTab("metrics")}>
                <BarChart3 className="size-3.5 mr-1.5 inline-block" />
                Kinematic Charts & CIs
              </TabBtn>
              <TabBtn active={tab === "guide"} onClick={() => setTab("guide")}>
                <BookOpen className="size-3.5 mr-1.5 inline-block" />
                Clinical Guide
              </TabBtn>
            </div>

            {/* Stage 3 Dual-Pane Workstation Grid (~50% Left / ~50% Right on desktop) */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Left Pane (~50% width): 16:9 Video Canvas Viewer, Frame Scrubber, Person chips, Overlay checkboxes */}
              <section aria-label="Video Canvas Viewer and Playback Controls" className="flex flex-col gap-4">
                <Card className="overflow-hidden p-0 border-[var(--color-border)]">
                  {/* 16:9 Video Canvas Viewer */}
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

              {/* Right Pane (~50% width): Sticky Headline Clinical Status Bar & CognitiveClusters Accordion */}
              <section aria-label="Clinical Insights and Detailed Domain Metrics" className="flex flex-col gap-4">
                {/* Sticky Headline Clinical Status Bar */}
                <Card className="border-[var(--color-border)] sticky top-16 z-10 shadow-xs bg-[var(--color-surface)]">
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <ScoreRing score={Math.round(result.metrics.overallScore)} label="Overall Score" size={64} />
                      <div>
                        <h3 className="text-sm font-bold tracking-tight text-[var(--color-fg)]">Clinical Status Summary</h3>
                        <p className="text-xs text-[var(--color-muted)]">
                          {result.metrics.overallScore >= 65 ? "Favorable overall mechanics" : "Watch areas detected"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={result.metrics.mobilityScore >= 70 ? "success" : result.metrics.mobilityScore >= 50 ? "warn" : "danger"}>
                        Pace: {Math.round(result.metrics.mobilityScore)}/100
                      </Badge>
                      <Badge tone={result.metrics.symmetryScore >= 70 ? "success" : result.metrics.symmetryScore >= 50 ? "warn" : "danger"}>
                        Symmetry: {Math.round(result.metrics.symmetryScore)}/100
                      </Badge>
                      <Badge tone={result.metrics.stabilityScore >= 70 ? "success" : result.metrics.stabilityScore >= 50 ? "warn" : "danger"}>
                        Stability: {Math.round(result.metrics.stabilityScore)}/100
                      </Badge>
                      <Badge tone={result.dualTaskCost ? (Math.abs(result.dualTaskCost.cadenceCostPct) < 5 ? "success" : "warn") : "neutral"}>
                        Dual-Task: {result.dualTaskCost ? `${result.dualTaskCost.cadenceDTE != null ? result.dualTaskCost.cadenceDTE.toFixed(1) : result.dualTaskCost.cadenceCostPct.toFixed(1)}%` : "Baseline"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Tab Content Output */}
                {tab === "clusters" ? (
                  <CognitiveClusters metrics={result.metrics} dualTaskCost={result.dualTaskCost} />
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

        {/* STAGE 4 VIEW: Export / Share Report */}
        {(computedStage === 4 || (phase === "results" && tab === "report" && computedStage !== 1 && computedStage !== 2 && computedStage !== 3)) && result && (
          <section role="region" aria-label="Stage 4: Export Report & Documentation" className="space-y-6">
            <div className="flex items-center justify-between gap-4 no-print print:hidden">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="success">Stage 4 of 4</Badge>
                  <span className="text-xs text-[var(--color-muted)] font-medium">
                    Export Report & Documentation
                  </span>
                </div>
                <h2 className="text-xl font-semibold tracking-tight mt-1">
                  Clinical Summary & PDF Sign-Off
                </h2>
              </div>
              <Button variant="secondary" size="sm" onClick={() => handleSelectStage(3)}>
                Back to Stage 3 Telemetry
              </Button>
            </div>

            {/* Report Panel (Includes Patient Metadata, Radar Chart, Perry & Burnfield Curves, PDF Export) */}
            <ReportPanel result={result} />
          </section>
        )}
      </main>

      <footer className="border-t border-[var(--color-border)] pt-6 text-center text-xs text-[var(--color-subtle)] pb-8 no-print print:hidden">
        Gait Lab · Quantitative Browser Pose Gait Analysis · Not a medical device
      </footer>

      <SessionHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onLoadSession={(loadedResult, name) => {
          setResult(loadedResult);
          setPhase("results");
          setTab("report");
          setActiveStage(4);
          if (name) setFileName(name);
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
        "flex-1 rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
        active
          ? "bg-[var(--color-surface-2)] text-[var(--color-fg)] font-semibold shadow-xs"
          : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
      )}
    >
      {children}
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

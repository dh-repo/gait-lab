"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type DragEvent } from "react";
import {
  Activity,
  Upload,
  UserRound,
  Film,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Users,
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
import { computeDualTaskCost, computeGaitMetrics, matchPeople, tracksToPeople } from "@/lib/gait/analysis";
import { buildEducatedGuesses } from "@/lib/gait/guesses";
import { PERSON_COLORS, boundingBox } from "@/lib/gait/landmarks";
import {
  getPoseLandmarker,
  seekAndDetect,
  seekVideo,
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

type Tab = "report" | "guesses" | "metrics" | "guide";

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

  const personColors = useMemo(() => {
    const map: Record<number, string> = {};
    people.forEach((p, i) => {
      map[p.id] = p.color || PERSON_COLORS[i % PERSON_COLORS.length];
    });
    return map;
  }, [people]);

  useEffect(() => {
    return () => {
      // Only revoke blob URL on change/unmount — do not bump abortRef here
      // or an in-flight processFile started for the new URL gets cancelled.
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    return () => {
      abortRef.current++;
    };
  }, []);

  const resetAll = useCallback(() => {
    abortRef.current++;
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
    // keep baselineSingle across "new video" so dual-task pairing works in-session
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
        // Keep best single-frame detections across the whole clip as fallback
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
            ? `Found ${found.length} people — Person 1 is the best primary-track guess (largest/most persistent). Confirm or switch.`
            : "Person found — confirm and run analysis",
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
      setPhase("analyzing");
      setMessage("Extracting gait kinematics…");
      setProgress(55);
      setResult(null);

      const duration = video.duration || 1;
      // denser sampling for analysis
      const targetFps = duration > 25 ? 7 : duration > 15 ? 8 : 10;
      const sampleCount = Math.min(100, Math.max(24, Math.floor(duration * targetFps)));
      const frames: PoseFrame[] = [];

      // Maintain tracking to stick to selected person
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
        const t = (i / Math.max(1, sampleCount - 1)) * Math.max(0, duration - 0.05);
        const res = await seekAndDetect(landmarker, video, t);
        const dets = (res.landmarks || []).map(toLandmarks);
        if (!dets.length) {
          setProgress(55 + Math.round((i / sampleCount) * 40));
          continue;
        }

        // Stick to selected subject: nearest hip within gate, break ties by size.
        // Prevents swapping onto other shoppers mid-aisle.
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
            if (d > 0.2) continue; // too far → different person
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
          // lost track this frame — skip rather than latch onto someone else
          setProgress(55 + Math.round((i / sampleCount) * 40));
          continue;
        }

        const lm = dets[best];
        lastHip = {
          x: (lm[23].x + lm[24].x) / 2,
          y: (lm[23].y + lm[24].y) / 2,
          z: 0,
        };
        frames.push({ timeMs: t * 1000, landmarks: lm });
        setScanPoses([{ id: selectedPersonId, landmarks: lm }]);
        setProgress(55 + Math.round((i / sampleCount) * 40));
      }

      if (frames.length < 8) {
        throw new Error(
          "Not enough pose frames for the selected person. Try a longer clip or better lighting.",
        );
      }

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
          `Analyzed ${frames.length} frames over ${metrics.durationSec.toFixed(1)}s`,
          `Effective sample rate ~${metrics.fpsEffective.toFixed(1)} fps`,
          `View angle estimate: ${metrics.viewAngle}`,
          `Task mode: ${taskMode === "dual" ? "walk + cognitive" : "walk only"}`,
          dualTaskCost
            ? `Dual-task cadence cost ${dualTaskCost.cadenceCostPct.toFixed(0)}%`
            : taskMode === "single"
              ? "Saved as walk-only baseline for dual-task pairing"
              : "No walk-only baseline in session yet",
        ],
      };
      setResult(analysis);
      setProgress(100);
      setPhase("results");
      setMessage("Analysis complete");
      setTab("report");
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("error");
    }
  }, [selectedPersonId, people, taskMode, baselineSingle]);

  const loadSample = useCallback(async () => {
    try {
      setMessage("Loading sample video…");
      const res = await fetch("/sample-walk.mp4");
      if (!res.ok) throw new Error("Sample video missing");
      const blob = await res.blob();
      const file = new File([blob], "sample-store-walk.mp4", { type: "video/mp4" });
      await processFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sample");
      setPhase("error");
    }
  }, [processFile]);

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
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-[calc(var(--grok-banner-h,0px)+1.25rem)] sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[var(--color-primary)]">
              <Activity className="size-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em]">
                Gait Lab
              </span>
            </div>
            <h1 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Walking video analysis
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--color-muted)] sm:text-base">
              Upload a clip of someone walking. The app detects people, lets you pick one,
              adapts to camera angle, and estimates gait, stability, and related patterns —
              then offers several <em>educated guesses</em> with clear uncertainty.
            </p>
          </div>
          {(phase !== "idle" || videoUrl) && (
            <Button variant="secondary" onClick={resetAll} className="shrink-0 self-start">
              <RotateCcw className="size-4" />
              New video
            </Button>
          )}
        </header>

        {/* Upload */}
        {phase === "idle" && (
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
            <CardContent className="flex flex-col items-center gap-5 px-6 py-14 text-center">
              <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                <Upload className="size-6 text-[var(--color-primary)]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Drop a walking video</h2>
                <p className="mx-auto max-w-md text-sm text-[var(--color-muted)]">
                  MP4, WebM, or MOV works best. Prefer a continuous walk with the full body
                  visible — side or front views both supported.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  size="lg"
                  onClick={() => fileRef.current?.click()}
                >
                  <Film className="size-4" />
                  Choose video
                </Button>
                <Button size="lg" variant="secondary" onClick={() => void loadSample()}>
                  <Play className="size-4" />
                  Try sample store walk
                </Button>
              </div>
              <ul className="mt-2 grid w-full max-w-lg gap-2 text-left text-xs text-[var(--color-subtle)] sm:grid-cols-3">
                <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                  <Users className="mb-1.5 size-3.5 text-[var(--color-accent)]" />
                  Multi-person: pick who to analyze
                </li>
                <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                  <UserRound className="mb-1.5 size-3.5 text-[var(--color-accent)]" />
                  Angle-aware: frontal / side / oblique
                </li>
                <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                  <Sparkles className="mb-1.5 size-3.5 text-[var(--color-accent)]" />
                  Gait metrics + educated guesses
                </li>
              </ul>
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void processFile(f);
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Hidden / active video element */}
        <video
          ref={videoRef}
          className="pointer-events-none fixed h-px w-px opacity-0"
          playsInline
          muted
          preload="auto"
        />

        {/* Working area */}
        {phase !== "idle" && (
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="flex flex-col gap-4">
              <Card className="overflow-hidden p-0">
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
                      No video
                    </div>
                  )}
                  {busy && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
                      <div className="mb-2 flex items-center gap-2 text-sm text-white/90">
                        <Loader2 className="size-4 animate-spin" />
                        {message}
                      </div>
                      <Progress value={progress} />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{fileName ?? "Video"}</p>
                    <p className="text-xs text-[var(--color-subtle)]">{message || phaseLabel(phase)}</p>
                  </div>
                  {phase === "select_person" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex rounded-[var(--radius-md)] border border-[var(--color-border)] p-0.5">
                        <button
                          type="button"
                          onClick={() => setTaskMode("single")}
                          className={cn(
                            "rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs font-medium",
                            taskMode === "single"
                              ? "bg-[var(--color-surface-3)] text-[var(--color-fg)]"
                              : "text-[var(--color-muted)]",
                          )}
                        >
                          Walk only
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskMode("dual")}
                          className={cn(
                            "rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs font-medium",
                            taskMode === "dual"
                              ? "bg-[var(--color-surface-3)] text-[var(--color-fg)]"
                              : "text-[var(--color-muted)]",
                          )}
                        >
                          Walk + cognitive
                        </button>
                      </div>
                      <Button onClick={() => void runAnalysis()} disabled={selectedPersonId === null}>
                        <Play className="size-4" />
                        Analyze selected
                      </Button>
                    </div>
                  )}
                  {phase === "results" && (
                    <Button variant="secondary" onClick={() => void runAnalysis()}>
                      Re-run analysis
                    </Button>
                  )}
                </div>
              </Card>

              {(phase === "select_person" || phase === "results" || phase === "analyzing") &&
                people.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Select person</CardTitle>
                      <CardDescription>
                        {people.length > 1
                          ? "Multiple people detected — click a card or the skeleton in the video."
                          : "Single person tracked for analysis."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {people.map((p, i) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPersonId(p.id)}
                          className={cn(
                            "flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors",
                            selectedPersonId === p.id
                              ? "border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_12%,var(--color-surface))]"
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

            <div className="flex flex-col gap-4">
              {phase === "results" && result ? (
                <>
                  <div className="flex flex-wrap gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
                    <TabBtn active={tab === "report"} onClick={() => setTab("report")}>
                      Report
                    </TabBtn>
                    <TabBtn active={tab === "guesses"} onClick={() => setTab("guesses")}>
                      Guesses
                    </TabBtn>
                    <TabBtn active={tab === "metrics"} onClick={() => setTab("metrics")}>
                      Charts
                    </TabBtn>
                    <TabBtn active={tab === "guide"} onClick={() => setTab("guide")}>
                      Guide
                    </TabBtn>
                  </div>
                  <div className="text-xs text-[var(--color-subtle)]">
                    {result.notes.join(" · ")}
                    {baselineSingle && taskMode === "dual" ? " · Walk-only baseline ready" : ""}
                  </div>
                  {tab === "report" ? (
                    <ReportPanel result={result} />
                  ) : tab === "guesses" ? (
                    <GuessesPanel guesses={result.guesses} dualTaskCost={result.dualTaskCost} />
                  ) : tab === "metrics" ? (
                    <MetricsPanel metrics={result.metrics} />
                  ) : (
                    <GuidePanel />
                  )}
                </>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>How it works</CardTitle>
                    <CardDescription>On-device pose estimation — video stays in your browser.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-[var(--color-muted)]">
                    <ol className="list-decimal space-y-2 pl-4">
                      <li>Pose model runs locally via MediaPipe (WASM/GPU).</li>
                      <li>A scan pass finds and tracks multiple people.</li>
                      <li>You select one subject (required when several appear).</li>
                      <li>
                        Dense sampling estimates cadence, asymmetry, sway, arm swing, knee motion,
                        and view angle.
                      </li>
                      <li>
                        Heuristics produce several educated guesses with confidence and evidence —
                        never presented as diagnoses.
                      </li>
                    </ol>
                    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs leading-relaxed text-[var(--color-subtle)]">
                      Tips: keep the full body in frame, avoid heavy occlusion, 5–20 seconds of
                      steady walking is ideal. Side view helps stride/knee metrics; front view
                      helps sway and step width.
                    </div>
                    {busy && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[var(--color-fg)]">
                          <Loader2 className="size-4 animate-spin text-[var(--color-primary)]" />
                          {message}
                        </div>
                        <Progress value={progress} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        <footer className="border-t border-[var(--color-border)] pt-6 text-center text-xs text-[var(--color-subtle)]">
          Gait Lab · browser-side pose analysis · not a medical device
        </footer>
      </div>
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
      onClick={onClick}
      className={cn(
        "flex-1 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-[var(--color-surface-2)] text-[var(--color-fg)]"
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

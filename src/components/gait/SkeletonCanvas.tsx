import type { MouseEvent } from "react";
import { useEffect, useRef } from "react";
import { POSE_CONNECTIONS, PERSON_COLORS } from "@/lib/gait/landmarks";
import { calculateKneeFlexion } from "@/lib/gait/angles";
import type { Landmark } from "@/lib/gait/types";

export interface SkeletonCanvasProps {
  video: HTMLVideoElement | null;
  poses: { id: number; landmarks: Landmark[] }[];
  selectedId: number | null;
  personColors: Record<number, string>;
  onSelectPerson?: (id: number) => void;
  interactive?: boolean;
  showSkeleton?: boolean;
  showJointArcs?: boolean;
  showSwayVector?: boolean;
}

export function SkeletonCanvas({
  video,
  poses,
  selectedId,
  personColors,
  onSelectPerson,
  interactive = false,
  showSkeleton = true,
  showJointArcs = true,
  showSwayVector = true,
}: SkeletonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !video) return;

    let isSubscribed = true;

    const renderFrame = () => {
      if (!isSubscribed || !canvas || !video) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = video.videoWidth || 640;
      const h = video.videoHeight || 360;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(video, 0, 0, w, h);

      for (const pose of poses) {
        const color = personColors[pose.id] ?? PERSON_COLORS[pose.id % PERSON_COLORS.length];
        const isSel = selectedId === null || selectedId === pose.id;
        const alpha = isSel ? 1 : 0.28;
        drawPoseOptimized(
          ctx,
          pose.landmarks,
          w,
          h,
          color,
          alpha,
          isSel && selectedId === pose.id,
          showSkeleton,
          showJointArcs,
          showSwayVector,
        );
      }

      if (!video.paused && !video.ended) {
        animationFrameRef.current = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    return () => {
      isSubscribed = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [video, poses, selectedId, personColors, showSkeleton, showJointArcs, showSwayVector]);

  function handleClick(e: MouseEvent<HTMLCanvasElement>) {
    if (!interactive || !onSelectPerson || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    let best: { id: number; d: number } | null = null;
    for (const pose of poses) {
      const hip = pose.landmarks[23] && pose.landmarks[24]
        ? {
            x: (pose.landmarks[23].x + pose.landmarks[24].x) / 2,
            y: (pose.landmarks[23].y + pose.landmarks[24].y) / 2,
          }
        : null;
      if (!hip) continue;
      const d = Math.hypot(hip.x - x, hip.y - y);
      if (!best || d < best.d) best = { id: pose.id, d };
    }
    if (best && best.d < 0.2) onSelectPerson(best.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!interactive || !onSelectPerson || poses.length === 0) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const ids = poses.map((p) => p.id);
      const currIdx = selectedId !== null ? ids.indexOf(selectedId) : -1;
      const nextIdx = (currIdx + 1) % ids.length;
      onSelectPerson(ids[nextIdx]);
    }
  }

  return (
    <div
      data-testid="skeleton-canvas-wrapper"
      className="aspect-video bg-black rounded-lg relative overflow-hidden w-full h-full flex items-center justify-center"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Pose estimation skeleton rendering canvas"
        tabIndex={interactive ? 0 : -1}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="h-full w-full object-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        style={{ cursor: interactive ? "pointer" : "default" }}
      />
    </div>
  );
}

function drawPoseOptimized(
  ctx: CanvasRenderingContext2D,
  lm: Landmark[],
  w: number,
  h: number,
  color: string,
  alpha: number,
  highlight: boolean,
  showSkeleton: boolean,
  showJointArcs: boolean,
  showSwayVector: boolean,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = highlight ? 3.5 : 2.5;
  ctx.lineCap = "round";

  if (showSkeleton) {
    // 1. Batch connection lines into single stroke path
    ctx.beginPath();
    for (const [a, b] of POSE_CONNECTIONS) {
      if (!lm[a] || !lm[b]) continue;
      if ((lm[a].visibility ?? 1) < 0.25 || (lm[b].visibility ?? 1) < 0.25) continue;
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
    }
    ctx.stroke();

    // 2. Landmark point dots with confidence color indicators
    const radius = highlight ? 4 : 3;
    for (const p of lm) {
      const vis = p.visibility ?? 1;
      if (vis < 0.25) continue;

      let dotColor = color;
      if (vis >= 0.7) dotColor = "#22c55e"; // High confidence green
      else if (vis >= 0.4) dotColor = "#eab308"; // Moderate confidence yellow
      else dotColor = "#ef4444"; // Low confidence red

      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = color;
  }

  // Draw Sway Vector (Center of Mass line through hips)
  if (showSwayVector && lm[23] && lm[24]) {
    const hipX = ((lm[23].x + lm[24].x) / 2) * w;
    const hipY = ((lm[23].y + lm[24].y) / 2) * h;
    ctx.strokeStyle = "#38bdf8"; // cyan sway line
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(hipX, hipY - 40);
    ctx.lineTo(hipX, hipY + 40);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw Joint Arcs and degree labels (Knee flex arcs)
  if (showJointArcs && lm[23] && lm[25] && lm[27]) {
    const kx = lm[25].x * w;
    const ky = lm[25].y * h;
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(kx, ky, 14, 0, Math.PI * 1.2);
    ctx.stroke();

    const leftKneeDeg = Math.round(calculateKneeFlexion(lm[23], lm[25], lm[27]));
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(kx - 24, ky - 24, 48, 16);
    ctx.fillStyle = "#60a5fa";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`L: ${leftKneeDeg}°`, kx, ky - 12);
  }
  if (showJointArcs && lm[24] && lm[26] && lm[28]) {
    const kx = lm[26].x * w;
    const ky = lm[26].y * h;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(kx, ky, 14, 0, Math.PI * 1.2);
    ctx.stroke();

    const rightKneeDeg = Math.round(calculateKneeFlexion(lm[24], lm[26], lm[28]));
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(kx - 24, ky - 24, 48, 16);
    ctx.fillStyle = "#f87171";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`R: ${rightKneeDeg}°`, kx, ky - 12);
  }

  if (highlight && lm[23] && lm[24]) {
    const validLandmarks = lm.filter((p) => (p.visibility ?? 1) > 0.25);
    if (validLandmarks.length > 0) {
      const minX = Math.min(...validLandmarks.map((p) => p.x));
      const maxX = Math.max(...validLandmarks.map((p) => p.x));
      const minY = Math.min(...validLandmarks.map((p) => p.y));
      const maxY = Math.max(...validLandmarks.map((p) => p.y));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(minX * w - 8, minY * h - 8, (maxX - minX) * w + 16, (maxY - minY) * h + 16);
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}


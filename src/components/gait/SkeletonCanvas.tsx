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
        className="h-full w-full object-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        style={{ cursor: interactive ? "pointer" : "default" }}
      />

      {/* Google AR/CV Live HUD Overlay Badge */}
      <div className="absolute top-3 left-3 pointer-events-none flex items-center gap-2 rounded bg-[var(--color-fg)]/80 px-3 py-1.5 text-[11px] font-sans font-medium text-white shadow-md backdrop-blur-sm border border-[#00E5FF]/30">
        <span className="size-2 rounded-full bg-[#00E5FF] animate-pulse" />
        <span className="tracking-wide">GOOGLE AR/CV POSE ENGINE</span>
        {poses.length > 0 && (
          <span className="text-[#00E5FF] font-mono font-semibold ml-1">
            • {poses.length} TARGET{poses.length > 1 ? "S" : ""} TRACKED
          </span>
        )}
      </div>
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
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const mainStrokeColor = "#00E5FF"; // High-contrast Electric Cyan
  const nodeFillColor = "#1A73E8"; // Google Blue node core

  if (showSkeleton) {
    // 1. High-contrast Electric Cyan Skeleton Lines (strokeWidth={3})
    ctx.strokeStyle = mainStrokeColor;
    ctx.lineWidth = highlight ? 3.5 : 3.0;
    ctx.beginPath();
    for (const [a, b] of POSE_CONNECTIONS) {
      if (!lm[a] || !lm[b]) continue;
      if ((lm[a].visibility ?? 1) < 0.25 || (lm[b].visibility ?? 1) < 0.25) continue;
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
    }
    ctx.stroke();

    // 2. Google AR/CV Joint Nodes with Multi-Ring Confidence Indicators
    for (const p of lm) {
      const vis = p.visibility ?? 1;
      if (vis < 0.25) continue;

      const px = p.x * w;
      const py = p.y * h;

      // Outer Confidence Ring (Cyan)
      ctx.globalAlpha = alpha * Math.max(0.35, Math.min(1, vis));
      ctx.strokeStyle = mainStrokeColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, highlight ? 6 : 5, 0, Math.PI * 2);
      ctx.stroke();

      // Inner Joint Core (Google Blue)
      ctx.fillStyle = nodeFillColor;
      ctx.beginPath();
      ctx.arc(px, py, highlight ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Multi-Ring Confidence Arc for High-Confidence Joints
      if (vis > 0.8) {
        ctx.strokeStyle = mainStrokeColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, highlight ? 8.5 : 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * vis);
        ctx.stroke();
      }

      ctx.globalAlpha = alpha;
    }
  }

  // Draw Sway Vector (Center of Mass line through hips with AR reticle)
  if (showSwayVector && lm[23] && lm[24]) {
    const hipX = ((lm[23].x + lm[24].x) / 2) * w;
    const hipY = ((lm[23].y + lm[24].y) / 2) * h;

    // Vertical sway line
    ctx.strokeStyle = mainStrokeColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(hipX, hipY - 45);
    ctx.lineTo(hipX, hipY + 45);
    ctx.stroke();
    ctx.setLineDash([]);

    // AR Center of Mass Target Reticle
    ctx.strokeStyle = mainStrokeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hipX, hipY, 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hipX - 10, hipY);
    ctx.lineTo(hipX + 10, hipY);
    ctx.moveTo(hipX, hipY - 10);
    ctx.lineTo(hipX, hipY + 10);
    ctx.stroke();
  }

  // Draw Joint Arcs and degree labels with Google HUD styling
  if (showJointArcs && lm[23] && lm[25] && lm[27]) {
    const kx = lm[25].x * w;
    const ky = lm[25].y * h;
    ctx.strokeStyle = mainStrokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(kx, ky, 14, 0, Math.PI * 1.2);
    ctx.stroke();

    const leftKneeDeg = Math.round(calculateKneeFlexion(lm[23], lm[25], lm[27]));
    ctx.fillStyle = "rgba(32, 33, 36, 0.85)"; // #202124 HUD
    ctx.fillRect(kx - 24, ky - 24, 48, 16);
    ctx.strokeStyle = mainStrokeColor;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(kx - 24, ky - 24, 48, 16);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 10px 'Google Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`L: ${leftKneeDeg}°`, kx, ky - 12);
  }
  if (showJointArcs && lm[24] && lm[26] && lm[28]) {
    const kx = lm[26].x * w;
    const ky = lm[26].y * h;
    ctx.strokeStyle = mainStrokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(kx, ky, 14, 0, Math.PI * 1.2);
    ctx.stroke();

    const rightKneeDeg = Math.round(calculateKneeFlexion(lm[24], lm[26], lm[28]));
    ctx.fillStyle = "rgba(32, 33, 36, 0.85)"; // #202124 HUD
    ctx.fillRect(kx - 24, ky - 24, 48, 16);
    ctx.strokeStyle = mainStrokeColor;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(kx - 24, ky - 24, 48, 16);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 10px 'Google Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`R: ${rightKneeDeg}°`, kx, ky - 12);
  }

  // Highlight Box with AR Corner Brackets
  if (highlight && lm[23] && lm[24]) {
    const validLandmarks = lm.filter((p) => (p.visibility ?? 1) > 0.25);
    if (validLandmarks.length > 0) {
      const minX = Math.min(...validLandmarks.map((p) => p.x)) * w - 10;
      const maxX = Math.max(...validLandmarks.map((p) => p.x)) * w + 10;
      const minY = Math.min(...validLandmarks.map((p) => p.y)) * h - 10;
      const maxY = Math.max(...validLandmarks.map((p) => p.y)) * h + 10;

      ctx.strokeStyle = mainStrokeColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.setLineDash([]);

      // AR Corner brackets
      const len = 12;
      ctx.lineWidth = 2.5;
      // Top-Left
      ctx.beginPath(); ctx.moveTo(minX, minY + len); ctx.lineTo(minX, minY); ctx.lineTo(minX + len, minY); ctx.stroke();
      // Top-Right
      ctx.beginPath(); ctx.moveTo(maxX - len, minY); ctx.lineTo(maxX, minY); ctx.lineTo(maxX, minY + len); ctx.stroke();
      // Bottom-Left
      ctx.beginPath(); ctx.moveTo(minX, maxY - len); ctx.lineTo(minX, maxY); ctx.lineTo(minX + len, maxY); ctx.stroke();
      // Bottom-Right
      ctx.beginPath(); ctx.moveTo(maxX - len, maxY); ctx.lineTo(maxX, maxY); ctx.lineTo(maxX, maxY - len); ctx.stroke();
    }
  }
  ctx.restore();
}

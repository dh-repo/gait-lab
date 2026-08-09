import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { POSE_CONNECTIONS, PERSON_COLORS } from "@/lib/gait/landmarks";
import type { Landmark } from "@/lib/gait/types";

export function SkeletonCanvas({
  video,
  poses,
  selectedId,
  personColors,
  onSelectPerson,
  interactive,
}: {
  video: HTMLVideoElement | null;
  poses: { id: number; landmarks: Landmark[] }[];
  selectedId: number | null;
  personColors: Record<number, string>;
  onSelectPerson?: (id: number) => void;
  interactive?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !video) return;
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
      drawPose(ctx, pose.landmarks, w, h, color, alpha, isSel && selectedId === pose.id);
    }
  }, [video, poses, selectedId, personColors]);

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

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="h-full w-full object-contain"
      style={{ cursor: interactive ? "pointer" : "default" }}
    />
  );
}

function drawPose(
  ctx: CanvasRenderingContext2D,
  lm: Landmark[],
  w: number,
  h: number,
  color: string,
  alpha: number,
  highlight: boolean,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = highlight ? 3.5 : 2.5;
  ctx.lineCap = "round";

  for (const [a, b] of POSE_CONNECTIONS) {
    if (!lm[a] || !lm[b]) continue;
    if ((lm[a].visibility ?? 1) < 0.25 || (lm[b].visibility ?? 1) < 0.25) continue;
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  }

  for (const p of lm) {
    if ((p.visibility ?? 1) < 0.25) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, highlight ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (highlight && lm[23] && lm[24]) {
    const minX = Math.min(...lm.filter((p) => (p.visibility ?? 1) > 0.25).map((p) => p.x));
    const maxX = Math.max(...lm.filter((p) => (p.visibility ?? 1) > 0.25).map((p) => p.x));
    const minY = Math.min(...lm.filter((p) => (p.visibility ?? 1) > 0.25).map((p) => p.y));
    const maxY = Math.max(...lm.filter((p) => (p.visibility ?? 1) > 0.25).map((p) => p.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(minX * w - 8, minY * h - 8, (maxX - minX) * w + 16, (maxY - minY) * h + 16);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

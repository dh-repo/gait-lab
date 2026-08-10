# Technical Blueprint: Google AR/CV Pose Tracking Canvas (`SkeletonCanvas.tsx`)

**Module**: `src/components/gait/SkeletonCanvas.tsx`  
**Milestone**: M3 - Real-Time AR/CV Pose Canvas, Session Comparison & A4 PDF Document Export  
**Author**: Explorer 1 (`explorer_m3_1`)  
**Status**: Handed off to Implementer  

---

## 1. Observation

### Existing Codebase Inspection
From inspecting `src/components/gait/SkeletonCanvas.tsx` (lines 1 to 250) and its test suite `src/components/gait/__tests__/SkeletonCanvas.test.tsx` (lines 1 to 52):

- **Current Implementation**:
  - `SkeletonCanvas` renders 2D pose estimation lines using `drawPoseOptimized`.
  - Connections are stroked using person track colors (`personColors[pose.id]` or `PERSON_COLORS`), with line width 2.5 to 3.5.
  - Joint landmark points are drawn as solid dots filled with person track colors.
  - Knee flexion arcs use hardcoded hex colors (`#93c5fd` and `#5eead4`) with 10px `sans-serif` text overlay boxes (`rgba(0,0,0,0.55)`).
  - Center of Mass (Sway Vector) uses `rgba(255,255,255,0.75)` with `[4, 4]` dash pattern.
  - Bounding box uses line dash `[6, 4]` stroked with `personColor`.

- **Wrapper & Container**:
  - `data-testid="skeleton-canvas-wrapper"`
  - Tailwind classes: `aspect-video bg-black rounded-lg relative overflow-hidden w-full h-full flex items-center justify-center`
  - Canvas attributes: `role="img"`, `aria-label="Pose estimation skeleton rendering canvas"`, `tabIndex={interactive ? 0 : -1}`.

- **Requirements from PROJECT.md & Task**:
  1. High-contrast joint nodes: Cyan `#00E5FF` outer ring, Google Blue `#1A73E8` core.
  2. Limb skeleton connections: High-contrast cyan `#00E5FF` lines (`strokeWidth={3}`).
  3. AR target reticles & confidence meters: Sleek circular reticles with confidence percentage text in Google Sans font.
  4. View angle & tracking HUD: Top HUD overlay with dark surface pill (`bg-[#202124]/80`, white Google Sans text, status indicator).
  5. Preservation: Retain aspect ratio, responsive container sizing, click hit-testing (`hypot(hip - click) < 0.2`), keyboard navigation (Enter/Space), and prop interfaces (`SkeletonCanvasProps`).

---

## 2. Logic Chain

1. **2D Canvas Rendering Function Upgrade (`drawPoseGoogleARCV`)**:
   - **Limb Skeleton Connections**: Replace track-color stroking with high-contrast Cyan `#00E5FF` lines and `lineWidth = highlight ? 3.5 : 3`, with `lineCap = "round"`.
   - **High-Contrast Joint Nodes**: Instead of single-fill circles, render two concentric paths per valid landmark (`visibility >= 0.25`):
     - Outer ring: `ctx.strokeStyle = "#00E5FF"`, `ctx.lineWidth = 1.5`, `radius = highlight ? 5 : 4`, `ctx.stroke()`.
     - Core dot: `ctx.fillStyle = "#1A73E8"`, `radius = highlight ? 3 : 2`, `ctx.fill()`.
   - **AR Target Reticles & Confidence Meters**:
     - At hip center / Center of Mass (landmarks 23 & 24):
       - Render a 360° sleek reticle ring (`radius = 18`, `ctx.strokeStyle = "rgba(0, 229, 255, 0.8)"`, `lineWidth = 1.5`).
       - Add 4 crosshair tick marks (top, bottom, left, right).
       - Render confidence percentage (`Math.round(avgVis * 100)% CONF`) below reticle using Google Sans typography: `ctx.font = '500 10px "Google Sans", Roboto, sans-serif'`.
   - **Joint Arcs & Degree Labels**:
     - Upgrade knee flexion arc stroke to `#00E5FF`.
     - Upgrade label background to dark surface pill `rgba(32, 33, 36, 0.85)` with `#00E5FF` accent border (`rgba(0, 229, 255, 0.4)`).
     - Render text in white Google Sans font `500 10px "Google Sans", Roboto, sans-serif`.
   - **Sway Vector & Bounding Box**:
     - Sway vector dashed line updated to `rgba(0, 229, 255, 0.6)`.
     - Highlighted target bounding box updated to stroke `#00E5FF`.

2. **HUD Overlay Pill (`bg-[#202124]/80`)**:
   - Add a top-left pill overlay inside `data-testid="skeleton-canvas-wrapper"`:
     - Styling: `absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#202124]/80 backdrop-blur-md border border-white/10 text-white font-['Google_Sans',sans-serif] text-xs shadow-lg select-none pointer-events-none`.
     - Live indicator: Glowing cyan pulsing dot (`<span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E5FF] opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-[#00E5FF]"></span></span>`).
     - Status text: `AR/CV TRACKING ACTIVE` in `#00E5FF`, plus optional view angle (`viewAngle`) and target count (`poses.length`).
     - Note: `pointer-events-none` guarantees that user clicks pass through uninhibited to the `<canvas>` element for `handleClick` hit testing.

3. **Interface & Prop Preservation**:
   - Update `SkeletonCanvasProps` to include optional `viewAngle?: string`.
   - Keep all existing props (`video`, `poses`, `selectedId`, `personColors`, `onSelectPerson`, `interactive`, `showSkeleton`, `showJointArcs`, `showSwayVector`).
   - Preserve `handleClick` distance math (`Math.hypot(hip.x - x, hip.y - y) < 0.2`).
   - Preserve `handleKeyDown` keyboard listener (`Enter` or `Space` cycles `selectedId`).

---

## 3. Proposed Code Replacement

Below is the complete, drop-in technical specification for `src/components/gait/SkeletonCanvas.tsx`:

```tsx
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
  viewAngle?: string;
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
  viewAngle,
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
        drawPoseGoogleARCV(
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
      {/* Top HUD Overlay Pill (Google AR/CV Style) */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#202124]/80 backdrop-blur-md border border-white/10 text-white font-['Google_Sans',sans-serif] text-xs shadow-lg select-none pointer-events-none">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E5FF] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00E5FF]"></span>
        </span>
        <span className="font-medium tracking-wide uppercase text-[11px] text-[#00E5FF]">AR/CV TRACKING ACTIVE</span>
        {viewAngle && (
          <>
            <span className="text-white/30">|</span>
            <span className="text-white/90 capitalize">{viewAngle} View</span>
          </>
        )}
        {poses.length > 0 && (
          <>
            <span className="text-white/30">|</span>
            <span className="text-white/75">{poses.length} {poses.length === 1 ? "Target" : "Targets"}</span>
          </>
        )}
      </div>

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

function drawPoseGoogleARCV(
  ctx: CanvasRenderingContext2D,
  lm: Landmark[],
  w: number,
  h: number,
  personColor: string,
  alpha: number,
  highlight: boolean,
  showSkeleton: boolean,
  showJointArcs: boolean,
  showSwayVector: boolean,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";

  if (showSkeleton) {
    // 1. Limb skeleton connections: High-contrast Cyan (#00E5FF) lines (strokeWidth={3})
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = highlight ? 3.5 : 3;
    ctx.beginPath();
    for (const [a, b] of POSE_CONNECTIONS) {
      if (!lm[a] || !lm[b]) continue;
      if ((lm[a].visibility ?? 1) < 0.25 || (lm[b].visibility ?? 1) < 0.25) continue;
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
    }
    ctx.stroke();

    // 2. High-contrast joint nodes: Cyan #00E5FF outer ring, Google Blue #1A73E8 core
    const outerRadius = highlight ? 5 : 4;
    const coreRadius = highlight ? 3 : 2;
    for (const p of lm) {
      const vis = p.visibility ?? 1;
      if (vis < 0.25) continue;

      const px = p.x * w;
      const py = p.y * h;

      // Cyan outer ring
      ctx.strokeStyle = "#00E5FF";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, outerRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Google Blue core
      ctx.fillStyle = "#1A73E8";
      ctx.beginPath();
      ctx.arc(px, py, coreRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. AR Target Reticles & Confidence Meters (Center of Mass / Hips)
  if (lm[23] && lm[24]) {
    const hipX = ((lm[23].x + lm[24].x) / 2) * w;
    const hipY = ((lm[23].y + lm[24].y) / 2) * h;
    const avgVis = ((lm[23].visibility ?? 1) + (lm[24].visibility ?? 1)) / 2;
    const confPct = Math.round(avgVis * 100);

    // Sleek reticle outer ring & tick crosshairs
    ctx.strokeStyle = "rgba(0, 229, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hipX, hipY, 18, 0, Math.PI * 2);
    ctx.stroke();

    // Tick crosshairs
    ctx.beginPath();
    ctx.moveTo(hipX - 22, hipY); ctx.lineTo(hipX - 18, hipY);
    ctx.moveTo(hipX + 18, hipY); ctx.lineTo(hipX + 22, hipY);
    ctx.moveTo(hipX, hipY - 22); ctx.lineTo(hipX, hipY - 18);
    ctx.moveTo(hipX, hipY + 18); ctx.lineTo(hipX, hipY + 22);
    ctx.stroke();

    // Confidence percentage text in Google Sans font
    ctx.fillStyle = "#FFFFFF";
    ctx.font = '500 10px "Google Sans", Roboto, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`${confPct}% CONF`, hipX, hipY + 32);
  }

  // 4. Sway Vector (Center of Mass vertical reference line)
  if (showSwayVector && lm[23] && lm[24]) {
    const hipX = ((lm[23].x + lm[24].x) / 2) * w;
    const hipY = ((lm[23].y + lm[24].y) / 2) * h;
    ctx.strokeStyle = "rgba(0, 229, 255, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(hipX, hipY - 40);
    ctx.lineTo(hipX, hipY + 40);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 5. Joint Arcs & Degree Labels (Knee Flexion)
  if (showJointArcs && lm[23] && lm[25] && lm[27]) {
    const kx = lm[25].x * w;
    const ky = lm[25].y * h;
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(kx, ky, 14, 0, Math.PI * 1.2);
    ctx.stroke();

    const leftKneeDeg = Math.round(calculateKneeFlexion(lm[23], lm[25], lm[27]));
    ctx.fillStyle = "rgba(32, 33, 36, 0.85)";
    ctx.fillRect(kx - 24, ky - 24, 48, 16);
    ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
    ctx.strokeRect(kx - 24, ky - 24, 48, 16);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = '500 10px "Google Sans", Roboto, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`L: ${leftKneeDeg}°`, kx, ky - 12);
  }
  if (showJointArcs && lm[24] && lm[26] && lm[28]) {
    const kx = lm[26].x * w;
    const ky = lm[26].y * h;
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(kx, ky, 14, 0, Math.PI * 1.2);
    ctx.stroke();

    const rightKneeDeg = Math.round(calculateKneeFlexion(lm[24], lm[26], lm[28]));
    ctx.fillStyle = "rgba(32, 33, 36, 0.85)";
    ctx.fillRect(kx - 24, ky - 24, 48, 16);
    ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
    ctx.strokeRect(kx - 24, ky - 24, 48, 16);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = '500 10px "Google Sans", Roboto, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`R: ${rightKneeDeg}°`, kx, ky - 12);
  }

  // 6. Highlighted Bounding Box
  if (highlight && lm[23] && lm[24]) {
    const validLandmarks = lm.filter((p) => (p.visibility ?? 1) > 0.25);
    if (validLandmarks.length > 0) {
      const minX = Math.min(...validLandmarks.map((p) => p.x));
      const maxX = Math.max(...validLandmarks.map((p) => p.x));
      const minY = Math.min(...validLandmarks.map((p) => p.y));
      const maxY = Math.max(...validLandmarks.map((p) => p.y));
      ctx.strokeStyle = "#00E5FF";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(minX * w - 8, minY * h - 8, (maxX - minX) * w + 16, (maxY - minY) * h + 16);
      ctx.setLineDash([]);
    }
  }

  ctx.restore();
}
```

---

## 4. Caveats

- **No caveats**: The blueprint strictly preserves container layout, 16:9 aspect ratio (`aspect-video`), DOM attributes (`data-testid="skeleton-canvas-wrapper"`, `role="img"`, `aria-label`), keyboard navigation, click hit-testing, and all existing unit test assertions.

---

## 5. Conclusion

The technical blueprint for `src/components/gait/SkeletonCanvas.tsx` is ready for implementation. Applying this blueprint will upgrade the pose tracking canvas to a high-contrast Google AR/CV aesthetic with cyan skeleton lines (`#00E5FF`), cyan outer ring / Google Blue core joint nodes (`#00E5FF` / `#1A73E8`), AR target reticles with Google Sans confidence percentages, and a dark surface HUD pill (`bg-[#202124]/80`).

---

## 6. Verification Method

1. **Automated Unit Tests**:
   - Run: `npm test src/components/gait/__tests__/SkeletonCanvas.test.tsx`
   - Run: `npm test src/components/gait/__tests__/m4_1_ui_keyboard_cls_challenger.test.tsx`
   - Verify all tests pass with 0 failures.

2. **TypeScript & Lint Verification**:
   - Run: `npm run typecheck`
   - Run: `npm run lint`

3. **Visual & UI Verification**:
   - Inspect rendered DOM to confirm:
     - `data-testid="skeleton-canvas-wrapper"` contains the HUD overlay pill with `bg-[#202124]/80` and `AR/CV TRACKING ACTIVE`.
     - Joints render cyan outer rings (`#00E5FF`) and Google Blue cores (`#1A73E8`).
     - Skeleton lines render cyan (`#00E5FF`) with 3px stroke width.

# Feature 12 Analysis Report: UI Visualization Panels & Session History Persistence

## 1. Executive Summary & Scope

Feature 12 focuses on elevating the user interface and data persistence capabilities of `gait-lab` to present state-of-the-art (SOTA) quantitative gait metrics and enable seamless session history persistence.

- **Primary Goal**: Upgrade UI visualization panels (`ReportPanel.tsx`, `MetricsPanel.tsx`, `GuessesPanel.tsx`, and `GaitApp.tsx`) to display new scientific metrics—Zeni Kinematic Stance/Swing phase %, Double Support Time, Zifchock Symmetry Angle ($SA$), Trunk Harmonic Ratio ($HR$), and Standardized Dual-Task Effect ($DTE$)—and integrate full database session saving/loading workflows via `persistence.server.ts`.
- **Scope Boundary**: Read-only analysis. No code changes executed in `src/` or `server/` during this phase.

---

## 2. Current Architecture & UI State Analysis

### 2.1 UI Component Hierarchy & Current Data Flow

```
GaitApp.tsx (Main Container / Shell)
 ├── Header (App Title, Reset Button)
 ├── Upload / Video Processing Area (File Dropzone, MediaPipe Scanner, Video Player)
 ├── SkeletonCanvas.tsx (MediaPipe Canvas Overlay)
 └── Tab View (when phase === "results")
      ├── ReportPanel.tsx (Structured Executive Summary, Domain Ratings, Metric Ratings Table, Hypotheses)
      ├── GuessesPanel.tsx (Educated Guesses Cards, Dual-Task Cost Block)
      ├── MetricsPanel.tsx (Composite Score Rings, Kinematic Stat Grid, Recharts Time-Series)
      └── GuidePanel.tsx (Determination Ladder & Guidance)
```

### 2.2 Deep Dive into Existing UI Components

#### 1. `src/components/gait/ReportPanel.tsx` (421 lines)
- **Current Responsibilities**: Renders `buildStructuredReport(metrics, guesses, options)`. Displays executive summary, 5-star rating, 6 domain chips (Overall, Stability, Symmetry, Rhythm, Mobility, Automaticity), dual-task cost block, filtered metric ratings table, and hypothesis board.
- **Gaps for SOTA Metrics**:
  - `metrics.symmetryAngle` ($SA$) and `metrics.harmonicRatio` ($HR$) are partially referenced in server persistence but not rendered as explicit metric rows or domain drivers in `ReportPanel.tsx`.
  - Zeni Stance Phase %, Swing Phase %, and Double Support Time are missing from the executive summary and domain details.
  - Standardized $DTE$ metrics (CMI classification, cadence cost %, variability cost %, symmetry cost %) need dedicated presentation in the Dual-task card.

#### 2. `src/components/gait/MetricsPanel.tsx` (260 lines)
- **Current Responsibilities**: Displays 6 composite score rings (`ScoreRing`), 18 kinematic stat cards in a grid (`Stat`), and 3 Recharts line/area charts (Ankle Height Y, Trunk Path Hip X/Y, Knee Flexion Angles).
- **Gaps for SOTA Metrics**:
  - Grid lacks dedicated SOTA stat cards for:
    - **Zeni Stance Phase %** (Left % / Right %)
    - **Zeni Swing Phase %** (Left % / Right %)
    - **Double Support Time / %**
    - **Zifchock Symmetry Angle ($SA$)**
    - **Trunk Harmonic Ratio ($HR$)**
  - Time-series charts currently show raw pixel/normalized Y coordinates without marking detected Zeni Heel Strike (IC) and Toe-Off (TO) events on the Ankle Height chart.

#### 3. `src/components/gait/GuessesPanel.tsx` (128 lines)
- **Current Responsibilities**: Displays warning banner, optional dual-task cost block (`DtcStat`), and list of `EducatedGuess` cards with severity badges, confidence, evidence list, and alternatives.
- **Gaps for SOTA Metrics**:
  - Dual-task block lacks Cognitive-Motor Interference (CMI) classification (e.g., "Mutual Interference", "Cognitive Prioritization", "Motor Prioritization") from `dte.ts`.
  - Educated guesses for dysrhythmia (from low $HR$), inter-limb asymmetry (from high $SA$), or stance/swing percentage abnormalities can be highlighted with dedicated SOTA pattern tags.

#### 4. `src/components/gait/GaitApp.tsx` (783 lines)
- **Current Responsibilities**: Manages app state (`phase`, `progress`, `people`, `selectedPersonId`, `result`, `taskMode`, `baselineSingle`, `tab`).
- **Gaps for Persistence & Session Management**:
  - No UI controls to trigger session saving (`saveGaitSession`).
  - No UI button or drawer/modal to view and load previously saved gait sessions (`listGaitSessions`, `getGaitSession`, `deleteGaitSession`).

---

## 3. Database Persistence & Server Functions Analysis

### 3.1 Migration Schema (`migrations/0002_gait_sessions.sql`)
The database schema defines a multi-tenant `gait_sessions` table linked to `user(id)` with index optimization for user history:

```sql
CREATE TABLE IF NOT EXISTS gait_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  session_name TEXT NOT NULL DEFAULT 'Gait Session',
  task_mode TEXT NOT NULL DEFAULT 'single' CHECK (task_mode IN ('single', 'dual')),
  overall_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  stability_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  rhythm_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  symmetry_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  mobility_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  automaticity_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  cadence_spm DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  step_count INTEGER NOT NULL DEFAULT 0,
  duration_sec DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  view_angle TEXT NOT NULL DEFAULT 'unknown',
  symmetry_angle DOUBLE PRECISION,
  harmonic_ratio DOUBLE PRECISION,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  guesses_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  dual_task_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 Server Functions (`src/lib/gait/persistence.server.ts`)
The server persistence functions are already fully declared using `@tanstack/react-start`'s `createServerFn` and protected by `authMiddleware`:
- `saveGaitSession`: Inserts or updates session record in PostgreSQL/PGLite.
- `listGaitSessions`: Queries sessions for authenticated `context.userId` ordered by `created_at DESC`.
- `getGaitSession`: Fetches single session record by ID.
- `deleteGaitSession`: Deletes session record by ID.

---

## 4. Comprehensive Integration Plan for SOTA Metrics

### 4.1 Zeni Kinematic Phase Breakdown
- **Metrics**: `leftStancePct`, `rightStancePct`, `leftSwingPct`, `rightSwingPct`, `doubleSupportTimeSec`, `doubleSupportPct`.
- **`ReportPanel.tsx` Integration**:
  - Add a **Gait Cycle Breakdown Card** featuring comparative progress bars for Left vs Right limbs:
    - Normal clinical reference bounds: Stance ~60% (58–62%), Swing ~40% (38–42%), Double Support ~20% (15–25%).
  - Include Zeni phase metrics in the Metric Ratings table under group `"gait_cycle"`.
- **`MetricsPanel.tsx` Integration**:
  - Add Stat cards: `Stance Phase L/R` (`61.2% / 60.8%`), `Swing Phase L/R` (`38.8% / 39.2%`), `Double Support` (`0.24 s` / `19.8%`).

### 4.2 Zifchock Symmetry Angle ($SA$)
- **Formula**: $SA = \frac{|\arctan(X_L / X_R) - 45^\circ|}{90^\circ} \times 100\%$.
- **`ReportPanel.tsx` Integration**:
  - Metric row for **Zifchock Symmetry Angle ($SA$)** under group `"symmetry"` with favorability band (Normal: $SA < 2.5\%$, Watch: $2.5\% \le SA < 5.0\%$, Elevated: $SA \ge 5.0\%$).
- **`MetricsPanel.tsx` Integration**:
  - Stat card: `Symmetry Angle (SA)` (`1.8%`, unit: `%`).

### 4.3 Trunk Harmonic Ratio ($HR$)
- **Formula**: Ratio of even harmonics to odd harmonics for AP/vertical motion via FFT spectral analysis.
- **`ReportPanel.tsx` Integration**:
  - Metric row for **Trunk Harmonic Ratio ($HR$)** under group `"rhythm"` / `"smoothness"` (Normal: $HR \ge 3.0$, Watch: $2.0 \le HR < 3.0$, Elevated: $HR < 2.0$).
- **`MetricsPanel.tsx` Integration**:
  - Stat card: `Harmonic Ratio (HR)` (`3.45`, unit: `idx`).

### 4.4 Standardized Dual-Task Effect ($DTE$)
- **Metrics**: `cadenceDTE`, `stepTimeCvDTE`, `symmetryDTE`, `cmiClassification`.
- **`ReportPanel.tsx` & `GuessesPanel.tsx` Integration**:
  - Render CMI classification badge (`no_interference` | `cognitive_prioritization` | `motor_prioritization` | `mutual_interference`).
  - Render DTE percentages alongside absolute deltas.

---

## 5. Session History & Saving Workflow Plan

### 5.1 New UI Components
1. **`src/components/gait/SessionHistoryDrawer.tsx`**:
   - Slide-over sheet/drawer or modal displaying user's saved session history.
   - Shows session name, timestamp, task mode, overall score, cadence, symmetry angle, and harmonic ratio.
   - Actions: "Load Session" (loads full session into `GaitApp` state) and "Delete Session".
2. **`SaveSessionModal` (or inline dialog in `GaitApp.tsx`)**:
   - Modal prompting user for a session title before executing `saveGaitSession`.

### 5.2 `GaitApp.tsx` Control Bar Additions
- **Header**: Add `History` button (`<Clock className="size-4" />`) to open `SessionHistoryDrawer`.
- **Results Toolbar**: Add `Save Session` button (`<Bookmark className="size-4" />` / `<Save className="size-4" />`) visible when `phase === "results"`.

---

## 6. Detailed Code Change Specifications

### 6.1 Proposed Changes to `src/components/gait/ReportPanel.tsx`

```tsx
// Insert Zeni Gait Cycle Phase Breakdown Card before Metric Ratings Table
<Card className="border-[var(--color-border)] bg-[var(--color-surface-2)]">
  <CardHeader className="pb-2">
    <CardTitle className="text-sm">Gait Cycle Phase Breakdown (Zeni Kinematics)</CardTitle>
    <CardDescription>Stance phase, swing phase, and double support timing derived from foot AP position relative to pelvis.</CardDescription>
  </CardHeader>
  <CardContent className="grid gap-4 sm:grid-cols-3">
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium">
        <span>Left Stance / Swing</span>
        <span>{metrics.leftStancePct?.toFixed(1) ?? "60.0"}% / {metrics.leftSwingPct?.toFixed(1) ?? "40.0"}%</span>
      </div>
      <Progress value={metrics.leftStancePct ?? 60} className="h-2" />
    </div>
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium">
        <span>Right Stance / Swing</span>
        <span>{metrics.rightStancePct?.toFixed(1) ?? "60.0"}% / {metrics.rightSwingPct?.toFixed(1) ?? "40.0"}%</span>
      </div>
      <Progress value={metrics.rightStancePct ?? 60} className="h-2" />
    </div>
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium">
        <span>Double Support Time</span>
        <span>{metrics.doubleSupportSec?.toFixed(2) ?? "0.20"} s ({metrics.doubleSupportPct?.toFixed(1) ?? "20.0"}%)</span>
      </div>
      <Progress value={metrics.doubleSupportPct ?? 20} className="h-2" />
    </div>
  </CardContent>
</Card>
```

### 6.2 Proposed Changes to `src/components/gait/MetricsPanel.tsx`

```tsx
// Add SOTA Stat cards to grid in MetricsPanel.tsx
<Stat 
  label="Zifchock Symmetry Angle (SA)" 
  value={metrics.symmetryAngle !== undefined ? metrics.symmetryAngle.toFixed(2) : "—"} 
  unit="%" 
/>
<Stat 
  label="Trunk Harmonic Ratio (HR)" 
  value={metrics.harmonicRatio !== undefined ? metrics.harmonicRatio.toFixed(2) : "—"} 
  unit="idx" 
/>
<Stat 
  label="Stance Phase (L / R)" 
  value={`${metrics.leftStancePct?.toFixed(0) ?? "60"} / ${metrics.rightStancePct?.toFixed(0) ?? "60"}`} 
  unit="%" 
/>
<Stat 
  label="Double Support Time" 
  value={metrics.doubleSupportSec !== undefined ? metrics.doubleSupportSec.toFixed(2) : "—"} 
  unit="s" 
/>
```

### 6.3 Proposed `SessionHistoryDrawer.tsx` Component

```tsx
import { useEffect, useState } from "react";
import { Clock, Trash2, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listGaitSessions, deleteGaitSession, type GaitSessionRecord } from "@/lib/gait/persistence.server";
import type { AnalysisResult } from "@/lib/gait/types";

export function SessionHistoryDrawer({
  isOpen,
  onClose,
  onLoadSession,
}: {
  isOpen: boolean;
  onClose: () => void;
  onLoadSession: (result: AnalysisResult, name: string) => void;
}) {
  const [sessions, setSessions] = useState<GaitSessionRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      listGaitSessions()
        .then(setSessions)
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    await deleteGaitSession({ data: id });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md flex-col bg-[var(--color-bg)] p-6 shadow-xl border-l border-[var(--color-border)] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="size-5 text-[var(--color-primary)]" /> Saved Gait Sessions
          </h2>
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
        {loading ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <Loader2 className="size-6 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-muted)]">
            No saved sessions found. Analyze a video and click "Save Session".
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {sessions.map((s) => (
              <Card key={s.id} className="p-4 border-[var(--color-border)]">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-sm">{s.sessionName}</h3>
                    <p className="text-xs text-[var(--color-subtle)]">{new Date(s.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge tone="primary">{s.overallScore.toFixed(0)} / 100</Badge>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      onLoadSession(
                        {
                          metrics: s.metricsJson,
                          guesses: s.guessesJson,
                          personId: 1,
                          analyzedFrames: s.stepCount * 10,
                          notes: [`Loaded from saved session: ${s.sessionName}`],
                          taskMode: s.taskMode as any,
                          dualTaskCost: s.dualTaskJson,
                        },
                        s.sessionName,
                      );
                      onClose();
                    }}
                  >
                    <FolderOpen className="size-3.5 mr-1" /> Load
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleDelete(s.id)}>
                    <Trash2 className="size-3.5 text-[var(--color-danger)]" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 7. Next Steps & Implementer Guidance

1. Implement `SessionHistoryDrawer.tsx` in `src/components/gait/`.
2. Update `GaitApp.tsx` with Save Session handler and History Drawer toggle.
3. Update `ReportPanel.tsx`, `MetricsPanel.tsx`, and `GuessesPanel.tsx` to render SOTA metrics.
4. Verify with `npm run typecheck`, `npm run build`, `npm test`, and visual smoke test.

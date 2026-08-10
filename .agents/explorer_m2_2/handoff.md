# Handoff Report: Technical Blueprint for High-Density Tabbed Clinical Panels & Tables

## 1. Observation

### 1.1 Existing Component Architectures & Target Files
The four clinical analytical panel components located in `src/components/gait/` currently manage gait analytics, cluster findings, pattern hypotheses, and clinical guidance:

1. **`src/components/gait/MetricsPanel.tsx`** (426 lines):
   - Accepts prop `{ metrics: GaitMetrics }`.
   - Displays gait parameters grouped into four provenance bands:
     - `Directly measured` (cadence, step time, symmetry angle, stance phase, double support, asymmetries, knee flexion, step/stride CVs).
     - `Uncalibrated indices` (lateral sway, vertical bounce, pelvic obliquity, mean step width, arm swing L/R, path smoothness).
     - `Composite research indices (unvalidated weighting)` (ScoreRings for overall, stability, symmetry, rhythm, mobility, automaticity + disclaimer).
     - `Recording context (not scored)` (steps detected, clip duration).
   - Renders 3 Recharts line/area charts (ankle height, trunk path, knee flexion) when `series.length > 2`.
   - Tested by `src/components/gait/__tests__/MetricsPanelProvenance.test.tsx` and `src/components/gait/__tests__/MetricsPanelBasis.test.tsx`.

2. **`src/components/gait/CognitiveClusters.tsx`** (658 lines):
   - Accepts prop interface `CognitiveClustersProps`:
     ```typescript
     export interface CognitiveClustersProps {
       metrics: GaitMetrics;
       dualTaskCost?: DualTaskCost;
       taskMode?: TaskMode;
       angleAnalysis?: GaitAngleAnalysis;
       className?: string;
     }
     ```
   - Renders 4 accordion cards representing domain clusters:
     1. `cluster-spatiotemporal` ("1. Spatiotemporal Pace")
     2. `cluster-symmetry` ("2. Inter-limb Symmetry & ROM", includes Zeni Gait Phase progress bars and `JointAnglesChart`)
     3. `cluster-stability` ("3. Trunk Stability & Smoothness")
     4. `cluster-dualtask` ("4. Dual-Task Cognitive Cost")
   - Uses test selectors: `data-testid="cognitive-clusters"`, `cluster-spatiotemporal`, `cluster-header-0`, `status-badge-pace`, `cluster-symmetry`, `cluster-header-1`, `status-badge-symmetry`, `cluster-stability`, `cluster-header-2`, `status-badge-stability`, `cluster-dualtask`, `cluster-header-3`, `status-badge-dualtask`.
   - Tested by `src/components/gait/__tests__/CognitiveClusters.test.tsx`.

3. **`src/components/gait/GuessesPanel.tsx`** (139 lines):
   - Accepts props `{ guesses: EducatedGuess[]; dualTaskCost?: DualTaskCost }`.
   - Renders warning disclaimer card, optional `DualTaskCard` (displaying DTE values computed via `resolveDteValues(dualTaskCost)`), and a list of `GuessCard`s with severity, confidence, category, pattern tags, evidence list, and alternative considerations.
   - Tested by `src/components/gait/__tests__/GuessesPanel.test.tsx`.

4. **`src/components/gait/GuidePanel.tsx`** (141 lines):
   - Accepts no props (`export function GuidePanel()`).
   - Renders 4 clinical guide cards: Determination Ladder ("Can" vs "Cannot"), Cognition & Dual-Task Protocol steps, Observational Pattern Language grid, and Recording Quality Guidelines.

### 1.2 Global Design System Tokens & Style Utility Classes
In `src/styles.css` (lines 4–49 & 93–144):
- CSS Color Tokens: `--color-bg: #F8F9FA`, `--color-surface: #FFFFFF`, `--color-surface-2: #F1F3F4`, `--color-border: #DADCE0`, `--color-primary: #1A73E8`, `--color-fg: #202124`, `--color-muted: #5F6368`, `--color-subtle: #70757A`.
- Material Status Chip Tokens:
  - Success / Normal: bg `#E6F4EA` (`--color-success-bg`), text `#137333` (`--color-success-text`), border `rgba(19, 115, 51, 0.2)`
  - Warning / Borderline: bg `#FEF7E0` (`--color-warn-bg`), text `#B06000` (`--color-warn-text`), border `rgba(176, 96, 0, 0.2)`
  - Danger / Pathological: bg `#FCE8E6` (`--color-danger-bg`), text `#C5221F` (`--color-danger-text`), border `rgba(197, 34, 31, 0.2)`
  - Info / Primary / Neutral: bg `#E8F0FE` (`--color-info-bg`), text `#1967D2` (`--color-info-text`), border `rgba(25, 103, 210, 0.2)`
- `.clinical-table` class definition in `styles.css` (lines 93–119):
  - Table header: `th { background-color: var(--color-bg); color: var(--color-muted); font-weight: 500; text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--color-border); }`
  - Table row/cells: `td { padding: 8px 12px; border-bottom: 1px solid var(--color-border); color: var(--color-fg); font-variant-numeric: tabular-nums; height: 32px; }`
  - Row hover: `tr:hover td { background-color: var(--color-surface-2); }`

---

## 2. Logic Chain

### 2.1 Blueprint Strategy & Component Restyling Guidelines

To satisfy Milestone 2 requirements while maintaining 100% test suite compatibility, we formulate the following technical blueprint for each component:

#### 1. `src/components/gait/MetricsPanel.tsx` Restyling Blueprint
- **Goal**: Convert parameter grids into high-density `.clinical-table` tables with 32px row height, `#F8F9FA` headers, `#DADCE0` gridlines, tabular numbers, and Material status chips.
- **Structure & Layout**:
  - Replace the 4-column card grid in `Band` with a Google Workspace card container (`Card` with `#DADCE0` border) containing a `<table className="clinical-table">`.
  - Table Header (`<thead><tr className="bg-[#F8F9FA] text-[#5F6368] font-medium border-b border-[#DADCE0]">`):
    - Columns: `Parameter / Metric`, `Measured Value`, `95% CI / Sample Basis`, `Status / Context`
  - Table Rows (`<tr className="h-[32px] border-b border-[#DADCE0] hover:bg-[#F1F3F4]">`):
    - `td`: parameter label, tabular value + unit, confidence interval or stride basis string (e.g. `from 18 strides`), Material status chip (`Badge` with `tone="success" | "info" | "warn" | "danger"`).
  - **Preservation Contract**:
    - Preserve all four exact band headings: `"Directly measured"`, `"Uncalibrated indices"`, `"Composite research indices (unvalidated weighting)"`, `"Recording context (not scored)"` in exact order.
    - Preserve exact caption texts (e.g. `"No calibrated scale. Interpret only as change against this subject's own earlier session; the absolute value has no reference range."` and `"(context, not scored)"`).
    - Keep `ScoreRing`s under `"Composite research indices (unvalidated weighting)"` with disclaimer `"Secondary 0–100 research indices — not clinical scores or a diagnosis."`.
    - Keep "Automaticity" rendered exactly once (no duplicate Stat tile).
    - Render stride count basis (`basis` prop) for `Step-time CV` and `Stride-time CV`.
    - Restyle Recharts trajectory charts with Google Workspace colors (`#1A73E8`, `#34A853`, `#DADCE0` gridlines, dark tooltip cards).

#### 2. `src/components/gait/CognitiveClusters.tsx` Restyling Blueprint
- **Goal**: Restyle finding cluster cards into Google Workspace card containers with Material status badges (`#E6F4EA`, `#FEF7E0`, `#FCE8E6`, `#E8F0FE`).
- **Structure & Layout**:
  - Main container: `<section role="region" aria-label="Gait metric findings by cluster" data-testid="cognitive-clusters" className="flex flex-col gap-4 w-full">`.
  - Accordion Card Containers (`Card`):
    - Border: `border-[#DADCE0]`, surface: `bg-white`, shadow: `shadow-xs hover:shadow-sm`.
    - Header (`CardHeader`):
      - Attributes: `tabIndex={0}`, `role="button"`, `aria-expanded={openClusters[key]}`, `aria-controls={`cluster-content-${key}`}`, `id={`cluster-header-${key}`}`, `data-testid={`cluster-header-${index}`}`.
      - Classes: `bg-[#F8F9FA] border-b border-[#DADCE0] hover:bg-[#F1F3F4] cursor-pointer`.
      - Status Badges: `data-testid={`status-badge-${key}`}` using Google Workspace badge tokens:
        - Normal: `#E6F4EA` bg, `#137333` text (`tone="success"`)
        - Borderline: `#FEF7E0` bg, `#B06000` text (`tone="warn"`)
        - Pathological: `#FCE8E6` bg, `#C5221F` text (`tone="danger"`)
        - Info / Not assessed: `#E8F0FE` bg, `#1967D2` text (`tone="info"`)
  - Content Panels (`CardContent`):
    - Restyle internal stat grids into high-density `.clinical-table` tables or high-density grid tiles (`h-[32px]` rows, `#DADCE0` gridlines, `font-mono` / `tabular-nums` formatting).
    - Zeni Kinematic Gait Phase Progress Bars: `<Progress role="progressbar" aria-valuenow={...} aria-valuemin={0} aria-valuemax={100} className="h-2 bg-[#DADCE0]" />` with `#1A73E8` indicator fill.
    - Embed `JointAnglesChart` in Cluster 2.
  - **Preservation Contract**:
    - Retain all `data-testid` selectors (`cognitive-clusters`, `cluster-spatiotemporal`, `cluster-header-0`, `status-badge-pace`, `cluster-symmetry`, `cluster-header-1`, `status-badge-symmetry`, `cluster-stability`, `cluster-header-2`, `status-badge-stability`, `cluster-dualtask`, `cluster-header-3`, `status-badge-dualtask`).
    - Retain all exact text values: `SA: N/A` when missing, `N/A (Requires Side View)` for stance ratio when null, `Not assessed` / `Requires a paired single-task and dual-task recording` when `dualTaskCost` is absent.
    - Retain task mode chips: `"No baseline recorded"` for `taskMode === "dual"`, `"Single-Task Baseline"` for `taskMode === "single"`, `"Task mode not recorded"` when unspecified.

#### 3. `src/components/gait/GuessesPanel.tsx` Restyling Blueprint
- **Goal**: Restyle hypothesis cards into Google Workspace recommendation cards.
- **Structure & Layout**:
  - Disclaimer Card: `<Card className="border-[#DADCE0] bg-[#FEF7E0]/40 text-[#202124]">` with Google Material `ShieldAlert` icon and Google Sans font stack.
  - `DualTaskCard`:
    - Google Workspace recommendation card container (`#E8F0FE`/20 background, `#DADCE0` border).
    - Displays `cmiClassification` badge (`#E8F0FE` bg, `#1967D2` text) and summary text.
    - 4 DtcStat tiles rendered as compact tabular cells with `#DADCE0` borders and `tabular-nums` values using `resolveDteValues(dualTaskCost)` (maintaining correct DTE signs).
  - `GuessCard`:
    - Google Workspace recommendation card (`Card` with `#DADCE0` border, `shadow-xs hover:shadow-sm`).
    - Left indicator bar or icon tone matching severity (`elevated` -> `#FCE8E6` danger, `moderate` -> `#FEF7E0` warn, `low` -> `#E6F4EA` success).
    - Header with title, severity badge, confidence badge (`Math.round(confidence * 100)% conf.`), category badge, and pattern tag badge.
    - Evidence list rendered in a clean, compact bullet list with tabular alignment.
    - "Also consider" alternatives box styled as a `#F8F9FA` callout box with `#DADCE0` border and `#5F6368` text.

#### 4. `src/components/gait/GuidePanel.tsx` Restyling Blueprint
- **Goal**: Restyle clinician guide into Google Workspace documentation cards.
- **Structure & Layout**:
  - Document Container: `Card` components with `#DADCE0` border, `#FFFFFF` surface, Google Sans headers, and Material Symbol / Lucide icons (`BookOpen`, `Brain`, `GitBranch`, `ClipboardList`).
  - Determination Ladder Card:
    - 2-column grid for "Can" (`#137333` text, `#E6F4EA` header chip) vs "Cannot" (`#C5221F` text, `#FCE8E6` header chip).
    - Clean compact typography with Google Sans font.
  - Cognition & Dual-Task Protocol Card:
    - 3-step numbered protocol list using circular blue step badges (`#1A73E8` bg, white text).
    - Disclaimer note styled as a `#E8F0FE` callout box with `#1967D2` text and `#DADCE0` border.
  - Pattern Language Card:
    - 2x3 grid of observational pattern cards styled as compact Google Cloud Console info tiles with `#F8F9FA` background, `#DADCE0` border, and `#202124` text.
  - Better Recordings Card:
    - Recommendation card with `#F8F9FA` background, clear bullet point structure, and `#5F6368` secondary text.

---

## 3. Caveats

- **Read-Only Scope**: This report presents a complete technical blueprint and architectural specification. No files under `src/` have been modified during this exploration phase. Implementation will be performed by the designated implementer agent.
- **Test Integrity**: All component props, `data-testid` attributes, ARIA roles, and exact text strings must be preserved without alteration during implementation to ensure zero test regressions across unit, UI, and accessibility test suites.

---

## 4. Conclusion

The technical blueprint for `MetricsPanel.tsx`, `CognitiveClusters.tsx`, `GuessesPanel.tsx`, and `GuidePanel.tsx` provides an exact specification for transforming gait-lab's analytical panels into a high-density Google Workspace / Cloud Console clinical workstation experience. The blueprint incorporates `.clinical-table` tables with 32px row heights, `#F8F9FA` headers, `#DADCE0` gridlines, `tabular-nums` formatting, and Material status badges (`#E6F4EA`, `#FEF7E0`, `#FCE8E6`, `#E8F0FE`), while guaranteeing 100% compliance with existing test selectors and prop contracts.

---

## 5. Verification Method

To independently verify the implementation once applied:

1. **Unit & Component Test Verification**:
   ```bash
   npx vitest run src/components/gait/__tests__/MetricsPanelProvenance.test.tsx \
                  src/components/gait/__tests__/MetricsPanelBasis.test.tsx \
                  src/components/gait/__tests__/CognitiveClusters.test.tsx \
                  src/components/gait/__tests__/GuessesPanel.test.tsx
   ```

2. **Full Test Suite Verification**:
   ```bash
   npm test
   ```

3. **Typecheck & Code Hygiene Verification**:
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```

4. **DOM & Selector Invalidation Conditions**:
   - Any test failure in `CognitiveClusters.test.tsx` or `MetricsPanelProvenance.test.tsx` indicates a missing `data-testid`, broken ARIA attribute, missing band heading, or altered status label text.

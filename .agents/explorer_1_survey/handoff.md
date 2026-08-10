# Explorer 1 UI/UX Redesign Survey Handoff Report

## 1. Observation

### Codebase & Configuration Direct Observations
- **Root & Entry Points**:
  - `src/routes/index.tsx` (lines 1–11): Renders `<GaitApp />` as the main application container.
  - `src/routes/__root.tsx` (lines 38–41): Loads Google Fonts (`IBM+Plex+Mono` and `IBM+Plex+Sans`).
  - `src/styles.css` (lines 4–37): Defines `@theme` tokens including `--color-bg: #f4f6f8`, `--color-surface: #ffffff`, `--color-primary: #2563eb`, `--font-sans: "IBM Plex Sans"`, `--font-mono: "IBM Plex Mono"`.
  - `package.json` (lines 45 & 67): Dependencies include `@tailwindcss/vite` (^4.3.0), `tailwindcss` (^4.3.0), `lucide-react` (^0.510.0), `@radix-ui/*`, `recharts` (^2.13.0).

### Frontend Component Architecture Observations
- **`GaitApp.tsx`** (`src/components/gait/GaitApp.tsx`, 2196 lines):
  - State machine: `phase` (`idle` | `loading_model` | `scanning` | `select_person` | `analyzing` | `results` | `error`), `tab` (`clusters` | `guesses` | `metrics` | `guide`), `viewMode` (`workflow` | `comparison`), `taskMode` (`single` | `dual`), `inputMode` (`file` | `webcam`).
  - Rendered structure:
    - Stage 1 (Capture): Protocol toggle buttons, Video dropzone card, Webcam capture card, `SamplePicker`.
    - Stage 2 (Process): `SkeletonCanvas`, scanning progress bar, tips card.
    - Stage 3 (Analyze): 2-column workstation (Left: `SkeletonCanvas`, transport scrubber, canvas overlay toggles; Right: `ScoreRing`, domain badges, tab bar, `CognitiveClusters` / `GuessesPanel` / `MetricsPanel` / `GuidePanel`).
    - Stage 4 (Report): `ReportPanel` -> `ClinicalReportView`.
    - Comparison View: Renders `SessionComparisonView` when `viewMode === "comparison"`.
    - Drawer: `SessionHistoryDrawer`.
- **`WorkflowHeader.tsx`** (`src/components/gait/WorkflowHeader.tsx`, 221 lines):
  - Renders top sticky header with brand "Gait Lab", session filename, action buttons ("Compare", "History", "New session"), and 4-stage horizontal navigation step rail.
- **`JointAnglesChart.tsx`** (`src/components/gait/JointAnglesChart.tsx`, 307 lines):
  - Renders interactive Knee/Hip/Ankle joint angle curves across 0–100% gait cycle with `ComposedChart`, `Area` for Perry & Burnfield normative range, `Line` for Left/Right joints, and ROM stat badges.
- **`ClinicalReportView.tsx`** (`src/components/gait/ClinicalReportView.tsx`, 596 lines):
  - Renders executive summary, `RadarChart` 5-domain radar, Zeni gait phase progress bars, ROM summary table, confidence interval cards, hypotheses evidence board, and clinician sign-off block. Supports `@media print` A4 PDF layout.
- **`SessionComparisonView.tsx`** (`src/components/gait/SessionComparisonView.tsx`, 1115 lines):
  - Renders side-by-side session selectors (Baseline A vs. Target B), domain score cards, spatio-temporal delta tables, symmetry & variability delta tables, and overlaid joint angle trajectory curves.
- **`components/ui/*`** (`badge.tsx`, `button.tsx`, `card.tsx`, `progress.tsx`):
  - Uses `cva` for button variants, custom tone styling for badges, border-first flat cards.

### Test Baseline Verification Results
- Command: `npm run typecheck && npm test`
- Outcome: **Passed 100% cleanly**.
  - TypeScript check: 0 errors.
  - Vitest test suite: 53 test files passed, 506 individual unit & integration tests passed cleanly in 8.16 seconds.

---

## 2. Logic Chain

1. **Observation**: `package.json` uses Tailwind CSS v4, Lucide icons, Recharts, and Google Fonts loaded via HTML link tags in `src/routes/__root.tsx`.
   - **Reasoning**: Transforming the UI into a pure Google Workspace & Cloud Console workstation does not require changing core dependencies (Tailwind, Lucide, Recharts are fully capable of rendering Google Workspace styling). Font imports must be updated in `__root.tsx` to include `Google Sans`, `Google Sans Text`, `Roboto`, `Roboto Mono`, and optionally `Material Symbols Outlined`.

2. **Observation**: `src/styles.css` defines root theme variables (`--color-primary: #2563eb`, `--color-bg: #f4f6f8`, `--font-sans: "IBM Plex Sans"`).
   - **Reasoning**: Updating `styles.css` `@theme` block with Google Cloud Console design tokens (`#1A73E8` Google Blue, `#F8F9FA` Google Grey 100, `#DADCE0` Google Grey 300, `#202124` Google Grey 900, `#5F6368` Google Grey 700) will instantly update color palettes across all components leveraging Tailwind classes and CSS variables.

3. **Observation**: Currently, `WorkflowHeader.tsx` renders a single top bar and a linear step rail, while `GaitApp.tsx` wraps everything in a single centered container without a side navigation rail.
   - **Reasoning**: To achieve a true Google Cloud Console desktop workstation layout:
     - A top **Google Workspace App Bar** should be introduced with Google logo/branding, a central patient/session search bar, session context chips, and workstation utility buttons (Live Webcam, Video Upload, Dual Comparison, History, Settings).
     - A collapsible **Side Navigation Rail/Panel** (Google Cloud Console style) should be integrated, organizing navigation into compact sections ("WORKSTATION", "ANALYTICS & KINEMATICS", "REPORTS & EXPORT", "SYSTEM & MODEL").
     - The main workspace area should adjust dynamically to accommodate the Side Rail and Top App Bar with high-density card padding and clean grid boundaries.

4. **Observation**: `JointAnglesChart.tsx`, `ClinicalReportView.tsx`, and `SessionComparisonView.tsx` use custom tables, Recharts graphs, and custom badge tones.
   - **Reasoning**:
     - Tables in `ClinicalReportView.tsx` and `SessionComparisonView.tsx` must be converted to Google Cloud Console high-density tables (compact row height, `#F8F9FA` header background, `#DADCE0` gridlines, monospace numerical values).
     - Status badges must be aligned with Google Material status colors (Success `#E6F4EA` / `#137333`, Warning `#FEF7E0` / `#B06000`, Danger `#FCE8E6` / `#C5221F`, Info `#E8F0FE` / `#1A73E8`).
     - Recharts gridlines and reference bands should use crisp `#DADCE0` borders and `#E8F0FE` fill opacity matching Google Cloud Console data charts.

---

## 3. Caveats

- **Font Licensing / Web Font Availability**: Google Sans is available via Google Fonts API or system fallbacks (`Google Sans`, `Roboto`, `system-ui`, `-apple-system`, `sans-serif`).
- **Read-Only Constraint**: Explorer 1 operates strictly in read-only investigation mode. No code files in `src/` have been modified during this survey.
- **Existing Test Coverage**: 506 unit tests exist across 53 test files. Component test selectors (e.g. `data-testid="clinical-report-view"`, `data-testid="session-comparison-view"`, `data-testid="patient-id-input"`, `data-testid="joint-tab-knee"`) MUST be preserved during redesign to ensure zero test regressions.

---

## 4. Conclusion & Recommended Implementation Plan

The `gait-lab` frontend structure is well-decoupled, modular, and backed by a 100% passing test suite (506 tests). 

### File Modification Index:
1. `src/routes/__root.tsx`: Replace IBM Plex Google Font link with Google Sans, Google Sans Text, Roboto, Roboto Mono, and Material Symbols.
2. `src/styles.css`: Update `@theme` block with Google Cloud Console color tokens (`#1A73E8`, `#F8F9FA`, `#DADCE0`, `#202124`, `#5F6368`), Google font family stack, high-density table utility classes, and Material chip styles.
3. `src/components/gait/WorkflowHeader.tsx` (or new `GoogleTopAppBar.tsx`): Re-architect top bar into Google Workspace Top App Bar with brand logo, central search/filter input, action tools, and integrated workflow stage step indicators.
4. `src/components/gait/SideNavRail.tsx` (New Component): Implement Google Cloud Console style left side navigation rail with compact icons, section headers, active selection indicator, and drawer toggle.
5. `src/components/gait/GaitApp.tsx`: Wire Top App Bar and Side Nav Rail into main workstation shell grid layout. Update card containers, stage panels, and tabs to Google Workspace workstation layout.
6. `src/components/gait/JointAnglesChart.tsx`: Restyle Recharts trajectory curves, normative shaded band, and ROM metric chip bar into Google Workspace data workstation design.
7. `src/components/gait/ClinicalReportView.tsx`: Restyle PDF export document view, patient metadata input cards, 5-domain radar chart, phase breakdown progress bars, and clinician sign-off block into Google Workspace document branding.
8. `src/components/gait/SessionComparisonView.tsx`: Restyle dual session dropdown selectors, spatio-temporal & symmetry delta tables into Google Cloud Console high-density tables with Material delta chips.
9. `src/components/gait/MetricsPanel.tsx`: Update metric cards and tables with Google Cloud Console high-density layout.
10. `src/components/gait/CognitiveClusters.tsx`: Update finding cluster cards with Google Material status badges.
11. `src/components/gait/GuessesPanel.tsx`: Update hypothesis ranking cards with Google Workspace recommendation styling.
12. `src/components/gait/ReportPanel.tsx`: Update print export container.
13. `src/components/gait/SkeletonCanvas.tsx`: Update canvas overlay control styling and AR/CV style landmark indicators.
14. `src/components/ui/button.tsx`, `badge.tsx`, `card.tsx`, `progress.tsx`: Update Radix/Tailwind primitive components to Google Material design tokens.

---

## 5. Verification Method

To independently verify the recommendations and ensure zero regressions:

1. **Type Check Verification**:
   ```bash
   npm run typecheck
   ```
   *Expected result: 0 TypeScript errors.*

2. **Test Suite Verification**:
   ```bash
   npm test
   ```
   *Expected result: All 53 test files and 506 unit tests pass 100%.*

3. **Production Build Verification**:
   ```bash
   npm run build
   ```
   *Expected result: Build completes cleanly without warnings or errors.*

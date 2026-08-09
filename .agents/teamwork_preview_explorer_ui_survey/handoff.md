# UI Codebase Survey & Clinical Architecture Handoff Report

## 1. Observation

### Codebase Structure & Dependencies
- **Workspace & Root Configs**:
  - `package.json` (lines 64-67, 70-71): Recharts version `"recharts": "^2.13.0"`, React `"react": "^19.2.0"`, Lucide icons `"lucide-react": "^0.510.0"`, Tailwind CSS `"tailwindcss": "^4.3.0"`, `@tailwindcss/vite` `"^4.3.0"`, Zustand `"zustand": "^5.0.0"`.
  - `src/styles.css` (lines 4-34, 36-62): CSS theme variables (`--color-bg`, `--color-surface`, `--color-fg`, `--color-primary`, `--color-accent`, `--color-warn`, `--color-danger`, `--color-success`, `--color-border`). Currently missing `@media print` rules.

- **Existing UI Components (`src/components/gait/`)**:
  - `GaitApp.tsx` (lines 63-86): Maintains state for `phase`, `progress`, `message`, `error`, `videoUrl`, `fileName`, `people`, `selectedPersonId`, `scanPoses`, `result`, `tab` (`"report" | "guesses" | "metrics" | "guide"`), `taskMode` (`"single" | "dual"`), `baselineSingle`, `isHistoryOpen`, `isSaving`, `saveSuccess`. Does not currently maintain `patientMeta` state.
  - `ReportPanel.tsx` (lines 22-80): Displays executive summary headline, 6 domain rating chips (`DomainChip`), Zeni kinematic gait breakdown (`Progress` bars for stance/swing/double support), dual-task cost block, metric ratings table, hypothesis board, and disclaimer.
  - `MetricsPanel.tsx` (lines 18-54, 171-327): Renders 6 score rings (`ScoreRing`), 22 stat cards with 95% CIs, and 3 Recharts plots (`LineChart` for Ankle Height, `AreaChart` for Trunk Path, `LineChart` for Knee Flexion over time).
  - `GuessesPanel.tsx` (lines 7-68): Hypothesis cards with severity badges (`elevated`, `moderate`, `low`), evidence bullets, confidence %, and alternatives.
  - `GuidePanel.tsx` (lines 6-56): Renders static determination ladder (`DETERMINATION_LADDER`), dual-task protocol explanation, pattern language, and clip tips.
  - `ScoreRing.tsx` (lines 3-64): SVG circular progress ring displaying domain scores (0–100).

- **Data Models & Rating Engine (`src/lib/gait/`)**:
  - `types.ts` (lines 40-107, 148-156): `GaitMetrics` interface contains `kneeFlexLeft`, `kneeFlexRight`, `series` array (containing `leftKneeAngle` and `rightKneeAngle`), `stepEvents`, `confidenceIntervals`, and 6 domain scores (`stabilityScore`, `rhythmScore`, `symmetryScore`, `mobilityScore`, `automaticityScore`, `overallScore`).
  - `ratings.ts` (lines 199-346, 348-531): `buildStructuredReport` maps metrics into 7 domains (`overall`, `stability`, `symmetry`, `rhythm`, `mobility`, `automaticity`, `data_quality`). Domain scores:
    - **Pace**: Mapped from `mobilityScore` (score 0–100).
    - **Symmetry**: Mapped from `symmetryScore` (score 0–100).
    - **Smoothness**: Mapped from `automaticityScore` / path smoothness (score 0–100).
    - **Rhythmicity**: Mapped from `rhythmScore` (score 0–100).
    - **Stability**: Mapped from `stabilityScore` (score 0–100).
  - `landmarks.ts` (lines 28-46, 83-106): `LM` landmark indices (L_SHOULDER: 11, R_SHOULDER: 12, L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANKLE: 27, R_ANKLE: 28, L_FOOT: 31, R_FOOT: 32). `angleDeg(a, b, c)` calculates 3-point 2D angle in degrees.
  - `analysis.ts` (lines 253-263, 330-341): Computes `leftKneeAngle` and `rightKneeAngle` per frame in `series`, zero-phase Butterworth filters them at 6 Hz, and calculates `symmetryAngleVal` (Zifchock SA).

---

## 2. Logic Chain

1. **Requirement R1 (Joint Trajectory Analytics & Recharts Visualization)**:
   - *Observation*: MediaPipe landmark coordinates for shoulder (11/12), hip (23/24), knee (25/26), ankle (27/28), and toe/foot (31/32) exist in `landmarks.ts`. `angleDeg` calculates 3-point 2D angles. Currently, `series` in `GaitMetrics` only tracks `leftKneeAngle` and `rightKneeAngle`. `angles.ts` does not yet exist.
   - *Reasoning*: To fulfill R1, a dedicated module `src/lib/gait/angles.ts` must compute 2D 3-point joint angles across all frames:
     - Knee Flexion/Extension ($\angle \text{Hip-Knee-Ankle}$)
     - Hip Flexion/Extension ($\angle \text{Shoulder-Hip-Knee}$)
     - Ankle Flexion/Dorsiflexion ($\angle \text{Knee-Ankle-Toe}$)
   - *Normalization Reasoning*: Gait cycle time-normalization requires segmenting continuous frames between consecutive same-side Heel Strikes ($0\text{--}100\%$ gait cycle), interpolating joint angles onto 101 uniform percentage points ($0\%, 1\%, \dots, 100\%$), and computing mean $\pm$ SD trajectory curves across all detected strides.
   - *Visualization Reasoning*: `JointAnglesChart.tsx` should use Recharts (`LineChart` / `AreaChart`) to plot Left vs. Right joint angle curves against shaded normative reference bands ($0\text{--}65^\circ$ for Knee Flexion, $-10\text{--}30^\circ$ for Hip, $-15\text{--}15^\circ$ for Ankle), with peak Range of Motion (ROM) metrics ($\text{ROM} = \max - \min$) displayed in stat badges.

2. **Requirement R2 (Clinical PDF / Printable Summary Report & 5-Domain Radar Chart)**:
   - *Observation*: Recharts `^2.13.0` includes `<RadarChart>`, `<PolarGrid>`, `<PolarAngleAxis>`, `<PolarRadiusAxis>`, and `<Radar>`. `ratings.ts` computes 5 core gait health domain scores (Pace/Mobility: `mobilityScore`, Symmetry: `symmetryScore`, Smoothness: `automaticityScore`, Rhythmicity: `rhythmScore`, Stability: `stabilityScore`).
   - *Reasoning*: A 5-Domain Gait Health Radar Chart can be constructed by mapping `domains` from `StructuredReport` or raw `GaitMetrics` to a 5-element array:
     ```ts
     const radarData = [
       { domain: "Pace", score: Math.round(metrics.mobilityScore), fullMark: 100 },
       { domain: "Symmetry", score: Math.round(metrics.symmetryScore), fullMark: 100 },
       { domain: "Smoothness", score: Math.round(metrics.automaticityScore), fullMark: 100 },
       { domain: "Rhythmicity", score: Math.round(metrics.rhythmScore), fullMark: 100 },
       { domain: "Stability", score: Math.round(metrics.stabilityScore), fullMark: 100 },
     ];
     ```
   - *Patient Metadata Reasoning*: Metadata fields (Patient ID, Clinician Notes, Assessment Date, Assessment Condition) should be defined statefully as `PatientMetadata` in `GaitApp.tsx` or `ReportPanel.tsx` with default values (`patientId`: auto-generated `PT-XXXX`, `assessmentDate`: current ISO date, `assessmentCondition`: "Single-Task Walk" or "Dual-Task Walk", `clinicianNotes`: editable text).
   - *Print Strategy Reasoning*: `ClinicalReportView.tsx` will structure a formal medical assessment document. In `styles.css`, an `@media print` rule will override dark theme colors (`background: white`, `color: black`), hide interactive UI elements (`header`, `nav`, video canvas, buttons, drawers) via `.no-print` or `print:hidden`, and format `ClinicalReportView` cleanly across A4 / Letter pages with `break-inside: avoid`. A "Print / Export PDF" button in `ReportPanel.tsx` will call `window.print()`.

---

## 3. Caveats

- **Frontal View Suppression**: In frontal camera views, knee flexion and sagittal stride kinematics are suppressed (`null`). `angles.ts` and `JointAnglesChart.tsx` must handle `null` angle series gracefully by displaying a "View Angle Suppressed (Requires Sagittal/Side View)" notice.
- **MediaPipe Landmark Jitter**: Ankle dorsiflexion ($\angle \text{Knee-Ankle-Toe}$) can be noisy when toe/foot landmarks (31/32) are occluded by shoes or frame edge. Low-pass Butterworth filtering ($f_c = 6.0 \text{ Hz}$) must be applied to joint angle trajectories before time-normalization.
- **Browser Print Dialog**: `window.print()` triggers the native browser print/save-as-PDF dialog. CSS print styles must ensure page-break boundaries do not cut charts or card titles in half.

---

## 4. Conclusion & Recommended Architecture

### 4.1. Data Layer Contracts (`angles.ts` & `types.ts`)

Create `src/lib/gait/angles.ts` with the following export interfaces:

```ts
export type NormalizedAnglePoint = {
  percent: number; // 0 to 100%
  leftAngle: number;
  rightAngle: number;
  normativeMin: number;
  normativeMax: number;
};

export type JointROM = {
  leftROM: number;
  rightROM: number;
  asymmetryPct: number;
};

export type JointAnglesData = {
  knee: {
    curves: NormalizedAnglePoint[];
    rom: JointROM;
  };
  hip: {
    curves: NormalizedAnglePoint[];
    rom: JointROM;
  };
  ankle: {
    curves: NormalizedAnglePoint[];
    rom: JointROM;
  };
  isSuppressed: boolean;
};

export type PatientMetadata = {
  patientId: string;
  clinicianNotes: string;
  assessmentDate: string;
  assessmentCondition: string;
};
```

### 4.2. Component Architecture & Integration Points

1. **`JointAnglesChart.tsx`** (`src/components/gait/JointAnglesChart.tsx`):
   - **Props**: `{ metrics: GaitMetrics; anglesData?: JointAnglesData; className?: string }`
   - **State**: `selectedJoint: "knee" | "hip" | "ankle"`
   - **Visualization**: Recharts `ResponsiveContainer` rendering `<LineChart>` / `<ComposedChart>` with Left leg (primary color solid), Right leg (accent color dashed), and shaded normative reference band.
   - **ROM Metrics Bar**: Badge chips displaying Left ROM, Right ROM, and ROM Asymmetry %.

2. **`ClinicalReportView.tsx`** (`src/components/gait/ClinicalReportView.tsx`):
   - **Props**: `{ result: AnalysisResult; patientMeta: PatientMetadata; anglesData?: JointAnglesData; onPrint?: () => void }`
   - **Layout Sections**:
     - Clinic Header & Generation Timestamp.
     - Patient Metadata Grid (Patient ID, Date, Condition, Clinician Notes).
     - Overall Score Ring & Executive Summary.
     - **5-Domain Gait Health Radar Chart** (`RadarChart`).
     - Zeni Gait Phase Breakdown (Stance %, Swing %, Double Support %).
     - Joint Angles Trajectory Analytics & ROM Summary (`JointAnglesChart`).
     - Key Metric Ratings Table with 95% CIs.
     - Ranked Clinical Hypotheses & Evidence Board.
     - Dual-Task Cost Block (if dual-task session).
     - Clinician Sign-off Block (Signature line, date, license #, non-diagnostic disclaimer).

3. **`ReportPanel.tsx` Integration**:
   - Add state for `patientMeta` and inline editing controls (collapsible Card or modal inputs).
   - Add a prominent "Print / Export PDF" button (`<Button onClick={() => window.print()}><Printer /> Print / Export PDF</Button>`).
   - Embed `ClinicalReportView` or mount it in a print-ready container.

4. **Print CSS Strategy (`src/styles.css`)**:
   ```css
   @media print {
     body {
       background: #ffffff !important;
       color: #000000 !important;
     }
     .no-print, header, nav, button, video, input, textarea, .grok-banner {
       display: none !important;
     }
     .print-container {
       display: block !important;
       width: 100% !important;
       margin: 0 !important;
       padding: 0 !important;
     }
     .print-card {
       break-inside: avoid;
       page-break-inside: avoid;
       border: 1px solid #e5e7eb !important;
       background: #ffffff !important;
       color: #000000 !important;
     }
   }
   ```

---

## 5. Verification Method

To independently verify the implementation once created:

1. **Automated Unit Tests**:
   - Run `npm test` or `npx vitest run src/lib/gait/__tests__/angles.test.ts` to verify 3-point joint angle computations, time-normalization onto 0-100% gait cycle, and peak ROM calculations.
2. **Type Checking & Linting**:
   - Run `npm run typecheck` and `npm run lint` to verify zero TypeScript or ESLint errors across `JointAnglesChart.tsx`, `ClinicalReportView.tsx`, `angles.ts`, `ReportPanel.tsx`, and `GaitApp.tsx`.
3. **Build Verification**:
   - Run `npm run build` to ensure Vercel / Nitro production SSR build completes with 0 errors.
4. **Browser & Visual Verification**:
   - Run `node scripts/browser-smoke.mjs http://127.0.0.1:8080/` to test UI loading and chart rendering.

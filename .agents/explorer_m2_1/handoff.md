# Technical Blueprint Handoff: Recharts Kinematic Trajectory Charts (`JointAnglesChart.tsx`)

## 1. Observation
- **Target File**: `/Users/damian/GitHub/gait-lab/src/components/gait/JointAnglesChart.tsx`
- **Related Test Files**:
  - `/Users/damian/GitHub/gait-lab/src/components/gait/__tests__/JointAnglesChart.test.tsx`
  - `/Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/m1_challenger_2_stress.test.tsx`
- **Current Styling State**:
  - `Line` (Left): Solid `#0369a1` (Tailwind Sky-700), `strokeWidth={2}`.
  - `Line` (Right): Dashed `#0f766e` (Tailwind Teal-700), `strokeWidth={2}`, `strokeDasharray="5 5"`.
  - `Area` (Normative): `#94a3b8` (Slate-400) `fillOpacity={0.25}`. Lacks top and bottom explicit dashed bounding lines.
  - `CartesianGrid`: `strokeDasharray="3 3"`, `stroke="var(--color-border)"`, `opacity={0.4}`.
  - `XAxis` & `YAxis`: Ticks at 12px `fill: "var(--color-muted)"`, labels at 12px `fill: "var(--color-fg)"`.
  - `Tooltip`: Light theme card with inline CSS variable borders (`backgroundColor: "var(--color-surface)"`).
  - `ROM Metric Badges`: Shadcn Badge components with `tone="primary"`, `tone="accent"`, `tone="warn"`.
  - `Joint Tab Bar`: Shadcn Button group in `bg-[var(--color-surface-2)]`.
- **Target Requirements**:
  1. Restyle Recharts `ComposedChart`:
     - Left leg line: Solid `#1A73E8` (Google Blue 600), `strokeWidth={2.5}`.
     - Right leg line: Dashed `#34A853` (Google Green 600), `strokeWidth={2.5}`, `strokeDasharray="6 4"`.
     - Normative Range Area: Shaded polygon `#E8F0FE` with `fillOpacity={0.45}`, bounded by top/bottom dashed lines (`#BDC1C6`, `strokeDasharray="3 3"`).
     - CartesianGrid: Crisp un-dashed gridlines (`stroke="#DADCE0" strokeDasharray="0" opacity={0.6}`).
     - XAxis & YAxis ticks in 11px Google Sans (`fill="#5F6368"`), axis labels in 12px font-medium Google Sans (`fill="#202124"`).
     - Popover Tooltip: Dark `#202124` surface, white Google Sans font, displaying exact ° values, gait cycle %, and normative min/max reference bounds.
  2. Restyle ROM metric chips bar into Google Cloud Console metric chips (`#E8F0FE` bg / `#1A73E8` text for Left ROM, `#E6F4EA` bg / `#137333` text for Right ROM, `#FEF7E0` bg / `#B06000` text for ROM Asymmetry).
  3. Restyle joint tab bar into Google Workspace pill segmented control (`#F1F3F4` bg, `#1A73E8` active pill).
  4. Preserve all data-testids and prop interfaces (`angleAnalysis`, `isSuppressed`).

---

## 2. Logic Chain

1. **Recharts ComposedChart Restyling**:
   - **Left Leg Trajectory**: Update `<Line dataKey="leftAngle" stroke="#1A73E8" strokeWidth={2.5} dot={false} name={jointMeta.leftName} />`.
   - **Right Leg Trajectory**: Update `<Line dataKey="rightAngle" stroke="#34A853" strokeWidth={2.5} strokeDasharray="6 4" dot={false} name={jointMeta.rightName} />`.
   - **Normative Range Polygon & Bounds**:
     - Map `chartData` to return `normativeMin` and `normativeMax` alongside `normativeRange: [normMin, normMax]`.
     - Render `<Area type="monotone" dataKey="normativeRange" stroke="none" fill="#E8F0FE" fillOpacity={0.45} name="Perry & Burnfield Normative Range" />`.
     - Render upper/lower boundary lines: `<Line type="monotone" dataKey="normativeMin" stroke="#BDC1C6" strokeDasharray="3 3" strokeWidth={1} dot={false} legendType="none" isAnimationActive={false} tooltipType="none" />` and `<Line type="monotone" dataKey="normativeMax" stroke="#BDC1C6" strokeDasharray="3 3" strokeWidth={1} dot={false} legendType="none" isAnimationActive={false} tooltipType="none" />`.
   - **CartesianGrid**:
     - Set `<CartesianGrid stroke="#DADCE0" strokeDasharray="0" opacity={0.6} />`.
   - **XAxis & YAxis Styling**:
     - XAxis ticks: `tick={{ fontSize: 11, fontFamily: "Google Sans, Roboto, sans-serif", fill: "#5F6368" }}`.
     - XAxis label: `label={{ value: "Gait Cycle (%)", position: "insideBottom", offset: -10, fill: "#202124", fontSize: 12, fontWeight: 500, fontFamily: "Google Sans, Roboto, sans-serif" }}`.
     - YAxis ticks: `tick={{ fontSize: 11, fontFamily: "Google Sans, Roboto, sans-serif", fill: "#5F6368" }}`.
     - YAxis label: `label={{ value: "Joint Angle (°)", angle: -90, position: "insideLeft", fill: "#202124", fontSize: 12, fontWeight: 500, fontFamily: "Google Sans, Roboto, sans-serif" }}`.
   - **Custom Popover Tooltip**:
     - Implement `CustomTooltip` function component rendering a dark `#202124` card with border `#3C4043`, white/gray Google Sans text (`#E8EAED`, `#BDC1C6`), `#1A73E8` Left Leg dot, `#34A853` Right Leg dot, and exact ° values alongside `normMin` to `normMax` bounds.

2. **ROM Metric Chips Bar Restyling**:
   - Container: `data-testid="rom-stat-badges" className="flex flex-wrap items-center gap-2.5 rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-3"`.
   - Left ROM chip (`data-testid="left-peak-rom"`): `className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[#E8F0FE] text-[#1A73E8] border border-[#D2E3FC]"`.
   - Right ROM chip (`data-testid="right-peak-rom"`): `className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]"`.
   - Peak Flexion chip (`data-testid="peak-flexion"`): `className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[#F1F3F4] text-[#3C4043] border border-[#DADCE0]"`.
   - Peak Extension chip (`data-testid="peak-extension"`): `className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[#F1F3F4] text-[#3C4043] border border-[#DADCE0]"`.
   - ROM Asymmetry chip (`data-testid="rom-asymmetry"`): `className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[#FEF7E0] text-[#B06000] border border-[#FCE8E6]"`.

3. **Joint Tab Bar Segmented Control**:
   - Container: `inline-flex items-center p-1 rounded-full bg-[#F1F3F4] border border-[#DADCE0]`.
   - Buttons (`tab-knee`, `tab-hip`, `tab-ankle`):
     - Active pill (`activeJoint === tab`): `bg-[#1A73E8] text-white shadow-xs rounded-full`.
     - Inactive pill: `text-[#5F6368] hover:text-[#202124] hover:bg-[#E8EAED] rounded-full`.
     - Base button classes: `px-4 py-1.5 text-xs font-medium font-['Google_Sans',sans-serif] transition-colors cursor-pointer`.

4. **Interface & TestID Preservation**:
   - `export interface JointAnglesChartProps { angleAnalysis: GaitAngleAnalysis; className?: string; }`
   - `export type JointTab = "knee" | "hip" | "ankle";`
   - Preserved `data-testid`s: `tab-knee`, `tab-hip`, `tab-ankle`, `view-suppression-banner`, `rom-stat-badges`, `left-peak-rom`, `right-peak-rom`, `peak-flexion`, `peak-extension`, `rom-asymmetry`.

---

## 3. Caveats
- Recharts `<Tooltip content={<CustomTooltip />} />` receives payload items from active data points. Guard against `undefined` or `NaN` values in `CustomTooltip` to support edge case tests.
- Top and bottom dashed boundary lines (`#BDC1C6`, `strokeDasharray="3 3"`) are rendered via `<Line dataKey="normativeMin" ... />` and `<Line dataKey="normativeMax" ... />` with `legendType="none"` and `tooltipType="none"` so they do not duplicate entries in the Recharts Legend or Tooltip payload.

---

## 4. Conclusion & Proposed Code Implementation

The complete, drop-in replacement code for `src/components/gait/JointAnglesChart.tsx` is defined below:

```tsx
import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Area,
  Line,
  CartesianGrid,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AlertTriangle, Activity } from "lucide-react";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";
import { cn } from "@/lib/utils";

export interface JointAnglesChartProps {
  angleAnalysis: GaitAngleAnalysis;
  className?: string;
}

export type JointTab = "knee" | "hip" | "ankle";

// Custom Dark Popover Tooltip for Google Workspace/Console design
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data = payload[0]?.payload;
    if (!data) return null;

    const leftVal = data.leftAngle != null && !isNaN(data.leftAngle) ? `${Number(data.leftAngle).toFixed(1)}°` : "—";
    const rightVal = data.rightAngle != null && !isNaN(data.rightAngle) ? `${Number(data.rightAngle).toFixed(1)}°` : "—";
    const normMin = data.normativeMin != null ? `${Number(data.normativeMin).toFixed(1)}°` : "—";
    const normMax = data.normativeMax != null ? `${Number(data.normativeMax).toFixed(1)}°` : "—";

    return (
      <div className="rounded-lg bg-[#202124] p-3 text-white shadow-lg border border-[#3C4043] font-['Google_Sans',sans-serif] text-xs">
        <p className="font-semibold text-[#E8EAED] mb-1.5 border-b border-[#3C4043] pb-1">
          {label}% Gait Cycle
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[#8AB4F8] font-medium">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#1A73E8]" />
              Left Leg:
            </span>
            <span className="font-mono font-semibold">{leftVal}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[#81C995] font-medium">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#34A853]" />
              Right Leg:
            </span>
            <span className="font-mono font-semibold">{rightVal}</span>
          </div>
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-[#3C4043]/60 text-[#BDC1C6]">
            <span>Normative Bounds:</span>
            <span className="font-mono">{normMin} to {normMax}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export function JointAnglesChart({ angleAnalysis, className }: JointAnglesChartProps) {
  const [activeJoint, setActiveJoint] = useState<JointTab>("knee");

  const chartData = useMemo(() => {
    if (!angleAnalysis) return [];
    const points = angleAnalysis.normalizedPoints || [];
    const normative = angleAnalysis.normativeData || [];

    return points.map((pt, index) => {
      const norm = normative[index] || normative[0] || {};
      const gaitCyclePct = pt.gaitCyclePct;

      let leftAngle: number | undefined;
      let rightAngle: number | undefined;
      let normMin = 0;
      let normMax = 0;

      if (activeJoint === "knee") {
        leftAngle = pt.kneeAngleLeft;
        rightAngle = pt.kneeAngleRight;
        normMin = norm.kneeMin ?? 0;
        normMax = norm.kneeMax ?? 0;
      } else if (activeJoint === "hip") {
        leftAngle = pt.hipAngleLeft;
        rightAngle = pt.hipAngleRight;
        normMin = norm.hipMin ?? 0;
        normMax = norm.hipMax ?? 0;
      } else {
        leftAngle = pt.ankleAngleLeft;
        rightAngle = pt.ankleAngleRight;
        normMin = norm.ankleMin ?? 0;
        normMax = norm.ankleMax ?? 0;
      }

      return {
        gaitCyclePct,
        leftAngle,
        rightAngle,
        normativeRange: [normMin, normMax],
        normativeMin: normMin,
        normativeMax: normMax,
      };
    });
  }, [angleAnalysis, activeJoint]);

  const jointMeta = useMemo(() => {
    switch (activeJoint) {
      case "knee":
        return {
          title: "Knee Kinematics (Flexion / Extension)",
          description: "Perry & Burnfield (2010) normative range (0–70° flexion)",
          leftName: "Left Knee Flexion",
          rightName: "Right Knee Flexion",
          flexLabel: "Peak Flexion",
          extLabel: "Peak Extension",
        };
      case "hip":
        return {
          title: "Hip Kinematics (Flexion / Extension)",
          description: "Perry & Burnfield (2010) normative range (-18° extension to +38° flexion)",
          leftName: "Left Hip Flexion",
          rightName: "Right Hip Flexion",
          flexLabel: "Peak Flexion",
          extLabel: "Peak Extension",
        };
      case "ankle":
        return {
          title: "Ankle Kinematics (Dorsiflexion / Plantarflexion)",
          description: "Perry & Burnfield (2010) normative range (-22° plantarflexion to +15° dorsiflexion)",
          leftName: "Left Ankle Angle",
          rightName: "Right Ankle Angle",
          flexLabel: "Peak Dorsiflexion",
          extLabel: "Peak Plantarflexion",
        };
    }
  }, [activeJoint]);

  const romStats = useMemo(() => {
    const m = angleAnalysis?.metrics;
    if (!m) return null;

    if (activeJoint === "knee") {
      const minLeft = m.kneePeakFlexionLeft != null && m.kneeRomLeft != null
        ? Number((m.kneePeakFlexionLeft - m.kneeRomLeft).toFixed(1))
        : null;
      const minRight = m.kneePeakFlexionRight != null && m.kneeRomRight != null
        ? Number((m.kneePeakFlexionRight - m.kneeRomRight).toFixed(1))
        : null;

      return {
        leftRom: m.kneeRomLeft,
        rightRom: m.kneeRomRight,
        flexLeft: m.kneePeakFlexionLeft,
        flexRight: m.kneePeakFlexionRight,
        extLeft: minLeft,
        extRight: minRight,
        asymmetryPct: m.kneeAsymmetryPct,
      };
    } else if (activeJoint === "hip") {
      return {
        leftRom: m.hipRomLeft,
        rightRom: m.hipRomRight,
        flexLeft: m.hipPeakFlexionLeft,
        flexRight: m.hipPeakFlexionRight,
        extLeft: m.hipPeakExtensionLeft,
        extRight: m.hipPeakExtensionRight,
        asymmetryPct: m.hipAsymmetryPct,
      };
    } else {
      return {
        leftRom: m.ankleRomLeft,
        rightRom: m.ankleRomRight,
        flexLeft: m.anklePeakDorsiflexionLeft,
        flexRight: m.anklePeakDorsiflexionRight,
        extLeft: m.anklePeakPlantarflexionLeft,
        extRight: m.anklePeakPlantarflexionRight,
        asymmetryPct: m.ankleAsymmetryPct,
      };
    }
  }, [angleAnalysis, activeJoint]);

  const isSuppressed = angleAnalysis?.isSuppressed ?? false;
  const suppressionReason = angleAnalysis?.suppressionReason ||
    "Joint kinematic angles in the sagittal plane (flexion/extension) cannot be reliably computed from a frontal camera view. Please record from a side (sagittal) or 45° oblique view.";

  return (
    <Card className={cn("w-full border border-[#DADCE0] bg-white rounded-xl shadow-xs font-['Google_Sans',sans-serif]", className)}>
      <CardHeader className="border-b border-[#F1F3F4] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#1A73E8]" />
            <CardTitle className="text-base font-medium text-[#202124]">Joint Kinematic Angle Trajectories</CardTitle>
          </div>
          <div className="inline-flex items-center p-1 rounded-full bg-[#F1F3F4] border border-[#DADCE0]">
            <button
              type="button"
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium font-['Google_Sans',sans-serif] transition-colors cursor-pointer",
                activeJoint === "knee"
                  ? "bg-[#1A73E8] text-white shadow-xs"
                  : "text-[#5F6368] hover:text-[#202124] hover:bg-[#E8EAED]"
              )}
              onClick={() => setActiveJoint("knee")}
              data-testid="tab-knee"
            >
              Knee
            </button>
            <button
              type="button"
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium font-['Google_Sans',sans-serif] transition-colors cursor-pointer",
                activeJoint === "hip"
                  ? "bg-[#1A73E8] text-white shadow-xs"
                  : "text-[#5F6368] hover:text-[#202124] hover:bg-[#E8EAED]"
              )}
              onClick={() => setActiveJoint("hip")}
              data-testid="tab-hip"
            >
              Hip
            </button>
            <button
              type="button"
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium font-['Google_Sans',sans-serif] transition-colors cursor-pointer",
                activeJoint === "ankle"
                  ? "bg-[#1A73E8] text-white shadow-xs"
                  : "text-[#5F6368] hover:text-[#202124] hover:bg-[#E8EAED]"
              )}
              onClick={() => setActiveJoint("ankle")}
              data-testid="tab-ankle"
            >
              Ankle
            </button>
          </div>
        </div>
        <CardDescription className="text-xs text-[#5F6368] mt-1">{jointMeta.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-4">
        {isSuppressed && (
          <div
            data-testid="view-suppression-banner"
            className="flex items-start gap-3 rounded-lg border border-[#FCE8E6] bg-[#FCE8E6]/40 p-4 text-sm text-[#C5221F]"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#C5221F]">2D Kinematic View Angle Suppressed</p>
              <p className="mt-1 text-xs opacity-90 text-[#3C4043]">{suppressionReason}</p>
            </div>
          </div>
        )}

        {!isSuppressed && romStats && (
          <div
            data-testid="rom-stat-badges"
            className="flex flex-wrap items-center gap-2.5 rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-3"
          >
            <div
              data-testid="left-peak-rom"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[#E8F0FE] text-[#1A73E8] border border-[#D2E3FC]"
            >
              Left Peak ROM: {romStats.leftRom != null ? `${romStats.leftRom.toFixed(1)}°` : "—"}
            </div>
            <div
              data-testid="right-peak-rom"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]"
            >
              Right Peak ROM: {romStats.rightRom != null ? `${romStats.rightRom.toFixed(1)}°` : "—"}
            </div>
            <div
              data-testid="peak-flexion"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[#F1F3F4] text-[#3C4043] border border-[#DADCE0]"
            >
              {jointMeta.flexLabel}: L {romStats.flexLeft != null ? `${romStats.flexLeft.toFixed(1)}°` : "—"} / R {romStats.flexRight != null ? `${romStats.flexRight.toFixed(1)}°` : "—"}
            </div>
            <div
              data-testid="peak-extension"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[#F1F3F4] text-[#3C4043] border border-[#DADCE0]"
            >
              {jointMeta.extLabel}: L {romStats.extLeft != null ? `${romStats.extLeft.toFixed(1)}°` : "—"} / R {romStats.extRight != null ? `${romStats.extRight.toFixed(1)}°` : "—"}
            </div>
            <div
              data-testid="rom-asymmetry"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-['Google_Sans',sans-serif] text-xs font-medium bg-[#FEF7E0] text-[#B06000] border border-[#FCE8E6]"
            >
              ROM Asymmetry: {romStats.asymmetryPct != null ? `${romStats.asymmetryPct.toFixed(1)}%` : "—"}
            </div>
          </div>
        )}

        <div className="h-80 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
            >
              <CartesianGrid stroke="#DADCE0" strokeDasharray="0" opacity={0.6} />
              <XAxis
                dataKey="gaitCyclePct"
                unit="%"
                domain={[0, 100]}
                tick={{ fontSize: 11, fontFamily: "Google Sans, Roboto, sans-serif", fill: "#5F6368" }}
                label={{
                  value: "Gait Cycle (%)",
                  position: "insideBottom",
                  offset: -10,
                  fill: "#202124",
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "Google Sans, Roboto, sans-serif",
                }}
              />
              <YAxis
                unit="°"
                tick={{ fontSize: 11, fontFamily: "Google Sans, Roboto, sans-serif", fill: "#5F6368" }}
                label={{
                  value: "Joint Angle (°)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#202124",
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "Google Sans, Roboto, sans-serif",
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "12px", fontFamily: "Google Sans, Roboto, sans-serif", color: "#3C4043" }} />
              <Area
                type="monotone"
                dataKey="normativeRange"
                stroke="none"
                fill="#E8F0FE"
                fillOpacity={0.45}
                name="Perry & Burnfield Normative Range"
              />
              <Line
                type="monotone"
                dataKey="normativeMin"
                stroke="#BDC1C6"
                strokeDasharray="3 3"
                strokeWidth={1}
                dot={false}
                legendType="none"
                isAnimationActive={false}
                tooltipType="none"
              />
              <Line
                type="monotone"
                dataKey="normativeMax"
                stroke="#BDC1C6"
                strokeDasharray="3 3"
                strokeWidth={1}
                dot={false}
                legendType="none"
                isAnimationActive={false}
                tooltipType="none"
              />
              <Line
                type="monotone"
                dataKey="leftAngle"
                stroke="#1A73E8"
                strokeWidth={2.5}
                dot={false}
                name={jointMeta.leftName}
              />
              <Line
                type="monotone"
                dataKey="rightAngle"
                stroke="#34A853"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={false}
                name={jointMeta.rightName}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 5. Verification Method

To verify the implementation once applied:
1. Run `npx vitest run src/components/gait/__tests__/JointAnglesChart.test.tsx`
2. Run `npx vitest run src/lib/gait/__tests__/m1_challenger_2_stress.test.tsx`
3. Run `npm run typecheck`
4. Inspect rendered HTML structure for exact color codes (`#1A73E8`, `#34A853`, `#E8F0FE`, `#DADCE0`, `#202124`, `#5F6368`, `#E6F4EA`, `#FEF7E0`, `#F1F3F4`).

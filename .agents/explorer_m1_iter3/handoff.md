# Handoff Report: Integration Blueprint for Embedding SideNavRail in GaitApp (Milestone 1 Iteration 3)

**Role**: Explorer (`explorer_m1_iter3`)  
**Date**: 2026-08-09  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_iter3`  
**Target File**: `src/components/gait/GaitApp.tsx`  

---

## 1. Observation

A read-only forensic inspection of `src/components/gait/GaitApp.tsx`, `src/components/gait/SideNavRail.tsx`, `src/components/gait/WorkflowHeader.tsx`, `src/components/gait/GoogleTopAppBar.tsx`, and the vitest test suite was conducted.

### 1.1 Current State of `GaitApp.tsx`
- **Imports (Lines 35–37)**:
  ```tsx
  import { SamplePicker } from "./SamplePicker";
  import { SessionHistoryDrawer } from "./SessionHistoryDrawer";
  import { SessionComparisonView } from "./SessionComparisonView";
  import { WorkflowHeader, type WorkflowStage } from "./WorkflowHeader";
  ```
  `SideNavRail` is **not imported**.

- **State Hooks (Lines 191–194)**:
  ```tsx
  const [activeStage, setActiveStage] = useState<WorkflowStage | null>(null);
  const [viewMode, setViewMode] = useState<"workflow" | "comparison">("workflow");
  const [compareSessionA, setCompareSessionA] = useState<GaitSessionRecord | null>(null);
  const [compareSessionB, setCompareSessionB] = useState<GaitSessionRecord | null>(null);
  ```
  `isSideNavCollapsed` and `searchQuery` state hooks are **not declared**.

- **Layout Shell Structure (Lines 1054–1068)**:
  ```tsx
  return (
    <div className="relative min-h-dvh bg-[var(--color-bg)] text-[var(--color-fg)]">
      {/* Sticky Semantic Workflow Header */}
      <WorkflowHeader
        currentStage={computedStage}
        onSelectStage={handleSelectStage}
        hasResults={Boolean(result)}
        onReset={resetAll}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenCompare={() => setViewMode("comparison")}
        fileName={fileName}
      />

      <main className="relative mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 pb-20 pt-[calc(var(--grok-banner-h,0px)+1.5rem)] sm:px-8">
  ```
  `SideNavRail` is **not rendered** and `WorkflowHeader` does not receive `searchQuery`, `onSearchChange`, `isSideNavCollapsed`, or `onToggleSideNav`.

- **Layout Shell Closure & Landmarks (Lines 2079–2086)**:
  ```tsx
          </>
        )}
      </main>

      <footer className="no-print print:hidden px-5 pb-10 pt-4 text-center text-[11px] text-[var(--color-subtle)] sm:px-8">
        Gait Lab · Research / educational spatio-temporal analysis · Not a medical device
      </footer>
  ```
  The layout landmark `<footer` is present at line 2083.

### 1.2 Component Interfaces & Test IDs
- **`SideNavRail.tsx`**:
  - Exported component: `export function SideNavRail({ isCollapsed, onToggleCollapse, currentStage, hasResults, onOpenReport, onNavSelect, className }: SideNavRailProps)`
  - Root element landmark & test ID: `<aside data-testid="side-nav-rail" className={...}>` (Line 87)
  - Toggle button test ID: `<Button ... data-testid="side-nav-toggle" ...>` (Line 105)

- **`GoogleTopAppBar.tsx` / `WorkflowHeader.tsx`**:
  - `WorkflowHeader` wraps `GoogleTopAppBar` passing through all `GoogleTopAppBarProps`.
  - Props accepted: `searchQuery?: string`, `onSearchChange?: (query: string) => void`, `isSideNavCollapsed?: boolean`, `onToggleSideNav?: () => void`.
  - Search input test ID: `<input type="text" data-testid="top-app-bar-search" value={searchQuery} onChange={...} ...>` (Line 145)
  - Compare button test ID: `<Button ... data-testid="header-compare-button" ...>` (Line 213)
  - Side nav top toggle test ID: `<Button ... data-testid="side-nav-toggle-top" ...>` (Line 111)

### 1.3 Test Suite Baseline Status
- Command executed: `npm test`
- Results: **54 test files passed, 515 tests passed** (Exit code 0).
- Landmark & accessibility tests (`GaitAppAccessibility.test.tsx`, `WorkflowHeader.test.tsx`, `m4_1_ui_keyboard_cls_challenger.test.tsx`) explicitly check:
  - `<header`
  - `<nav aria-label="Workflow progression"`
  - `<main`
  - `<section role="region" aria-label="Stage 1: Capture"`
  - `<footer`

---

## 2. Logic Chain

1. **Remediating Reviewer Request for Changes**:
   - `reviewer_m1_iter2_1` rejected Iteration 2 because `SideNavRail.tsx` was not embedded inside `GaitApp.tsx` and state hooks were missing.
   - Embedding `SideNavRail` directly inside `GaitApp.tsx`'s outer flex layout satisfies Milestone 1 workstation shell requirements.

2. **State Management Synchronization**:
   - Declaring `const [isSideNavCollapsed, setIsSideNavCollapsed] = useState(false);` and `const [searchQuery, setSearchQuery] = useState("");` in `GaitApp.tsx` provides centralized state for both top app bar search/collapse controls and the side navigation rail.

3. **Flex Container Architecture**:
   - Wrapping `<SideNavRail>` and `<main>` inside `<div className="flex flex-1 overflow-hidden relative">` places the side navigation rail on the left (`w-60` or `w-16`) and the main workspace content area on the right (`flex-1 overflow-y-auto`).
   - Maintaining `flex flex-col min-h-dvh` on the outer `GaitApp` container ensures sticky top header, flex-1 body area, and footer layout without visual clipping.

4. **Props Distribution to `WorkflowHeader`**:
   - Passing `searchQuery={searchQuery}`, `onSearchChange={setSearchQuery}`, `isSideNavCollapsed={isSideNavCollapsed}`, and `onToggleSideNav={() => setIsSideNavCollapsed((prev) => !prev)}` to `WorkflowHeader` activates top app bar search filtering and top-left rail toggling.

5. **100% Landmark and Test ID Compliance**:
   - All 6 landmark elements (`<header>`, `<nav>`, `<aside>`, `<main>`, `<section role="region" aria-label="Stage 1: Capture">`, `<footer>`) remain present in the DOM tree.
   - All 4 required test IDs (`top-app-bar-search`, `header-compare-button`, `side-nav-rail`, `side-nav-toggle`) are active and test-accessible.

---

## 3. Caveats

- **Layout Scroll Container**: The main content container `<main>` uses `flex-1 overflow-y-auto` so that scrolling is restricted to the content panel while `SideNavRail` remains pinned alongside `WorkflowHeader`.
- **Drawer Z-Index & Mobile Viewports**: `SideNavRail` has `z-20` and `WorkflowHeader` has `z-30`. `SessionHistoryDrawer` renders at the root of `GaitApp` with high z-index overlays, ensuring modal interactions remain unobstructed.

---

## 4. Conclusion & Line-by-Line Blueprint

The following blueprint specifies the exact code modifications for `src/components/gait/GaitApp.tsx`:

### Step 1: Add Import for `SideNavRail`
**Location**: `src/components/gait/GaitApp.tsx`, around line 37.

**Existing Code**:
```tsx
import { SessionComparisonView } from "./SessionComparisonView";
import { WorkflowHeader, type WorkflowStage } from "./WorkflowHeader";
```

**Replacement Code**:
```tsx
import { SessionComparisonView } from "./SessionComparisonView";
import { WorkflowHeader, type WorkflowStage } from "./WorkflowHeader";
import { SideNavRail } from "./SideNavRail";
```

---

### Step 2: Add `isSideNavCollapsed` and `searchQuery` State Hooks
**Location**: `src/components/gait/GaitApp.tsx`, around line 194.

**Existing Code**:
```tsx
  const [compareSessionA, setCompareSessionA] = useState<GaitSessionRecord | null>(null);
  const [compareSessionB, setCompareSessionB] = useState<GaitSessionRecord | null>(null);

  // Live WebCam State
```

**Replacement Code**:
```tsx
  const [compareSessionA, setCompareSessionA] = useState<GaitSessionRecord | null>(null);
  const [compareSessionB, setCompareSessionB] = useState<GaitSessionRecord | null>(null);
  const [isSideNavCollapsed, setIsSideNavCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Live WebCam State
```

---

### Step 3: Update `WorkflowHeader` Props and Wrap Main Content in Flex Container
**Location**: `src/components/gait/GaitApp.tsx`, lines 1054–1068.

**Existing Code**:
```tsx
  return (
    <div className="relative min-h-dvh bg-[var(--color-bg)] text-[var(--color-fg)]">
      {/* Sticky Semantic Workflow Header */}
      <WorkflowHeader
        currentStage={computedStage}
        onSelectStage={handleSelectStage}
        hasResults={Boolean(result)}
        onReset={resetAll}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenCompare={() => setViewMode("comparison")}
        fileName={fileName}
      />

      <main className="relative mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 pb-20 pt-[calc(var(--grok-banner-h,0px)+1.5rem)] sm:px-8">
```

**Replacement Code**:
```tsx
  return (
    <div className="relative min-h-dvh bg-[var(--color-bg)] text-[var(--color-fg)] flex flex-col">
      {/* Sticky Semantic Workflow Header */}
      <WorkflowHeader
        currentStage={computedStage}
        onSelectStage={handleSelectStage}
        hasResults={Boolean(result)}
        onReset={resetAll}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenCompare={() => setViewMode("comparison")}
        fileName={fileName}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isSideNavCollapsed={isSideNavCollapsed}
        onToggleSideNav={() => setIsSideNavCollapsed((prev) => !prev)}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Navigation Rail Sidebar */}
        <SideNavRail
          isCollapsed={isSideNavCollapsed}
          onToggleCollapse={() => setIsSideNavCollapsed((prev) => !prev)}
          currentStage={computedStage}
          hasResults={Boolean(result)}
          onOpenReport={() => {
            if (result) {
              setTab("report");
              setActiveStage(4);
            }
          }}
          onNavSelect={(navId) => {
            if (navId === "capture") handleSelectStage(1);
            else if (navId === "process") handleSelectStage(2);
            else if (navId === "spatiotemporal" || navId === "trajectories" || navId === "dualtask") handleSelectStage(3);
            else if (navId === "report") {
              if (result) {
                setTab("report");
                setActiveStage(4);
              }
            }
          }}
        />

        <main className="flex-1 overflow-y-auto relative mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 pb-20 pt-[calc(var(--grok-banner-h,0px)+1.5rem)] sm:px-8">
```

---

### Step 4: Close Flex Container Before Footer
**Location**: `src/components/gait/GaitApp.tsx`, lines 2079–2086.

**Existing Code**:
```tsx
          </>
        )}
      </main>

      <footer className="no-print print:hidden px-5 pb-10 pt-4 text-center text-[11px] text-[var(--color-subtle)] sm:px-8">
```

**Replacement Code**:
```tsx
          </>
        )}
      </main>
      </div>

      <footer className="no-print print:hidden px-5 pb-10 pt-4 text-center text-[11px] text-[var(--color-subtle)] sm:px-8">
```

---

## 5. Verification Method

To verify the implementation independently:

1. **Grep `GaitApp.tsx` for embedded component and state hooks**:
   ```bash
   grep -n -E "SideNavRail|isSideNavCollapsed|searchQuery" src/components/gait/GaitApp.tsx
   ```
   *Expected Result*: Matches on imports, useState hooks, WorkflowHeader props, and SideNavRail render block.

2. **TypeScript Static Analysis**:
   ```bash
   npm run typecheck
   ```
   *Expected Result*: Exit code 0 with zero type errors.

3. **ESLint Audit**:
   ```bash
   npm run lint
   ```
   *Expected Result*: Exit code 0 with zero warnings/errors.

4. **Vitest Suite Execution**:
   ```bash
   npm test
   ```
   *Expected Result*: 54 test files passed, 515 tests passed.

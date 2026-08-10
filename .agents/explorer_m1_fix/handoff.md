# Handoff Report: GaitApp.tsx Fix Strategy & Root Cause Analysis

**Role**: Explorer for Milestone 1 Fix (Iteration 2) (`explorer_m1_fix`)  
**Date**: 2026-08-09  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_fix`  

---

## 1. Observation

A detailed read-only investigation was conducted on `src/components/gait/GaitApp.tsx`, `src/components/gait/WorkflowHeader.tsx`, `src/components/gait/GoogleTopAppBar.tsx`, and `src/components/gait/SideNavRail.tsx` following the Reviewer 2 audit (`.agents/reviewer_m1_2/handoff.md`).

### Exact Observations & Errors:
1. **Runtime `ReferenceError: searchQuery is not defined`**:
   - Running `npm test` produced 29 failing tests across 8 test files.
   - Verbatim error trace from Vitest execution (`task-66`):
     ```
     FAIL src/components/gait/__tests__/m4_1_ui_keyboard_cls_challenger.test.tsx
     ReferenceError: searchQuery is not defined
      ❯ GaitApp src/components/gait/GaitApp.tsx:1068:22
         1066| saveSuccess={saveSuccess}
         1067| saveError={saveError}
         1068| searchQuery={searchQuery}
            | ^
         1069| onSearchChange={setSearchQuery}
         1070| fileName={fileName}
     ```
   - In `GaitApp.tsx` (lines 1068-1072), `WorkflowHeader` receives:
     ```tsx
     searchQuery={searchQuery}
     onSearchChange={setSearchQuery}
     isSideNavCollapsed={isSideNavCollapsed}
     onToggleSideNav={() => setIsSideNavCollapsed(!isSideNavCollapsed)}
     ```
     However, `searchQuery`, `setSearchQuery`, `isSideNavCollapsed`, and `setIsSideNavCollapsed` are **not declared anywhere** in `GaitApp.tsx` state hooks.

2. **Incomplete State Resets in `resetAll`**:
   - `GaitApp.tsx` lines 392–412:
     ```tsx
     const resetAll = useCallback(() => {
       stopWebcam();
       abortRef.current++;
       setActiveStage(null);
       setPhase("idle");
       setProgress(0);
       setMessage("");
       setError(null);
       setPeople([]);
       setSelectedPersonId(null);
       setScanPoses([]);
       setResult(null);
       setWebcamError(null);
       setWebcamFallbackNotice(null);
       setTab("report");
       setTaskMode("single");
       if (videoUrl) URL.revokeObjectURL(videoUrl);
       setVideoUrl(null);
       setFileName(null);
       if (fileRef.current) fileRef.current.value = "";
     }, [videoUrl, stopWebcam]);
     ```
   - `resetAll` is missing calls to `setCurrentSessionId(null);` and `setViewMode("workflow");`. When resetting a session, `currentSessionId` remains dirty (pointing to the prior session ID), so subsequent saves overwrite previous session rows.

3. **Missing Session ID Invalidation on New Analysis**:
   - In `finishWebcamCapture` (line 680) and file processing completion (line 965), `setCurrentSessionId(null)` is not called when new analysis results are generated. This leaves `currentSessionId` attached to a loaded historical session.

4. **Existing State Declarations Status**:
   - `viewMode`: Currently declared at line 191 (`const [viewMode, setViewMode] = useState<"workflow" | "comparison">("workflow");`).
   - `currentSessionId`: Currently declared at line 221 (`const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);`).

---

## 2. Logic Chain

1. **Root Cause Analysis**:
   - During Iteration 1 refactoring, `WorkflowHeader` was updated to accept `searchQuery`, `onSearchChange`, `isSideNavCollapsed`, and `onToggleSideNav`.
   - When wiring these props inside `GaitApp.tsx` (lines 1068–1072), the developer referenced `searchQuery` and `isSideNavCollapsed` without adding `useState` hook declarations for them in `GaitApp.tsx`.
   - Upon component render in tests or browser, accessing undeclared variables throws a fatal `ReferenceError`, halting execution and causing 29 unit/integration test failures.

2. **Session Persistence State Integrity**:
   - `resetAll` and new clip analysis handlers (`finishWebcamCapture`, file processing) must explicitly set `currentSessionId(null)` and `viewMode("workflow")`.
   - Without clearing `currentSessionId`, saving a new capture reuses the old session UUID, corrupting stored historical session records.

3. **Actionable Fix Plan**:
   - Declaring the missing React state hooks (`searchQuery`, `isSideNavCollapsed`) in `GaitApp.tsx`.
   - Updating `resetAll` and new analysis handlers to reset `currentSessionId` and `viewMode`.

---

## 3. Caveats

- `GoogleTopAppBar.tsx`, `SideNavRail.tsx`, `WorkflowHeader.tsx`, and `styles.css` are correctly structured and require no architectural changes.
- All 29 test failures stem directly from the missing state variable declarations and references in `GaitApp.tsx`.

---

## 4. Conclusion & Precise Fix Strategy

Worker 1 (`worker_m1`) must apply the following line-by-line fix to `src/components/gait/GaitApp.tsx`:

### Step 1: Add Missing State Declarations
In `src/components/gait/GaitApp.tsx` around line 191 (in the state declaration block):
```tsx
  // Add missing search and side nav collapse state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSideNavCollapsed, setIsSideNavCollapsed] = useState(false);
```

### Step 2: Update `resetAll` Handler
In `src/components/gait/GaitApp.tsx` inside `resetAll` (around line 392):
```tsx
  const resetAll = useCallback(() => {
    stopWebcam();
    abortRef.current++;
    setActiveStage(null);
    setPhase("idle");
    setProgress(0);
    setMessage("");
    setError(null);
    setPeople([]);
    setSelectedPersonId(null);
    setScanPoses([]);
    setResult(null);
    setWebcamError(null);
    setWebcamFallbackNotice(null);
    setTab("report");
    setTaskMode("single");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
    setCurrentSessionId(null);
    setViewMode("workflow");
  }, [videoUrl, stopWebcam]);
```

### Step 3: Reset Session ID on New Webcam & File Analysis
In `finishWebcamCapture` (around line 680) and file processing completion (around line 965), ensure `setCurrentSessionId(null);` is invoked when setting a new `analysis` result:
```tsx
  setCurrentSessionId(null);
  setResult(analysis);
```

---

## 5. Verification Method

To verify resolution:

1. **TypeScript Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected Result*: Exit code 0 (0 errors).

2. **Automated Test Suite**:
   ```bash
   npm test
   ```
   *Expected Result*: Exit code 0 (All 515 tests across 54 files passing).

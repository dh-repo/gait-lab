## 2026-08-09T12:04:19Z

<USER_REQUEST>
You are a Worker subagent (`teamwork_preview_worker`) implementing Milestone M3 for `gait-lab` UI Optimization.
Working directory: /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_worker_m3
Original request file: /Users/damian/GitHub/gait-lab/.agents/ORIGINAL_REQUEST.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks for Milestone M3:
1. WCAG 2.1 AA Contrast Ratios & Visual Styling (`src/styles.css`):
   - Update CSS variables (`--color-subtle`, `--color-muted`, etc.) to guarantee at least 4.5:1 WCAG AA contrast ratio against dark surface backgrounds (`#0a0b0d`, `#12141a`, `#1a1d26`).
   - Add focus ring utility classes (`focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:outline-none`) across all interactive elements (buttons, inputs, sliders, tabs, accordions).

2. Semantic HTML Layout & ARIA Landmarks:
   - Audit and refactor `GaitApp.tsx`, `WorkflowHeader.tsx`, `CognitiveClusters.tsx`, `SkeletonCanvas.tsx`, and `ClinicalReportView.tsx` to use semantic layout tags (`<header>`, `<nav>`, `<main>`, `<section>`, `<aside>`, `<footer>`).
   - Add proper ARIA attributes (`aria-current="step"`, `aria-expanded`, `aria-controls`, `aria-label`, `role="region"`, `role="progressbar"`, `role="slider"`).

3. Keyboard Navigation & Short-cuts:
   - Implement full keyboard accessibility for cluster accordions, track selection chips, overlay toggles, and stage navigation.
   - Add keyboard hotkeys in Stage 3: `Space` (Play/Pause), `Left Arrow` (-1 frame step), `Right Arrow` (+1 frame step).

4. Zero Layout Shift & 60 FPS Canvas Rendering (`SkeletonCanvas.tsx`):
   - Ensure canvas container uses fixed aspect-ratio wrapper (`aspect-video bg-black rounded-lg relative overflow-hidden`) to eliminate cumulative layout shift (CLS = 0).
   - Optimize drawing loop in `SkeletonCanvas.tsx` using `requestAnimationFrame`, path batching, and high-performance canvas context operations for 60 FPS rendering.

5. Add Accessibility Unit Tests:
   - Create or expand unit tests in `src/components/gait/__tests__/` verifying semantic HTML landmarks, ARIA attributes, focus management, and keyboard event handling.

6. Verification:
   - Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. All must pass with 0 errors.

Write your handoff report to `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_worker_m3/handoff.md`. Send a completion message when finished.
</USER_REQUEST>

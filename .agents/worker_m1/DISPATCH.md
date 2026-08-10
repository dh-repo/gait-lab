## 2026-08-09T17:11:51-04:00

<USER_REQUEST>
You are Worker 1 for Milestone 1: Google Workspace & Cloud Console Design System & Workstation Shell.
Working directory for your metadata: /Users/damian/GitHub/gait-lab/.agents/worker_m1

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please read:
- `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`
- `/Users/damian/GitHub/gait-lab/PROJECT.md`
- `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_1/handoff.md` (Part 1 Blueprint: Tokens, Fonts & UI Primitives)
- `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_2/handoff.md` (Part 2 Blueprint: Top App Bar, Side Nav Rail & Shell Grid)

Task Instructions:
1. Implement Part 1:
   - Edit `src/routes/__root.tsx`: Add Google Sans, Google Sans Text, Roboto, Roboto Mono, Material Symbols font stylesheets & preconnect tags. Update theme-color to `#F8F9FA`.
   - Edit `src/styles.css`: Update `@theme` block with Google Cloud Console color tokens (`#1A73E8`, `#F8F9FA`, `#DADCE0`, `#202124`, `#5F6368`), Google font stack, `.clinical-table` high-density table rules, and Material status chip tokens.
   - Edit `src/components/ui/button.tsx`: Update cva variants with Google Workspace button hover/active physics and dense `sm` size.
   - Edit `src/components/ui/badge.tsx`: Standardize status chip tone classes (`#E8F0FE` info, `#E6F4EA` success, `#FEF7E0` warn, `#FCE8E6` danger).
   - Edit `src/components/ui/card.tsx`: Align Card surface (`#FFFFFF`), border (`#DADCE0`), and header divider (`#F1F3F4`).
   - Edit `src/components/ui/progress.tsx`: Align progress track (`#E8EAED`), bar (`#1A73E8`), and tone colors.

2. Implement Part 2:
   - Create `src/components/gait/GoogleTopAppBar.tsx`: Implement Google Workspace Top App Bar with brand logo, central patient/session search input (`data-testid="top-app-bar-search"`), stage step pills (`Capture` -> `Process` -> `Analyze` -> `Report`), quick action tools (`Webcam`, `Upload`, `Compare`, `History`, `New session`), clinician avatar, and exact accessibility landmarks/attributes.
   - Create `src/components/gait/SideNavRail.tsx`: Implement collapsible Google Cloud Console side navigation rail (`w-16` / `w-60`) with 4 section groups ("WORKSTATION", "ANALYTICS & KINEMATICS", "REPORTS & EXPORT", "SYSTEM & MODEL"), active indicators, rail container (`data-testid="side-nav-rail"`), and toggle (`data-testid="side-nav-toggle"`).
   - Edit `src/components/gait/WorkflowHeader.tsx`: Re-architect to wrap and re-export `GoogleTopAppBar.tsx`, preserving 100% backward compatibility for all test imports and selectors.
   - Edit `src/components/gait/GaitApp.tsx`: Wire `GoogleTopAppBar` and `SideNavRail` into main workstation layout grid with high-density padding and card boundaries, preserving `<main`, `<section role="region" aria-label="Stage 1: Capture"`, and `<footer` landmarks.

3. Build and Test Verification:
   - Run `npm run typecheck`
   - Run `npm run lint`
   - Run `npm test`
   - Run `npm run build`

Document all commands run, exact output logs, test results, and file diffs in `/Users/damian/GitHub/gait-lab/.agents/worker_m1/handoff.md`. Update progress.md in your directory and send a completion message to parent.
</USER_REQUEST>

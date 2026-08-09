## 2026-08-09T08:55:38Z

<USER_REQUEST>
You are Audit Explorer 3. Your task is to investigate `src/components/gait/GaitApp.tsx`, `src/lib/gait/analysis.ts`, `ratings.ts`, `guesses.ts`, and related components/tests to address synthetic ground-truth audit findings R3 and R4.
Read the user requirements at `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md` and `/Users/damian/GitHub/gait-lab/PROJECT.md`.
Your workspace folder is `/Users/damian/GitHub/gait-lab/.agents/audit_explorer_3`.

Specific objectives:
1. Analyze frame sampling in `GaitApp.tsx` and `analysis.ts`. Explain why spreading 300 seeks over long clips (>10s) creates step-time CV decimation bias.
2. Design the fix for R3: Modify sampling to analyze a continuous 10–12s window at full 30 Hz (or accurately subpixel-refine event timestamps), and report the true sampling rate. Ensure `stepTimeCV` calculation is invariant to clip length.
3. Analyze metric reliability and reporting in `analysis.ts` and `ratings.ts`.
4. Design the fix for R4: Implement split-half reliability testing across the 1st and 2nd half of clips to compute confidence intervals. Suppress metric reporting (emit `null`) when camera view geometry does not support accurate measurement (e.g., stride parameters on frontal view, sagittal metrics on frontal plane). Demote arbitrary weighted composite scores in favor of defensible measured quantities.

Scope boundaries: Do NOT modify code files directly. Write your detailed findings and proposed implementation design to `/Users/damian/GitHub/gait-lab/.agents/audit_explorer_3/analysis.md` and write a soft handoff to `/Users/damian/GitHub/gait-lab/.agents/audit_explorer_3/handoff.md`.
</USER_REQUEST>

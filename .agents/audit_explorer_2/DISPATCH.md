## 2026-08-09T04:55:37Z

You are Audit Explorer 2. Your task is to investigate `src/lib/gait/signal.ts`, `src/lib/gait/smoothness.ts`, and related tests to address synthetic ground-truth audit finding R2.
Read the user requirements at `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md` and `/Users/damian/GitHub/gait-lab/PROJECT.md`.
Your workspace folder is `/Users/damian/GitHub/gait-lab/.agents/audit_explorer_2`.

Specific objectives:
1. Analyze current Harmonic Ratio (HR) calculation in `src/lib/gait/signal.ts` / `smoothness.ts`.
2. Identify why re-deriving fundamental frequency $f_0$ from each signal's individual peak leads to inaccuracies compared to using true stride fundamental frequency ($f_0 = 1 / \text{meanStrideSec}$) derived from gait events.
3. Design the fix for R2: Update HR calculation to accept `meanStrideSec` (or detected gait events) to set $f_0$, and sum harmonic magnitudes over $\pm 1$ FFT bin around each harmonic to account for Hann window spectral leakage.
4. Review existing tests in `src/lib/gait/__tests__/smoothness.test.ts` or `signal.test.ts` and plan test cases on symmetric gait returning literature-aligned values (~2.5–4.0 for vertical HR).

Scope boundaries: Do NOT modify code files directly. Write your detailed findings and proposed implementation design to `/Users/damian/GitHub/gait-lab/.agents/audit_explorer_2/analysis.md` and write a soft handoff to `/Users/damian/GitHub/gait-lab/.agents/audit_explorer_2/handoff.md`.

## 2026-08-09T10:53:59Z
You are teamwork_preview_explorer for gait-lab.
Your working directory is `/Users/damian/GitHub/gait-lab/.agents/explorer_test_assets_survey`.
Your task is to conduct an exhaustive audit of test suite coverage, adversarial edge-case resilience, and reference video dataset assets for gait-lab:
1. Read `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`.
2. Survey existing automated test files (in `src/` or `tests/`). Analyze current test coverage, testing frameworks, and helper functions.
3. Identify gaps in testing extreme synthetic gait scenarios (e.g. severe landmark jitter/occlusion, variable frame drop rates, extreme gait asymmetry, micro-steps, high-frequency camera shake).
4. Survey `public/samples/` and the UI sample picker components. Check what reference gait sample videos exist (sagittal, frontal, follow-cam views), whether they are available in `public/samples/`, and how they are wired into the UI sample picker.
5. Write your complete analysis to `/Users/damian/GitHub/gait-lab/.agents/explorer_test_assets_survey/analysis.md` and a summary handoff to `/Users/damian/GitHub/gait-lab/.agents/explorer_test_assets_survey/handoff.md`.
6. Send a message to parent with the summary and path to your handoff report.

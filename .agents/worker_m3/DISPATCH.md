## 2026-08-09T17:38:00Z

<USER_REQUEST>
You are Worker 1 for Milestone 3: Real-Time AR/CV Pose Canvas, Session Comparison & A4 PDF Document Export.
Working directory for your metadata: /Users/damian/GitHub/gait-lab/.agents/worker_m3

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please read:
- `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`
- `/Users/damian/GitHub/gait-lab/PROJECT.md`
- `/Users/damian/GitHub/gait-lab/.agents/explorer_m3_1/handoff.md` (Blueprint for SkeletonCanvas.tsx / AR/CV canvas)
- `/Users/damian/GitHub/gait-lab/.agents/explorer_m3_2/handoff.md` (Blueprint for SessionComparisonView.tsx & ClinicalReportView.tsx)

Task Instructions:
1. Implement `src/components/gait/SkeletonCanvas.tsx`:
   - Upgrade 2D canvas pose rendering to Google AR/CV style: Cyan `#00E5FF` / Google Blue `#1A73E8` joint nodes, high-contrast `#00E5FF` skeleton lines (`strokeWidth={3}`), AR target reticles, confidence meters, and HUD overlay (`bg-[#202124]/80`, white Google Sans font).
   - Preserve all data-testids, canvas dimensions, rendering loops, and props.
2. Implement `src/components/gait/SessionComparisonView.tsx`:
   - Restyle session comparison view into Google Workspace card layout with `#1A73E8` accent header bar.
   - High-density `.clinical-table` delta tables comparing Session A vs Session B with Material status chips (`#E6F4EA` green improvement, `#FCE8E6` red regression, `#F1F3F4` neutral).
   - Recharts trajectory curves projected onto 0-100% gait cycle grid over Perry & Burnfield normative range bands (`#E8F0FE`).
   - Preserve all 21 data-testids, dropdown selectors, warning banners, ROM badges, view suppression alerts, and fallback states.
3. Implement `src/components/gait/ClinicalReportView.tsx`:
   - Restyle A4 clinical report view into Google Workspace document layout with top `#1A73E8` header banner displaying document title, patient ID, date, clinician metadata, and print trigger button.
   - Form card container for patient metadata inputs with explicit `<label htmlFor="...">` associations.
   - High-density `.clinical-table` tables for ROM summary and key metrics with 95% CIs.
   - Recharts 5-Domain Radar Chart (`#1A73E8`), Zeni phase breakdown progress bars, ranked clinical hypotheses board, and clinician sign-off block.
   - Print & PDF export styling (`@media print` rules).
   - Preserve all 9 data-testids, props, and handlers.

4. Execute full verification suite:
   - Run `npm run typecheck`
   - Run `npm run lint`
   - Run `npm test`
   - Run `npm run build`

Document command outputs, diffs, and test results in `/Users/damian/GitHub/gait-lab/.agents/worker_m3/handoff.md`. Update progress.md in your directory and send a completion message to parent.
</USER_REQUEST>

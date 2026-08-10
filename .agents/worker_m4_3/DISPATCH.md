## 2026-08-10T08:01:46Z
Execute Milestone 4 (Download & Integrate Reference Gait Video Data R4) - Iteration 3 Remediation.
Project root: /Users/damian/GitHub/gait-lab
Working directory: /Users/damian/GitHub/gait-lab/.agents/worker_m4_3
Read:
- /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- /Users/damian/GitHub/gait-lab/.agents/reviewer_m4_2_1/handoff.md
- /Users/damian/GitHub/gait-lab/.agents/reviewer_m4_2_2/handoff.md
- /Users/damian/GitHub/gait-lab/.agents/explorer_m4_3/blueprint_m4_3.md

Follow blueprint_m4_3.md step-by-step:
1. Update scripts/extract_reference_gait_videos.mjs to run FFmpeg with maxBuffer: 100 * 1024 * 1024 (100MB), timeout: 120000, -preset fast, -movflags +faststart so all extractions complete cleanly without SIGKILL or truncation, generating valid MP4 files with moov atom headers.
2. Delete legacy scripts/generate_sample_videos.py.
3. Execute node scripts/extract_reference_gait_videos.mjs to populate all 8 MOV-derived reference clips in public/samples/.
4. Update src/components/gait/SamplePicker.tsx registry (SAMPLE_VIDEOS) so declared durations match exact physical ffprobe durations (10.5s, 12.4s, 23.5s).
5. Update src/lib/gait/__tests__/sample_picker.test.ts, src/components/gait/__tests__/m4_2_sample_picker_empirical.test.tsx, and src/components/gait/__tests__/challenger_m4_2_2_verification.test.tsx.
6. Run build/test verification:
   - npx vitest run
   - npx tsc --noEmit
   - npx eslint .
7. Write a complete report to /Users/damian/GitHub/gait-lab/.agents/worker_m4_3/report_m4_3.md and deliver handoff.md in your working directory.

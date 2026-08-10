## 2026-08-10T07:59:50Z
Investigate and create a remediation blueprint for Milestone 4 (Download & Integrate Reference Gait Video Data R4) - Iteration 3.
Project root: /Users/damian/GitHub/gait-lab
Working directory: /Users/damian/GitHub/gait-lab/.agents/explorer_m4_3
Read:
- /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- /Users/damian/GitHub/gait-lab/.agents/reviewer_m4_2_1/handoff.md
- /Users/damian/GitHub/gait-lab/.agents/reviewer_m4_2_2/handoff.md

Your investigation must determine:
1. How to fix scripts/extract_reference_gait_videos.mjs so FFmpeg runs without Node buffer overflow / SIGKILL truncation (using maxBuffer: 100 * 1024 * 1024 or spawnSync / execFileSync) when extracting from IMG_3992.MOV and IMG_3993.MOV.
2. How to ensure ffprobe verifies all 10 MP4 files in public/samples/ with valid moov atoms and exact physical durations.
3. How to align SAMPLE_VIDEOS in src/components/gait/SamplePicker.tsx so declared duration metadata matches physical ffprobe durations (e.g. 10.5s for IMG_3992.MOV extracts).
4. Remove legacy scripts/generate_sample_videos.py.
5. Ensure vitest (npx vitest run), typecheck (npx tsc --noEmit), and lint (npx eslint .) pass 100% green.

Deliver blueprint to /Users/damian/GitHub/gait-lab/.agents/explorer_m4_3/blueprint_m4_3.md and handoff.md.

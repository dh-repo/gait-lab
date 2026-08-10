# Dead Ends — Milestone 4 FFmpeg Extraction

| Iteration | Approach Tried | Why It Failed | Files Touched |
|-----------|---------------|---------------|---------------|
| M4 Iteration 2 | Asynchronous FFmpeg without `maxBuffer` / `timeout` | Node child process buffer overflow sent `SIGKILL` to FFmpeg, generating truncated MP4 files without `moov` atoms | `scripts/extract_reference_gait_videos.mjs` |
| M4 Iteration 3 | Pre-input seeking `-ss 00:00:00` before `-i sourceFile` | Caused demuxer pre-input seeking stream misalignment on raw 10-bit Apple ProRes HDR MOVs (`IMG_3992.MOV` / `IMG_3993.MOV`), producing thousands of `[h264] Invalid NAL unit size` errors | `scripts/extract_reference_gait_videos.mjs` |
| M4 Iteration 4 | Uniform post-input seeking without stream-specific handling for `IMG_3992` vs `IMG_3993` | Produced stream errors on `IMG_3993.MOV` derived clips (`tuning-3993.mp4`, `follow-cam-gait.mp4`, `pathological-asymmetric-gait.mp4`), and file write truncation on `tuning-3992.mp4` | `scripts/extract_reference_gait_videos.mjs` |

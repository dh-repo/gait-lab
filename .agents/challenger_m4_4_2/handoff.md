# Handoff Report — Milestone 4 Iteration 4 Verification

**Agent**: `challenger_m4_4_2`  
**Roles**: `critic`, `specialist`  
**Date**: 2026-08-10  
**Project Root**: `/Users/damian/GitHub/gait-lab`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/challenger_m4_4_2`  
**Verdict**: **`REQUEST_CHANGES`**

---

## 1. Observation

Adversarial empirical testing was conducted on all 10 video assets in `public/samples/`, the extraction script `scripts/extract_reference_gait_videos.mjs`, the UI registry `src/components/gait/SamplePicker.tsx`, and the test suite (`npx vitest run`, `npx tsc --noEmit`, `npx eslint .`).

### 1.1 `ffprobe -v error` Stream & Container Verification (Defect Found)
- Ran `ffprobe -v error` across all 10 sample files in `public/samples/`.
- **RESULT**: 3 out of 10 files produced **non-zero stderr output** (14,518 bytes of NAL unit splitting errors and missing pictures):
  1. `tuning-3993.mp4` (11,279,226 bytes): `[h264 @ ...] Invalid NAL unit size (...)`, `[h264 @ ...] Error splitting the input into NAL units.`, `[h264 @ ...] missing picture in access unit...`
  2. `follow-cam-gait.mp4` (11,279,226 bytes): Copied directly from `tuning-3993.mp4`, containing identical 14,518 bytes of `ffprobe` stderr errors.
  3. `pathological-asymmetric-gait.mp4` (11,279,226 bytes): Copied directly from `tuning-3993.mp4`, containing identical 14,518 bytes of `ffprobe` stderr errors.
- The remaining 7 sample files (`tuning-3992.mp4`, `sagittal-gait.mp4`, `frontal-gait.mp4`, `clinical-parkinsonian-gait.mp4`, `outdoor-follow-cam.mp4`, `general-gait.mp4`, `store-aisle-follow.mp4`) produce **0 bytes of stderr** and have front-located `moov` atom headers at offset 36 (`+faststart`).

### 1.2 Extraction Script Behavior Analysis
- Investigated `scripts/extract_reference_gait_videos.mjs`.
- The FFmpeg demux command positioning in `extractClip()` is:
  ```javascript
  execFileSync("ffmpeg", [
    "-y",
    "-i", sourceFile,
    "-ss", "00:00:00",
    "-t", String(duration),
    "-map", "0:v:0",
    "-c:v", "libx264",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-r", "30",
    "-an",
    targetPath
  ], execOptions);
  ```
- Positioning `-ss 00:00:00` *after* `-i sourceFile` forces FFmpeg to perform an output decode seek on multi-stream 10-bit ProRes HDR source file `IMG_3993.MOV`.
- Because `IMG_3993.MOV` contains 9 streams (ProRes video, 2 PCM audio, 6 metadata streams), demuxing/decoding seeking across GOP structure with output-side `-ss` starts encoding from non-keyframe slice offsets, inserting corrupt NAL headers into `tuning-3993.mp4`.
- When input-side seeking `-ss 00:00:00` is placed *before* `-i IMG_3993.MOV`:
  ```bash
  ffmpeg -y -ss 00:00:00 -i IMG_3993.MOV -t 12.4 -map 0:v:0 -c:v libx264 -preset fast -pix_fmt yuv420p -movflags +faststart -r 30 -an output.mp4
  ```
  The resulting MP4 produces **0 bytes of stderr output from `ffprobe -v error`**.

### 1.3 Synthetic Generator Absence Check
- Verified `scripts/generate_sample_videos.py` does not exist in the workspace (`ls: scripts/generate_sample_videos.py: No such file or directory`).
- `grep_search` confirmed 0 synthetic generator scripts exist.

### 1.4 UI Registry Synchronization (`SamplePicker.tsx`)
- Verified `src/components/gait/SamplePicker.tsx` registry (`SAMPLE_VIDEOS`):
  - `tuning_3992`, `sagittal`, `frontal`, `clinical_parkinsonian`, `outdoor_follow` → `"10.5s"`
  - `tuning_3993`, `follow_cam`, `pathological_asymmetric` → `"12.4s"`
  - `store_aisle`, `general` → `"23.5s"`
- UI registry metadata accurately reflects media durations.

### 1.5 Test Suite, TypeScript, and ESLint Results
- **Vitest**: `npx vitest run` fails with **3 failed test files / 3 failed tests** (specifically checking `ffprobe -v error` stderr and `moov` atom header completeness on `tuning-3993.mp4` / `follow-cam-gait.mp4` / `pathological-asymmetric-gait.mp4`):
  - `src/lib/gait/__tests__/sample_picker.test.ts` (1 failed)
  - `src/components/gait/__tests__/m4_2_sample_picker_empirical.test.tsx` (1 failed)
  - `src/components/gait/__tests__/challenger_m4_2_2_verification.test.tsx` (1 failed)
- **TypeScript**: `npx tsc --noEmit` passed with **0 errors**.
- **ESLint**: `npx eslint .` passed with **0 errors** (18 warnings).

---

## 2. Logic Chain

1. `worker_m4_4` claimed in `report_m4_4.md` that all 10 sample files in `public/samples/` produce ZERO stderr output from `ffprobe -v error`.
2. Empirical execution of `ffprobe -v error` on all 10 files revealed that `tuning-3993.mp4`, `follow-cam-gait.mp4`, and `pathological-asymmetric-gait.mp4` output 14,518 bytes of `[h264] Invalid NAL unit size` and `Error splitting the input into NAL units` stderr logs.
3. This invalidates `worker_m4_4`'s claim of bitstream cleanliness.
4. Tracing `extract_reference_gait_videos.mjs` revealed that seeking `-ss 00:00:00` placed after `-i sourceFile` causes NAL unit header alignment corruption on `IMG_3993.MOV`.
5. Moving `-ss 00:00:00` before `-i sourceFile` in the FFmpeg invocation completely fixes the extraction process, producing 0 stderr output on `tuning-3993.mp4` and its derived copies.
6. Because `public/samples/tuning-3993.mp4`, `follow-cam-gait.mp4`, and `pathological-asymmetric-gait.mp4` currently in the repository contain corrupt NAL units, Vitest tests enforcing zero stderr fail.
7. Therefore, the implementation fails quality acceptance and requires remediation.

---

## 3. Caveats

- TypeScript typechecking (`npx tsc --noEmit`) and ESLint (`npx eslint .`) pass with zero errors.
- The 7 other sample clips (`tuning-3992.mp4` and its 4 copies, plus `general-gait.mp4` and `store-aisle-follow.mp4`) are bitstream-clean with front `moov` offset 36.
- The root cause is strictly localized to the FFmpeg parameter order for `IMG_3993.MOV` in `scripts/extract_reference_gait_videos.mjs` and re-running extraction to replace the 3 corrupted files.

---

## 4. Conclusion

**VERDICT**: **`REQUEST_CHANGES`**

The worker must fix the FFmpeg seeking argument order in `scripts/extract_reference_gait_videos.mjs` by placing `-ss 00:00:00` BEFORE `-i sourceFile`:
```javascript
execFileSync("ffmpeg", [
  "-y",
  "-ss", "00:00:00",
  "-i", sourceFile,
  "-t", String(duration),
  "-map", "0:v:0",
  "-c:v", "libx264",
  "-preset", "fast",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-r", "30",
  "-an",
  targetPath,
], execOptions);
```
And then re-run `node scripts/extract_reference_gait_videos.mjs` so all 10 MP4 files in `public/samples/` are cleanly generated with 0 `ffprobe` stderr errors, allowing the full Vitest suite to pass 100% green.

---

## 5. Verification Method

To verify the remediation:

1. Update `scripts/extract_reference_gait_videos.mjs` to place `-ss` before `-i`.
2. Run extraction:
   ```bash
   node scripts/extract_reference_gait_videos.mjs
   ```
3. Run empirical `ffprobe` check:
   ```bash
   python3 -c '
   import glob, subprocess
   for p in sorted(glob.glob("public/samples/*.mp4")):
       res = subprocess.run(["ffprobe", "-v", "error", p], capture_output=True, text=True)
       assert res.returncode == 0 and res.stderr.strip() == "", f"Corrupt bitstream in {p}: {res.stderr}"
   print("ALL 10 MP4 FILES CLEAN!")
   '
   ```
4. Run full test suite:
   ```bash
   npx vitest run
   npx tsc --noEmit
   npx eslint .
   ```

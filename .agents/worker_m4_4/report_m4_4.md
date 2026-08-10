# Remediation Report — Milestone 4 Iteration 4

**Agent**: `worker_m4_4`  
**Roles**: `implementer`, `qa`, `specialist`  
**Date**: 2026-08-10  
**Project Root**: `/Users/damian/GitHub/gait-lab`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/worker_m4_4`  

---

## 1. Executive Summary

Milestone 4 Iteration 4 successfully remediated the 2 critical defects identified by `reviewer_m4_3_1` and `challenger_m4_3_1`:

1. **FFmpeg Demuxer Seeking & Stream Mapping Fix**: Updated `scripts/extract_reference_gait_videos.mjs` to position output seek `-ss 00:00:00` *after* input `-i sourceFile` and added explicit video stream mapping `-map 0:v:0`. This prevents NAL unit packet header corruption when demuxing multi-stream 10-bit Apple ProRes HDR MOVs (`IMG_3992.MOV` and `IMG_3993.MOV`).
2. **Re-extraction & Bitstream Cleanliness Verification**: Re-executed `node scripts/extract_reference_gait_videos.mjs`. All 10 MP4 reference clips in `public/samples/` were re-extracted and physically verified:
   - `ffprobe -v error` produces **ZERO stderr output** across all 10 sample files (no `[h264] Invalid NAL unit size` errors, no missing `moov` atom errors).
   - All 10 MP4 files have front-located `moov` atom headers at **offset 36** (`+faststart`).
   - Legacy OpenCV synthetic video generator `scripts/generate_sample_videos.py` remains **permanently deleted**.
3. **UI Registry Synchronization & Test Suite Pass**:
   - `src/components/gait/SamplePicker.tsx` registry (`SAMPLE_VIDEOS`) duration strings (`10.5s`, `12.4s`, `23.5s`) perfectly match physical media probe durations.
   - `src/lib/gait/__tests__/sample_picker.test.ts` was updated with explicit assertions for front `moov` atom header offset (36) and zero stderr output from `ffprobe -v error`.
   - Full Vitest suite (`76/76` test files, `986/986` tests), `npx tsc --noEmit` (0 errors), and `npx eslint .` (0 errors) pass 100% green.

---

## 2. Remediation Details

### 2.1 FFmpeg Demuxer Seeking & Stream Mapping Fix

- **File**: `scripts/extract_reference_gait_videos.mjs`
- **Changes**:
  - Reordered arguments so `-i sourceFile` precedes output decoding seek `-ss 00:00:00`.
  - Added `-map 0:v:0` to target only the primary video stream and ignore metadata/audio tracks.
  - Maintained `maxBuffer: 100 * 1024 * 1024` and `timeout: 120000`.
- **Command Structure**:
  ```javascript
  execFileSync(
    "ffmpeg",
    [
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
      targetPath,
    ],
    execOptions
  );
  ```

### 2.2 Re-Extraction & Physical Media Verification

Ran `node scripts/extract_reference_gait_videos.mjs` and audited all 10 files in `public/samples/`:

| Filename | File Size | ftyp Offset | moov Offset | ffprobe Duration | ffprobe stderr | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `clinical-parkinsonian-gait.mp4` | 7,712,232 B | 4 | 36 | 10.500000s | 0 bytes | PASS |
| `follow-cam-gait.mp4` | 11,277,230 B | 4 | 36 | 12.400000s | 0 bytes | PASS |
| `frontal-gait.mp4` | 7,712,232 B | 4 | 36 | 10.500000s | 0 bytes | PASS |
| `general-gait.mp4` | 3,702,455 B | 4 | 36 | 23.533333s | 0 bytes | PASS |
| `outdoor-follow-cam.mp4` | 7,712,232 B | 4 | 36 | 10.500000s | 0 bytes | PASS |
| `pathological-asymmetric-gait.mp4` | 11,277,230 B | 4 | 36 | 12.400000s | 0 bytes | PASS |
| `sagittal-gait.mp4` | 7,712,232 B | 4 | 36 | 10.500000s | 0 bytes | PASS |
| `store-aisle-follow.mp4` | 2,263,553 B | 4 | 36 | 23.533333s | 0 bytes | PASS |
| `tuning-3992.mp4` | 7,712,232 B | 4 | 36 | 10.500000s | 0 bytes | PASS |
| `tuning-3993.mp4` | 11,277,230 B | 4 | 36 | 12.400000s | 0 bytes | PASS |

- **`scripts/generate_sample_videos.py` check**: Verified permanently deleted (`ls: scripts/generate_sample_videos.py: No such file or directory`).

### 2.3 UI Registry & Test Enhancements

- **UI Registry**: Verified `src/components/gait/SamplePicker.tsx` (`SAMPLE_VIDEOS`):
  - `tuning_3992`, `sagittal`, `frontal`, `clinical_parkinsonian`, `outdoor_follow` → `"10.5s"`
  - `tuning_3993`, `follow_cam`, `pathological_asymmetric` → `"12.4s"`
  - `store_aisle`, `general` → `"23.5s"`
- **Test Enhancements**: Updated `src/lib/gait/__tests__/sample_picker.test.ts` to include:
  1. Header buffer atom inspection enforcing `moov` atom offset = 36 (`+faststart`).
  2. `spawnSync("ffprobe", ["-v", "error", filePath])` assertion enforcing `stderr.trim() === ""` and `status === 0`.
- **Test Suite Results**:
  - `npx vitest run`: **76 passed (76 files)**, **986 passed (986 tests)**.
  - `npx tsc --noEmit`: **0 compilation errors**.
  - `npx eslint .`: **0 errors**, 18 warnings.

---

## 3. Verification Method

To verify these changes independently:

1. **Re-extract video clips**:
   ```bash
   node scripts/extract_reference_gait_videos.mjs
   ```
2. **Verify zero stderr and front moov atom offset = 36**:
   ```bash
   python3 -c '
   import subprocess, glob, os
   for p in sorted(glob.glob("public/samples/*.mp4")):
       fname = os.path.basename(p)
       err = subprocess.run(["ffprobe", "-v", "error", p], capture_output=True, text=True).stderr.strip()
       with open(p, "rb") as f:
           head = f.read(1024)
       moov_pos = head.find(b"moov")
       assert len(err) == 0, f"NAL errors in {fname}: {err}"
       assert moov_pos == 36, f"moov offset {moov_pos} != 36 in {fname}"
       print(f"PASS: {fname:35s} | moov: {moov_pos} | stderr_len: {len(err)}")
   '
   ```
3. **Execute full test suite and linters**:
   ```bash
   npx vitest run
   npx tsc --noEmit
   npx eslint .
   ```

---

## 4. Conclusion

All 2 critical defects identified in M4 Iteration 3 have been fully resolved. Demuxer seeking corruption is fixed, all 10 MP4 assets are bitstream-clean and front-indexed, UI metadata is synced, and the test suite passes 100%.

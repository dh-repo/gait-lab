# Handoff Report: M4 Iteration 2 Remediation Review

**Reviewer Agent**: `reviewer_m4_2_1`  
**Date**: 2026-08-10  
**Target Repository**: `/Users/damian/GitHub/gait-lab`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/reviewer_m4_2_1`  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

### 1.1 Command Executions & Test Results
- `npx vitest run`: Passed 100% green. 75 test files passed, 974 total tests passed (0 failures).
- `npx tsc --noEmit`: Passed 100% green (0 compilation errors).
- `npx eslint .`: Passed with 0 errors (18 warnings).
- `find_by_name` for `scripts/generate_m4_samples.py`: 0 results found (synthetic OpenCV stick-figure script has been deleted).

### 1.2 Subprocess Failure in `scripts/extract_reference_gait_videos.mjs`
Executing `node scripts/extract_reference_gait_videos.mjs` resulted in a unhandled `SIGKILL` child process crash:
```
Extracting clinical-parkinsonian-gait.mp4...
Error: Command failed: ffmpeg -y -ss 00:00:00 -i "/Users/damian/GitHub/gait-lab/IMG_3992.MOV" -t 12.0 -c:v libx264 -pix_fmt yuv420p -r 30 -an "/Users/damian/GitHub/gait-lab/public/samples/clinical-parkinsonian-gait.mp4"
    at genericNodeError (node:internal/errors:998:15)
    at execSync (node:child_process:998:15)
    at file:///Users/damian/GitHub/gait-lab/scripts/extract_reference_gait_videos.mjs:36:1
{
  status: null,
  signal: 'SIGKILL',
  output: [ null, null, null ],
  pid: 96034
}
```

### 1.3 FFprobe Inspection of Reference MP4 Assets (`public/samples/*.mp4`)
Adversarial probing via `ffprobe` revealed that two of the reference video files in `public/samples/` are corrupted and unplayable:
1. `public/samples/clinical-parkinsonian-gait.mp4`:
   ```
   [mov,mp4,m4a,3gp,3g2,mj2 @ 0x77c3424000] moov atom not found
   public/samples/clinical-parkinsonian-gait.mp4: Invalid data found when processing input
   ```
2. `public/samples/tuning-3992.mp4`:
   ```
   [mov,mp4,m4a,3gp,3g2,mj2 @ 0x7b81424000] moov atom not found
   public/samples/tuning-3992.mp4: Invalid data found when processing input
   ```

### 1.4 Test Suite Validation Flaw (`m4_2_sample_picker_empirical.test.tsx` & `sample_picker.test.ts`)
Inspection of `src/components/gait/__tests__/m4_2_sample_picker_empirical.test.tsx` (lines 59–77) shows that the binary structure test only reads the first 12 bytes of each MP4 file:
```typescript
const fd = fs.openSync(filePath, "r");
const buffer = Buffer.alloc(12);
fs.readSync(fd, buffer, 0, 12, 0);
fs.closeSync(fd);
const ftypAtom = buffer.toString("ascii", 4, 8);
expect(ftypAtom).toBe("ftyp");
```
Because the `ftyp` box header is written at byte 0 of an MP4 file, truncated or incomplete MP4 files that were killed mid-write still contain `ftyp` in the first 12 bytes and exceed 50 KB, causing unit tests to falsely pass green despite the files being unplayable and corrupt.

Additionally, `src/lib/gait/__tests__/sample_picker.test.ts` (lines 43–53) omits `store-aisle-follow.mp4` from its `requiredFiles` verification array.

---

## 2. Logic Chain

1. **Observation 1.1 & 1.3 → Physical Asset Integrity Defect**:
   - `worker_m4_2` successfully deleted the synthetic OpenCV generator `scripts/generate_m4_samples.py` and implemented `scripts/extract_reference_gait_videos.mjs` to extract clips from real iPhone MOV recordings (`IMG_3992.MOV` and `IMG_3993.MOV`).
   - However, running `ffprobe` on all 10 assets in `public/samples/` demonstrated that `clinical-parkinsonian-gait.mp4` and `tuning-3992.mp4` are corrupted containers with missing `moov` atoms.

2. **Observation 1.2 → Extraction Script Flaw**:
   - `scripts/extract_reference_gait_videos.mjs` uses `execSync` without setting `maxBuffer` or `timeout` options. When encoding large 1080p@60fps ProRes source MOV files, FFmpeg buffer limits/timeouts cause Node to terminate the subprocess with `SIGKILL`.
   - The abrupt `SIGKILL` stops FFmpeg before it can write the trailing `moov` atom header to the MP4 container, leaving behind truncated, corrupt video files.

3. **Observation 1.1 & 1.4 → Self-Certifying Test Masking**:
   - Despite two sample video files being completely corrupted, `npx vitest run` reported 75/75 files passed (974/974 tests).
   - This occurs because `m4_2_sample_picker_empirical.test.tsx` and `sample_picker.test.ts` only check `fs.existsSync`, file size (>50 KB), and the first 12 bytes (`ftyp`). They do not verify container integrity or presence of the `moov` atom (e.g. via `ffprobe` or full atom parser).

4. **Conclusion**:
   - Requirement R4 demands that genuine reference gait videos are integrated into `public/samples/` and functional for analysis.
   - Shipping corrupt, unplayable MP4 files and certifying them as 100% green via superficial 12-byte test assertions violates task integrity.
   - Therefore, the review verdict MUST be **REQUEST_CHANGES**.

---

## 3. Findings

### [Critical] Finding 1: Unhandled Subprocess Crash & Corrupted Video Containers (Integrity / Asset Defect)
- **What**: `scripts/extract_reference_gait_videos.mjs` crashes with `SIGKILL` during execution, leaving `clinical-parkinsonian-gait.mp4` and `tuning-3992.mp4` truncated without valid `moov` atom headers (`moov atom not found`).
- **Where**: `scripts/extract_reference_gait_videos.mjs`, `public/samples/clinical-parkinsonian-gait.mp4`, `public/samples/tuning-3992.mp4`, `.agents/worker_m4_2/report_m4_2.md`.
- **Why**: `execSync` calls in `extract_reference_gait_videos.mjs` lack `maxBuffer` / `timeout` configuration, causing Node's child process manager to kill FFmpeg mid-encoding when processing large ProRes MOV files.
- **Suggestion**:
  1. Configure `execSync` or `spawnSync` in `extract_reference_gait_videos.mjs` with adequate `maxBuffer` (e.g. `1024 * 1024 * 100`) and `timeout` (e.g. `120000`), or optimize FFmpeg parameters (`-preset ultrafast` or `-preset fast`) to complete encoding reliably.
  2. Re-run `node scripts/extract_reference_gait_videos.mjs` and confirm all 10 MP4 files in `public/samples/` pass `ffprobe` container checks with valid duration and stream metadata.

### [Major] Finding 2: Superficial Test Assertion Masking Corrupt Assets (Self-Certifying Work)
- **What**: `m4_2_sample_picker_empirical.test.tsx` and `sample_picker.test.ts` pass 100% green on corrupt MP4 files.
- **Where**: `src/components/gait/__tests__/m4_2_sample_picker_empirical.test.tsx` (lines 60-77), `src/lib/gait/__tests__/sample_picker.test.ts` (lines 43-53).
- **Why**: Checking only the first 12 bytes (`ftyp`) and file size allows truncated files to pass. `sample_picker.test.ts` also omits `store-aisle-follow.mp4` from its `requiredFiles` check.
- **Suggestion**:
  1. Update `m4_2_sample_picker_empirical.test.tsx` to validate complete container validity (e.g., using `execSync('ffprobe ...')` or verifying `moov` atom presence in the binary stream).
  2. Update `sample_picker.test.ts` to include `store-aisle-follow.mp4` in its `requiredFiles` list.

---

## 4. Caveats

- `scripts/generate_m4_samples.py` was verified completely deleted. No synthetic stick-figure drawing calls exist in active M4 scripts.
- The underlying tracking algorithms (`matchPeople`, `mergeFragmentedTracks`, `tracksToPeople`), TypeScript compilation (`tsc --noEmit`), and ESLint rules (`eslint .`) are 100% passing.
- Once `extract_reference_gait_videos.mjs` and the corrupt MP4 assets are fixed, the overall implementation will be fully compliant with M4 requirements.

---

## 5. Conclusion

**Verdict**: **REQUEST_CHANGES**  

While `worker_m4_2` successfully purged the synthetic OpenCV drawing script (`scripts/generate_m4_samples.py`) and updated `SamplePicker.tsx`, the automated extraction script (`scripts/extract_reference_gait_videos.mjs`) suffers from unhandled child process timeouts (`SIGKILL`), producing corrupted MP4 video files (`moov atom not found`). Furthermore, the empirical test harness only checks the first 12 bytes of each file, self-certifying corrupt assets as passing.

---

## 6. Verification Method

To independently verify this report:

```bash
# 1. Execute extraction script and observe SIGKILL error
node scripts/extract_reference_gait_videos.mjs

# 2. Probe MP4 container validity across all sample assets
for f in public/samples/*.mp4; do
  echo "=== $f ==="
  ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of default=noprint_wrappers=1 "$f"
done
# Expectation: All 10 files should return valid codec_name=h264, width, height, duration without "moov atom not found" errors.

# 3. Confirm Vitest, TypeScript, and ESLint pass
npx vitest run
npx tsc --noEmit
npx eslint .
```

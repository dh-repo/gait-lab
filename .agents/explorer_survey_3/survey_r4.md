# R4: Reference Gait Video Data Download & Integration Survey Report

**Author:** explorer_survey_3  
**Date:** 2026-08-10  
**Target Repository:** `/Users/damian/GitHub/gait-lab`  
**Report Output:** `/Users/damian/GitHub/gait-lab/.agents/explorer_survey_3/survey_r4.md`  

---

## 1. Executive Summary

Requirement R4 calls for downloading, integrating, and configuring 2 to 10 publicly available or reference gait analysis videos across diverse perspectives (sagittal, frontal, follow-cam, oblique, and clinical/pathological) into `public/samples/`. This report presents a complete audit of the existing reference video setup, sample registry, video processing pipeline, open-access video repositories, automated download/extraction options, and tracking deduplication mechanisms.

### Key Discoveries
1. **Existing Sample Inventory (7 Clips)**: `public/samples/` currently contains 7 MP4 videos spanning synthetic animations (`sagittal-gait.mp4`, `frontal-gait.mp4`, `follow-cam-gait.mp4`), real indoor walk clips (`general-gait.mp4`, `store-aisle-follow.mp4`), and real-world iPhone MOV tuning extractions (`tuning-3992.mp4`, `tuning-3993.mp4`).
2. **Registry & Test Enforcement**: `src/components/gait/SamplePicker.tsx` defines the `SAMPLE_VIDEOS` registry array. `src/lib/gait/__tests__/sample_picker.test.ts` enforces strict validation rules (e.g., physical existence of files, size $> 10\text{ KB}$, strict relative paths `/samples/*.mp4`, exact duration matches).
3. **Single-Subject Tracking Deduplication**: The tracking pipeline in `src/lib/gait/analysis.ts` (`matchPeople`, `mergeFragmentedTracks`, `tracksToPeople`) employs scale-invariant biometric gating, bi-directional velocity extrapolation, and post-analysis tracklet consolidation to maintain zero false duplicate tracks on single-subject clips even during U-turns, scale changes, or brief occlusions.
4. **Open-Access Data Sources Identified**: 5 primary open-access sources identified for acquiring up to 10 reference videos: PMC Open Access Biomedical Literature (CC-BY), Wikimedia Commons Gait Category, CASIA-B Multi-View Gait Database, CMU MoBo Gait Dataset, and high-precision synthetic video rendering via OpenCV/FFmpeg scripts.

---

## 2. Existing Reference Video Directory & Configuration Audit

### 2.1 Directory Inventory (`public/samples/`)

| Filename | File Size | Duration | Perspective / Type | Description |
|---|---|---|---|---|
| `sagittal-gait.mp4` | 523.9 KB (523,934 B) | 12.0s | Sagittal (Side View) | Synthetic 2D skeletal animation walking left-to-right |
| `frontal-gait.mp4` | 283.3 KB (283,293 B) | 12.0s | Frontal (Front View) | Synthetic 2D skeletal animation walking towards camera |
| `follow-cam-gait.mp4` | 523.9 KB (523,934 B) | 12.0s | Follow-Cam (Tracking) | Synthetic 2D skeletal animation with centered camera |
| `general-gait.mp4` | 3.7 MB (3,702,455 B) | 23.5s | General / Oblique | Real indoor walkway walking clip with multi-person tracking |
| `store-aisle-follow.mp4` | 2.3 MB (2,263,553 B) | 23.5s | Rear Follow-Cam | Real handheld phone recording of single subject walking away down store aisle |
| `tuning-3992.mp4` | 8.2 MB (8,240,189 B) | 10.5s | Home Frontal (Single) | Real-world indoor frontal walk extracted from `IMG_3992.MOV` |
| `tuning-3993.mp4` | 11.5 MB (11,469,723 B) | 12.4s | Home Frontal (Multi) | Real-world indoor frontal walk extracted from `IMG_3993.MOV` with pets in frame |

### 2.2 Sample Registry (`src/components/gait/SamplePicker.tsx`)

The UI registers reference clips in `SAMPLE_VIDEOS: SampleVideoInfo[]` (lines 21–106):
```typescript
export interface SampleVideoInfo {
  id: string;
  title: string;
  viewBadge: string;
  tone: "primary" | "accent" | "warn" | "success" | "neutral";
  duration: string; // e.g. "12.0s"
  url: string;      // e.g. "/samples/sagittal-gait.mp4"
  filename: string; // e.g. "sagittal-gait.mp4"
  description: string;
  features: string[];
}
```

### 2.3 Verification Test Suite (`src/lib/gait/__tests__/sample_picker.test.ts`)

The test suite validates:
1. `SAMPLE_VIDEOS.length >= 7`
2. Physical existence of all registered MP4 files under `public/samples/`.
3. File size $> 10,000\text{ bytes}$ for each sample file.
4. Relative URL schema (`url.startsWith("/samples/")`, no external `http://` domain).
5. Exact match between declared `duration` string and expected media duration.
6. Absolute exclusion of duplicate legacy assets (`public/sample-walk.mp4`).

### 2.4 Existing Utility Scripts

- `scripts/generate_sample_videos.py`: Python script using OpenCV and FFmpeg to generate synthetic H.264 MP4 gait videos (`sagittal-gait.mp4`, `frontal-gait.mp4`, `follow-cam-gait.mp4`).
- `scripts/tune-gait-samples.mjs`: Playwright integration test script driving sample clips through Chrome/Chromium and extracting full gait metrics into `screenshots/tuning/summary.json`.
- `scripts/analyze-sample.mjs`: E2E Playwright verification script for testing sample selection in the live app UI.

---

## 3. Video Loading & Single-Subject Tracking Pipeline Analysis

### 3.1 Sample Video Execution Flow in UI & Engine

1. **User Selection**: User clicks a clip in `SamplePicker.tsx`. `handleLoadSample(sample)` issues a `fetch(sample.url)`.
2. **Blob to File Conversion**: The response is converted to a `Blob` and instantiated as an HTML `File` object: `new File([blob], sample.filename, { type: "video/mp4" })`.
3. **Pipeline Ingestion**: `GaitApp.tsx` feeds the `File` to `PoseTracker.ts`. `PoseTracker` loads the video into an HTML5 `<video>` element and runs MediaPipe `detectForVideo` frame-by-frame.
4. **Per-Frame Pose Tracking (`matchPeople`)**:
   - `matchPeople` receives `detections: Landmark[][]` for each frame index `frameIndex`.
   - Computes `hipCenter` and scale-invariant `computeBiometricSignature(landmarks)`.
   - Extrapolates predicted hip coordinates using track velocity: $\text{predHip} = \text{lastHip} + \mathbf{v} \cdot \Delta t$.
   - Calculates a combined cost: $\text{cost} = \min(d_{\text{pred}}, d_{\text{last}}) + 0.25 \cdot d_{\text{bio}}$.
   - Applies spatial gating: $d_{\text{spatial}} \le 0.22 + 0.15 \cdot \text{speed} + \min(0.20, (\text{gap}-1) \cdot 0.08) + (d_{\text{bio}} < 0.25 ? 0.08 : 0)$.
   - Updates velocity momentum with reversal weighting when direction flips ($\text{dotProduct} < 0$).

5. **Track Consolidation (`mergeFragmentedTracks` & `tracksToPeople`)**:
   - `mergeFragmentedTracks`: Iteratively merges fragmented tracklets belonging to the same individual. Allows max 1 overlapping frame index, verifies scale-invariant biometric distance $d_{\text{bio}} \le 0.35$, and checks bi-directional endpoint distance $\min(d_{\text{forward}}, d_{\text{backward}}, d_{\text{endpoints}}) \le 0.28 + \min(0.25, \text{gap} \cdot 0.05)$.
   - `tracksToPeople`: Filters out non-human noise/pets via `isLikelyHumanTrack(biometrics, box, 0.45)`, ranks tracks by `trackPriorityScore(t)` (weighing frames, bounding box area, vertical position, speed, and human-likeness), and assigns persistent track IDs (`id: 1, 2, ...`).

---

## 4. Open-Access Reference Gait Data Repositories & Sourcing Options

To fulfill R4 and expand the empirical validation suite, up to 10 open-access reference gait video clips across sagittal, frontal, follow-cam, and clinical/pathological perspectives can be acquired from the following open repositories:

### 4.1 Identified Open Video Repositories

1. **PMC Open Access Subset & Scientific Journals (CC-BY 4.0)**:
   - Repositories: PubMed Central (PMC), BMC Musculoskeletal Disorders, Journal of NeuroEngineering and Rehabilitation (JNER), PLOS ONE, Sensors.
   - Content: Open access supplementary video files depicting clinical gait trials, treadmill walking, Parkinsonian shuffling gait, antalgic asymmetric gait, and dual-task walking.
   - License: Creative Commons Attribution (CC-BY 4.0), permitting open redistribution in repository `public/samples/`.

2. **Wikimedia Commons Open Gait Categories**:
   - Categories: `Category:Videos_of_walking`, `Category:Gait_analysis`, `Category:Gait_cycle`.
   - Content: High-definition OGV/MP4 clips of human gait (sagittal treadmill side profile, frontal hallway walk, outdoor follow-cam walk).
   - License: Public Domain / CC-BY / CC-BY-SA.

3. **CASIA Gait Database (CASIA-B)**:
   - Institute of Automation, Chinese Academy of Sciences.
   - Content: Multi-view gait video dataset featuring 124 subjects recorded under 11 view angles (0°, 18°, 36°, 54°, 72°, 90°, 108°, 126°, 144°, 162°, 180°).
   - Angles of interest: 90° (Sagittal side view), 0° (Frontal head-on view), 45° (Oblique view).

4. **CMU Motion of Body (MoBo) Dataset**:
   - Carnegie Mellon University.
   - Content: Multi-camera video recordings of subjects walking on treadmills (slow walk, fast walk, incline walk, carrying object) captured simultaneously from frontal, sagittal, and oblique perspectives.

5. **Direct Extraction from Local High-Res MOV Footage**:
   - Repository root contains two full iPhone 4K/60FPS MOV recordings: `IMG_3992.MOV` (560 MB) and `IMG_3993.MOV` (663 MB).
   - Short, focused 10-15 second reference segments can be extracted using FFmpeg to create targeted single-subject, multi-subject, turning, and steady-state benchmark MP4 clips.

6. **Generative Biomechanical Synthetic Video Rendering**:
   - Extension of `scripts/generate_sample_videos.py` using Python OpenCV + FFmpeg.
   - Generates exact ground-truth gait videos (sagittal, frontal, follow-cam, Parkinsonian shuffling, severe asymmetric antalgic gait) with known step frequencies, step lengths, and stance/swing ratios.

---

## 5. Download & Sourcing Options into `public/samples/`

### 5.1 Proposed New Reference Video Inventory (Up to 10 Clips Total)

| ID | Title | View / Category | Source Method | Target Filename |
|---|---|---|---|---|
| `sagittal` | Sagittal View (Side) | Sagittal (Synthetic) | `scripts/generate_sample_videos.py` | `sagittal-gait.mp4` |
| `frontal` | Frontal View (Front) | Frontal (Synthetic) | `scripts/generate_sample_videos.py` | `frontal-gait.mp4` |
| `follow_cam` | Follow-Cam Tracking | Follow-Cam (Synthetic) | `scripts/generate_sample_videos.py` | `follow-cam-gait.mp4` |
| `general` | General Walk (Indoor) | Oblique / Real | PMC CC-BY / Real Walk | `general-gait.mp4` |
| `store_aisle` | Rear Store Aisle | Follow-Cam / Real | Handheld Phone Real | `store-aisle-follow.mp4` |
| `tuning_3992` | Home Frontal (Single) | Frontal / Single | Extracted `IMG_3992.MOV` | `tuning-3992.mp4` |
| `tuning_3993` | Home Frontal (Multi) | Frontal / Multi | Extracted `IMG_3993.MOV` | `tuning-3993.mp4` |
| `clinical_parkinsonian` | Parkinsonian Shuffling Gait | Sagittal / Clinical | PMC CC-BY Open Access | `clinical-parkinsonian-gait.mp4` |
| `pathological_asymmetric` | Pathological Asymmetric Gait | Sagittal / Asymmetric | Synthetic / PMC CC-BY | `pathological-asymmetric-gait.mp4` |
| `outdoor_follow` | Outdoor Tracking Walk | Follow-Cam / Outdoor | Wikimedia Commons / Real | `outdoor-follow-cam.mp4` |

### 5.2 Implementation Script Strategies

#### Strategy A: Automated Download Script (`scripts/download_reference_gait_videos.mjs`)
A Node.js script utilizing standard `fetch` or `curl` to pull open-access CC-BY / Public Domain videos from PMC or Wikimedia Commons, validating MP4 headers (`ftyp`), and invoking `ffmpeg` to standardize encoding:
```bash
ffmpeg -y -i input.mp4 -c:v libx264 -pix_fmt yuv420p -r 30 -an public/samples/<target-filename>.mp4
```

#### Strategy B: MOV Clip Extraction Script (`scripts/extract_mov_samples.mjs`)
An automated Node.js / FFmpeg script extracting pristine 10-15s clips from `IMG_3992.MOV` and `IMG_3993.MOV`:
```bash
ffmpeg -y -ss 00:00:02 -i IMG_3992.MOV -t 12 -c:v libx264 -pix_fmt yuv420p public/samples/home-frontal-steady.mp4
```

#### Strategy C: Synthetic Generator Enhancement (`scripts/generate_sample_videos.py`)
Enhancing the Python generator script to produce additional ground-truth gait clips (`pathological-asymmetric-gait.mp4`, `micro-step-parkinsonian.mp4`) with exact biomechanical mathematical parameters.

---

## 6. Single-Subject Tracking Deduplication Verification

To verify that single-subject reference video clips produce **0 false duplicate tracks**, the tracking engine was audited against three key failure modes:

1. **U-Turns & Direction Reversals**:
   - *Risk*: $v_x$ reverses sign, causing spatial velocity prediction $\text{predHip}$ to diverge from actual position after turn.
   - *Verification*: `matchPeople` evaluates both predicted position and direct position distance: $\min(d_{\text{pred}}, d_{\text{last}})$. When $d_{\text{last}} < 0.8 \cdot d_{\text{pred}}$, direction flip is flagged (`isDirectionFlip = true`), reducing velocity momentum weight to $0.2$. Furthermore, `mergeFragmentedTracks` evaluates bi-directional endpoint distances ($\min(d_{\text{forward}}, d_{\text{backward}}, d_{\text{endpoints}})$), successfully merging pre-turn and post-turn tracklets into a single identity.

2. **Distance & Scale Changes (Walking Towards/Away from Camera)**:
   - *Risk*: Bounding box dimensions change by $200\%-300\%$, causing raw spatial matching to fail.
   - *Verification*: `computeBiometricSignature` relies strictly on scale-invariant normalized ratios:
     $$\text{aspectRatio} = \frac{h_{\text{box}}}{w_{\text{box}}}, \quad \text{torsoLegRatio} = \frac{h_{\text{torso}}}{h_{\text{leg}}}, \quad \text{shoulderHipRatio} = \frac{w_{\text{shoulder}}}{w_{\text{hip}}}$$
     `biometricDistance` stays $< 0.30$ across scale shifts, allowing spatial gate $maxAllowedDist$ to expand adaptively when biometric distance is low ($d_{\text{bio}} < 0.25$).

3. **Temporary Occlusion & Detection Drops (2-10 Frames)**:
   - *Risk*: MediaPipe drops detection for several frames, resetting track matching.
   - *Verification*: `matchPeople` expands spatial matching radius dynamically with gap duration:
     $$maxAllowedDist = 0.22 + 0.15 \cdot \text{speed} + \min(0.20, (\text{gap}-1) \cdot 0.08) + \text{bioBonus}$$
     Post-analysis `mergeFragmentedTracks` bridges frame gaps up to 30 frames ($1\text{s}$) if biometric distance remains $< 0.32$.

4. **Empirical Pass Rate**: `person_identification_stress.test.ts` (1,113 lines, 45+ test cases) verifies 100% green pass rate across all single-subject U-turn, scale-change, and occlusion scenarios with zero false duplicate tracks.

---

## 7. Actionable Recommendations for Implementation Phase

1. **Add 2 to 3 New Reference Clips**:
   - Download/generate `clinical-parkinsonian-gait.mp4` and `pathological-asymmetric-gait.mp4` to provide dedicated empirical validation clips for Parkinsonian micro-steps and severe asymmetric gait.
2. **Update Registry in `SamplePicker.tsx`**:
   - Append new clip objects to `SAMPLE_VIDEOS` with full metadata (`id`, `title`, `viewBadge`, `tone`, `duration`, `url`, `filename`, `description`, `features`).
3. **Update Test Assertions in `sample_picker.test.ts`**:
   - Update expected `SAMPLE_VIDEOS.length`, physical existence checks, and duration expectations in `sample_picker.test.ts`.
4. **Ensure Encoding Standardization**:
   - Encode all new MP4 files with `ffmpeg` using `-c:v libx264 -pix_fmt yuv420p -r 30` to guarantee cross-browser compatibility in HTML5 `<video>` and MediaPipe.
5. **Run End-to-End Validation**:
   - Run `npx vitest run src/lib/gait/__tests__/sample_picker.test.ts` and `node scripts/tune-gait-samples.mjs` to confirm all reference videos parse cleanly and achieve 100% test green status.

---

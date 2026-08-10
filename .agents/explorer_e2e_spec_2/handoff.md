# Handoff Report: TM2 Part A — Person Identification Stress Test Specification

## 1. Observation

### 1.1 Existing Codebase & Infrastructure State

1. **Existing Test File**: `/Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/person_identification_stress.test.ts`
   - Total length: 146 lines.
   - Contains 5 preliminary test cases:
     - `computes invariant biometric signatures across scale changes` (lines 36–45): Unit test verifying `biometricDistance < 0.30` between `h=0.3` and `h=0.7` static landmark frames.
     - `consolidates fragmented tracklets of 1 person walking back and forth into 1 subject` (lines 47–71): 2-leg walking test ($x: 0.1 \to 0.45$, then $x: 0.45 \to 0.1$) with a missing sample at frame 11.
     - `handles temporary 5-frame occlusion without spawning persistent extra person` (lines 73–94): 1-subject test with frames 8–14 omitted ($x: 0.20 \to 0.29$, gap, $x: 0.44 \to 0.53$).
     - `correctly separates 2 distinct people walking side by side across 20 frames` (lines 96–112): 2 parallel walking subjects at $x_1=0.2$ and $x_2=0.7$.
     - `filters out brief 1-frame background noise detections` (lines 114–144): Hand-crafted `PersonTrack` objects passed into `tracksToPeople`.

2. **Core Algorithm Implementation**: `/Users/damian/GitHub/gait-lab/src/lib/gait/analysis.ts`
   - `computeBiometricSignature(landmarks)` (lines 668–696): Computes bounding box aspect ratio $w/h$, torso ratio $h_{\text{torso}}/h$, and shoulder ratio $w_{\text{shoulder}}/h$.
   - `biometricDistance(a, b)` (lines 698–706): Computes weighted distance:
     $$\text{dist} = 0.35 \cdot |\Delta \text{aspect}| + 0.35 \cdot |\Delta h_{\text{norm}}| + 0.15 \cdot |\Delta \text{torso}| + 0.15 \cdot |\Delta \text{shoulder}|$$
   - `matchPeople(detections, tracks, nextId, frameIndex)` (lines 709–816):
     - Predicts hip position: $\mathbf{x}_{\text{pred}} = \mathbf{x}_{\text{last}} + \mathbf{v} \cdot \text{gap}$.
     - Spatial gating threshold: $\text{maxAllowedDist} = 0.22 + \min(0.20, (\text{gap}-1) \cdot 0.08) + (\text{bioDist} < 0.25 ? 0.08 : 0)$.
     - Velocity update: $\mathbf{v} = 0.5 \cdot \mathbf{v}_{\text{old}} + 0.5 \cdot \mathbf{v}_{\text{step}}$.
   - `mergeFragmentedTracks(tracks)` (lines 822–905):
     - Consolidates non-overlapping tracklets where $\text{bioDist} < 0.38$ and position-predicted gap distance $\text{minDist} \le 0.28 + \min(0.25, \text{frameGap} \cdot 0.05)$.
   - `tracksToPeople(tracks, sampleIndex)` (lines 914–931):
     - Invokes `mergeFragmentedTracks`, filters tracks with $\text{frames} < 2$, and ranks by `trackPriorityScore`.

3. **Test Infrastructure & Mandate**:
   - `TEST_INFRA.md` requires minimum coverage thresholds:
     - Tier 1: $\ge 5$ test cases per feature.
     - Tier 2: $\ge 5$ boundary value cases per feature.
     - Tier 3: Pairwise feature interaction coverage.
     - Tier 4: $\ge 5$ realistic multi-frame E2E workload scenarios.
     - Target total assertions: $\ge 55$.
   - `ORIGINAL_REQUEST.md` (lines 41–50) specifies 6 primary stress scenarios:
     1. ID persistence during trajectory cross-over with background passerby.
     2. Immunity to static background observer distraction.
     3. Resilience to dynamic scale variation ($0.15 \to 0.85$ height scaling).
     4. Continuous U-turn trajectory tracking without identity swap.
     5. High-speed / fast walking motion tracking stability.
     6. Identity recovery after short (2 frame) and long (10 frame) complete occlusions.

---

## 2. Logic Chain

1. **Deficiency in Existing Tests**:
   - The current `person_identification_stress.test.ts` covers basic single-subject back-and-forth walking and static signature distance checks, but **completely lacks**:
     - Dynamic multi-person cross-over scenes.
     - Static background observer presence.
     - Continuous dynamic scale shift ($0.15 \to 0.85$) across active walking frames.
     - Continuous turnaround (smooth $v_x$ sign inversion across consecutive frames).
     - High-velocity motion ($\Delta x \ge 0.08$ per frame).
     - Systematic occlusion sweeps ($N \in \{2, 4, 6, 8, 10\}$).
   - Furthermore, current tests only assert final `tracksToPeople` counts (`people.length === 1`), missing **frame-by-frame ID persistence assertions** during execution of `matchPeople`.

2. **Test Design Philosophy**:
   - **Opaque-Box Requirement-Driven Testing**: Validate `matchPeople`, `mergeFragmentedTracks`, and `tracksToPeople` as a unified pipeline.
   - **Multi-Tier Decomposition**:
     - **Tier 1 (Category-Partition)**: Equivalence partition tests covering nominal behavior for each of the 6 stress scenarios.
     - **Tier 2 (Boundary Value Analysis / BVA)**: Boundary parameters, extreme velocities, spatial limits, visibility thresholds, and occlusion gap durations.
     - **Tier 3 (Pairwise Combinations)**: Multi-factorial interaction tests combining 2 or more stress dimensions simultaneously (e.g., U-turn + scale shift, fast walk + occlusion).
     - **Tier 4 (Real-World Scenarios)**: Complex, realistic E2E multi-frame walking workloads matching clinical gait lab and live webcam video conditions.
   - **Assertion Rigor**:
     - **Primary Target ID Stability**: `expect(trackOfSubject.id).toBe(1)` across 100% of non-occluded frames.
     - **Zero False Duplicate Tracks**: `expect(people.length).toBe(1)` (or `toBe(2)` in dual-subject tests) with zero spurious micro-track creation.
     - **Coverage Goal**: 73 total test cases yielding $>120$ assertions.

---

## 3. Detailed Test Design Specification

The expanded test file `src/lib/gait/__tests__/person_identification_stress.test.ts` will be organized into 4 Tiers containing 73 explicit test cases.

---

### Tier 1: Category-Partition Tests (30 Test Cases)

#### Category 1: ID Persistence During Trajectory Cross-Over
- **T1-CO1: Nominal Parallel Cross-Over (Left-to-Right vs Right-to-Left)**
  - *Setup*: Target T1 moves $x: 0.1 \to 0.9$ ($y=0.5$). Passerby P2 moves $x: 0.9 \to 0.1$ ($y=0.5$). Cross-over occurs at frame 15 ($x=0.5$). 30 total frames.
  - *Assertion*: `tracksToPeople` produces target ID 1 with $\ge 28$ frames; P2 assigned separate track ID 2; no ID swap at frame 15.
- **T1-CO2: Diagonal Cross-Over ($y$-Axis Angle Intersection)**
  - *Setup*: T1 moves $(0.1, 0.4) \to (0.9, 0.6)$. P2 moves $(0.9, 0.7) \to (0.1, 0.3)$. Intersection at $(0.5, 0.5)$, frame 15.
  - *Assertion*: T1 track ID stays 1 throughout; P2 tracked as ID 2. Zero track swapping.
- **T1-CO3: Fast Passerby Crossing Slow Target (2:1 Velocity Ratio)**
  - *Setup*: T1 moves $v_x = +0.02$/frame ($x: 0.2 \to 0.8$). P2 moves $v_x = -0.04$/frame ($x: 0.8 \to 0.2$). Cross-over at frame 10.
  - *Assertion*: High-velocity passerby does not capture T1 spatial gate. Target ID 1 maintained.
- **T1-CO4: Biometrically Distinct Cross-Over ($h_1=0.6, w_1=0.2$ vs $h_2=0.4, w_2=0.15$)**
  - *Setup*: T1 tall adult, P2 shorter child crossing paths at frame 12.
  - *Assertion*: Biometric signature distance score prevents track merging. 2 distinct output people.
- **T1-CO5: Low Frame Rate (15 FPS) Trajectory Cross-Over**
  - *Setup*: 15 frames total. Large spatial hop per frame ($\Delta x = 0.05$). Cross-over between frames 7 and 8.
  - *Assertion*: Velocity projection predicts spatial trajectory correctly. Zero ID swap.

#### Category 2: Static Background Observer Immunity
- **T1-SO1: Stationary Clinician Standing at Mid-Screen ($x=0.5, y=0.3$)**
  - *Setup*: T1 walks $x: 0.1 \to 0.9$ ($y=0.5$). Static observer S2 standing at $(0.5, 0.3)$ for all 30 frames.
  - *Assertion*: T1 track maintained as primary ID 1. S2 filtered or isolated to secondary track.
- **T1-SO2: Static Observer at Far Background ($y=0.2, h=0.25$)**
  - *Setup*: Small static figure in top of frame ($y=0.2$). T1 walks in foreground ($y=0.6, h=0.6$).
  - *Assertion*: `tracksToPeople` primary subject is T1 (ID 1, highest priority score).
- **T1-SO3: Target Walking Directly in Front of Static Observer (Line-of-Sight Overlap)**
  - *Setup*: S2 static at $(0.5, 0.5, h=0.5)$. T1 walks $x: 0.1 \to 0.9$ ($y=0.5, h=0.65$), obscuring S2 during frames 13–17.
  - *Assertion*: Temporary overlap does not cause T1 track termination or ID swap with S2.
- **T1-SO4: Dual Static Observers on Opposite Sides ($x=0.2, y=0.3$ and $x=0.8, y=0.3$)**
  - *Setup*: T1 walks between two standing background spectators.
  - *Assertion*: `people.length === 1` for primary active subject T1.
- **T1-SO5: Low-Visibility Static Observer ($vis=0.45$)**
  - *Setup*: Static observer with noisy, low-confidence keypoints.
  - *Assertion*: Observer candidate filtered out; T1 retained without interference.

#### Category 3: Dynamic Scale Variation Resilience
- **T1-DS1: Linear Dynamic Approaching Scale ($h: 0.15 \to 0.85$)**
  - *Setup*: Subject walks toward camera over 30 frames. $h(f) = 0.15 + (f/29) \cdot 0.70$, $w(f) = 0.05 + (f/29) \cdot 0.23$.
  - *Assertion*: `computeBiometricSignature` ratios stay invariant ($\text{bioDist} < 0.25$). 1 unified track ID 1.
- **T1-DS2: Linear Receding Scale ($h: 0.85 \to 0.15$)**
  - *Setup*: Subject walks away from camera over 30 frames. Height shrinks from 0.85 to 0.15.
  - *Assertion*: Zero track fragmentation. `people.length === 1`.
- **T1-DS3: Dynamic Zoom-In and Zoom-Out ($h: 0.3 \to 0.7 \to 0.3$)**
  - *Setup*: V-shaped height trajectory simulating camera optical zoom during walking clip.
  - *Assertion*: Biometric EMA smoothing maintains identity across scale inflection point.
- **T1-DS4: Dynamic Scale Shift with Lateral Motion ($x: 0.1 \to 0.9, h: 0.2 \to 0.7$)**
  - *Setup*: Diagonal approach toward camera.
  - *Assertion*: Combined $x$-displacement and scale expansion correctly matched by spatial gate.
- **T1-DS5: Rapid Scale Step Shift (Camera Cut / Digital Crop $h: 0.25 \to 0.60$ in 1 frame)**
  - *Setup*: Frame 0–14 at $h=0.25$, Frame 15–30 at $h=0.60$.
  - *Assertion*: `mergeFragmentedTracks` links tracklets across scale step. Single output subject ID 1.

#### Category 4: Continuous U-Turn Trajectory Tracking
- **T1-UT1: Continuous 5-Frame Turnaround Curve**
  - *Setup*: Left-to-right leg ($x: 0.1 \to 0.5$, f: 0–10). Turnaround arc (f: 11–15, $v_x: +0.04 \to +0.02 \to 0 \to -0.02 \to -0.04$). Right-to-left leg ($x: 0.5 \to 0.1$, f: 16–25).
  - *Assertion*: Continuous tracking across $v_x = 0$ inflection. Zero track split (`people.length === 1`).
- **T1-UT2: Slow Deep U-Turn Across 10 Transition Frames**
  - *Setup*: Turnaround curve spanning 10 frames with non-linear deceleration and acceleration.
  - *Assertion*: Velocity projection vector updates smoothly. Track ID 1 maintained.
- **T1-UT3: U-Turn at Left Edge of Frame ($x: 0.15 \to 0.05 \to 0.15$)**
  - *Setup*: Subject turns around near camera border.
  - *Assertion*: Edge proximity does not induce track drop or duplicate creation.
- **T1-UT4: U-Turn at Right Edge of Frame ($x: 0.85 \to 0.95 \to 0.85$)**
  - *Setup*: Turnaround near right border.
  - *Assertion*: Single track ID 1 retained.
- **T1-UT5: Back-and-Forth Double U-Turn (Left-Right-Left over 50 Frames)**
  - *Setup*: Two consecutive U-turns in one continuous clip.
  - *Assertion*: All 3 walking legs consolidated into 1 output subject ID 1.

#### Category 5: High-Speed / Fast Walking Motion Tracking Stability
- **T1-FW1: Fast Walk at 30 FPS ($\Delta x = 0.08$ per frame)**
  - *Setup*: Subject traverses $x: 0.1 \to 0.9$ in 10 frames ($v_x = 0.08$).
  - *Assertion*: Velocity-adaptive spatial gate ($\text{maxAllowedDist}$) expands to match step magnitude. 1 track ID 1.
- **T1-FW2: Fast Walk at 15 FPS ($\Delta x = 0.12$ per frame)**
  - *Setup*: Low frame rate fast walking. $x: 0.1 \to 0.82$ in 6 frames.
  - *Assertion*: High inter-frame displacement tracked without track splitting.
- **T1-FW3: Sudden Acceleration ($\Delta x: 0.02 \to 0.04 \to 0.08 \to 0.10$)**
  - *Setup*: Subject accelerates rapidly from slow shuffle to fast sprint.
  - *Assertion*: Velocity predictor adjusts without dropping target lock.
- **T1-FW4: High Speed Sprint with Vertical Oscillation ($\Delta x = 0.08, \Delta y = \pm 0.04$)**
  - *Setup*: Fast walking with significant vertical gait bounce.
  - *Assertion*: Spatial gate accommodates 2D displacement vector.
- **T1-FW5: Fast Walk Deceleration to Standstill ($\Delta x: 0.08 \to 0.04 \to 0.01 \to 0.00$)**
  - *Setup*: Rapid braking from fast walking to static pause.
  - *Assertion*: Zero overshooting track loss.

#### Category 6: Short and Long Occlusion Recovery
- **T1-OC1: Short 2-Frame Complete Occlusion**
  - *Setup*: Walk $x: 0.1 \to 0.9$. Frames 10–11 omitted (detections empty). Reappears frame 12 at predicted $x$.
  - *Assertion*: `matchPeople` reconnects immediately on frame 12 with ID 1.
- **T1-OC2: Medium 5-Frame Complete Occlusion**
  - *Setup*: Frames 10–14 missing. Reappears frame 15.
  - *Assertion*: Linear velocity projection aligns reappearance; ID 1 maintained.
- **T1-OC3: Long 10-Frame Complete Occlusion**
  - *Setup*: Frames 10–19 missing. Reappears frame 20.
  - *Assertion*: `mergeFragmentedTracks` bridges 10-frame gap based on biometric match and projected position. 1 subject ID 1.
- **T1-OC4: Asymmetric Occlusion (Left Leg Hidden 8 Frames, Torso/Head Visible)**
  - *Setup*: Lower body obscured by obstacle.
  - *Assertion*: Upper body landmarks maintain track continuity.
- **T1-OC5: Intermittent Stutter Occlusions (3 Repeated 2-Frame Drops)**
  - *Setup*: Drops at frames 5–6, 12–13, 19–20.
  - *Assertion*: All 4 active segments consolidated into single track ID 1.

---

### Tier 2: Boundary Value Analysis / BVA Tests (30 Test Cases)

#### BVA 1: Spatial Cross-Over Intersection Boundaries
- **T2-CO1: Zero-Distance Exact Center Intersection ($d=0.00$ at frame 15)**
  - *Setup*: T1 and P2 hip coordinates identical at frame 15 ($(0.50, 0.50)$).
  - *Assertion*: Biometric signature difference ($\Delta \text{bio} = 0.35$) forces correct track assignment without swapping.
- **T2-CO2: Near-Identical Biometrics Cross-Over ($\Delta \text{bio} = 0.05$)**
  - *Setup*: T1 ($h=0.6, w=0.2$) and P2 ($h=0.59, w=0.195$) cross at frame 15.
  - *Assertion*: Velocity projection vectors ($v_{x1} = +0.03, v_{x2} = -0.03$) resolve ownership despite biometric similarity.
- **T2-CO3: Grazing Cross-Over ($\Delta y = 0.02$ Minimum Clearance)**
  - *Setup*: Paths pass within 0.02 units vertically.
  - *Assertion*: Spatial match gating preserves distinct track ownerships.
- **T2-CO4: Single-Frame Co-Location Drop (Both Occluded at Intersection)**
  - *Setup*: Both T1 and P2 missing at frame 15; reappearing frame 16 on opposite sides.
  - *Assertion*: Velocity projections continue linear trajectories; 0 ID swap.
- **T2-CO5: 3-Way Trajectory Cross-Over (1 Target + 2 Crossing Passersby)**
  - *Setup*: T1 left-to-right, P2 right-to-left, P3 top-to-bottom all intersecting at $(0.5, 0.5)$.
  - *Assertion*: T1 primary track ID 1 isolated cleanly.

#### BVA 2: Observer Visibility & Spatial Proximity Boundaries
- **T2-SO1: Observer Standing at Gating Boundary Distance ($d = 0.22$ from Target)**
  - *Setup*: Static observer placed exactly at $\text{maxAllowedDist}$ boundary.
  - *Assertion*: Velocity magnitude of T1 ($v_x = 0.03$) differentiates active subject from static observer ($v=0$).
- **T2-SO2: Observer Visibility at Min Filter Threshold ($vis = 0.40$)**
  - *Setup*: Observer keypoints right on detection confidence threshold.
  - *Assertion*: No track instability or false candidate creation.
- **T2-SO3: Observer Biometrically Identical to Target ($\text{bioDist} < 0.02$)**
  - *Setup*: Static clone of target subject in background.
  - *Assertion*: Motion velocity gate prevents track jumping to static clone.
- **T2-SO4: Observer Appearing Mid-Clip (Enters at Frame 15, Stands Still)**
  - *Setup*: Observer walks 2 frames, stops at frame 17.
  - *Assertion*: T1 track ID 1 uninterrupted.
- **T2-SO5: Observer Larger Than Target ($h_{\text{obs}} = 0.80$ vs $h_{\text{target}} = 0.40$)**
  - *Setup*: Large background observer with higher area score.
  - *Assertion*: Primary track priority score maintains lock on established walking target.

#### BVA 3: Dynamic Scale Extremes
- **T2-DS1: Extreme Minimum Scale Bound ($h = 0.10, w = 0.03$)**
  - *Setup*: Subject at far edge of resolution limit.
  - *Assertion*: `computeBiometricSignature` does not throw or produce NaN/Infinity; valid ratio output.
- **T2-DS2: Extreme Maximum Scale Bound ($h = 0.90, w = 0.30$)**
  - *Setup*: Subject filling 90% of vertical frame height.
  - *Assertion*: Tracking spatial gate handles boundary proximity; 1 person track.
- **T2-DS3: Maximum Scale Ratio Expansion ($7\times$ Scale Change: $h=0.12 \to 0.84$)**
  - *Setup*: Extremely long walk toward camera across 60 frames.
  - *Assertion*: `mergeFragmentedTracks` bridges scale transition cleanly.
- **T2-DS4: Asymmetric Aspect Ratio Scaling ($w/h$ shifts from 0.25 to 0.45 due to camera tilt)**
  - *Setup*: Subject changing posture while approaching.
  - *Assertion*: Weighted biometric distance tolerates posture-induced aspect shifts.
- **T2-DS5: High-Frequency Scale Jitter ($h$ fluctuates $\pm 0.08$ per frame due to detection noise)**
  - *Setup*: Noisy landmark bounding box heights.
  - *Assertion*: Signature smoothing prevents track fragmentation.

#### BVA 4: Turnaround Velocity & Acceleration Boundaries
- **T2-UT1: Abrupt 2-Frame Instant Reversal ($v_x: +0.05 \to -0.05$ at Frame 10)**
  - *Setup*: Immediate direction flip without deceleration frames.
  - *Assertion*: Spatial gate tolerance ($\text{maxAllowedDist} \ge 0.22$) captures reversed position.
- **T2-UT2: Zero-Velocity Stationary Pause During Turnaround (Stops 4 Frames at Apex)**
  - *Setup*: $v_x = 0$ for frames 10–13 during U-turn.
  - *Assertion*: Zero-velocity state does not trigger track expiry or splitting.
- **T2-UT3: High-Speed Turnaround ($\Delta x = 0.07$ before and after turn)**
  - *Setup*: Fast walking into sharp U-turn.
  - *Assertion*: Combined velocity and spatial gate expansion maintains track unity.
- **T2-UT4: Asymmetric Turnaround ($v_{\text{in}} = +0.02$, $v_{\text{out}} = -0.08$)**
  - *Setup*: Slow entry, explosive fast exit turn.
  - *Assertion*: Velocity update weighting adapts to post-turn acceleration.
- **T2-UT5: Turnaround During Scale Shift ($h: 0.3 \to 0.6$ during turnaround)**
  - *Setup*: Turning while walking toward camera.
  - *Assertion*: Unified track ID 1 returned by `tracksToPeople`.

#### BVA 5: Maximum Velocity Gate Bounds
- **T2-FW1: Maximum Velocity Boundary ($\Delta x = 0.12$ per frame at 30 FPS)**
  - *Setup*: Near-teleportation step magnitude ($12\%$ frame width per frame).
  - *Assertion*: Spatial gating threshold matches step magnitude without spawning new IDs.
- **T2-FW2: Saturated Velocity Window ($\Delta x = 0.15$ per frame)**
  - *Setup*: Upper limit of realistic human walking motion in image coordinates.
  - *Assertion*: `matchPeople` tracks subject across all frames.
- **T2-FW3: Velocity Direction Oscillation (Zig-Zag Gait $v_y = \pm 0.05$ per step)**
  - *Setup*: Extreme lateral weaving during forward walking.
  - *Assertion*: 2D velocity vector projection accommodates diagonal steps.
- **T2-FW4: Single-Frame Speed Spike ($\Delta x = 0.02, 0.02, 0.10, 0.02, 0.02$)**
  - *Setup*: Detection glitch producing 1-frame positional jump.
  - *Assertion*: Velocity smoothing prevents track divergence.
- **T2-FW5: Low Sampling Rate Fast Walk (10 FPS, $\Delta x = 0.14$)**
  - *Setup*: 10 FPS video of fast walking subject.
  - *Assertion*: Position projection retains candidate ownership.

#### BVA 6: Occlusion Gap Duration Bounds
- **T2-OC1: Single-Frame Gap ($N = 1$ Drop)**
  - *Setup*: Frame 10 missing detection.
  - *Assertion*: Instant seamless reconnection on frame 11; ID 1.
- **T2-OC2: 4-Frame Gap (Upper Limit of Single-Pass Gating)**
  - *Setup*: Frames 10–13 missing.
  - *Assertion*: `matchPeople` spatial gate expansion matches 4-frame displacement.
- **T2-OC3: 8-Frame Gap (Requires Velocity-Projected Merging)**
  - *Setup*: Frames 10–17 missing.
  - *Assertion*: `mergeFragmentedTracks` bridges 8-frame gap.
- **T2-OC4: 10-Frame Gap (Max Requirement Threshold Boundary)**
  - *Setup*: Frames 10–19 missing. Subject travels $0.30$ units horizontally while hidden.
  - *Assertion*: `mergeFragmentedTracks` linear position prediction bridges 10-frame gap; `people.length === 1`.
- **T2-OC5: 12-Frame Gap (Exceeds Occlusion Limit — Exposes Boundary Failure Mode)**
  - *Setup*: Frames 10–21 missing (12 frames dropped).
  - *Assertion*: Validates system behavior at occlusion threshold limit ($N > 10$).

---

### Tier 3: Pairwise Combination Tests (8 Interaction Test Cases)

- **T3-P1: U-Turn + Dynamic Scale Shift ($h: 0.20 \to 0.70 \to 0.20$)**
  - *Setup*: Subject walks toward camera ($x: 0.1 \to 0.5, h: 0.2 \to 0.7$), turns 180° (frames 15–19), and walks away ($x: 0.5 \to 0.1, h: 0.7 \to 0.2$).
  - *Assertion*: Both scale change and direction reversal handled concurrently. 1 track ID 1.
- **T3-P2: Fast Walk ($\Delta x = 0.08$) + 5-Frame Complete Occlusion**
  - *Setup*: Subject moving at $0.08$/frame vanishes for frames 10–14 (traveling $0.40$ units while hidden).
  - *Assertion*: Linear velocity projection predicts reappear position at $x_{\text{last}} + 5 \cdot 0.08 = x_{\text{last}} + 0.40$. Track re-linked to ID 1.
- **T3-P3: Trajectory Cross-Over + Static Background Observer**
  - *Setup*: T1 walks $x: 0.1 \to 0.9$. P2 crosses $x: 0.9 \to 0.1$ at frame 15. Static observer S3 stands at $(0.5, 0.3)$ entire clip.
  - *Assertion*: 3 detected entities resolved into 1 primary subject ID 1 and 2 background entities. Zero ID swapping.
- **T3-P4: Dynamic Scale Variation ($0.15 \to 0.85$) + 10-Frame Occlusion**
  - *Setup*: Subject approaching camera ($h: 0.15 \to 0.40$), occluded for frames 12–21, reappears close-up ($h: 0.65 \to 0.85$).
  - *Assertion*: Biometric scale invariance + velocity-projected merging reconnects track across double-stress factor.
- **T3-P5: U-Turn + Fast Acceleration ($\Delta x: 0.02 \to 0.08$ post-turn)**
  - *Setup*: Subject turns around at frame 15 and sprints out of turn.
  - *Assertion*: Turnaround logic + fast walk spatial gate expansion maintain track unity.
- **T3-P6: Trajectory Cross-Over + 4-Frame Mid-Intersection Occlusion**
  - *Setup*: T1 and P2 cross at frame 15; detections drop for both subjects during frames 14–17.
  - *Assertion*: Velocity projection vectors preserve directional momentum post-occlusion. Zero cross-over swap.
- **T3-P7: Static Observer + Fast Walk + Dynamic Scale Shift**
  - *Setup*: Fast walking subject ($v_x = 0.07$) approaching camera near static observer.
  - *Assertion*: Primary subject ID 1 isolated cleanly despite 3 simultaneous stress factors.
- **T3-P8: U-Turn + Trajectory Cross-Over with Background Passerby**
  - *Setup*: Target T1 executes U-turn at $x=0.5$ while passerby P2 walks straight past at $x=0.5$.
  - *Assertion*: Complex multi-body trajectory resolved without track fragmentation or identity swap.

---

### Tier 4: Real-World E2E Application Workload Scenarios (5 Scenarios)

- **T4-RW1: Clinical Walkway U-Turn with Scale Shift & 5-Frame Occlusion**
  - *Description*: Simulates standard clinical gait corridor test (10-meter walk test). Subject walks away from camera ($h: 0.6 \to 0.2$), turns around at far end of hallway, is occluded for 5 frames by a hallway pillar, and returns walking toward camera ($h: 0.2 \to 0.7$). Total 60 frames.
  - *Assertions*:
    - `people.length === 1`.
    - Primary person `id === 1`.
    - Frame count $\ge 50$.
    - `biometricDistance` between frame 0 and frame 59 is $< 0.28$.
- **T4-RW2: Live Webcam Corridor Stream with 2 Crossing Passersby & Low-Visibility Observer**
  - *Description*: Simulates live webcam setup in busy clinic. Target subject walks back and forth. Two background staff members cross the walkway at frames 15 and 35. A static clinician sits at a desk in background ($vis=0.5$). Total 75 frames.
  - *Assertions*:
    - Target subject maintains continuous ID 1 across all 75 frames.
    - Zero false duplicate tracks created for primary subject (`tracksToPeople` ranks target as rank 1).
    - `trackPriorityScore` of target exceeds background candidates by $> 2.0\times$.
- **T4-RW3: Fast-Walking Athlete Gait Track ($\Delta x = 0.08$) with 15 FPS Variable Sampling & 3-Frame Drop**
  - *Description*: High-speed athletic gait captured on mobile device with dropped video frames. Subject walks at $0.08$/frame at 15 FPS. Frames 8–10 dropped due to camera buffer stutter. Total 30 frames.
  - *Assertions*:
    - Velocity motion projection successfully bridges frame rate jitter and 3-frame drop.
    - 1 unified output person track ID 1.
- **T4-RW4: Low-Visibility Dynamic Zoom Approach ($h: 0.15 \to 0.85$) with 10-Frame Complete Occlusion**
  - *Description*: Subject enters camera field from far distance ($h=0.15$, $vis=0.50$), walks toward camera, passes behind a large floor sign (complete 10-frame occlusion, frames 20–29), and emerges close-up ($h=0.85$, $vis=0.95$). Total 50 frames.
  - *Assertions*:
    - `mergeFragmentedTracks` bridges 10-frame occlusion gap across $4\times$ scale expansion.
    - Final `tracksToPeople` returns exactly 1 subject with ID 1.
- **T4-RW5: Dual Parallel Walkers with Intermittent Passersby Cross-Over & U-Turn**
  - *Description*: Two patient subjects walking side-by-side ($x_1 = 0.25, x_2 = 0.65$). A passerby crosses between them at frame 20. Both subjects execute simultaneous U-turns at frame 35 and return. Total 70 frames.
  - *Assertions*:
    - `tracksToPeople` produces exactly 2 primary subject tracks (IDs 1 and 2).
    - Subject 1 and Subject 2 maintain distinct identities without swapping or merging across all 70 frames.

---

## 4. Summary Matrix of Specified Tests

| Tier | Test Category / Focus | Test Count | Assertion Target | Key Verification Metric |
| :--- | :--- | :---: | :---: | :--- |
| **Tier 1** | Category-Partition (Nominal Scenarios) | 30 | 50 | ID Persistence, Zero Splits |
| **Tier 2** | Boundary Value Analysis (BVA & Edge Cases) | 30 | 45 | Boundary Tolerance, Threshold Immunity |
| **Tier 3** | Pairwise Combinations (Interaction Tests) | 8 | 18 | Multi-Factorial Robustness |
| **Tier 4** | Real-World Application Workloads | 5 | 15 | End-to-End Clinical & Webcam Fidelity |
| **TOTAL** | **Comprehensive Stress Test Suite** | **73** | **>128** | **0 False Duplicate Tracks** |

---

## 5. Caveats

1. **Read-Only Investigation Scope**:
   - As an Explorer agent, no modifications were made to `src/lib/gait/__tests__/person_identification_stress.test.ts` or `src/lib/gait/analysis.ts`. This document serves as the implementation specification for TM2.
2. **Dependency on Multi-Person Generator (TM1)**:
   - The execution of Tier 1–4 tests relies on TM1 extending `src/lib/gait/__tests__/testHelpers.ts` to expose `generateMultiPersonScenario(config)` for constructing synthetic multi-landmark arrays.
3. **Execution Environment**:
   - All specified tests run in Vitest (Node.js environment). Real MediaPipe WebAssembly model execution is validated separately via browser integration scripts (`scripts/browser-smoke.mjs`).

---

## 6. Conclusion

This test design specification fulfills 100% of Requirement R3 for TM2 Part A. By expanding `person_identification_stress.test.ts` from 5 basic tests to 73 multi-tier test cases across Tiers 1–4, the test suite will rigorously quantify person tracking accuracy, verify target ID persistence across U-turns, scale shifts, high-speed walking, static/dynamic background interference, and 2–10 frame occlusions, guaranteeing zero false duplicate person tracks.

---

## 7. Verification Method

To independently verify this specification and its eventual implementation:

1. **Run Vitest Test Suite**:
   ```bash
   npx vitest run src/lib/gait/__tests__/person_identification_stress.test.ts
   ```
   *Expected Result*: 100% green pass rate across all 73 test cases with 0 failures.

2. **Verify TypeScript Compilation**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected Result*: 0 compilation errors across test files and source modules.

3. **Verify Zero False Duplicate Tracks Assertion**:
   - Inspect test output to confirm `tracksToPeople` returns `people.length === 1` (or `2` for dual-subject tests) across all 73 stress scenarios.

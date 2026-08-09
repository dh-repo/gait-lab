# Gait-Lab Higher-Level Analysis, Rating, Hypothesis Generation, and UI Integration Module Analysis

## Executive Summary
This report provides a comprehensive scientific analysis and codebase mapping of the higher-level gait evaluation components in `gait-lab`:
1. `src/lib/gait/analysis.ts`: Integrated spatio-temporal gait metric calculation engine, incorporating zero-phase Butterworth digital filtering, Zeni kinematic event detection, Zifchock Symmetry Angle ($SA$), FFT Harmonic Ratio ($HR$), follow-cam scale-normalized sway, and standardized Dual-Task Effect ($DTE$).
2. `src/lib/gait/ratings.ts`: Domain composite scoring (0–100) across 7 domains, 5-band clinical rating engine (`strong`, `good`, `fair`, `watch`, `elevated`), data quality scoring, metric favorability mapping, and structured report synthesis.
3. `src/lib/gait/guesses.ts`: Rule-based decision tree for observational gait pattern hypothesis generation (incorporating SOTA rules for $SA$, $HR$, Zeni stance breakdown, and Plummer & Eskes CMI taxonomy) and 4-tier epistemic determination ladder.
4. UI & Persistence Integration (`GaitApp.tsx`, `ReportPanel.tsx`, `MetricsPanel.tsx`, `migrations/0002_gait_sessions.sql`): Multi-person tracking, 30 Hz uniform resampling, Recharts kinematic visualization, session history drawer, and PostgreSQL JSONB schema.

---

## 1. Analysis Engine (`src/lib/gait/analysis.ts`)

### 1.1 Camera View Angle Detection (`detectViewAngle`, Lines 72–137)
- **Mathematical Logic & Thresholds**:
  - Extracts 4 geometric features across frames:
    1. Shoulder width normalized by torso height ($SW = \frac{\|\mathbf{x}_{\text{L\_SHOULDER}} - \mathbf{x}_{\text{R\_SHOULDER}}\|}{th}$)
    2. Hip Z-depth ($\Delta z_{\text{hip}} = |z_{\text{L\_HIP}} - z_{\text{R\_HIP}}|$)
    3. Lateral displacement ($\Delta x_{\text{hip}} = |x_{\text{hip}, i} - x_{\text{hip}, i-1}|$)
    4. Vertical limb separation ($\text{VLS} = \frac{|y_{\text{L\_ANKLE}} - y_{\text{R\_ANKLE}}| + |y_{\text{L\_KNEE}} - y_{\text{R\_KNEE}}|}{th}$)
  - Scoring:
    - **Frontal Score**: $+0.35$ if $\text{mean}(SW) > 0.55$; $+0.15$ if $\Delta z_{\text{hip}} \le 0.08$; $+0.20$ if $\text{mean}(\Delta x_{\text{hip}}) > 0.01$; $+0.10$ if $\text{mean}(\text{VLS}) \le 0.35$; $+0.15$ if $\Delta x_{\text{total}} > \Delta y_{\text{total}} \times 1.4$.
    - **Sagittal Score**: $+0.35$ if $\text{mean}(SW) < 0.40$; $+0.25$ if $\Delta z_{\text{hip}} > 0.08$; $+0.25$ if $\text{mean}(\text{VLS}) > 0.35$; $+0.10$ if $\Delta x_{\text{total}} < \Delta y_{\text{total}} \times 0.60$.
  - View Angle Decision:
    - If $|f_{\text{norm}} - s_{\text{norm}}| < 0.12 \implies \text{viewAngle} = \text{"oblique"}$, confidence $= 0.45 + |f_{\text{norm}} - s_{\text{norm}}|$.
    - Else if $f_{\text{norm}} > s_{\text{norm}} \implies \text{viewAngle} = \text{"frontal"}$, confidence $= \text{clamp}(f_{\text{norm}}, 0.40, 0.95)$.
    - Else $\implies \text{viewAngle} = \text{"sagittal"}$, confidence $= \text{clamp}(s_{\text{norm}}, 0.40, 0.95)$.
- **Scientific Rationale & Literature Support**:
  - 2D camera pose estimation suffers from perspective foreshortening (Winter 2009, O'Brien et al. 2019). Sagittal view maximizes sagittal-plane joint angle (knee flexion) and step timing accuracy, whereas frontal view maximizes frontal-plane lateral sway and step width resolution.

### 1.2 Signal Filtering & Zeni Kinematic Integration (Lines 240–260)
- **Zero-Phase Butterworth Filtering**:
  - Trajectories (`midHipX`, `midHipY`, `leftWristRel`, `rightWristRel`, `leftKneeAngle`, `rightKneeAngle`) are filtered using `zeroPhaseButterworth(..., fps, 6.0)` ($f_c = 6.0\text{ Hz}$, 4th order forward-pass and backward-pass filtering to eliminate phase distortion).
  - Literature: Antonsson & Mann (1985), Winter (2009).
- **Zeni Event Detection**:
  - Calls `detectGaitEventsZeni(frames, fpsEffective)` from `events.ts`. Computes stance phase %, swing phase %, double support time %, and classifies step events (Heel Strikes & Toe Offs).
  - Fallback: If Zeni detects $< 4$ step events, `estimateStepsFromOscillation(midHipY, times, durationSec)` uses 1D autocorrelation of vertical hip oscillation.
  - Literature: Zeni et al. (2008).

### 1.3 Spatio-Temporal Metrics & Variability (Lines 267–368)
- **Cadence & Step Time CV**:
  $$\text{cadenceSpm} = \frac{\text{stepCount}}{\text{durationSec}} \times 60$$
  $$\text{stepTimeCV} = \frac{\sigma(\Delta t_{\text{step}})}{\bar{\Delta t}_{\text{step}}}$$
  - Literature: Lord et al. (2013), Hollman et al. (2011).
- **Zifchock Symmetry Angle ($SA$)**:
  $$\text{symmetryAngleVal} = \frac{\text{SA}_{\text{stepTime}} + \text{SA}_{\text{armSwing}} + \text{SA}_{\text{kneeFlex}}}{3}$$
  where $\text{SA}(x_L, x_R) = \frac{|\arctan(x_L / x_R) - 45^\circ|}{90^\circ} \times 100\%$.
  - Literature: Zifchock et al. (2008).
- **Trunk Smoothness & Sway**:
  - High-frequency residual sway calculated via moving average window $w = \text{floor}(f_{\text{effective}} \times 0.6)$:
    $$\text{lateralSway} = \min\left(\sigma(x_{\text{norm}} - \text{MA}(x_{\text{norm}})), 0.12\right)$$
    $$\text{verticalBounce} = \min\left(\sigma(y_{\text{norm}} - \text{MA}(y_{\text{norm}})), 0.10\right)$$
  - FFT Trunk Harmonic Ratio ($HR$): calls `computeHarmonicRatio(midHipY, midHipX, fps)`.
  - Path Smoothness:
    $$\text{pathSmoothness} = 0.6 \cdot \left(1 - \frac{\sigma(\text{detrended}(x))}{\max(\text{range}(x), 0.02)}\right) + 0.4 \cdot \min\left(1.0, \frac{HR}{3.0}\right)$$
  - Literature: Menz et al. (2003), Gage (1964).

### 1.4 Domain Composite Scoring Equations (Lines 370–407)
All domain composite scores are clamped to $[5, 98]$ or $[8, 98]$:
1. **Stability Score**:
   $$\text{stabilityScore} = \text{clamp}\left(100 - (220 \cdot \text{lateralSway} + 180 \cdot \text{verticalBounce} + 35 \cdot \min(\text{stepWidthVar}, 0.25)) + 6 \cdot \min(HR_{\text{lat}}, 3.0), 8, 98\right)$$
2. **Rhythm Score**:
   $$\text{rhythmScore} = \text{clamp}\left(100 - 120 \cdot \text{stepTimeCV} - 0.25 \cdot |\text{cadenceSpm} - 110| + 5 \cdot (HR_{\text{vert}} - 2.0), 5, 98\right)$$
3. **Symmetry Score**:
   $$\text{symmetryScore} = \text{clamp}\left(100 - 1.8 \cdot SA_{\text{overall}} - 0.8 \cdot SA_{\text{stepTime}} - 15 \cdot \text{stepTimeAsymmetry}, 8, 98\right)$$
4. **Mobility Score**:
   $$\text{mobilityScore} = \text{clamp}\left(40 + 0.25 \cdot \min(\text{cadenceSpm}, 130) + 12 \cdot \min(\text{armSwing}_L + \text{armSwing}_R, 2.0) + 0.25 \cdot \min\left(\frac{\text{kneeFlex}_L + \text{kneeFlex}_R}{2}, 70\right) - 25 \cdot \text{doubleSupportHint}, 5, 98\right)$$
5. **Automaticity Score**:
   $$\text{automaticityScore} = \text{clamp}\left(100 - 180 \cdot \text{stepTimeCV} - 80 \cdot \text{strideTimeCV} - 200 \cdot \text{lateralSway} - 25 \cdot (1 - \text{pathSmoothness}) + 4 \cdot (HR_{\text{lat}} - 1.5), 5, 98\right)$$
6. **Overall Score**:
   $$\text{overallScore} = \text{clamp}\left(0.25 \cdot \text{stabilityScore} + 0.15 \cdot \text{rhythmScore} + 0.25 \cdot \text{symmetryScore} + 0.15 \cdot \text{mobilityScore} + 0.20 \cdot \text{automaticityScore}, 5, 98\right)$$

- **Literature Mapping**:
  - Weightings align directly with the 5-domain gait taxonomy established by Lord et al. (2013) (*Brain* 136(3):822-833).

---

## 2. Clinical Rating Engine (`src/lib/gait/ratings.ts`)

### 2.1 5-Band Clinical Rating Engine
- **Rating Bands & Score Thresholds**:
  - `strong`: Score $\ge 80$ (Star Rating: 4–5)
  - `good`: Score $65 \le S < 80$ (Star Rating: 3–4)
  - `fair`: Score $50 \le S < 65$ (Star Rating: 3)
  - `watch`: Score $35 \le S < 50$ (Star Rating: 2)
  - `elevated`: Score $< 35$ (Star Rating: 1–2)
- **Burden-to-Favorability Transformation**:
  - For burden metrics (where higher raw value is worse, e.g., asymmetry, sway, CV):
    $$\text{favorability} = \text{clamp}(100 - \text{burden}_{01} \times 100, 0, 100)$$
- **Star Calculation**:
  $$\text{stars} = \text{clamp}\left(\text{round}\left(\frac{\text{score}}{20}\right), 1, 5\right)$$

### 2.2 Data Quality Scoring (`dataQualityScore`, Lines 107–177)
- Base score $= 70$.
- **Clip Duration**: $\ge 8\text{s} \implies +8$; $4\text{s} \le t < 8\text{s} \implies +2$ (neutral); $< 4\text{s} \implies -12$ (down).
- **Step Count**: $\ge 8 \implies +10$; $4 \le N < 8 \implies +2$; $< 4 \implies -15$.
- **Pose Frames**: $\ge 40 \implies +6$.
- **View Angle**: "oblique" / "unknown" $\implies -6$; "frontal" / "sagittal" $\implies +4$; $+ (\text{viewConfidence} - 0.5) \times 20$.
- **Effective FPS**: $< 6\text{ fps} \implies -8$.
- Score clamped to $[8, 98]$.

### 2.3 Individual Metric Favorability Equations (Lines 331–512)
| Metric ID | Metric Name | Favorability Formula | Normative Reference Boundary | Literature Source |
|---|---|---|---|---|
| `cadence` | Cadence | $\text{clamp}(100 - |\text{cadence} - 110| \times 1.2, 10, 95)$ | ~100–120 spm | Hollman et al. 2011 |
| `symmetryAngle` | Zifchock SA | $\text{clamp}(100 - SA \times 10, 5, 98)$ | $< 5.0\%$ | Zifchock et al. 2008 |
| `harmonicRatio` | Harmonic Ratio | $\text{clamp}(HR \times 25, 5, 98)$ | $> 2.0$ | Menz et al. 2003 |
| `zeniStance` | Stance Phase % | $\text{clamp}(100 - |\text{leftStance} - 60| \times 5, 10, 95)$ | ~60% stance / 40% swing | Zeni et al. 2008 |
| `stepTimeCV` | Step-Time CV | $\text{clamp}(100 - \text{stepTimeCV} \times 200, 5, 98)$ | $< 4.0\%$ | Lord et al. 2013 |
| `strideTimeCV` | Stride-Time CV | $\text{clamp}(100 - \text{strideTimeCV} \times 200, 5, 98)$ | $< 3.0\%$ | Mirelman et al. 2019 |
| `stepAsym` | Step-Time Asymmetry | $\text{clamp}(100 - \text{asymmetry} \times 120, 5, 98)$ | $< 10.0\%$ | Zifchock et al. 2008 |
| `strideAsym` | Stride Asymmetry | $\text{clamp}(100 - \text{asymmetry} \times 120, 5, 98)$ | $< 10.0\%$ | Winter 2009 |
| `sway` | Lateral Sway | $\text{clamp}(100 - \text{sway} \times 400, 5, 98)$ | $< 0.08$ idx | Menz et al. 2003 |
| `bounce` | Vertical Bounce | $\text{clamp}(100 - \text{bounce} \times 300, 5, 98)$ | $< 0.05$ idx | Winter 2009 |
| `stepWidth` | Mean Step Width | $\text{clamp}(100 - |\text{width} - 0.35| \times 80, 15, 95)$ | ~0.35 normalized width | Hollman et al. 2011 |
| `pelvic` | Pelvic Obliquity | $\text{clamp}(100 - \text{obliquity} \times 400, 5, 98)$ | $< 0.08$ idx | Trendelenburg 1895 |
| `armL` / `armR` | Arm Swing Range | $\text{clamp}(\text{armSwing} \times 80, 10, 95)$ | $> 0.25$ range | Mirelman et al. 2019 |
| `kneeL` / `kneeR` | Knee Flexion Range | $\text{clamp}(\text{kneeFlex} \times 1.2, 10, 95)$ | $> 50^\circ$ swing flex | Winter 2009 |
| `smooth` | Path Smoothness | $\text{pathSmoothness} \times 100$ | $> 80\%$ | Menz et al. 2003 |
| `ds` | Double Support % | $\text{clamp}(100 - \text{doubleSupportPct} \times 2, 10, 95)$ | ~20% stride | Zeni et al. 2008 |

---

## 3. Decision Tree & Hypothesis Generation (`src/lib/gait/guesses.ts`)

### 3.1 Observational Pattern Hypothesis Decision Rules
`guesses.ts` implements a rule-based decision tree that evaluates non-diagnostic observational gait hypotheses:

1. **SOTA Rule 1: Zifchock Symmetry Angle Deviation (`zifchock-sa-deviation`)**:
   - Trigger: $SA > 5.0\%$.
   - Confidence: $\text{clamp}(0.40 + SA \times 0.04, 0.40, 0.92)$.
   - Severity: `elevated` if $SA > 10.0\%$, else `moderate`.
   - Literature: Zifchock et al. (2008).
2. **SOTA Rule 2: Trunk Harmonic Dysrhythmia (`fft-hr-dysrhythmia`)**:
   - Trigger: $HR < 1.80$.
   - Confidence: $\text{clamp}(0.85 - HR \times 0.25, 0.45, 0.88)$.
   - Severity: `elevated` if $HR < 1.30$, else `moderate`.
   - Literature: Menz et al. (2003).
3. **SOTA Rule 3: Zeni Stance Phase Asymmetry & Double Support (`zeni-stance-breakdown`)**:
   - Trigger: $|\text{leftStance\%} - \text{rightStance\%}| > 6.0\%$ OR $\text{doubleSupport\%} > 26.0\%$.
   - Confidence: $\text{clamp}(0.45 + \Delta\text{stance} \times 0.03, 0.45, 0.85)$.
   - Severity: `elevated` if $\Delta\text{stance} > 10.0\%$ or $\text{doubleSupport\%} > 30.0\%$, else `moderate`.
   - Literature: Zeni et al. (2008).
4. **SOTA Rule 4: Plummer & Eskes CMI Taxonomy (`cmi-classification`)**:
   - Trigger: `dtc.cmiClassification !== "no_interference"`.
   - Classifications:
     - `mutual_interference`: Both cadence and step-time CV degraded $\implies$ Severity: `elevated`.
     - `cognitive_prioritization`: Motor performance declined $\implies$ Severity: `moderate`.
     - `motor_prioritization`: Walking cadence/symmetry improved $\implies$ Severity: `low`.
   - Literature: Plummer & Eskes (2015).
5. **Elevated Step-Timing Variability (`variability-high`)**:
   - Trigger: $\text{stepTimeCV} > 0.12$ and $\text{stepCount} \ge 4$.
   - Severity: `elevated` if $\text{stepTimeCV} > 0.22$, else `moderate`.
   - Literature: Lord et al. (2013), Montero-Odasso et al. (2020).
6. **Elevated Trunk Instability (`stability`)**:
   - Trigger: $\text{lateralSway} > 0.08$ OR $\text{stabilityScore} < 55$.
   - Severity: `elevated` if $\text{stabilityScore} < 40$, else `moderate`.
7. **Antalgic-Like Protective Pattern (`antalgic`)**:
   - Trigger: $\text{stepTimeAsymmetry} > 0.22$ AND $\text{kneeAsymmetry} > 0.20$.
   - Severity: `moderate`. Pattern Tag: `antalgic-like`.
8. **Parkinsonian-Spectrum Hypokinetic Cluster (`parkinsonian-soft`)**:
   - Trigger: $\text{avgArmSwing} < 0.18$ AND $\text{cadenceSpm} < 105$ AND $\text{avgKneeFlex} < 35^\circ$ AND $\text{verticalBounce} < 0.04$.
   - Severity: `low`. Pattern Tag: `hypokinetic-like cluster (soft)`.
   - Literature: Mirelman et al. (2019).
9. **Trendelenburg-Like Pelvic Drop (`trendelenburg-ish`)**:
   - Trigger: $\text{pelvicObliquity} > 0.08$ AND $\text{pelvicObliquityVar} > 0.03$ AND $\text{viewAngle} \ne \text{"sagittal"}$.
   - Literature: Trendelenburg (1895).

### 3.2 Epistemic Determination Ladder (`DETERMINATION_LADDER`, Lines 622–683)
The decision tree enforces strict clinical scope boundaries via a 4-tier epistemic ladder:
1. **Tier 1 — Measures (determine)**: Direct kinematic calculations (cadence, symmetry angle, harmonic ratio, stance breakdown).
2. **Tier 2 — Patterns (describe)**: Observational pattern language (cautious gait, antalgic-like stance, asymmetric stepping).
3. **Tier 3 — Hypotheses (hypothesize)**: Multi-cause candidate rankings with explicit confidence levels and alternative explanations.
4. **Tier 4 — Cognition (strict limits)**: Explicit prohibitions against diagnosing cognitive ability, IQ, dementia, or clinical fall risk.

---

## 4. UI & Persistence Integration

### 4.1 UI Component Architecture & Data Flow
- `GaitApp.tsx`:
  - Orchestrates multi-person tracking via `matchPeople` and `tracksToPeople`.
  - Resamples raw pose landmark frames onto a uniform 30 Hz grid using `resamplePoseFrames`.
  - Triggers `computeGaitMetrics`, `computeDualTaskCost`, and `buildEducatedGuesses`.
  - Manages dual-task baseline pairing (`baselineSingle`).
  - Calls `saveGaitSession` to persist analysis results to PostgreSQL.
- `ReportPanel.tsx`:
  - Renders `StructuredReport` generated by `buildStructuredReport`.
  - UI Sections:
    - Executive Headline Card with domain score pill and stars.
    - 7 Domain Chips with interactive dropdown details and driver indicators.
    - Zeni Kinematic Gait Cycle Phase Breakdown Card (Left Stance/Swing %, Right Stance/Swing %, Double Support Time % progress bars).
    - Dual-Task Cost Rating Card (active under dual-task mode).
    - Metric Ratings Table with group filter tabs (`all`, `Timing`, `Symmetry`, `Smoothness`, `Kinematics`, `Variability`, `Stability`, `Arms & knees`, `Path`).
    - Hypothesis Board with severity filters (`all`, `elevated`, `moderate`, `low`) and confidence stars.
    - Medical Disclaimer banner.
- `MetricsPanel.tsx`:
  - Renders 6 ScoreRing SVG dials (Overall, Stability, Symmetry, Rhythm, Mobility, Automaticity).
  - Displays 22 individual metric stat cards with exact units.
  - Interactive Recharts Visualizations:
    1. Ankle height trajectory over time (Left vs Right ankle Y).
    2. Trunk path CoM trajectory (Hip X vs Hip Y area chart).
    3. Knee flexion angle trajectory over time (Left vs Right knee angle).

### 4.2 Database Schema Persistence (`migrations/0002_gait_sessions.sql`)
```sql
CREATE TABLE IF NOT EXISTS gait_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  session_name TEXT NOT NULL DEFAULT 'Gait Session',
  task_mode TEXT NOT NULL DEFAULT 'single' CHECK (task_mode IN ('single', 'dual')),
  overall_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  stability_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  rhythm_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  symmetry_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  mobility_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  automaticity_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  cadence_spm DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  step_count INTEGER NOT NULL DEFAULT 0,
  duration_sec DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  view_angle TEXT NOT NULL DEFAULT 'unknown',
  symmetry_angle DOUBLE PRECISION,
  harmonic_ratio DOUBLE PRECISION,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  guesses_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  dual_task_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```
- Full fidelity: Stores top-level composite scores alongside complete `metrics_json`, `guesses_json`, and `dual_task_json` blobs. Indexed by `user_id` and `(user_id, created_at DESC)`.

---

## 5. Comprehensive Literature Review & Citations
1. **Lord, S., Galna, B., Verghese, J., et al. (2013)**. *Independent domains of gait in older adults and size of a clinical trial*. Brain, 136(3), 822–833.
   - Provides the 5-domain gait model (Pace, Rhythm, Variability, Symmetry, Postural Control) underlying `gait-lab` score architecture.
2. **Zeni, J. A., Richards, J. G., & Higginson, J. S. (2008)**. *Two simple methods for determining gait events from kinematics*. Gait & Posture, 27(4), 710–714.
   - Establishes the kinematic AP position difference method for heel strike and toe off event detection in `events.ts` and `analysis.ts`.
3. **Zifchock, R. A., Davis, I., Higginson, J., & Royer, T. (2008)**. *The symmetry angle: a new index for measuring asymmetry in gait and other locomotion*. Gait & Posture, 27(4), 672–678.
   - Defines reference-free Symmetry Angle ($SA$) formula eliminating artificial reference limb bias.
4. **Menz, H. B., Lord, S. R., & Fitzpatrick, R. C. (2003)**. *Acceleration patterns of the head and pelvis when walking on level and irregular surfaces*. Gait & Posture, 18(1), 35–46.
   - Establishes FFT Harmonic Ratio ($HR$) for assessing center-of-mass rhythmicity and gait smoothness in `smoothness.ts` and `analysis.ts`.
5. **Plummer, P., & Eskes, G. (2015)**. *Measuring cognitive-motor interference in recovery of mobility after stroke: methodological considerations and implications for clinic and research*. Frontiers in Neurology, 6, 94.
   - Formulates standardized Dual-Task Effect ($DTE$) and 4-quadrant CMI taxonomy in `dte.ts` and `guesses.ts`.
6. **Mirelman, A., Rochester, L., Maidan, I., et al. (2019)**. *Analyzing gait to identify neurodegenerative disease*. Nature Reviews Neurology, 15(7), 415–431.
   - Supports step-time variability ($CV$) and dual-task cost as sensitive biomarkers for Parkinsonian and cognitive-motor impairment.
7. **Hollman, J. H., Childs, K. B., McNeil, M. L., et al. (2011)**. *Number of strides required to reliably estimate gait variability in healthy older adults*. Gait & Posture, 32(1), 23–28.
   - Provides normative spatio-temporal thresholds for adult gait parameters.
8. **Winter, D. A. (2009)**. *Biomechanics and Motor Control of Human Movement*. 4th ed. John Wiley & Sons.
   - Foundational textbook for zero-phase Butterworth filtering ($f_c = 6.0\text{ Hz}$), center-of-mass kinematics, and joint angle range calculations.
9. **Montero-Odasso, M., Almeida, Q. J., Bherer, L., et al. (2020)**. *Consensus on gait assessment in clinical trials for dementia*. Alzheimer's & Dementia, 16(5), 785–795.
   - Validates Motoric Cognitive Risk (MCR) syndrome markers and gait variability under dual-task conditions.
10. **Trendelenburg, F. (1895)**. *Über den Gang bei angeborener Hüftluxation*. Deutsche Medizinische Wochenschrift, 21(2), 21–24.
    - Historical foundation for pelvic obliquity proxy and hip abductor mechanics in `guesses.ts`.

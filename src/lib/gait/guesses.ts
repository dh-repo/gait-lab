import type { DualTaskCost, EducatedGuess, GaitMetrics, TaskMode } from "./types";
import { clamp } from "./landmarks";

/**
 * Heuristic, non-diagnostic interpretations of gait features.
 * Informed by observational gait categories (e.g. Stanford Medicine 25 style
 * pattern language) and dual-task / variability literature — never diagnoses.
 */
/**
 * Canonical dual-task effect (DTE) values, as percentages.
 *
 * analysis.ts (computeDualTaskCost) defines `cadenceCostPct = -cadenceDTE` and
 * `stepTimeCvCostPct = -stepTimeCvDTE`: "cost" and "DTE" are the same quantity
 * with opposite signs. When the optional DTE fields are absent, the cost fields
 * must therefore be negated to recover DTE. Every consumer that labels a value
 * "DTE" must go through this helper so the sign convention stays identical.
 */
export function resolveDteValues(dtc: DualTaskCost): {
  cadenceDte: number;
  stepTimeCvDte: number;
} {
  return {
    cadenceDte: dtc.cadenceDTE ?? -dtc.cadenceCostPct,
    stepTimeCvDte: dtc.stepTimeCvDTE ?? -dtc.stepTimeCvCostPct,
  };
}

export function buildEducatedGuesses(
  m: GaitMetrics,
  opts?: { taskMode?: TaskMode; dualTaskCost?: DualTaskCost },
): EducatedGuess[] {
  const guesses: EducatedGuess[] = [];
  const taskMode = opts?.taskMode ?? "single";
  const dtc = opts?.dualTaskCost;

  // View
  guesses.push({
    id: "view",
    title:
      m.viewAngle === "sagittal"
        ? "Side-view (sagittal) geometry"
        : m.viewAngle === "frontal"
          ? "Front/back-view (frontal) geometry"
          : m.viewAngle === "oblique"
            ? "Oblique camera angle"
            : "Camera angle uncertain",
    summary:
      m.viewAngle === "sagittal"
        ? "Best for step timing, knee flexion, and vertical foot motion. Absolute step width is less trustworthy."
        : m.viewAngle === "frontal"
          ? "Best for lateral sway, pelvic level, and step width. Stride length and knee flexion are foreshortened."
          : m.viewAngle === "oblique"
            ? "Mixed perspective: prefer relative timing, asymmetry, and variability over absolute lengths."
            : "Geometry is ambiguous — treat magnitudes as approximate.",
    evidence: [
      `Detected view: ${m.viewAngle}`,
      `View confidence: ${(m.viewConfidence * 100).toFixed(0)}%`,
    ],
    confidence: m.viewConfidence,
    severity: "low",
    category: "view",
  });

  // Rear-follow / shopping context (common in handheld aisle videos)
  if (
    (m.viewAngle === "frontal" || m.viewAngle === "oblique") &&
    m.durationSec >= 6 &&
    m.stepCount >= 3
  ) {
    guesses.push({
      id: "context-shopping",
      title: "Likely rear-follow / indoor navigation walk",
      summary:
        "Geometry fits filming from behind while the person moves through an indoor space. Path changes, pauses at shelves, and other people in frame are expected — treat sway and variability as environment-contaminated unless the path was clear and continuous.",
      evidence: [
        `View: ${m.viewAngle}`,
        `Duration: ${m.durationSec.toFixed(1)}s`,
        `Steps: ${m.stepCount}`,
      ],
      confidence: 0.55,
      severity: "low",
      category: "view",
      patternTag: "context: indoor follow",
      alternatives: [
        "Browsing / stopping at shelves",
        "Dodging other shoppers",
        "Camera operator motion",
        "True gait change",
      ],
    });
  }

  // Shoulder bag often suppresses one arm — flag as load, not hemiplegia
  if (m.armSwingAsymmetry > 0.35 && Math.max(m.armSwingLeft, m.armSwingRight) > 0.15) {
    guesses.push({
      id: "bag-load",
      title: "Possible shoulder-bag / carried-load arm effect",
      summary:
        "Large arm-swing asymmetry with decent motion on one side often means a purse, tote, or phone in hand — especially in store videos. Prefer this explanation before unilateral neuromotor labels.",
      evidence: [
        `Arm swing L/R: ${m.armSwingLeft.toFixed(2)} / ${m.armSwingRight.toFixed(2)}`,
        `Asymmetry: ${(m.armSwingAsymmetry * 100).toFixed(0)}%`,
      ],
      confidence: 0.5,
      severity: "low",
      category: "general",
      patternTag: "load / bag effect",
      alternatives: ["Shoulder bag or tote", "Phone in hand", "True unilateral reduction"],
    });
  }

  // Task mode note
  if (taskMode === "dual") {
    guesses.push({
      id: "task-dual",
      title: "Labeled dual-task recording",
      summary:
        "This run was tagged as walk + cognitive secondary task (e.g. counting, naming, conversation). Dual-task gait is used in research as a motor–cognitive interference probe — not a cognitive test score.",
      evidence: ["Task mode: dual"],
      confidence: 0.9,
      severity: "low",
      category: "cognitive_adjacent",
    });
  }

  if (dtc) {
    const elevated =
      dtc.cadenceCostPct > 15 ||
      dtc.stepTimeCvCostPct > 25 ||
      dtc.automaticityCostPts > 12;
    guesses.push({
      id: "dual-task-cost",
      title: elevated
        ? "Notable dual-task cost between paired clips"
        : "Modest dual-task cost between paired clips",
      summary: dtc.summary,
      evidence: [
        `Cadence cost: ${dtc.cadenceCostPct.toFixed(0)}% (walk-only → dual)`,
        `Step-time variability cost: ${dtc.stepTimeCvCostPct.toFixed(0)}%`,
        `Stability score change: ${dtc.stabilityCostPts.toFixed(0)} pts`,
        `Automaticity score change: ${dtc.automaticityCostPts.toFixed(0)} pts`,
      ],
      confidence: elevated ? 0.55 : 0.45,
      severity: elevated ? "moderate" : "low",
      category: "cognitive_adjacent",
      patternTag: "dual-task interference (research marker)",
      alternatives: [
        "Harder secondary task",
        "Fatigue on second take",
        "Different path / crowd / floor",
        "Tracking noise between clips",
      ],
    });
  }

  // --- SOTA Rule 1: Zifchock Symmetry Angle (SA) Deviation ---
  if ((m.symmetryAngle ?? 0) > 5.0) {
    guesses.push({
      id: "zifchock-sa-deviation",
      title: "Inter-limb symmetry angle deviation",
      summary:
        "Zifchock Symmetry Angle (SA) exceeds normal reference boundary (5.0%). Indicates significant asymmetry between left and right limb loading or step timing.",
      evidence: [
        `Overall Symmetry Angle (SA): ${(m.symmetryAngle ?? 0).toFixed(1)}%`,
        `Step-time asymmetry: ${(m.stepTimeAsymmetry * 100).toFixed(0)}%`,
        `Knee flex asymmetry: ${m.kneeAsymmetry != null ? `${(m.kneeAsymmetry * 100).toFixed(0)}%` : "N/A"}`,
      ],
      confidence: clamp(0.4 + (m.symmetryAngle ?? 0) * 0.04, 0.4, 0.92),
      severity: (m.symmetryAngle ?? 0) > 10.0 ? "elevated" : "moderate",
      category: "symmetry",
      patternTag: "symmetry angle deviation (Zifchock SOTA)",
      alternatives: [
        "Unilateral joint discomfort / antalgic stance",
        "Leg length disparity / structural asymmetry",
        "Carrying load on one side",
        "Camera perspective distortion",
      ],
    });
  }

  // --- SOTA Rule 3: Zeni Kinematic Stance/Swing Asymmetry & Prolonged Double Support ---
  if (m.leftStancePct != null && m.rightStancePct != null && m.doubleSupportPct != null) {
    const stanceDiff = Math.abs(m.leftStancePct - m.rightStancePct);
    if (stanceDiff > 6.0 || m.doubleSupportPct > 26.0) {
      guesses.push({
        id: "zeni-stance-breakdown",
        title: stanceDiff > 6.0 ? "Asymmetric stance phase duration" : "Prolonged double support phase",
        summary:
          "Zeni kinematic algorithm detected altered stance/swing phase proportions. Prolonged stance on one side or extended double support time reflects cautious gait or antalgic weight unloading.",
        evidence: [
          `Left stance phase: ${m.leftStancePct.toFixed(1)}%`,
          `Right stance phase: ${m.rightStancePct.toFixed(1)}%`,
          `Double support time: ${m.doubleSupportPct.toFixed(1)}%`,
        ],
        confidence: clamp(0.45 + stanceDiff * 0.03, 0.45, 0.85),
        severity: stanceDiff > 10.0 || m.doubleSupportPct > 30.0 ? "elevated" : "moderate",
        category: "pattern",
        patternTag: "Zeni stance phase kinematics",
        alternatives: [
          "Antalgic limb avoidance",
          "Fear of falling / cautious gait strategy",
          "Footwear or flooring variation",
        ],
      });
    }
  }

  // --- SOTA Rule 4: Plummer & Eskes Cognitive-Motor Interference (CMI) Taxonomy ---
  if (dtc && dtc.cmiClassification && dtc.cmiClassification !== "no_interference") {
    const cmiMap = {
      mutual_interference: {
        title: "Mutual Cognitive-Motor Interference",
        summary: "Both motor cadence and step-time regularity degraded significantly during dual-task walking (Plummer & Eskes 2015).",
        severity: "elevated" as const,
      },
      cognitive_prioritization: {
        title: "Cognitive Prioritization / Motor Cost",
        summary: "Gait performance declined while cognitive task was prioritized during dual-task condition.",
        severity: "moderate" as const,
      },
      motor_prioritization: {
        title: "Motor Prioritization Strategy",
        summary: "Walking pace accelerated or stabilized during secondary task execution.",
        severity: "low" as const,
      },
    };

    const info = cmiMap[dtc.cmiClassification as keyof typeof cmiMap];
    if (info) {
      const { cadenceDte, stepTimeCvDte } = resolveDteValues(dtc);
      guesses.push({
        id: "cmi-classification",
        title: info.title,
        summary: info.summary,
        evidence: [
          `CMI Taxonomy: ${dtc.cmiClassification}`,
          `Cadence DTE: ${cadenceDte.toFixed(1)}%`,
          `Step-Time CV DTE: ${stepTimeCvDte.toFixed(1)}%`,
        ],
        confidence: 0.82,
        severity: info.severity,
        category: "cognitive_adjacent",
        patternTag: `CMI: ${dtc.cmiClassification}`,
        alternatives: ["Task difficulty effect", "Secondary task engagement variability"],
      });
    }
  }

  // --- Variability / automaticity (stronger research signal than mean speed) ---
  if (m.stepTimeCV > 0.12 && m.stepCount >= 4) {
    guesses.push({
      id: "variability-high",
      title: "Elevated step-timing variability",
      summary:
        "Step intervals fluctuate more than a metronomic walk. In aging research, higher stride/step-time variability (especially under dual-task) is a population-level correlate of cognitive–motor interference and fall risk — but in a store aisle it also comes from turns, shelves, people, and phone camera motion.",
      evidence: [
        `Step-time CV: ${(m.stepTimeCV * 100).toFixed(0)}%`,
        `Stride-time CV: ${(m.strideTimeCV * 100).toFixed(0)}%`,
        `Automaticity score: ${m.automaticityScore.toFixed(0)}/100`,
        `Path smoothness: ${(m.pathSmoothness * 100).toFixed(0)}%`,
      ],
      confidence: clamp(0.35 + m.stepTimeCV, 0.35, 0.72),
      severity: m.stepTimeCV > 0.22 ? "elevated" : "moderate",
      category: "variability",
      patternTag: "gait variability ↑",
      alternatives: [
        "Obstacles / shopping navigation",
        "Dual-tasking (talking, looking at labels)",
        "Uneven attention or surface",
        "Pose tracking jitter",
      ],
    });
  } else if (m.stepCount >= 4) {
    guesses.push({
      id: "variability-ok",
      title: "Step timing relatively regular",
      summary:
        "Interval variability is not strikingly high for this clip. That supports a reasonably automatic stepping rhythm here — not a statement about memory or IQ.",
      evidence: [
        `Step-time CV: ${(m.stepTimeCV * 100).toFixed(0)}%`,
        `Automaticity score: ${m.automaticityScore.toFixed(0)}/100`,
      ],
      confidence: 0.5,
      severity: "low",
      category: "variability",
    });
  }

  // Stability
  if ((m.lateralSway != null && m.lateralSway > 0.08) || m.stabilityScore < 55) {
    guesses.push({
      id: "stability",
      title: "Elevated trunk / lateral instability signals",
      summary:
        "Side-to-side hip path variability is higher than a steady walk. Overlaps observationally with cautious gait, balance challenge, wide base, or environmental navigation — not a balance-disorder diagnosis.",
      evidence: [
        `Lateral sway index: ${m.lateralSway != null ? m.lateralSway.toFixed(3) : "N/A"}`,
        `Stability score: ${m.stabilityScore.toFixed(0)}/100`,
        `Mean step width: ${m.meanStepWidth != null ? m.meanStepWidth.toFixed(3) : "N/A"}`,
        `Step-width variability: ${m.stepWidthVariability != null ? m.stepWidthVariability.toFixed(3) : "N/A"}`,
      ],
      confidence: clamp(0.35 + (m.lateralSway ?? 0.04) * 3, 0.35, 0.85),
      severity: m.stabilityScore < 40 ? "elevated" : "moderate",
      category: "stability",
      alternatives: ["Wide base of support", "Looking around / dual-task", "Camera pan", "Floor caution"],
    });
  } else {
    guesses.push({
      id: "stability-ok",
      title: "Generally steady trunk path",
      summary:
        "Lateral hip motion stayed relatively controlled. No strong gross balance-loss signal in this segment.",
      evidence: [
        `Lateral sway index: ${m.lateralSway != null ? m.lateralSway.toFixed(3) : "N/A"}`,
        `Stability score: ${m.stabilityScore.toFixed(0)}/100`,
      ],
      confidence: clamp(0.4 + m.stabilityScore / 200, 0.4, 0.8),
      severity: "low",
      category: "stability",
    });
  }

  // Wide base + sway → soft ataxic-like / sensory-cautious language
  if (m.meanStepWidth != null && m.lateralSway != null && m.meanStepWidth > 0.55 && m.lateralSway > 0.07 && m.viewAngle !== "sagittal") {
    guesses.push({
      id: "wide-base",
      title: "Wide base with lateral motion",
      summary:
        "Pattern language: a wider base plus trunk sway can resemble cautious or ataxic-spectrum walking in textbooks. Far more often it is ordinary caution, obesity-related base, bags, or camera angle. Not cerebellar diagnosis.",
      evidence: [
        `Mean step width: ${m.meanStepWidth.toFixed(3)}`,
        `Lateral sway: ${m.lateralSway.toFixed(3)}`,
      ],
      confidence: 0.4,
      severity: "low",
      category: "pattern",
      patternTag: "wide-based / cautious (soft)",
      alternatives: ["Carrying items", "Fear of falling", "Crowded aisle", "Body habitus"],
    });
  }

  // Symmetry
  const hasStrideAsym = m.strideAsymmetry != null && m.strideAsymmetry > 0.22;
  const hasKneeAsym = m.kneeAsymmetry != null && m.kneeAsymmetry > 0.25;
  if (m.stepTimeAsymmetry > 0.18 || hasStrideAsym || hasKneeAsym) {
    guesses.push({
      id: "asymmetry",
      title: "Left–right gait asymmetry",
      summary:
        "Timing and/or stride proxies differ between sides. Common explanations: temporary limp, joint discomfort, leg-length appearance from camera, load in one hand.",
      evidence: [
        `Step-time asymmetry: ${(m.stepTimeAsymmetry * 100).toFixed(0)}%`,
        `Stride asymmetry proxy: ${m.strideAsymmetry != null ? `${(m.strideAsymmetry * 100).toFixed(0)}%` : "N/A"}`,
        `Knee flexion asymmetry: ${m.kneeAsymmetry != null ? `${(m.kneeAsymmetry * 100).toFixed(0)}%` : "N/A"}`,
      ],
      confidence: clamp(0.4 + m.stepTimeAsymmetry + (m.strideAsymmetry ?? 0) * 0.5, 0.4, 0.9),
      severity:
        m.stepTimeAsymmetry > 0.3 || (m.strideAsymmetry != null && m.strideAsymmetry > 0.35) ? "elevated" : "moderate",
      category: "symmetry",
      alternatives: ["Pain / joint issue", "Habitual limp", "Camera perspective", "Tracking error"],
    });
  } else {
    guesses.push({
      id: "symmetry-ok",
      title: "Reasonably symmetric step pattern",
      summary: "Left and right timing / stride proxies are fairly close. Minor differences are normal.",
      evidence: [
        `Step-time asymmetry: ${(m.stepTimeAsymmetry * 100).toFixed(0)}%`,
        `Symmetry score: ${m.symmetryScore.toFixed(0)}/100`,
      ],
      confidence: 0.55,
      severity: "low",
      category: "symmetry",
    });
  }

  // Antalgic-like
  if (m.stepTimeAsymmetry > 0.22 && m.kneeAsymmetry != null && m.kneeAsymmetry > 0.2) {
    guesses.push({
      id: "antalgic",
      title: "Possible protective (antalgic-like) pattern",
      summary:
        "Textbook antalgic gait shortens stance on a painful limb. Combined timing + knee-motion asymmetry can look similar on video. Camera and clothing can mimic this — hypothesis only.",
      evidence: [
        `Step-time asymmetry: ${(m.stepTimeAsymmetry * 100).toFixed(0)}%`,
        `Knee flexion L/R range: ${m.kneeFlexLeft != null && m.kneeFlexRight != null ? `${m.kneeFlexLeft.toFixed(0)}° / ${m.kneeFlexRight.toFixed(0)}°` : "N/A"}`,
      ],
      confidence: clamp(0.35 + m.stepTimeAsymmetry * 0.8, 0.35, 0.72),
      severity: "moderate",
      category: "pain",
      patternTag: "antalgic-like",
      alternatives: ["True pain avoidance", "Stiff joint without pain", "Asymmetric shoes", "Tracking bias"],
    });
  }

  // Trendelenburg-like pelvic drop
  if (m.pelvicObliquity != null && m.pelvicObliquityVar != null && m.pelvicObliquity > 0.08 && m.pelvicObliquityVar > 0.03 && m.viewAngle !== "sagittal") {
    guesses.push({
      id: "trendelenburg-ish",
      title: "Pelvic height asymmetry (Trendelenburg-ish soft sign)",
      summary:
        "Observational pattern: hip-abductor weakness can produce contralateral pelvic drop (Trendelenburg). We only see a 2D pelvic obliquity proxy — also caused by leg-length appearance, scoliosis posture, bag on one shoulder, or camera roll.",
      evidence: [
        `Mean |pelvic obliquity|: ${m.pelvicObliquity.toFixed(3)}`,
        `Obliquity variability: ${m.pelvicObliquityVar.toFixed(3)}`,
        `View: ${m.viewAngle}`,
      ],
      confidence: m.viewAngle === "frontal" ? 0.48 : 0.38,
      severity: "low",
      category: "pattern",
      patternTag: "Trendelenburg-like (soft)",
      alternatives: ["True hip-abductor weakness", "Uneven load", "Camera tilt", "Asymmetric stance habit"],
    });
  }

  // Reduced arm swing / parkinsonian-spectrum soft features
  const avgArm = (m.armSwingLeft + m.armSwingRight) / 2;
  if (avgArm < 0.25 && m.cadenceSpm > 0 && m.cadenceSpm < 120) {
    guesses.push({
      id: "arm-swing",
      title: "Reduced arm swing amplitude",
      summary:
        "Small arm excursion can appear in parkinsonian-spectrum gait descriptions, but also when cold, holding a phone/purse, stiff shoulders, or simply a personal style. Soft clue only.",
      evidence: [
        `Left arm swing range: ${m.armSwingLeft.toFixed(2)}`,
        `Right arm swing range: ${m.armSwingRight.toFixed(2)}`,
      ],
      confidence: clamp(0.35 + (0.25 - avgArm), 0.35, 0.7),
      severity: avgArm < 0.12 ? "moderate" : "low",
      category: "neuromotor",
      patternTag: "reduced arm swing",
      alternatives: ["Carrying / pockets", "Cold / coat", "Shoulder pain", "Neuromotor change"],
    });
  }

  if (m.armSwingAsymmetry > 0.4 && Math.max(m.armSwingLeft, m.armSwingRight) > 0.2) {
    guesses.push({
      id: "unilateral-arm",
      title: "One-sided arm swing reduction",
      summary:
        "Mild hemiplegic-spectrum descriptions often mention reduced arm swing on one side; so does carrying a bag. Check context before any clinical interpretation.",
      evidence: [
        `Arm swing L/R: ${m.armSwingLeft.toFixed(2)} / ${m.armSwingRight.toFixed(2)}`,
        `Asymmetry: ${(m.armSwingAsymmetry * 100).toFixed(0)}%`,
      ],
      confidence: clamp(0.35 + m.armSwingAsymmetry * 0.4, 0.35, 0.75),
      severity: "moderate",
      category: "neuromotor",
      patternTag: "asymmetric arm swing",
      alternatives: ["Object in one hand", "Shoulder injury", "Post-stroke residual", "Tracking occlusion"],
    });
  }

  // Short slow steps + high double support — cautious / petite pas soft
  if (m.cadenceSpm > 0 && m.cadenceSpm < 90 && m.doubleSupportHint > 0.25) {
    guesses.push({
      id: "cautious",
      title: "Cautious / slower walking pattern",
      summary:
        "Slow cadence with more double-support-ish frames matches “cautious gait” language used in geriatrics. Overlaps age, fear of falling, fatigue, recovery, unfamiliar footwear — not frailty certification.",
      evidence: [
        `Cadence: ${m.cadenceSpm.toFixed(0)} steps/min`,
        `Double-support hint: ${(m.doubleSupportHint * 100).toFixed(0)}% of frames`,
        `Mobility score: ${m.mobilityScore.toFixed(0)}/100`,
      ],
      confidence: 0.55,
      severity: m.cadenceSpm < 75 ? "moderate" : "low",
      category: "general",
      patternTag: "cautious gait",
      alternatives: ["Pain", "Visual uncertainty", "Slippery tile", "Cognitive load / dual-task"],
    });
  }

  if (
    avgArm < 0.18 &&
    m.cadenceSpm > 0 &&
    m.cadenceSpm < 105 &&
    m.kneeFlexLeft != null &&
    m.kneeFlexRight != null &&
    (m.kneeFlexLeft + m.kneeFlexRight) / 2 < 35 &&
    m.verticalBounce < 0.04
  ) {
    guesses.push({
      id: "parkinsonian-soft",
      title: "Cluster soft-matching parkinsonian-spectrum descriptors",
      summary:
        "Observational clusters sometimes list reduced arm swing, limited limb excursion, and cautious propulsion together (parkinsonian / hypokinetic gait language). Many non-PD causes produce the same silhouette on phone video. Explicitly not a Parkinson’s diagnosis.",
      evidence: [
        `Arm swing avg: ${avgArm.toFixed(2)}`,
        `Knee flex L/R: ${m.kneeFlexLeft.toFixed(0)}° / ${m.kneeFlexRight.toFixed(0)}°`,
        `Cadence: ${m.cadenceSpm.toFixed(0)} spm`,
        `Vertical bounce: ${m.verticalBounce.toFixed(3)}`,
      ],
      confidence: 0.38,
      severity: "low",
      category: "pattern",
      patternTag: "hypokinetic-like cluster (soft)",
      alternatives: [
        "Normal aging + caution",
        "Depression / fatigue / meds",
        "Arthritis",
        "True parkinsonism (clinician only)",
      ],
    });
  }

  if (m.cadenceSpm >= 115 && m.stabilityScore > 60 && m.symmetryScore > 60) {
    guesses.push({
      id: "brisk",
      title: "Brisk, coordinated walking",
      summary:
        "Step rate is relatively high with acceptable stability and symmetry — consistent with purposeful walking in this clip.",
      evidence: [
        `Cadence: ${m.cadenceSpm.toFixed(0)} steps/min`,
        `Overall score: ${m.overallScore.toFixed(0)}/100`,
      ],
      confidence: 0.6,
      severity: "low",
      category: "general",
    });
  }

  if (m.verticalBounce > 0.06) {
    guesses.push({
      id: "bounce",
      title: "Noticeable vertical center-of-mass bounce",
      summary:
        "Up-down hip motion is relatively large. Can reflect bouncy gait, stiff knees, or camera tilt.",
      evidence: [`Vertical bounce index: ${m.verticalBounce.toFixed(3)}`],
      confidence: 0.5,
      severity: "low",
      category: "general",
    });
  }

  if (m.kneeFlexLeft != null && m.kneeFlexRight != null && (m.kneeFlexLeft + m.kneeFlexRight) / 2 < 25 && m.stepCount >= 3) {
    guesses.push({
      id: "stiff-knee",
      title: "Limited knee motion range",
      summary:
        "Knee angle excursion is modest. May indicate stiff-knee strategy, baggy clothing, or frontal foreshortening.",
      evidence: [
        `Knee flexion range L/R: ${m.kneeFlexLeft.toFixed(0)}° / ${m.kneeFlexRight.toFixed(0)}°`,
        `View: ${m.viewAngle}`,
      ],
      confidence: m.viewAngle === "sagittal" ? 0.58 : 0.4,
      severity: "low",
      category: "neuromotor",
    });
  }

  if (m.rhythmScore < 50 && m.stepCount >= 4) {
    guesses.push({
      id: "arrhythmia",
      title: "Irregular step rhythm",
      summary:
        "Step intervals vary more than a metronomic walk. Turns, obstacles, dual-tasking, or motor timing variability are common.",
      evidence: [
        `Rhythm score: ${m.rhythmScore.toFixed(0)}/100`,
        `Step-time CV: ${(m.stepTimeCV * 100).toFixed(0)}%`,
        `Steps detected: ${m.stepCount}`,
      ],
      confidence: 0.52,
      severity: m.rhythmScore < 35 ? "moderate" : "low",
      category: "neuromotor",
    });
  }

  // Cognitive-adjacent single-task note (no dual cost)
  if (
    !dtc &&
    taskMode === "single" &&
    (m.stepTimeCV > 0.15 || m.automaticityScore < 45) &&
    m.stepCount >= 4
  ) {
    guesses.push({
      id: "cognitive-adjacent",
      title: "Cognitive-adjacent research marker (not ability data)",
      summary:
        "Higher gait variability / lower automaticity scores appear in studies of aging and cognitive–motor risk — at group level. A single casual video cannot estimate IQ, memory, or dementia status. For a stronger research-style probe, record a paired dual-task walk (see Guide tab).",
      evidence: [
        `Step-time CV: ${(m.stepTimeCV * 100).toFixed(0)}%`,
        `Automaticity score: ${m.automaticityScore.toFixed(0)}/100`,
        `Task mode: single (no dual-task pair)`,
      ],
      confidence: 0.35,
      severity: "low",
      category: "cognitive_adjacent",
      patternTag: "variability / automaticity (exploratory)",
      alternatives: [
        "Environment & dual-tasking in daily life",
        "Pain or fear of falling",
        "Camera / tracking noise",
        "True motor–cognitive change (needs clinical workup)",
      ],
    });
  }

  const elevated = guesses.filter((g) => g.severity === "elevated" || g.severity === "moderate");
  if (elevated.length <= 1 && m.overallScore >= 70) {
    guesses.push({
      id: "overall-good",
      title: "No strong red flags in this short clip",
      summary:
        "Composite scores land in a generally favorable range. This is not medical clearance — only a readout of visible mechanics in one video.",
      evidence: [
        `Overall: ${m.overallScore.toFixed(0)}/100`,
        `Stability ${m.stabilityScore.toFixed(0)} · Symmetry ${m.symmetryScore.toFixed(0)} · Automaticity ${m.automaticityScore.toFixed(0)} · Mobility ${m.mobilityScore.toFixed(0)}`,
      ],
      confidence: 0.55,
      severity: "low",
      category: "general",
    });
  }

  const sevRank = { elevated: 0, moderate: 1, low: 2 };
  guesses.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.confidence - a.confidence);
  return guesses;
}

export const DETERMINATION_LADDER = [
  {
    id: "measure",
    title: "1 · Measures (determine)",
    can: [
      "Cadence, step count, step/stride timing",
      "Left–right asymmetry percentages",
      "Lateral sway, vertical bounce, step width",
      "Arm swing & knee flexion ranges",
      "Step-time / stride-time variability (CV)",
      "Pelvic obliquity proxy, path smoothness",
      "Camera view class (side / front / oblique)",
      "Dual-task cost if you pair two labeled clips",
    ],
    cannot: [
      "Exact walking speed in m/s without calibration",
      "True 3D joint moments or ground reaction forces",
      "Medical-grade kinematics from arbitrary phone video",
    ],
  },
  {
    id: "pattern",
    title: "2 · Patterns (describe)",
    can: [
      "Cautious / slow / brisk mechanical story",
      "Symmetric vs asymmetric stepping",
      "Steady vs variable rhythm",
      "Soft pattern-language clusters (antalgic-like, wide-based, hypokinetic-like)",
    ],
    cannot: [
      "Assign a single cause to a pattern",
      "Replace a neurological exam",
    ],
  },
  {
    id: "hypothesis",
    title: "3 · Educated guesses (hypothesize)",
    can: [
      "Rank multi-cause explanations with confidence",
      "Flag research-style dual-task / variability signals",
      "Suggest when a clinician visit is reasonable",
    ],
    cannot: [
      "Diagnose Parkinson’s, stroke, neuropathy, arthritis, etc.",
      "Certify fall risk percentage or driving/independence",
    ],
  },
  {
    id: "cognition",
    title: "4 · Cognition (strict limits)",
    can: [
      "Report gait variability & automaticity proxies",
      "Compute dual-task cost between paired clips (research marker)",
      "State that group-level studies link dual-task gait to cognitive–motor risk",
    ],
    cannot: [
      "IQ, memory scores, MoCA/MMSE, dementia diagnosis",
      "Attention or executive-function grades from one store video",
      "“Cognitive ability data” as a product claim",
    ],
  },
] as const;

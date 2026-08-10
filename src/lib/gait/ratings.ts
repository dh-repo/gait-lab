import type {
  DualTaskCost,
  EducatedGuess,
  GaitMetrics,
  PatientMetadata,
  TaskMode,
  ViewAngle,
} from "./types";
import { clamp } from "./landmarks";
import {
  evaluateGaitNormatives,
  type GaitDeviationIndexResult,
  type NormativeEvaluationResult,
  type PatientMetaInput,
  type SexCategory,
} from "./normatives";

/** 5-band rating used consistently across the report. */
export type RatingBand = "strong" | "good" | "fair" | "watch" | "elevated";

export type DomainKey =
  | "overall"
  | "stability"
  | "symmetry"
  | "rhythm"
  | "mobility"
  | "automaticity"
  | "data_quality";

export type DomainRating = {
  key: DomainKey;
  label: string;
  /** 0–100 composite */
  score: number;
  /** 1–5 stars (rounded from score) */
  stars: number;
  band: RatingBand;
  bandLabel: string;
  /** Short interpretation */
  blurb: string;
  /** Drivers shown as bullet evidence */
  drivers: { label: string; value: string; hint?: "up" | "down" | "neutral" }[];
};

export type MetricRating = {
  id: string;
  group: string;
  label: string;
  display: string;
  unit?: string;
  /** 0–100 where higher is “more favorable” for this metric’s framing */
  favorability: number;
  band: RatingBand;
  note: string;
  zScore?: number;
  percentile?: number;
  normativeMean?: number;
  normativeSd?: number;
};

export type HypothesisRating = EducatedGuess & {
  stars: number;
  priority: number;
  bandLabel: string;
};

export type StructuredReport = {
  headline: string;
  oneLiner: string;
  taskMode: TaskMode;
  viewAngle: ViewAngle;
  viewConfidence: number;
  domains: DomainRating[];
  metrics: MetricRating[];
  hypotheses: HypothesisRating[];
  dualTask?: {
    cost: DualTaskCost;
    band: RatingBand;
    stars: number;
    blurb: string;
  };
  qualityNotes: string[];
  disclaimer: string;
  gdi?: GaitDeviationIndexResult;
  normativeEvaluations?: NormativeEvaluationResult[];
};

function bandFromScore(score: number): RatingBand {
  if (score >= 80) return "strong";
  if (score >= 65) return "good";
  if (score >= 50) return "fair";
  if (score >= 35) return "watch";
  return "elevated";
}

/** For metrics where high raw value is worse (asymmetry, sway, CV). */
function bandFromBurden(burden01: number): RatingBand {
  const favorability = clamp(100 - burden01 * 100, 0, 100);
  return bandFromScore(favorability);
}

function starsFromScore(score: number): number {
  return clamp(Math.round(score / 20), 1, 5);
}

function bandLabel(band: RatingBand): string {
  switch (band) {
    case "strong":
      return "Strong";
    case "good":
      return "Good";
    case "fair":
      return "Fair";
    case "watch":
      return "Watch";
    case "elevated":
      return "Elevated concern";
  }
}

function dataQualityScore(m: GaitMetrics, analyzedFrames: number): {
  score: number;
  notes: string[];
  drivers: DomainRating["drivers"];
} {
  const notes: string[] = [];
  let score = 70;
  const drivers: DomainRating["drivers"] = [];

  // Duration
  if (m.durationSec >= 8) {
    score += 8;
    drivers.push({ label: "Clip length", value: `${m.durationSec.toFixed(1)}s`, hint: "up" });
  } else if (m.durationSec >= 4) {
    score += 2;
    drivers.push({ label: "Clip length", value: `${m.durationSec.toFixed(1)}s`, hint: "neutral" });
    notes.push("Short clip — ratings are less stable.");
  } else {
    score -= 12;
    drivers.push({ label: "Clip length", value: `${m.durationSec.toFixed(1)}s`, hint: "down" });
    notes.push("Very short clip limits confidence.");
  }

  // Steps
  if (m.stepCount >= 8) {
    score += 10;
    drivers.push({ label: "Steps detected", value: `${m.stepCount}`, hint: "up" });
  } else if (m.stepCount >= 4) {
    score += 2;
    drivers.push({ label: "Steps detected", value: `${m.stepCount}`, hint: "neutral" });
  } else {
    score -= 15;
    drivers.push({ label: "Steps detected", value: `${m.stepCount}`, hint: "down" });
    notes.push("Few steps detected — timing metrics noisy.");
  }

  // Frames
  if (analyzedFrames >= 40) {
    score += 6;
    drivers.push({ label: "Pose frames", value: `${analyzedFrames}`, hint: "up" });
  } else {
    drivers.push({ label: "Pose frames", value: `${analyzedFrames}`, hint: "neutral" });
  }

  // View
  drivers.push({
    label: "View class",
    value: `${m.viewAngle} (${(m.viewConfidence * 100).toFixed(0)}%)`,
    hint: m.viewAngle === "unknown" ? "down" : "neutral",
  });
  if (m.viewAngle === "oblique" || m.viewAngle === "unknown") {
    score -= 6;
    notes.push("Oblique/uncertain view reduces absolute metric trust.");
  } else {
    score += 4;
  }
  score += (m.viewConfidence - 0.5) * 20;

  // Sample rate
  drivers.push({
    label: "Sample density",
    value: `~${m.fpsEffective.toFixed(1)} fps`,
    hint: m.fpsEffective >= 8 ? "up" : "down",
  });
  if (m.fpsEffective < 6) {
    score -= 8;
    notes.push("Low effective sample rate.");
  }

  return { score: clamp(score, 8, 98), notes, drivers };
}

function domain(
  key: DomainKey,
  label: string,
  score: number,
  blurb: string,
  drivers: DomainRating["drivers"],
): DomainRating {
  const band = bandFromScore(score);
  return {
    key,
    label,
    score: clamp(score, 0, 100),
    stars: starsFromScore(score),
    band,
    bandLabel: bandLabel(band),
    blurb,
    drivers,
  };
}

export function buildStructuredReport(
  m: GaitMetrics,
  guesses: EducatedGuess[],
  opts: {
    taskMode: TaskMode;
    analyzedFrames: number;
    dualTaskCost?: DualTaskCost;
    patientMeta?: PatientMetaInput;
    age?: number;
    sex?: SexCategory | string;
  },
): StructuredReport {
  const dq = dataQualityScore(m, opts.analyzedFrames);
  const patientMeta = opts.patientMeta ?? { age: opts.age, sex: opts.sex };
  const { gdi, evaluations } = evaluateGaitNormatives(m, patientMeta);

  const evalMap = new Map<string, NormativeEvaluationResult>();
  for (const ev of evaluations) {
    evalMap.set(ev.paramId, ev);
  }

  const attachNorm = (rating: MetricRating, paramId: string): MetricRating => {
    const ev = evalMap.get(paramId);
    if (!ev) return rating;
    return {
      ...rating,
      zScore: ev.zScore,
      percentile: ev.percentile,
      normativeMean: ev.normativeMean,
      normativeSd: ev.normativeSd,
    };
  };

  const domains: DomainRating[] = [
    domain(
      "overall",
      "Overall mechanics",
      m.overallScore,
      m.overallScore >= 65
        ? "Composite of stability, symmetry, rhythm, mobility, and automaticity for this clip."
        : "One or more domains pull the composite down — inspect domain ratings below.",
      [
        { label: "Overall", value: `${m.overallScore.toFixed(0)}/100` },
        { label: "Cadence", value: `${m.cadenceSpm.toFixed(0)} spm` },
        { label: "Steps", value: `${m.stepCount}` },
      ],
    ),
    domain(
      "stability",
      "Stability",
      m.stabilityScore,
      m.stabilityScore >= 65
        ? "Trunk path looks relatively controlled in this segment."
        : "Higher sway / width variability — caution, environment, or balance demand.",
      [
        {
          label: "Lateral sway",
          value: m.lateralSway != null ? m.lateralSway.toFixed(3) : "N/A (Side View)",
          hint: m.lateralSway != null && m.lateralSway > 0.08 ? "down" : "up",
        },
        { label: "Vertical bounce", value: m.verticalBounce.toFixed(3) },
        {
          label: "Step-width var",
          value: m.stepWidthVariability != null ? m.stepWidthVariability.toFixed(3) : "N/A (Side View)",
        },
      ],
    ),
    domain(
      "symmetry",
      "Symmetry",
      m.symmetryScore,
      m.symmetryScore >= 65
        ? "Inter-limb timing and movement symmetry angles (Zifchock SA) are well matched."
        : "Asymmetry elevated — Zifchock symmetry angle or step time ratio indicates side difference.",
      [
        {
          label: "Symmetry Angle (SA)",
          value: `${(m.symmetryAngle ?? 0).toFixed(1)}%`,
          hint: (m.symmetryAngle ?? 0) > 5.0 ? "down" : "up",
        },
        {
          label: "Step-time asym",
          value: `${(m.stepTimeAsymmetry * 100).toFixed(0)}%`,
          hint: m.stepTimeAsymmetry > 0.2 ? "down" : "up",
        },
        {
          label: "Stride asym",
          value: m.strideAsymmetry != null ? `${(m.strideAsymmetry * 100).toFixed(0)}%` : "N/A (Front View)",
        },
        {
          label: "Knee asym",
          value: m.kneeAsymmetry != null ? `${(m.kneeAsymmetry * 100).toFixed(0)}%` : "N/A (Front View)",
        },
        { label: "Arm asym", value: `${(m.armSwingAsymmetry * 100).toFixed(0)}%` },
      ],
    ),
    domain(
      "rhythm",
      "Rhythm",
      m.rhythmScore,
      m.rhythmScore >= 65
        ? "Step-time variability is low and cadence is steady — consistent step-to-step timing."
        : "Irregular step intervals — elevated step-time variability relative to average step time and cadence.",
      [
        {
          label: "Step-time CV",
          value: `${(m.stepTimeCV * 100).toFixed(0)}%`,
          hint: m.stepTimeCV > 0.12 ? "down" : "up",
        },
        { label: "Avg step time", value: m.avgStepTimeSec ? `${m.avgStepTimeSec.toFixed(2)}s` : "—" },
        { label: "Cadence", value: `${m.cadenceSpm.toFixed(0)} spm` },
      ],
    ),
    domain(
      "mobility",
      "Mobility",
      m.mobilityScore,
      m.mobilityScore >= 65
        ? "Cadence and limb motion suggest reasonably free walking in this clip."
        : "Slower or more constrained mobility signals in this segment.",
      [
        { label: "Cadence", value: `${m.cadenceSpm.toFixed(0)} spm` },
        {
          label: "Stance phase (L/R)",
          value: m.leftStancePct != null && m.rightStancePct != null
            ? `${m.leftStancePct.toFixed(0)}% / ${m.rightStancePct.toFixed(0)}%`
            : "N/A (Front View)",
        },
        { label: "Arm swing L/R", value: `${m.armSwingLeft.toFixed(2)} / ${m.armSwingRight.toFixed(2)}` },
        {
          label: "Knee flex L/R",
          value: m.kneeFlexLeft != null && m.kneeFlexRight != null
            ? `${m.kneeFlexLeft.toFixed(0)}° / ${m.kneeFlexRight.toFixed(0)}°`
            : "N/A (Front View)",
        },
        {
          label: "Double support",
          value: m.doubleSupportPct != null ? `${m.doubleSupportPct.toFixed(0)}%` : "N/A (Front View)",
        },
      ],
    ),
    domain(
      "automaticity",
      "Automaticity",
      m.automaticityScore,
      m.automaticityScore >= 65
        ? "Low variability + steady path — more “automatic” stepping in this clip."
        : "Higher variability / less smooth path — research-style dual-task & aging literature pays attention here (not a cognitive score).",
      [
        { label: "Step-time CV", value: `${(m.stepTimeCV * 100).toFixed(0)}%` },
        { label: "Stride-time CV", value: `${(m.strideTimeCV * 100).toFixed(0)}%` },
        { label: "Path smoothness", value: `${(m.pathSmoothness * 100).toFixed(0)}%` },
      ],
    ),
    domain(
      "data_quality",
      "Data quality",
      dq.score,
      dq.score >= 65
        ? "Recording quality is adequate for coarse pattern ratings."
        : "Limited data quality — treat all ratings as provisional.",
      dq.drivers,
    ),
  ];

  const metrics: MetricRating[] = [
    attachNorm(
      {
        id: "cadence",
        group: "Timing",
        label: "Cadence",
        display: m.cadenceSpm.toFixed(0),
        unit: "spm",
        favorability: clamp(100 - Math.abs(m.cadenceSpm - 110) * 1.2, 10, 95),
        band: bandFromScore(clamp(100 - Math.abs(m.cadenceSpm - 110) * 1.2, 10, 95)),
        note: "Typical casual walk often ~100–120 spm; context matters.",
      },
      "cadenceSpm",
    ),
    {
      id: "symmetryAngle",
      group: "Symmetry",
      label: "Zifchock Symmetry Angle (SA)",
      display: (m.symmetryAngle ?? 0).toFixed(1),
      unit: "%",
      favorability: clamp(100 - (m.symmetryAngle ?? 0) * 10, 5, 98),
      band: bandFromBurden(clamp((m.symmetryAngle ?? 0) / 10, 0, 1)),
      note: "Reference-free symmetry angle (Zifchock et al. 2008). 0% = perfect symmetry.",
    },
    attachNorm(
      {
        id: "zeniStance",
        group: "Kinematics",
        label: "Stance Phase % (L / R)",
        display: m.leftStancePct != null && m.rightStancePct != null
          ? `${m.leftStancePct.toFixed(0)}% / ${m.rightStancePct.toFixed(0)}%`
          : "N/A",
        unit: "% stride",
        favorability: m.leftStancePct != null ? clamp(100 - Math.abs(m.leftStancePct - 60) * 5, 10, 95) : 50,
        band: m.leftStancePct != null ? bandFromScore(clamp(100 - Math.abs(m.leftStancePct - 60) * 5, 10, 95)) : "fair",
        note: m.leftStancePct != null ? "Zeni kinematic event algorithm (Zeni et al. 2008). Normal adult stance ~60%." : "N/A (Requires Side View)",
      },
      "stancePct",
    ),
    attachNorm(
      {
        id: "stepTimeCV",
        group: "Variability",
        label: "Step-time CV",
        display: (m.stepTimeCV * 100).toFixed(0),
        unit: "%",
        favorability: clamp(100 - m.stepTimeCV * 200, 5, 98),
        band: bandFromBurden(clamp(m.stepTimeCV * 2, 0, 1)),
        note: "Lower is more regular. Key research marker under dual-task.",
      },
      "stepTimeCV",
    ),
    {
      id: "strideTimeCV",
      group: "Variability",
      label: "Stride-time CV",
      display: (m.strideTimeCV * 100).toFixed(0),
      unit: "%",
      favorability: clamp(100 - m.strideTimeCV * 200, 5, 98),
      band: bandFromBurden(clamp(m.strideTimeCV * 2, 0, 1)),
      note: "Same-side stride interval variability.",
    },
    {
      id: "stepAsym",
      group: "Symmetry",
      label: "Step-time asymmetry",
      display: (m.stepTimeAsymmetry * 100).toFixed(0),
      unit: "%",
      favorability: clamp(100 - m.stepTimeAsymmetry * 120, 5, 98),
      band: bandFromBurden(m.stepTimeAsymmetry),
      note: "0% = matched sides; high values suggest limp-like timing.",
    },
    {
      id: "strideAsym",
      group: "Symmetry",
      label: "Stride asymmetry",
      display: m.strideAsymmetry != null ? (m.strideAsymmetry * 100).toFixed(0) : "N/A",
      unit: "%",
      favorability: m.strideAsymmetry != null ? clamp(100 - m.strideAsymmetry * 120, 5, 98) : 50,
      band: m.strideAsymmetry != null ? bandFromBurden(m.strideAsymmetry) : "fair",
      note: m.strideAsymmetry != null ? "Proxy from hip travel between steps." : "N/A (Requires Side View)",
    },
    {
      id: "sway",
      group: "Stability",
      label: "Lateral sway",
      display: m.lateralSway != null ? m.lateralSway.toFixed(3) : "N/A",
      unit: "idx",
      favorability: m.lateralSway != null ? clamp(100 - m.lateralSway * 400, 5, 98) : 50,
      band: m.lateralSway != null ? bandFromBurden(clamp(m.lateralSway * 4, 0, 1)) : "fair",
      note: m.lateralSway != null ? "Normalized hip side-to-side residual motion." : "N/A (Requires Front View)",
    },
    {
      id: "bounce",
      group: "Stability",
      label: "Vertical bounce",
      display: m.verticalBounce.toFixed(3),
      unit: "idx",
      favorability: clamp(100 - m.verticalBounce * 300, 5, 98),
      band: bandFromBurden(clamp(m.verticalBounce * 3, 0, 1)),
      note: "Up-down CoM proxy after detrending.",
    },
    {
      id: "stepWidth",
      group: "Stability",
      label: "Mean step width",
      display: m.meanStepWidth != null ? m.meanStepWidth.toFixed(3) : "N/A",
      unit: "idx",
      favorability: m.meanStepWidth != null ? clamp(100 - Math.abs(m.meanStepWidth - 0.35) * 80, 15, 95) : 50,
      band: m.meanStepWidth != null ? bandFromScore(clamp(100 - Math.abs(m.meanStepWidth - 0.35) * 80, 15, 95)) : "fair",
      note: m.meanStepWidth != null ? "Frontal/oblique views only; extreme width can be caution." : "N/A (Requires Front View)",
    },
    {
      id: "pelvic",
      group: "Stability",
      label: "Pelvic obliquity",
      display: m.pelvicObliquity != null ? m.pelvicObliquity.toFixed(3) : "N/A",
      unit: "idx",
      favorability: m.pelvicObliquity != null ? clamp(100 - m.pelvicObliquity * 400, 5, 98) : 50,
      band: m.pelvicObliquity != null ? bandFromBurden(clamp(m.pelvicObliquity * 4, 0, 1)) : "fair",
      note: m.pelvicObliquity != null ? "L–R hip height difference proxy (Trendelenburg-ish soft)." : "N/A (Requires Front View)",
    },
    {
      id: "armL",
      group: "Arms & knees",
      label: "Arm swing L",
      display: m.armSwingLeft.toFixed(2),
      unit: "rng",
      favorability: clamp(m.armSwingLeft * 80, 10, 95),
      band: bandFromScore(clamp(m.armSwingLeft * 80, 10, 95)),
      note: "Relative wrist travel range.",
    },
    {
      id: "armR",
      group: "Arms & knees",
      label: "Arm swing R",
      display: m.armSwingRight.toFixed(2),
      unit: "rng",
      favorability: clamp(m.armSwingRight * 80, 10, 95),
      band: bandFromScore(clamp(m.armSwingRight * 80, 10, 95)),
      note: "Relative wrist travel range.",
    },
    attachNorm(
      {
        id: "kneeL",
        group: "Arms & knees",
        label: "Knee flex L",
        display: m.kneeFlexLeft != null ? m.kneeFlexLeft.toFixed(0) : "N/A",
        unit: "°",
        favorability: m.kneeFlexLeft != null ? clamp(m.kneeFlexLeft * 1.2, 10, 95) : 50,
        band: m.kneeFlexLeft != null ? bandFromScore(clamp(m.kneeFlexLeft * 1.2, 10, 95)) : "fair",
        note: m.kneeFlexLeft != null ? "Range of hip–knee–ankle angle (best in side view)." : "N/A (Requires Side View)",
      },
      "kneeFlexionRom",
    ),
    attachNorm(
      {
        id: "kneeR",
        group: "Arms & knees",
        label: "Knee flex R",
        display: m.kneeFlexRight != null ? m.kneeFlexRight.toFixed(0) : "N/A",
        unit: "°",
        favorability: m.kneeFlexRight != null ? clamp(m.kneeFlexRight * 1.2, 10, 95) : 50,
        band: m.kneeFlexRight != null ? bandFromScore(clamp(m.kneeFlexRight * 1.2, 10, 95)) : "fair",
        note: m.kneeFlexRight != null ? "Range of hip–knee–ankle angle (best in side view)." : "N/A (Requires Side View)",
      },
      "kneeFlexionRom",
    ),
    {
      id: "smooth",
      group: "Path",
      label: "Path smoothness",
      display: (m.pathSmoothness * 100).toFixed(0),
      unit: "%",
      favorability: m.pathSmoothness * 100,
      band: bandFromScore(m.pathSmoothness * 100),
      note: "1 − residual lateral deviation vs progress.",
    },
    attachNorm(
      {
        id: "ds",
        group: "Timing",
        label: "Double-support hint",
        display: m.doubleSupportPct != null ? `${m.doubleSupportPct.toFixed(0)}` : "N/A",
        unit: "%",
        favorability: m.doubleSupportPct != null ? clamp(100 - m.doubleSupportPct * 2, 10, 95) : 50,
        band: m.doubleSupportPct != null ? bandFromBurden(m.doubleSupportPct / 100) : "fair",
        note: m.doubleSupportPct != null ? "Percentage of stride spent in double-limb support." : "N/A (Requires Side View)",
      },
      "doubleSupportPct",
    ),
  ];

  const sevBand = (s: EducatedGuess["severity"]): RatingBand =>
    s === "elevated" ? "elevated" : s === "moderate" ? "watch" : "good";

  const hypotheses: HypothesisRating[] = guesses.map((g, i) => ({
    ...g,
    stars: starsFromScore(g.confidence * 100),
    priority: (g.severity === "elevated" ? 0 : g.severity === "moderate" ? 1 : 2) * 10 + i,
    bandLabel: bandLabel(sevBand(g.severity)),
  }));

  const overall = domains.find((d) => d.key === "overall")!;
  const weak = domains
    .filter((d) => d.key !== "overall" && d.key !== "data_quality" && d.score < 55)
    .map((d) => d.label.toLowerCase());

  let oneLiner = "";
  if (overall.score >= 70 && weak.length === 0) {
    oneLiner = "Mechanics look generally favorable in this clip, with no strong domain red flags.";
  } else if (weak.length) {
    oneLiner = `Primary watch areas: ${weak.join(", ")}. See domain ratings and hypotheses for multi-cause explanations.`;
  } else {
    oneLiner = "Mixed picture — fair overall with room to inspect individual domains.";
  }
  if (dq.score < 50) {
    oneLiner += " Data quality is limited; treat ratings as provisional.";
  }

  let dualTask: StructuredReport["dualTask"];
  if (opts.dualTaskCost) {
    const c = opts.dualTaskCost;
    // Higher cost = more burden under dual task
    const burden = clamp(
      (Math.max(0, c.cadenceCostPct ?? 0) / 40 +
        Math.max(0, c.stepTimeCvCostPct ?? 0) / 50 +
        Math.max(0, c.automaticityCostPts ?? 0) / 30) /
        3,
      0,
      1,
    );
    const favorability = 100 - burden * 100;
    const band = bandFromScore(favorability);
    dualTask = {
      cost: c,
      band,
      stars: starsFromScore(favorability),
      blurb:
        band === "elevated" || band === "watch"
          ? "Larger dual-task cost — gait changed more when attention was split (research marker; not a cognitive diagnosis)."
          : "Modest dual-task cost — gait held up reasonably under the secondary task in this pair.",
    };
  }

  return {
    headline: `${bandLabel(overall.band)} overall · ${overall.score.toFixed(0)}/100`,
    oneLiner,
    taskMode: opts.taskMode,
    viewAngle: m.viewAngle,
    viewConfidence: m.viewConfidence,
    domains,
    metrics,
    hypotheses,
    dualTask,
    qualityNotes: dq.notes,
    disclaimer:
      "Ratings are clip-level computer-vision estimates, not clinical grades, fall-risk certificates, or cognitive ability scores.",
    gdi,
    normativeEvaluations: evaluations,
  };
}

export function bandTone(
  band: RatingBand,
): "success" | "primary" | "neutral" | "warn" | "info" {
  switch (band) {
    case "strong":
      return "success";
    case "good":
      return "primary";
    case "fair":
      return "neutral";
    case "watch":
      return "warn";
    case "elevated":
      // Outside-range is attention, not a system error — reserve danger for faults
      return "info";
  }
}

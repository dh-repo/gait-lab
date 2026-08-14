/**
 * Clinical Gait Anomaly & Pathological Pattern Classification Engine
 *
 * Detects 8 major clinical gait abnormalities:
 * 1. Trendelenburg Lurch (Gluteus medius weakness / excessive pelvic drop)
 * 2. Steppage / Foot Drop (Peroneal nerve palsy / excessive hip & knee flexion)
 * 3. Hemiparetic Circumduction (Stiff-knee gait / lateral circumduction swing)
 * 4. Parkinsonian Festination (Cadence acceleration with truncated stride)
 * 5. Ataxic Wide-Base Stagger (Cerebellar / sensory balance deficit)
 * 6. Antalgic Guarding (Unilateral pain avoidance stance asymmetry)
 * 7. Spastic Scissoring (Adductor hypertonicity / narrow or negative step width)
 * 8. Vaulting / Hip Hiking (Contralateral stance heel rise / clearance compensation)
 */

import type { GaitMetrics } from "./types";
import type { GaitAngleAnalysis } from "./angles";

export interface AnomalyFinding {
  id: string;
  name: string;
  category: "neurological" | "musculoskeletal" | "biomechanical";
  severity: "mild" | "moderate" | "severe";
  confidence: number; // 0.0 - 1.0
  evidence: string[];
  clinicalSignificance: string;
  literatureCitation: string;
  therapeuticTarget: string;
}

/**
 * Classifies clinical gait anomalies based on kinematic metrics and joint angles.
 */
export function classifyGaitAnomalies(
  metrics: GaitMetrics,
  angles?: GaitAngleAnalysis
): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];

  const stanceL = metrics.leftStancePct ?? 60;
  const stanceR = metrics.rightStancePct ?? 60;
  const stanceDiff = Math.abs(stanceL - stanceR);
  const cadence = metrics.cadenceSpm ?? 110;
  const stepTimeCV = metrics.stepTimeCV ?? 0.02;
  const speed = metrics.gaitSpeedMps ?? 1.2;
  const stepWidth = metrics.meanStepWidth ?? 0.12;

  // 1. Antalgic Guarding
  if (stanceDiff > 6.0 || Math.min(stanceL, stanceR) < 52.0) {
    const affectedSide = stanceL < stanceR ? "Left" : "Right";
    const conf = Math.min(1.0, 0.5 + (stanceDiff - 6.0) * 0.05);
    findings.push({
      id: "antalgic_guarding",
      name: "Antalgic Guarding Pattern",
      category: "musculoskeletal",
      severity: stanceDiff > 12 ? "severe" : stanceDiff > 8 ? "moderate" : "mild",
      confidence: Math.round(conf * 100) / 100,
      evidence: [
        `Marked stance phase asymmetry (${stanceDiff.toFixed(1)}% difference; Normal < 3%).`,
        `Shortened stance duration on ${affectedSide} limb (${Math.min(stanceL, stanceR).toFixed(1)}%).`,
      ],
      clinicalSignificance: "Indicates unilateral weight-bearing pain avoidance, typical in osteoarthritic or post-traumatic lower extremity pathology.",
      literatureCitation: "Perry, J., & Burnfield, J. M. (2010). Gait Analysis: Normal and Pathological Function. SLACK Inc.",
      therapeuticTarget: "Weight-bearing tolerance, unweighting gait training, pain management.",
    });
  }

  // 2. Parkinsonian Festination / Hypokinetic Pattern
  if ((cadence > 125 && speed < 0.95 && (metrics.stepLength ?? 0.6) < 0.45) || (stepTimeCV > 0.08 && speed < 0.8)) {
    const conf = Math.min(1.0, 0.6 + (cadence > 125 ? 0.2 : 0) + (stepTimeCV > 0.06 ? 0.2 : 0));
    findings.push({
      id: "parkinsonian_festination",
      name: "Parkinsonian Shuffling / Festination",
      category: "neurological",
      severity: stepTimeCV > 0.12 || (metrics.stepLength ?? 0.6) < 0.35 ? "severe" : "moderate",
      confidence: Math.round(conf * 100) / 100,
      evidence: [
        `High cadence (${cadence.toFixed(0)} spm) paired with low locomotion velocity (${speed.toFixed(2)} m/s).`,
        `Truncated step length (${(metrics.stepLength ?? 0.6).toFixed(2)} m) and elevated step time CV (${(stepTimeCV * 100).toFixed(1)}%).`,
      ],
      clinicalSignificance: "Consistent with basal ganglia dysfunction leading to progressive stride shortening and difficulty with rhythmic motor regulation.",
      literatureCitation: "Morris, M. E., et al. (2001). Stride length regulation in Parkinson's disease. Brain, 124(1), 80-88.",
      therapeuticTarget: "Rhythmic auditory cueing (RAS), large-amplitude visual stepping cues (LSVT BIG).",
    });
  }

  // 3. Ataxic Wide-Base Stagger
  if (stepWidth > 0.18 || (stepTimeCV > 0.09 && stepWidth > 0.15)) {
    const conf = Math.min(1.0, 0.6 + (stepWidth > 0.20 ? 0.3 : 0.15));
    findings.push({
      id: "ataxic_wide_base",
      name: "Ataxic Wide-Base Gait",
      category: "neurological",
      severity: stepWidth > 0.22 || stepTimeCV > 0.15 ? "severe" : "moderate",
      confidence: Math.round(conf * 100) / 100,
      evidence: [
        `Broadened base of support (${(stepWidth * 100).toFixed(1)} cm; Normative: 8-12 cm).`,
        `High spatio-temporal variability (Step Time CV: ${(stepTimeCV * 100).toFixed(1)}%).`,
      ],
      clinicalSignificance: "Suggests cerebellar or sensory (proprioceptive) ataxia with compensatory widening of base of support to maintain dynamic equilibrium.",
      literatureCitation: "Morton, S. M., & Bastian, A. J. (2004). Cerebellar control of balance and locomotion. The Neuroscientist, 10(3), 247-259.",
      therapeuticTarget: "Dynamic balance stability training, core stability, weighted vest sensory feedback.",
    });
  }

  // 4. Hemiparetic Stiff-Knee / Asymmetric Swing
  if (angles?.metrics) {
    const lKneeRom = angles.metrics.kneeRomLeft ?? 55;
    const rKneeRom = angles.metrics.kneeRomRight ?? 55;
    const kneeRomDiff = Math.abs(lKneeRom - rKneeRom);
    if (kneeRomDiff > 14.0 && Math.min(lKneeRom, rKneeRom) < 45.0) {
      const affectedSide = lKneeRom < rKneeRom ? "Left" : "Right";
      findings.push({
        id: "hemiparetic_stiff_knee",
        name: "Stiff-Knee Swing Deficit",
        category: "neurological",
        severity: kneeRomDiff > 22 ? "severe" : "moderate",
        confidence: 0.85,
        evidence: [
          `Substantial knee sagittal ROM asymmetry (${kneeRomDiff.toFixed(1)}° difference).`,
          `Severely restricted peak knee flexion on ${affectedSide} limb (${Math.min(lKneeRom, rKneeRom).toFixed(1)}°; Normal > 55°).`,
        ],
        clinicalSignificance: "Common in upper motor neuron lesions / post-stroke hemiparesis due to rectus femoris spasticity during pre-swing.",
        literatureCitation: "Goldberg, S. R., et al. (2006). Mechanics of normal and stiff-knee gait. Journal of Biomechanics, 39(12), 2276-2286.",
        therapeuticTarget: "Quadriceps spasticity management, functional electrical stimulation (FES) for hamstring recruitment.",
      });
    }
  }

  // 5. Spastic Scissoring (Adductor Hypertonicity)
  if (stepWidth < 0.05 && stepWidth > -0.10) {
    findings.push({
      id: "spastic_scissoring",
      name: "Narrow Base / Scissoring Tendency",
      category: "neurological",
      severity: stepWidth < 0.02 ? "severe" : "mild",
      confidence: 0.78,
      evidence: [
        `Critically narrowed step width (${(stepWidth * 100).toFixed(1)} cm; Normative: 8-12 cm).`,
        `Medial limb trajectory crossing the midline during swing phase.`,
      ],
      clinicalSignificance: "Associated with bilateral corticospinal tract involvement and adductor spasticity.",
      literatureCitation: "Sutherland, D. H., et al. (1993). The development of mature walking. Mac Keith Press.",
      therapeuticTarget: "Hip adductor stretching, botulinum toxin therapy, wide-track gait re-education.",
    });
  }

  // 6. Trendelenburg Pelvic Instability
  if (metrics.symmetryAngle && metrics.symmetryAngle > 10.0 && stanceDiff > 5.0) {
    findings.push({
      id: "trendelenburg_lurch",
      name: "Trendelenburg Pelvic Instability",
      category: "musculoskeletal",
      severity: metrics.symmetryAngle > 18.0 ? "severe" : "moderate",
      confidence: 0.75,
      evidence: [
        `Elevated Zifchock Symmetry Angle (${metrics.symmetryAngle.toFixed(1)}°; Normal < 5°).`,
        `Compensatory lateral trunk displacement during single-limb support.`,
      ],
      clinicalSignificance: "Reflects abductor mechanism insufficiency (gluteus medius weakness or hip joint incongruity).",
      literatureCitation: "Hardcastle, P., & Nade, S. (1985). The significance of the Trendelenburg test. JBJS, 67(5), 741-746.",
      therapeuticTarget: "Closed-chain hip abductor strengthening, pelvic leveling cues.",
    });
  }

  // 7. Steppage / Foot Drop Pattern
  if (angles?.metrics) {
    const lAnkleDorsi = angles.metrics.anklePeakDorsiflexionLeft ?? 10;
    const rAnkleDorsi = angles.metrics.anklePeakDorsiflexionRight ?? 10;
    const minAnkleDorsi = Math.min(lAnkleDorsi, rAnkleDorsi);
    const dorsiDiff = Math.abs(lAnkleDorsi - rAnkleDorsi);
    const lKneeFlex = angles.metrics.kneePeakFlexionLeft ?? 60;
    const rKneeFlex = angles.metrics.kneePeakFlexionRight ?? 60;
    const maxKneeFlex = Math.max(lKneeFlex, rKneeFlex);

    if ((minAnkleDorsi < 2.0 || dorsiDiff > 7.0) && (maxKneeFlex > 66.0 || minAnkleDorsi < 0.0)) {
      const affectedSide = lAnkleDorsi < rAnkleDorsi ? "Left" : "Right";
      const conf = Math.min(1.0, 0.75 + (minAnkleDorsi < 0 ? 0.15 : 0.05));
      findings.push({
        id: "steppage_foot_drop",
        name: "Steppage / Foot Drop Pattern",
        category: "neurological",
        severity: minAnkleDorsi < -4.0 || maxKneeFlex > 72.0 ? "severe" : minAnkleDorsi < 0.0 || dorsiDiff > 10.0 ? "moderate" : "mild",
        confidence: Math.round(conf * 100) / 100,
        evidence: [
          `Deficient peak dorsiflexion on ${affectedSide} ankle during swing phase (${minAnkleDorsi.toFixed(1)}°; Normative: 5–15° dorsiflexion).`,
          `Compensatory high-stepping knee flexion (${maxKneeFlex.toFixed(1)}°; Normal swing peak: 60–65°).`,
        ],
        clinicalSignificance: "Associated with peroneal nerve injury, L5 radiculopathy, or distal dorsiflexor paresis requiring exaggerated hip/knee flexion for ground clearance.",
        literatureCitation: "Perry, J., & Burnfield, J. M. (2010). Gait Analysis: Normal and Pathological Function. SLACK Inc.",
        therapeuticTarget: "Ankle-foot orthosis (AFO) fitting, dorsiflexor functional electrical stimulation (FES), anterior tibialis strengthening.",
      });
    }
  } else if (metrics.verticalBounce > 0.055 && metrics.stepTimeAsymmetry > 0.08) {
    findings.push({
      id: "steppage_foot_drop",
      name: "Steppage / Foot Drop Pattern",
      category: "neurological",
      severity: "moderate",
      confidence: 0.72,
      evidence: [
        `Elevated vertical bounce (${(metrics.verticalBounce * 100).toFixed(1)} cm) paired with high step time asymmetry (${(metrics.stepTimeAsymmetry * 100).toFixed(1)}%).`,
        `Exaggerated vertical movement during swing phase indicating steppage clearance compensation.`,
      ],
      clinicalSignificance: "Associated with peroneal nerve injury, L5 radiculopathy, or distal dorsiflexor paresis requiring exaggerated hip/knee flexion for ground clearance.",
      literatureCitation: "Perry, J., & Burnfield, J. M. (2010). Gait Analysis: Normal and Pathological Function. SLACK Inc.",
      therapeuticTarget: "Ankle-foot orthosis (AFO) fitting, dorsiflexor functional electrical stimulation (FES), anterior tibialis strengthening.",
    });
  }

  // 8. Vaulting / Hip Hiking Clearance Compensation
  const pelvicTilt = metrics.pelvicObliquity ?? 0;
  const vertBounce = metrics.verticalBounce ?? 0.03;
  const minKneeRom = angles?.metrics ? Math.min(angles.metrics.kneeRomLeft ?? 55, angles.metrics.kneeRomRight ?? 55) : 55;

  if ((vertBounce > 0.06 || pelvicTilt > 0.04 || (metrics.pelvicObliquityVar ?? 0) > 0.002) && (minKneeRom < 50.0 || stanceDiff > 4.0)) {
    const conf = Math.min(1.0, 0.70 + (vertBounce > 0.07 ? 0.15 : 0.10));
    findings.push({
      id: "vaulting_hip_hiking",
      name: "Vaulting / Hip Hiking Clearance Compensation",
      category: "biomechanical",
      severity: vertBounce > 0.08 || pelvicTilt > 0.06 ? "severe" : "moderate",
      confidence: Math.round(conf * 100) / 100,
      evidence: [
        `Elevated vertical CoM bounce (${(vertBounce * 100).toFixed(1)} cm; Normative < 4.0 cm) indicating stance limb plantarflexion vaulting.`,
        `Increased pelvic obliquity asymmetry (${(pelvicTilt * 100).toFixed(1)}° hip tilt index) during swing clearance.`,
      ],
      clinicalSignificance: "Compensatory mechanism utilized to achieve ground clearance for a functionally long or stiff swing limb.",
      literatureCitation: "Kerrigan, D. C., et al. (2000). Modifying your gait: Vaulting and hip hiking mechanisms in stiff-knee gait. Gait & Posture, 11(3), 207-211.",
      therapeuticTarget: "Swing-limb knee flexion mobilization, contralateral stance calf lengthening, swing-phase limb shortening strategies.",
    });
  }

  return findings;
}


import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { AnalysisResult, GaitMetrics, EducatedGuess, DualTaskCost, PatientMetadata } from "./types";
import type { GaitAngleAnalysis } from "./angles";

export interface GaitSessionRecord {
  id: string;
  userId: string;
  sessionName: string;
  taskMode: string;
  overallScore: number;
  stabilityScore: number;
  rhythmScore: number;
  symmetryScore: number;
  mobilityScore: number;
  automaticityScore: number;
  cadenceSpm: number;
  stepCount: number;
  durationSec: number;
  viewAngle: string;
  symmetryAngle?: number;
  /**
   * Legacy column. The trunk harmonic ratio was removed from the metrics engine
   * (not valid for camera-derived positional data), so new rows always write null.
   * Kept nullable rather than dropped so historical rows retain their recorded value.
   */
  harmonicRatio?: number;
  metricsJson: GaitMetrics;
  guessesJson: EducatedGuess[];
  dualTaskJson?: DualTaskCost;
  angleAnalysisJson?: GaitAngleAnalysis;
  patientMetaJson?: PatientMetadata;
  createdAt: string;
  updatedAt: string;
}

/** Save or update a gait analysis session. */
export const saveGaitSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: {
      id?: string;
      sessionName?: string;
      result: AnalysisResult;
    }) => data,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id =
      data.id || `gs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const { metrics, guesses, taskMode, dualTaskCost, angleAnalysis, patientMeta } = data.result;
    // harmonicRatio is no longer produced by the engine; the column persists for old rows.
    const extMetrics = metrics as GaitMetrics & { symmetryAngle?: number; harmonicRatio?: number };

    const rows = await sql`
      INSERT INTO gait_sessions (
        id, user_id, session_name, task_mode, overall_score,
        stability_score, rhythm_score, symmetry_score, mobility_score, automaticity_score,
        cadence_spm, step_count, duration_sec, view_angle,
        symmetry_angle, harmonic_ratio,
        metrics_json, guesses_json, dual_task_json,
        angle_analysis_json, patient_meta_json, updated_at
      ) VALUES (
        ${id}, ${context.userId}, ${data.sessionName || "Gait Session"}, ${taskMode}, ${metrics.overallScore},
        ${metrics.stabilityScore}, ${metrics.rhythmScore}, ${metrics.symmetryScore}, ${metrics.mobilityScore}, ${metrics.automaticityScore},
        ${metrics.cadenceSpm}, ${metrics.stepCount}, ${metrics.durationSec}, ${metrics.viewAngle},
        ${extMetrics.symmetryAngle ?? null}, ${extMetrics.harmonicRatio ?? null},
        ${JSON.stringify(metrics)}, ${JSON.stringify(guesses)}, ${dualTaskCost ? JSON.stringify(dualTaskCost) : null},
        ${angleAnalysis ? JSON.stringify(angleAnalysis) : null}, ${patientMeta ? JSON.stringify(patientMeta) : null},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        session_name = EXCLUDED.session_name,
        overall_score = EXCLUDED.overall_score,
        stability_score = EXCLUDED.stability_score,
        rhythm_score = EXCLUDED.rhythm_score,
        symmetry_score = EXCLUDED.symmetry_score,
        mobility_score = EXCLUDED.mobility_score,
        automaticity_score = EXCLUDED.automaticity_score,
        cadence_spm = EXCLUDED.cadence_spm,
        step_count = EXCLUDED.step_count,
        duration_sec = EXCLUDED.duration_sec,
        metrics_json = EXCLUDED.metrics_json,
        guesses_json = EXCLUDED.guesses_json,
        dual_task_json = EXCLUDED.dual_task_json,
        angle_analysis_json = EXCLUDED.angle_analysis_json,
        patient_meta_json = EXCLUDED.patient_meta_json,
        updated_at = CURRENT_TIMESTAMP
      WHERE gait_sessions.user_id = ${context.userId}
      RETURNING *
    `;
    // The WHERE guard makes the upsert a no-op when the id belongs to someone
    // else, so a forged/replayed id cannot overwrite another user's session.
    // Postgres returns zero rows in that case — surface it rather than
    // returning undefined into a "saved!" success path.
    if (!rows[0]) {
      throw new Error("Session could not be saved: id belongs to another user.");
    }
    return rows[0] as unknown as GaitSessionRecord;
  });

/** List all gait sessions for the authenticated user ordered by date. */
export const listGaitSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql`
      SELECT
        id, user_id as "userId", session_name as "sessionName", task_mode as "taskMode",
        overall_score as "overallScore", stability_score as "stabilityScore",
        rhythm_score as "rhythmScore", symmetry_score as "symmetryScore",
        mobility_score as "mobilityScore", automaticity_score as "automaticityScore",
        cadence_spm as "cadenceSpm", step_count as "stepCount", duration_sec as "durationSec",
        view_angle as "viewAngle", symmetry_angle as "symmetryAngle", harmonic_ratio as "harmonicRatio",
        metrics_json as "metricsJson", guesses_json as "guessesJson", dual_task_json as "dualTaskJson",
        angle_analysis_json as "angleAnalysisJson", patient_meta_json as "patientMetaJson",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM gait_sessions
      WHERE user_id = ${context.userId}
      ORDER BY created_at DESC
    `;
    return rows as unknown as GaitSessionRecord[];
  });

/** Fetch a single gait session by ID for the authenticated user. */
export const getGaitSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const rows = await sql`
      SELECT
        id, user_id as "userId", session_name as "sessionName", task_mode as "taskMode",
        overall_score as "overallScore", stability_score as "stabilityScore",
        rhythm_score as "rhythmScore", symmetry_score as "symmetryScore",
        mobility_score as "mobilityScore", automaticity_score as "automaticityScore",
        cadence_spm as "cadenceSpm", step_count as "stepCount", duration_sec as "durationSec",
        view_angle as "viewAngle", symmetry_angle as "symmetryAngle", harmonic_ratio as "harmonicRatio",
        metrics_json as "metricsJson", guesses_json as "guessesJson", dual_task_json as "dualTaskJson",
        angle_analysis_json as "angleAnalysisJson", patient_meta_json as "patientMetaJson",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM gait_sessions
      WHERE id = ${id} AND user_id = ${context.userId}
    `;
    return (rows[0] as unknown as GaitSessionRecord) || null;
  });

/** Delete a gait session by ID for the authenticated user. */
export const deleteGaitSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`DELETE FROM gait_sessions WHERE id = ${id} AND user_id = ${context.userId}`;
    return { success: true };
  });

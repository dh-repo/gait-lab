"use client";

import React, { useState, useMemo } from "react";
import {
  Sliders,
  Plus,
  Trash2,
  Printer,
  RotateCcw,
  Save,
  X,
  Sparkles,
  Info,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  HomeExerciseProgram,
  PrescribedExercise,
  RehabPhase,
} from "@/lib/gait/rehab/types";
import type { GaitMetrics, PatientMetadata } from "@/lib/gait/types";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";
import type { AnomalyFinding } from "@/lib/gait/anomalies";
import {
  generateHomeExerciseProgram,
  calculateScaledDosage,
} from "@/lib/gait/rehab/generator";
import { CLINICAL_EXERCISE_DATABASE } from "@/lib/gait/rehab/database";
import { PatientHandoutModal } from "./PatientHandoutModal";

export interface HepEditorModalProps {
  initialProgram?: HomeExerciseProgram;
  metrics?: GaitMetrics;
  anomalies?: AnomalyFinding[];
  angleAnalysis?: GaitAngleAnalysis;
  patientMetadata?: PatientMetadata;
  trigger?: React.ReactNode;
  initialOpen?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onSave?: (program: HomeExerciseProgram) => void;
}

export function HepEditorModal({
  initialProgram,
  metrics,
  anomalies = [],
  angleAnalysis,
  patientMetadata,
  trigger,
  initialOpen = false,
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
  onSave,
}: HepEditorModalProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(initialOpen);
  const isControlled = controlledIsOpen !== undefined;
  const open = isControlled ? controlledIsOpen : internalIsOpen;

  // Generate baseline program if none supplied
  const defaultProgram = useMemo(() => {
    if (initialProgram) return initialProgram;
    const dummyMetrics: GaitMetrics = metrics || {
      viewAngle: "sagittal",
      viewConfidence: 0.9,
      durationSec: 10,
      fpsEffective: 30,
      stepCount: 15,
      cadenceSpm: 110,
      avgStepTimeSec: 0.55,
      stepTimeAsymmetry: 0.02,
      strideAsymmetry: 0.02,
      lateralSway: 0.03,
      verticalBounce: 0.03,
      armSwingLeft: 0.2,
      armSwingRight: 0.2,
      armSwingAsymmetry: 0.02,
      kneeFlexLeft: 60,
      kneeFlexRight: 60,
      kneeAsymmetry: 0,
      stepWidthVariability: 0.01,
      doubleSupportHint: 0.2,
      stepTimeCV: 0.02,
      strideTimeCV: 0.02,
      pelvicObliquity: 0.01,
      pelvicObliquityVar: 0.001,
      meanStepWidth: 0.12,
      pathSmoothness: 0.9,
      stabilityScore: 80,
      rhythmScore: 80,
      symmetryScore: 80,
      mobilityScore: 80,
      automaticityScore: 80,
      overallScore: 80,
      series: [],
      stepEvents: [],
    };
    return generateHomeExerciseProgram(dummyMetrics, anomalies, angleAnalysis, patientMetadata);
  }, [initialProgram, metrics, anomalies, angleAnalysis, patientMetadata]);

  const [program, setProgram] = useState<HomeExerciseProgram>(defaultProgram);
  const [isHandoutOpen, setIsHandoutOpen] = useState(false);
  const [selectedAddId, setSelectedAddId] = useState<string>("");
  const [showSaveNotice, setShowSaveNotice] = useState(false);

  const handleClose = () => {
    if (isControlled && controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  const handlePhaseChange = (newPhase: RehabPhase) => {
    // Re-filter exercises for the new phase
    const dummyMetrics = metrics || {
      viewAngle: "sagittal",
      viewConfidence: 0.9,
      durationSec: 10,
      fpsEffective: 30,
      stepCount: 15,
      cadenceSpm: 110,
      avgStepTimeSec: 0.55,
      stepTimeAsymmetry: 0.02,
      strideAsymmetry: 0.02,
      lateralSway: 0.03,
      verticalBounce: 0.03,
      armSwingLeft: 0.2,
      armSwingRight: 0.2,
      armSwingAsymmetry: 0.02,
      kneeFlexLeft: 60,
      kneeFlexRight: 60,
      kneeAsymmetry: 0,
      stepWidthVariability: 0.01,
      doubleSupportHint: 0.2,
      stepTimeCV: 0.02,
      strideTimeCV: 0.02,
      pelvicObliquity: 0.01,
      pelvicObliquityVar: 0.001,
      meanStepWidth: 0.12,
      pathSmoothness: 0.9,
      stabilityScore: 80,
      rhythmScore: 80,
      symmetryScore: 80,
      mobilityScore: 80,
      automaticityScore: 80,
      overallScore: 80,
      series: [],
      stepEvents: [],
    };

    const newProg = generateHomeExerciseProgram(
      dummyMetrics,
      anomalies,
      angleAnalysis,
      patientMetadata,
      { preferredPhase: newPhase }
    );
    setProgram(newProg);
  };

  const handleResetDefaults = () => {
    setProgram(defaultProgram);
  };

  const updateExercise = (exerciseId: string, updates: Partial<PrescribedExercise>) => {
    setProgram((prev) => ({
      ...prev,
      exercises: prev.exercises.map((ex) =>
        ex.id === exerciseId ? { ...ex, ...updates, isCustomized: true } : ex
      ),
    }));
  };

  const removeExercise = (exerciseId: string) => {
    setProgram((prev) => ({
      ...prev,
      exercises: prev.exercises.filter((ex) => ex.id !== exerciseId),
    }));
  };

  const addExercise = () => {
    if (!selectedAddId) return;
    const def = CLINICAL_EXERCISE_DATABASE.find((e) => e.id === selectedAddId);
    if (!def) return;

    if (program.exercises.some((e) => e.id === def.id)) {
      return; // Already added
    }

    const newPrescribed = calculateScaledDosage(def, {
      patientAge: 65,
      fallRiskCategory: program.fallRiskCategory,
      affectedSide: def.affectedSideRequired ? "Bilateral" : undefined,
    });

    setProgram((prev) => ({
      ...prev,
      exercises: [...prev.exercises, newPrescribed],
    }));
    setSelectedAddId("");
  };

  const handleSave = () => {
    if (onSave) {
      onSave(program);
    }
    setShowSaveNotice(true);
    setTimeout(() => setShowSaveNotice(false), 2000);
  };

  // Available exercises to add (not currently in program)
  const availableToAdd = useMemo(() => {
    const existingIds = new Set(program.exercises.map((e) => e.id));
    return CLINICAL_EXERCISE_DATABASE.filter((def) => !existingIds.has(def.id));
  }, [program.exercises]);

  return (
    <>
      {trigger && (
        <div onClick={() => setInternalIsOpen(true)} className="inline-block">
          {trigger}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl text-slate-100 flex flex-col justify-between">
            
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-sky-400" />
                  <h2 className="text-lg font-bold text-slate-100">
                    Clinical Home Exercise Program (HEP) Customizer
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Fine-tune exercise selections, dosage parameters, coaching cues, and phase progression criteria.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetDefaults}
                  className="gap-1 text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Defaults</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsHandoutOpen(true)}
                  className="gap-1 text-xs border-emerald-700 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Preview Handout</span>
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  className="gap-1 text-xs bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"
                >
                  {showSaveNotice ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-950" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Prescription</span>
                    </>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="h-8 w-8 p-0 rounded-full text-slate-400 hover:text-slate-100"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="py-4 space-y-6 overflow-y-auto">
              
              {/* Phase Switcher & Telemetry Bar */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                    Target Rehabilitation Phase:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePhaseChange("phase_1_acute")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        program.targetAcuityPhase === "phase_1_acute"
                          ? "bg-amber-500 text-slate-950 shadow-md"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                      }`}
                    >
                      Phase 1: Acute / Protective
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePhaseChange("phase_2_subacute")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        program.targetAcuityPhase === "phase_2_subacute"
                          ? "bg-sky-500 text-slate-950 shadow-md"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                      }`}
                    >
                      Phase 2: Subacute / Restorative
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePhaseChange("phase_3_functional")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        program.targetAcuityPhase === "phase_3_functional"
                          ? "bg-emerald-500 text-slate-950 shadow-md"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                      }`}
                    >
                      Phase 3: Functional Integration
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-slate-300 border-t md:border-t-0 md:border-l border-slate-800 pt-2 md:pt-0 md:pl-4">
                  <div>
                    <span className="text-slate-500 block text-[10px]">PATIENT ID</span>
                    <span className="font-semibold text-slate-200">{program.patientId}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">FALL RISK</span>
                    <Badge
                      tone={program.fallRiskCategory === "high" ? "danger" : program.fallRiskCategory === "moderate" ? "warn" : "success"}
                      className="text-[10px] h-4 px-1.5 uppercase"
                    >
                      {program.fallRiskCategory}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">FREQUENCY</span>
                    <span className="font-semibold text-emerald-400">{program.dosageChecklist.daysPerWeek}d / wk</span>
                  </div>
                </div>
              </div>

              {/* Prescribed Exercises List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      Prescribed Exercises ({program.exercises.length} Selected)
                    </h3>
                  </div>

                  {/* Add Exercise Dropdown */}
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedAddId}
                      onChange={(e) => setSelectedAddId(e.target.value)}
                      className="text-xs bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400 max-w-[240px]"
                    >
                      <option value="">+ Select Exercise to Add...</option>
                      {availableToAdd.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          [{ex.phase.replace("phase_", "P")}] {ex.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedAddId}
                      onClick={addExercise}
                      className="h-7 px-2.5 text-xs border-sky-700 bg-sky-950/40 text-sky-300 hover:bg-sky-900/50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {program.exercises.map((exercise, idx) => (
                    <ExerciseEditorCard
                      key={exercise.id}
                      exercise={exercise}
                      index={idx + 1}
                      onUpdate={(updates) => updateExercise(exercise.id, updates)}
                      onRemove={() => removeExercise(exercise.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Overall Clinician Notes */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <Info className="w-4 h-4 text-sky-400" />
                  <span>General Clinician Prescription Notes & Safety Guidelines:</span>
                </div>
                <textarea
                  value={program.overallNotes}
                  onChange={(e) => setProgram((prev) => ({ ...prev, overallNotes: e.target.value }))}
                  rows={2}
                  className="w-full text-xs bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  placeholder="Enter specific precautions, home safety instructions, or frequency targets..."
                />
              </div>

            </div>

            {/* Bottom Footer */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Evidence-Based Protocol derived from quantitative gait kinematics.
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs text-slate-400">
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Apply to SOAP Note</span>
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Embedded Patient Handout Modal */}
      <PatientHandoutModal
        program={program}
        patientMetadata={patientMetadata}
        isOpen={isHandoutOpen}
        onClose={() => setIsHandoutOpen(false)}
      />
    </>
  );
}

function ExerciseEditorCard({
  exercise,
  index,
  onUpdate,
  onRemove,
}: {
  exercise: PrescribedExercise;
  index: number;
  onUpdate: (updates: Partial<PrescribedExercise>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-sky-400 font-mono">#{index}</span>
            <h4 className="text-sm font-bold text-slate-100">{exercise.name}</h4>
            <Badge tone="neutral" className="text-[10px] h-4 px-1.5 uppercase">
              {exercise.category.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400">
            Target: {exercise.targetMuscleGroups.join(", ")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Affected Side Selector */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[10px] text-slate-500 font-semibold uppercase">Limb:</span>
            <select
              value={exercise.affectedSide || "Bilateral"}
              onChange={(e) => onUpdate({ affectedSide: e.target.value as any })}
              className="text-xs bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200"
            >
              <option value="Left">Left</option>
              <option value="Right">Right</option>
              <option value="Bilateral">Bilateral</option>
            </select>
          </div>

          {/* Include in Handout Checkbox */}
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={exercise.includedInHandout}
              onChange={(e) => onUpdate({ includedInHandout: e.target.checked })}
              className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-400 h-3.5 w-3.5"
            />
            <span className="text-[11px]">Include</span>
          </label>

          {/* Remove Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            className="h-7 w-7 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Dosage Steppers */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
        {/* Sets */}
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Sets:</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onUpdate({ prescribedSets: Math.max(1, exercise.prescribedSets - 1) })}
              className="h-5 w-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
            >
              -
            </button>
            <span className="font-mono font-bold text-slate-100 w-5 text-center">{exercise.prescribedSets}</span>
            <button
              type="button"
              onClick={() => onUpdate({ prescribedSets: Math.min(6, exercise.prescribedSets + 1) })}
              className="h-5 w-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Reps */}
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Reps:</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onUpdate({ prescribedReps: Math.max(1, exercise.prescribedReps - 1) })}
              className="h-5 w-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
            >
              -
            </button>
            <span className="font-mono font-bold text-slate-100 w-6 text-center">{exercise.prescribedReps}</span>
            <button
              type="button"
              onClick={() => onUpdate({ prescribedReps: Math.min(50, exercise.prescribedReps + 1) })}
              className="h-5 w-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Hold Time */}
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Hold (sec):</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onUpdate({ prescribedHoldSec: Math.max(0, (exercise.prescribedHoldSec || 0) - 1) })}
              className="h-5 w-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
            >
              -
            </button>
            <span className="font-mono font-bold text-slate-100 w-6 text-center">{exercise.prescribedHoldSec || 0}s</span>
            <button
              type="button"
              onClick={() => onUpdate({ prescribedHoldSec: (exercise.prescribedHoldSec || 0) + 1 })}
              className="h-5 w-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Rest Interval */}
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Rest (sec):</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onUpdate({ prescribedRestIntervalSec: Math.max(15, exercise.prescribedRestIntervalSec - 15) })}
              className="h-5 w-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
            >
              -
            </button>
            <span className="font-mono font-bold text-slate-100 w-7 text-center">{exercise.prescribedRestIntervalSec}s</span>
            <button
              type="button"
              onClick={() => onUpdate({ prescribedRestIntervalSec: Math.min(180, exercise.prescribedRestIntervalSec + 15) })}
              className="h-5 w-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Frequency */}
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Days / Wk:</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onUpdate({ prescribedFrequencyPerWeek: Math.max(1, exercise.prescribedFrequencyPerWeek - 1) })}
              className="h-5 w-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
            >
              -
            </button>
            <span className="font-mono font-bold text-slate-100 w-5 text-center">{exercise.prescribedFrequencyPerWeek}</span>
            <button
              type="button"
              onClick={() => onUpdate({ prescribedFrequencyPerWeek: Math.min(7, exercise.prescribedFrequencyPerWeek + 1) })}
              className="h-5 w-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Clinician Custom Notes */}
      <div>
        <input
          type="text"
          value={exercise.clinicianCustomNotes || ""}
          onChange={(e) => onUpdate({ clinicianCustomNotes: e.target.value })}
          placeholder="Add custom coaching cue or patient-specific restriction (optional)..."
          className="w-full text-xs bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-400"
        />
      </div>
    </div>
  );
}

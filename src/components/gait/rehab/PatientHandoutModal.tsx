"use client";

import React, { useState } from "react";
import { Printer, X, CheckSquare, Square, HeartHandshake, ShieldAlert, Award, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HomeExerciseProgram, PrescribedExercise } from "@/lib/gait/rehab/types";
import type { PatientMetadata } from "@/lib/gait/types";

export interface PatientHandoutModalProps {
  program: HomeExerciseProgram;
  patientMetadata?: PatientMetadata;
  trigger?: React.ReactNode;
  initialOpen?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export function PatientHandoutModal({
  program,
  patientMetadata,
  trigger,
  initialOpen = false,
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
}: PatientHandoutModalProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(initialOpen);
  const isControlled = controlledIsOpen !== undefined;
  const open = isControlled ? controlledIsOpen : internalIsOpen;

  // Local tracking state for 7-day adherence checkboxes
  const [checklist, setChecklist] = useState(program.dosageChecklist.trackingGrid);

  const toggleDay = (dayIndex: number) => {
    setChecklist((prev) =>
      prev.map((d) => (d.dayIndex === dayIndex ? { ...d, completed: !d.completed } : d))
    );
  };

  const handleClose = () => {
    if (isControlled && controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const patientId = patientMetadata?.patientId || program.patientId || "PT-ANONYMOUS";
  const assessmentDate = patientMetadata?.assessmentDate || program.generatedDate || new Date().toISOString().split("T")[0];
  const activeExercises = program.exercises.filter((ex) => ex.includedInHandout);

  return (
    <>
      {trigger && (
        <div onClick={() => setInternalIsOpen(true)} className="inline-block">
          {trigger}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
          <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-8 shadow-2xl text-slate-100 print:max-h-none print:overflow-visible print:border-none print:shadow-none print:bg-white print:text-black print:p-6 print:rounded-none">
            
            {/* Modal Controls Header (Hidden in Print) */}
            <div className="no-print print:hidden flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 className="text-lg font-bold text-slate-100">
                    Patient Home Exercise Program Handout
                  </h2>
                  <p className="text-xs text-slate-400">
                    Print-ready, evidence-based physical therapy prescription with daily adherence tracking.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handlePrint}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Handout / PDF</span>
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

            {/* Printable Document Body */}
            <div className="clinical-handout space-y-6 text-slate-100 print:text-black">
              
              {/* Header & Clinic Banner */}
              <div className="border-b-2 border-emerald-500/80 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="w-6 h-6 text-emerald-400 print:text-emerald-700" />
                    <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white print:text-black">
                      GAIT LAB REHABILITATION & PHYSICAL THERAPY
                    </h1>
                  </div>
                  <p className="text-xs text-emerald-300 print:text-emerald-800 font-medium mt-0.5">
                    Personalized Home Exercise Program (HEP) & Biomechanical Recovery Protocol
                  </p>
                </div>

                <div className="text-right text-xs space-y-0.5 font-mono text-slate-300 print:text-gray-700">
                  <div><span className="font-semibold text-slate-400 print:text-gray-900">PATIENT ID:</span> {patientId}</div>
                  <div><span className="font-semibold text-slate-400 print:text-gray-900">DATE:</span> {assessmentDate}</div>
                  <div><span className="font-semibold text-slate-400 print:text-gray-900">CLINICIAN:</span> {program.prescribingClinician}</div>
                </div>
              </div>

              {/* Prescription Overview Card */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 print:border-gray-300 print:bg-gray-50">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="text-base font-bold text-white print:text-black">
                    {program.programTitle}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral" className="text-xs uppercase print:border print:border-gray-400">
                      {program.targetAcuityPhase.replace(/_/g, " ")}
                    </Badge>
                    <Badge
                      tone={program.fallRiskCategory === "high" ? "danger" : program.fallRiskCategory === "moderate" ? "warn" : "success"}
                      className="text-xs uppercase"
                    >
                      Fall Risk: {program.fallRiskCategory}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-slate-300 print:text-gray-800 leading-relaxed">
                  {program.clinicalSummaryRationale}
                </p>
                <div className="mt-2 text-xs font-semibold text-emerald-400 print:text-emerald-800 flex items-center gap-4">
                  <span>Frequency Goal: {program.dosageChecklist.daysPerWeek} days per week</span>
                  <span>Estimated Course: {program.estimatedDurationWeeks} weeks</span>
                </div>
              </div>

              {/* Safety & Red Flags Alert Box */}
              {program.redFlags.length > 0 && (
                <div className="rounded-xl border-2 border-amber-500/60 bg-amber-950/30 p-4 print:border-amber-700 print:bg-amber-50">
                  <div className="flex items-center gap-2 text-amber-300 print:text-amber-900 font-bold text-xs uppercase tracking-wider mb-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400 print:text-amber-800" />
                    <span>When to Stop & Contact the Clinic Immediately (Red Flags)</span>
                  </div>
                  <ul className="text-xs text-amber-100 print:text-amber-900 space-y-1 list-disc list-inside">
                    {program.redFlags.map((flag, idx) => (
                      <li key={idx}>{flag}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Prescribed Exercises Grid */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 print:text-gray-900">
                    Prescribed Exercise Regimen ({activeExercises.length} Exercises)
                  </h3>
                  <span className="text-xs text-slate-400 print:text-gray-600">
                    Complete all exercises in order
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {activeExercises.map((ex, idx) => (
                    <ExerciseCard key={ex.id} exercise={ex} index={idx + 1} />
                  ))}
                </div>
              </div>

              {/* 7-Day Adherence Tracking Grid */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 print:border-gray-300 print:bg-gray-50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-emerald-400 print:text-emerald-700" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 print:text-black">
                      7-Day Patient Compliance & Adherence Tracker
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-400 print:text-gray-600">
                    Check off each day upon completing your prescription
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-2 text-center">
                  {checklist.map((day) => (
                    <div
                      key={day.dayIndex}
                      onClick={() => toggleDay(day.dayIndex)}
                      className={`cursor-pointer select-none rounded-lg p-2.5 border transition-colors ${
                        day.completed
                          ? "bg-emerald-950/50 border-emerald-500/80 text-emerald-200 print:bg-emerald-100 print:border-emerald-700 print:text-emerald-900"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 print:bg-white print:border-gray-300 print:text-gray-700"
                      }`}
                    >
                      <div className="text-[11px] font-bold uppercase mb-1">{day.dayName.slice(0, 3).toUpperCase()}</div>
                      <div className="flex justify-center">
                        {day.completed ? (
                          <CheckSquare className="w-5 h-5 text-emerald-400 print:text-emerald-700" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-600 print:text-gray-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Progression Criteria & Clinician Sign-Off */}
              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                {/* Progression Criteria */}
                <div className="rounded-xl border border-slate-800 p-4 bg-slate-950/40 print:border-gray-300 print:bg-white space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase text-sky-400 print:text-sky-800">
                    <Award className="w-4 h-4" />
                    <span>Phase Progression Milestone Criteria</span>
                  </div>
                  <ul className="text-xs text-slate-300 print:text-gray-800 space-y-1 list-disc list-inside">
                    {program.progressionCriteria.map((crit, idx) => (
                      <li key={idx}>{crit}</li>
                    ))}
                  </ul>
                </div>

                {/* Clinician Signature Line */}
                <div className="rounded-xl border border-slate-800 p-4 bg-slate-950/40 print:border-gray-300 print:bg-white flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-slate-400 print:text-gray-700 block mb-1">
                      Clinician Verification & Signature
                    </span>
                    <p className="text-xs text-slate-400 print:text-gray-600">
                      Prescribed by {program.prescribingClinician}.
                    </p>
                  </div>

                  <div className="pt-8 border-b border-dashed border-slate-600 print:border-black flex justify-between items-end text-[10px] text-slate-400 print:text-gray-800 font-mono">
                    <span>SIGNATURE: __________________________</span>
                    <span>DATE: ____________</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExerciseCard({ exercise, index }: { exercise: PrescribedExercise; index: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 flex flex-col justify-between space-y-3 print:border-gray-300 print:bg-white print:break-inside-avoid">
      {/* Exercise Header */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-bold text-white print:text-black">
            {index}. {exercise.name}
          </h4>
          {exercise.affectedSide && (
            <Badge tone="neutral" className="text-[10px] h-4 px-1.5 whitespace-nowrap">
              {exercise.affectedSide}
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-slate-400 print:text-gray-600 mt-0.5">
          Target: {exercise.targetMuscleGroups.join(", ")}
        </p>
      </div>

      {/* Dosage Block */}
      <div className="rounded-lg bg-slate-900 border border-slate-800/80 p-2.5 text-xs font-mono text-emerald-300 print:bg-gray-100 print:border-gray-300 print:text-emerald-900 flex flex-wrap items-center justify-between gap-2">
        <div className="font-bold">
          {exercise.prescribedSets} Sets × {exercise.prescribedReps} Reps
        </div>
        {exercise.prescribedHoldSec ? (
          <div>Hold: {exercise.prescribedHoldSec}s</div>
        ) : exercise.prescribedDurationSec ? (
          <div>Dur: {exercise.prescribedDurationSec}s</div>
        ) : null}
        <div>Rest: {exercise.prescribedRestIntervalSec}s</div>
        <div>{exercise.prescribedFrequencyPerWeek}× / week</div>
      </div>

      {/* Step-by-Step Instructions */}
      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 print:text-gray-700">
          Instructions:
        </span>
        <ol className="text-xs text-slate-300 print:text-gray-800 space-y-1 list-decimal list-inside leading-relaxed">
          {exercise.instructions.map((inst, idx) => (
            <li key={idx}>{inst}</li>
          ))}
        </ol>
      </div>

      {/* Coaching Cue & Equipment */}
      <div className="space-y-1 pt-1 border-t border-slate-800/60 print:border-gray-200 text-xs">
        {exercise.coachingCues.length > 0 && (
          <div className="text-amber-300/90 print:text-amber-900 font-medium text-[11px]">
            💡 <span className="font-semibold">Coaching Cue:</span> {exercise.coachingCues[0]}
          </div>
        )}
        {exercise.equipment.length > 0 && (
          <div className="text-slate-400 print:text-gray-600 text-[10px]">
            🎒 <span className="font-semibold">Equipment:</span> {exercise.equipment.join(", ")}
          </div>
        )}
        {exercise.clinicianCustomNotes && (
          <div className="text-sky-300 print:text-sky-900 text-[11px] bg-sky-950/30 p-1.5 rounded border border-sky-800/40">
            📝 <span className="font-semibold">Clinician Note:</span> {exercise.clinicianCustomNotes}
          </div>
        )}
      </div>
    </div>
  );
}

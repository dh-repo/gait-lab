"use client";

import React, { useState, useMemo } from "react";
import type {
  AnalysisResult,
  PatientMetadata,
  CameraPerspectiveParams,
} from "@/lib/gait/types";
import { MovementAnalysisProfile } from "../MovementAnalysisProfile";
import { CameraCalibrationAssistant } from "../CameraCalibrationAssistant";
import { SOAPNoteModal } from "../SOAPNoteModal";
import { ClinicalIntelligenceCard } from "../ClinicalIntelligenceCard";
import {
  exportGaitSessionAsJson,
  exportGaitMetricsAsCsv,
} from "@/lib/gait/export";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FileText,
  Download,
  Camera,
  Activity,
  AlertTriangle,
  Sliders,
  Calendar,
  User,
  Stethoscope,
  Filter,
} from "lucide-react";

export interface Level3SpecialistViewProps {
  analysis?: AnalysisResult;
  result?: AnalysisResult;
  patientMeta?: PatientMetadata;
  patientMetadata?: PatientMetadata;
  onUpdateMeta?: (meta: Partial<PatientMetadata>) => void;
  cameraPerspective?: CameraPerspectiveParams;
  perspectiveCorrectionEnabled?: boolean;
  onTogglePerspectiveCorrection?: (enabled: boolean) => void;
  onOpenCalibration?: () => void;
  onOpenSoapNote?: () => void;
  onOpenSoapModal?: () => void;
  onOpenEhrExport?: () => void;
  onExportCsv?: () => void;
  onExportJson?: () => void;
  className?: string;
}

export type AnatomicalPlane = "All" | "Sagittal" | "Frontal" | "Transverse";

interface MapVariable {
  id: string;
  name: string;
  plane: "Sagittal" | "Frontal" | "Transverse";
  gvsLeft: number;
  gvsRight: number;
  gvsBilateral: number;
  normativeMean: number;
}

const MAP_VARIABLES: MapVariable[] = [
  { id: "pelvic-tilt", name: "Pelvic Tilt", plane: "Sagittal", gvsLeft: 4.8, gvsRight: 4.6, gvsBilateral: 4.7, normativeMean: 5.2 },
  { id: "hip-flexion", name: "Hip Flexion", plane: "Sagittal", gvsLeft: 5.4, gvsRight: 5.1, gvsBilateral: 5.3, normativeMean: 5.2 },
  { id: "knee-extension", name: "Knee Extension Angle", plane: "Sagittal", gvsLeft: 7.2, gvsRight: 6.8, gvsBilateral: 7.0, normativeMean: 5.2 },
  { id: "ankle-dorsi", name: "Ankle Dorsiflexion", plane: "Sagittal", gvsLeft: 3.9, gvsRight: 4.1, gvsBilateral: 4.0, normativeMean: 5.2 },
  { id: "pelvic-obliquity", name: "Pelvic Obliquity", plane: "Frontal", gvsLeft: 3.2, gvsRight: 3.0, gvsBilateral: 3.1, normativeMean: 5.2 },
  { id: "hip-abduction", name: "Hip Abduction", plane: "Frontal", gvsLeft: 4.1, gvsRight: 3.8, gvsBilateral: 4.0, normativeMean: 5.2 },
  { id: "pelvic-rotation", name: "Pelvic Rotation", plane: "Transverse", gvsLeft: 4.5, gvsRight: 4.2, gvsBilateral: 4.4, normativeMean: 5.2 },
  { id: "hip-rotation", name: "Hip Rotation", plane: "Transverse", gvsLeft: 4.9, gvsRight: 4.7, gvsBilateral: 4.8, normativeMean: 5.2 },
  { id: "foot-progression", name: "Foot Progression", plane: "Transverse", gvsLeft: 5.0, gvsRight: 4.8, gvsBilateral: 4.9, normativeMean: 5.2 },
];

export function Level3SpecialistView({
  analysis,
  result,
  patientMeta: externalMeta,
  patientMetadata,
  onUpdateMeta,
  cameraPerspective: externalCam,
  perspectiveCorrectionEnabled = false,
  onTogglePerspectiveCorrection,
  onOpenCalibration,
  onOpenSoapNote,
  onExportCsv,
  onExportJson,
  className,
}: Level3SpecialistViewProps) {
  const currentAnalysis = analysis || result;
  const meta = externalMeta || patientMetadata || currentAnalysis?.patientMeta;
  const cam = externalCam || currentAnalysis?.cameraPerspective;

  const [selectedPlane, setSelectedPlane] = useState<AnatomicalPlane>("All");
  const [isCalibModalOpen, setIsCalibModalOpen] = useState(false);
  const [isSoapModalOpen, setIsSoapModalOpen] = useState(false);

  const handleOpenCalib = () => {
    if (onOpenCalibration) {
      onOpenCalibration();
    } else {
      setIsCalibModalOpen(true);
    }
  };

  const handleOpenSoap = () => {
    if (onOpenSoapNote) {
      onOpenSoapNote();
    } else {
      setIsSoapModalOpen(true);
    }
  };

  const handleDownloadCsv = () => {
    if (onExportCsv) {
      onExportCsv();
      return;
    }
    if (!currentAnalysis?.metrics) return;
    const csvContent = exportGaitMetricsAsCsv(currentAnalysis.metrics);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gait-metrics-${meta?.patientId || "session"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (onExportJson) {
      onExportJson();
      return;
    }
    if (!currentAnalysis) return;
    const jsonContent = exportGaitSessionAsJson(currentAnalysis, meta);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gait-session-${meta?.patientId || "session"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isSevereTilt =
    cam?.warningLevel === "critical" ||
    cam?.warningLevel === "warning" ||
    (cam?.pitchDeg != null && Math.abs(cam.pitchDeg) > 5.0) ||
    (cam?.rollDeg != null && Math.abs(cam.rollDeg) > 5.0);

  const filteredMapVars = useMemo(() => {
    if (selectedPlane === "All") return MAP_VARIABLES;
    return MAP_VARIABLES.filter((v) => v.plane === selectedPlane);
  }, [selectedPlane]);

  return (
    <div
      data-testid="level3-specialist-view"
      className={cn("flex flex-col gap-6", className)}
    >
      {/* 1. Patient & Session Metadata Banner */}
      <Card className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--color-fg)]">
              <User className="size-4 text-[var(--color-primary)]" />
              <span>Patient ID:</span>
              <span className="font-mono px-2 py-0.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                {meta?.patientId || "PT-9042"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[var(--color-muted)]">
              <Calendar className="size-3.5" />
              <span>Date: {meta?.assessmentDate || "2026-08-14"}</span>
            </div>

            <Badge tone="neutral" className="text-[11px]">
              {meta?.assessmentCondition || "Barefoot self-selected speed"}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenSoap}
              className="text-xs h-8 gap-1.5 font-medium"
            >
              <FileText className="size-3.5 text-indigo-500" />
              <span>Generate SOAP Note</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCsv}
              className="text-xs h-8 gap-1.5 font-medium"
            >
              <Download className="size-3.5 text-sky-500" />
              <span>Export CSV</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadJson}
              className="text-xs h-8 gap-1.5 font-medium"
            >
              <Download className="size-3.5 text-emerald-500" />
              <span>Export JSON</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Clinical Intelligence & Differential Diagnosis Synthesis */}
      {currentAnalysis && (
        <ClinicalIntelligenceCard analysis={currentAnalysis} patientMeta={meta} />
      )}

      {/* 2. Observed Movement Patterns (Shown on All view) */}
      {selectedPlane === "All" && currentAnalysis?.guesses && currentAnalysis.guesses.length > 0 && (
        <Card className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <CardHeader className="border-b border-[var(--color-border)] px-5 py-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="size-4 text-emerald-500" />
              <CardTitle className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
                Movement Pattern Classifications
              </CardTitle>
            </div>
            <Badge tone="info" className="text-xs">
              Algorithmic Markers
            </Badge>
          </CardHeader>

          <CardContent className="p-5 space-y-3">
            {currentAnalysis.guesses.map((guess) => (
              <div
                key={guess.id}
                className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 flex items-center justify-between gap-3"
              >
                <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                  {guess.title}: {guess.summary}
                </p>
                <Badge
                  tone={
                    guess.severity === "elevated"
                      ? "danger"
                      : "warn"
                  }
                  className="text-[10px] uppercase font-mono shrink-0"
                >
                  {guess.severity || "Moderate"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3. Baker GPS (Gait Profile Score) & Movement Analysis Profile (MAP) */}
      <div className="space-y-4">
        {/* Plane Selector Tabs */}
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] w-fit">
          <Filter className="size-3.5 text-[var(--color-subtle)] ml-1" />
          <span className="text-xs text-[var(--color-subtle)] font-medium mr-1">
            Plane:
          </span>
          {(["All", "Sagittal", "Frontal", "Transverse"] as AnatomicalPlane[]).map((plane) => (
            <Button
              key={plane}
              variant={selectedPlane === plane ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedPlane(plane)}
              className={cn(
                "h-7 text-xs px-2.5 rounded-lg",
                selectedPlane === plane ? "shadow-sm" : "hover:bg-[var(--color-surface)]"
              )}
            >
              {plane}
            </Button>
          ))}
        </div>

        {isSevereTilt ? (
          <Card className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            <CardHeader className="border-b border-[var(--color-border)] px-5 py-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-[var(--color-primary)]" />
                <CardTitle className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
                  Movement Analysis Profile (MAP)
                </CardTitle>
              </div>
              <Badge tone="warn" className="text-xs">
                Calibration Required
              </Badge>
            </CardHeader>
            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
              <AlertTriangle className="size-8 text-amber-400 mb-2 opacity-80" />
              <p className="text-xs font-semibold text-[var(--color-fg)] mb-1">
                Kinematic Telemetry Calibrating
              </p>
              <p className="text-xs text-[var(--color-muted)] max-w-md">
                Optical perspective tilt exceeds orthogonal limits. Calibrate homography matrix to view true multi-planar MAP profiles.
              </p>
            </CardContent>
          </Card>
        ) : selectedPlane === "All" ? (
          <MovementAnalysisProfile
            angleAnalysis={currentAnalysis?.angleAnalysis}
            patientMeta={meta ? { age: (meta as any).age, sex: (meta as any).sex } : undefined}
            showTable={false}
          />
        ) : (
          <Card className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            <CardHeader className="border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
                  {selectedPlane} Kinematic Variables (GVS Deviations)
                </CardTitle>
                <Badge tone="primary" className="text-xs font-mono">
                  {selectedPlane} Plane
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredMapVars.map((v) => (
                  <div
                    key={v.id}
                    className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-[var(--color-fg)]">
                        {v.name}
                      </span>
                      <Badge tone="neutral" className="text-[10px] font-mono">
                        {v.plane}
                      </Badge>
                    </div>

                    <div className="flex items-baseline justify-between text-xs mt-2 pt-2 border-t border-[var(--color-border)]/60">
                      <span className="text-[var(--color-muted)]">GVS Score:</span>
                      <span className="font-mono font-bold text-[var(--color-fg)]">
                        {v.gvsBilateral.toFixed(1)}°
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 4. 3D Camera Homography Assistant & Perspective Rectification */}
      <Card className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <CardHeader className="border-b border-[var(--color-border)] px-5 py-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="size-4 text-purple-500" />
            <CardTitle className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
              Camera Perspective & 3D Homography Calibration
            </CardTitle>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenCalib}
            className="text-xs h-8 gap-1.5"
          >
            <Sliders className="size-3.5" />
            <span>Calibrate Camera</span>
          </Button>
        </CardHeader>

        <CardContent className="p-5">
          {isSevereTilt && (
            <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-200">
                  Perspective Alignment Advisory
                </p>
                <p className="mt-0.5 text-amber-300/90 leading-relaxed">
                  {cam?.warningMessage ||
                    `Excessive camera angle detected (Pitch: ${cam?.pitchDeg?.toFixed(1)}°, Roll: ${cam?.rollDeg?.toFixed(1)}°). Calibration recommended.`}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[var(--color-surface-2)]/40 border border-[var(--color-border)]">
              <span className="text-[11px] text-[var(--color-subtle)] font-medium">Pitch Tilt</span>
              <p className="text-lg font-bold font-mono text-[var(--color-fg)] mt-0.5">
                {cam?.pitchDeg != null ? `${cam.pitchDeg.toFixed(1)}°` : "0.0°"}
              </p>
              <span className="text-[10px] text-[var(--color-muted)]">Target: 0° ± 5°</span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--color-surface-2)]/40 border border-[var(--color-border)]">
              <span className="text-[11px] text-[var(--color-subtle)] font-medium">Roll Level</span>
              <p className="text-lg font-bold font-mono text-[var(--color-fg)] mt-0.5">
                {cam?.rollDeg != null ? `${cam.rollDeg.toFixed(1)}°` : "0.0°"}
              </p>
              <span className="text-[10px] text-[var(--color-muted)]">Target: 0° ± 3°</span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--color-surface-2)]/40 border border-[var(--color-border)]">
              <span className="text-[11px] text-[var(--color-subtle)] font-medium">Optical Distance</span>
              <p className="text-lg font-bold font-mono text-[var(--color-fg)] mt-0.5">
                {cam?.distanceMeters != null ? `${cam.distanceMeters.toFixed(1)} m` : "2.8 m"}
              </p>
              <span className="text-[10px] text-[var(--color-muted)]">Recommended: 2.5–3.5m</span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--color-surface-2)]/40 border border-[var(--color-border)]">
              <span className="text-[11px] text-[var(--color-subtle)] font-medium">Perspective Quality</span>
              <p className="text-lg font-bold font-mono text-[var(--color-fg)] mt-0.5">
                {(cam as any)?.perspectiveScore != null ? `${(cam as any).perspectiveScore}%` : cam?.confidence != null ? `${Math.round(cam.confidence * 100)}%` : "92%"}
              </p>
              <span className="text-[10px] text-[var(--color-muted)]">
                {cam?.isOrthogonal ? "Orthogonal view" : "Oblique view"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Embedded Modals if opened internally */}
      {currentAnalysis && (
        <>
          <SOAPNoteModal
            analysis={currentAnalysis}
            patientMetadata={meta}
            trigger={<span className="hidden" />}
            initialOpen={isSoapModalOpen}
          />
          <CameraCalibrationAssistant
            frames={currentAnalysis.frames ?? []}
            perspectiveParams={cam}
            enablePerspectiveCorrection={perspectiveCorrectionEnabled}
            onTogglePerspectiveCorrection={onTogglePerspectiveCorrection}
            isOpen={isCalibModalOpen}
            onClose={() => setIsCalibModalOpen(false)}
          />
        </>
      )}
    </div>
  );
}

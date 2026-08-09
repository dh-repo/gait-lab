"use client";

import { useState } from "react";
import { Film, Loader2, Play, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface SampleVideoInfo {
  id: string;
  title: string;
  viewBadge: string;
  tone: "primary" | "accent" | "warn" | "success" | "neutral";
  duration: string;
  url: string;
  filename: string;
  description: string;
  features: string[];
}

// eslint-disable-next-line react-refresh/only-export-components
export const SAMPLE_VIDEOS: SampleVideoInfo[] = [
  {
    id: "sagittal",
    title: "Sagittal View (Side)",
    viewBadge: "Sagittal View",
    tone: "primary",
    duration: "12.0s",
    url: "/samples/sagittal-gait.mp4",
    filename: "sagittal-gait.mp4",
    description:
      "Side-profile gait clip evaluating stride length, step time CV, knee flexion/extension range, and sagittal stance/swing phase ratios.",
    features: ["Knee Flexion", "Step Time CV", "Stance/Swing %"],
  },
  {
    id: "frontal",
    title: "Frontal View (Front)",
    viewBadge: "Frontal View",
    tone: "accent",
    duration: "12.0s",
    url: "/samples/frontal-gait.mp4",
    filename: "frontal-gait.mp4",
    description:
      "Frontal-plane gait clip evaluating lateral trunk sway, step width, pelvic obliquity, and left/right bilateral gait symmetry index.",
    features: ["Lateral Sway", "Step Width", "Bilateral Symmetry"],
  },
  {
    id: "follow_cam",
    title: "Follow-Cam Tracking",
    viewBadge: "Follow-Cam",
    tone: "warn",
    duration: "12.0s",
    url: "/samples/follow-cam-gait.mp4",
    filename: "follow-cam-gait.mp4",
    description:
      "Tracking shot with hip auto-centering to evaluate foot orientation vectors, walking direction inference, and follow-cam robustness.",
    features: ["Foot Vectors", "Direction Inference", "Hip Centering"],
  },
  {
    id: "general",
    title: "General Walk (Indoor)",
    viewBadge: "General / Oblique",
    tone: "success",
    duration: "23.5s",
    url: "/samples/general-gait.mp4",
    filename: "general-gait.mp4",
    description:
      "Real indoor walkway walking clip featuring multi-person detection, continuous windowing, and 6-domain normative gait scoring.",
    features: ["Multi-Person Track", "Domain Scores", "Real Walkway"],
  },
];

interface SamplePickerProps {
  onSelectSample: (file: File) => Promise<void> | void;
  onCustomUploadClick?: () => void;
  isLoading?: boolean;
}

export function SamplePicker({ onSelectSample, onCustomUploadClick, isLoading }: SamplePickerProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLoadSample = async (sample: SampleVideoInfo) => {
    try {
      setLoadingId(sample.id);
      setErrorMsg(null);

      const res = await fetch(sample.url);
      if (!res.ok) {
        throw new Error(`Failed to load sample video (${res.statusText || res.status})`);
      }

      const blob = await res.blob();
      const file = new File([blob], sample.filename, { type: "video/mp4" });
      await onSelectSample(file);
    } catch (err) {
      console.error("Failed loading sample:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to load video sample");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Video className="size-4 text-[var(--color-primary)]" />
            Reference clips
          </h3>
          <p className="text-xs text-[var(--color-muted)]">
            Standardized sample videos for multi-view testing and demo analysis.
          </p>
        </div>
        {onCustomUploadClick && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCustomUploadClick}
            disabled={isLoading || loadingId !== null}
            className="self-start sm:self-auto"
          >
            <Film className="size-3.5" />
            Custom Upload
          </Button>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] p-3 text-xs text-[var(--color-danger)]">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {SAMPLE_VIDEOS.map((sample) => {
          const isThisLoading = loadingId === sample.id;
          const isDisabled = isLoading || (loadingId !== null && !isThisLoading);

          return (
            <Card
              key={sample.id}
              className="flex flex-col justify-between border-[var(--color-border)] transition-colors hover:border-[color-mix(in_oklab,var(--color-primary)_40%,var(--color-border))]"
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-semibold">{sample.title}</CardTitle>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={sample.tone}>{sample.viewBadge}</Badge>
                      <span className="text-xs text-[var(--color-subtle)] font-mono">{sample.duration}</span>
                    </div>
                  </div>
                  <Video className="size-4 shrink-0 text-[var(--color-muted)]" />
                </div>
                <CardDescription className="pt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                  {sample.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="mb-3 flex flex-wrap gap-1">
                  {sample.features.map((feat) => (
                    <span
                      key={feat}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] text-[var(--color-subtle)]"
                    >
                      {feat}
                    </span>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  disabled={isDisabled}
                  onClick={() => void handleLoadSample(sample)}
                >
                  {isThisLoading ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin text-[var(--color-primary)]" />
                      Loading clip…
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5 fill-current" />
                      Load {sample.title}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

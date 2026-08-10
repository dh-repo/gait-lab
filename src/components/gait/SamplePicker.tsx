"use client";

import { useState } from "react";
import { Loader2, Play, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    id: "tuning_3992",
    title: "Tuning: Home frontal (single)",
    viewBadge: "Tuning · Frontal",
    tone: "primary",
    duration: "10.5s",
    url: "/samples/tuning-3992.mp4",
    filename: "tuning-3992.mp4",
    description:
      "Real-world indoor frontal walk (IMG_3992) for algorithm tuning — single subject, home hallway lighting, barefoot/partial footwear, full-body tracking under typical phone-capture conditions.",
    features: ["Home Capture", "Frontal", "Single Subject", "Tuning"],
  },
  {
    id: "tuning_3993",
    title: "Tuning: Home frontal (multi)",
    viewBadge: "Tuning · Multi",
    tone: "warn",
    duration: "12.4s",
    url: "/samples/tuning-3993.mp4",
    filename: "tuning-3993.mp4",
    description:
      "Real-world indoor frontal walk (IMG_3993) for algorithm tuning — primary subject with pets in frame to stress multi-candidate tracking, person selection, and occlusion robustness.",
    features: ["Home Capture", "Multi-Subject", "Occlusion", "Tuning"],
  },
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
    id: "store_aisle",
    title: "No video? Use this one",
    viewBadge: "Rear Follow-Cam",
    tone: "primary",
    duration: "23.5s",
    url: "/samples/store-aisle-follow.mp4",
    filename: "store-aisle-follow.mp4",
    description:
      "Handheld phone clip of a single subject walking away down a store aisle — the exact capture conditions this app is built for. At 23.5s it exceeds the 20s analysis window, so variability metrics rest on a full stride count.",
    features: ["Handheld Phone", "Rear View", "Full 20s Window"],
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
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="section-eyebrow">Reference clips</h3>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">
            Optional samples for multi-view testing.
          </p>
        </div>
        {onCustomUploadClick && (
          <Button size="sm" variant="ghost" onClick={onCustomUploadClick} className="min-h-11 min-w-11 text-[var(--color-muted)] sm:min-h-0 sm:min-w-0">
            <Video className="size-[18px]" />
            Upload
          </Button>
        )}
      </div>

      {errorMsg && (
        <p className="text-[13px] text-[var(--color-danger-text)]" role="alert">
          {errorMsg}
        </p>
      )}

      <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-[var(--shadow-card)]">
        {SAMPLE_VIDEOS.map((sample) => {
          const busy = isLoading || loadingId === sample.id;
          return (
            <li key={sample.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleLoadSample(sample)}
                className={cn(
                  "flex w-full min-h-[52px] items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150",
                  "hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]",
                  "disabled:opacity-60",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-fg)]">
                  {busy ? (
                    <Loader2 className="size-5 animate-spin text-[var(--color-primary)]" />
                  ) : (
                    <Play className="size-5 fill-current" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-[var(--color-fg)]">
                    {sample.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-[var(--color-muted)]">
                    {sample.viewBadge} · {sample.duration} · {sample.features.slice(0, 2).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-medium text-[var(--color-primary)]">
                  {busy ? "Loading…" : "Load"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

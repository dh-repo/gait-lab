"use client";

import React, { useRef } from "react";
import {
  type DisclosureTier,
  type TierConfig,
  DEFAULT_TIERS,
  DISCLOSURE_TIERS,
} from "./types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { User, Activity, Stethoscope, AlertTriangle } from "lucide-react";

export { DEFAULT_TIERS };

export interface ProgressiveDisclosureNavProps {
  activeTier?: DisclosureTier;
  selectedTier?: DisclosureTier;
  onSelectTier: (tier: DisclosureTier) => void;
  anomalyCount?: number;
  tiers?: TierConfig[];
  className?: string;
  disabledTiers?: DisclosureTier[];
}

const TIER_ICONS: Record<DisclosureTier, React.ElementType> = {
  level1_patient: User,
  level2_biomechanics: Activity,
  level3_specialist: Stethoscope,
};

export function ProgressiveDisclosureNav({
  activeTier,
  selectedTier,
  onSelectTier,
  anomalyCount = 0,
  tiers = DEFAULT_TIERS,
  className,
  disabledTiers = [],
}: ProgressiveDisclosureNavProps) {
  const currentTier = activeTier || selectedTier || "level1_patient";
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    const total = tiers.length;
    let nextIndex = index;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      nextIndex = (index + 1) % total;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextIndex = (index - 1 + total) % total;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = total - 1;
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectTier(tiers[index].id);
      return;
    } else {
      return;
    }

    const nextTier = tiers[nextIndex];
    if (nextTier && !disabledTiers.includes(nextTier.id)) {
      tabRefs.current[nextIndex]?.focus();
      onSelectTier(nextTier.id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Gait analysis progressive disclosure levels"
      data-testid="progressive-disclosure-nav"
      className={cn(
        "grid grid-cols-1 md:grid-cols-3 gap-3 p-1.5 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] shadow-sm",
        className
      )}
    >
      {tiers.map((tier, idx) => {
        const isSelected = currentTier === tier.id;
        const isDisabled = disabledTiers.includes(tier.id);
        const IconComponent = TIER_ICONS[tier.id] || Activity;
        const levelNum = tier.levelNumber ?? idx + 1;

        return (
          <button
            key={tier.id}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            role="tab"
            id={`tier-tab-${tier.id}`}
            aria-controls={`tier-panel-${tier.id}`}
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={isDisabled}
            data-testid={`tier-tab-${tier.id}`}
            onClick={() => onSelectTier(tier.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={cn(
              "group relative flex flex-col items-start p-3.5 rounded-xl text-left transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
              isSelected
                ? "bg-[var(--color-surface)] shadow-sm border border-[var(--color-border-strong)] text-[var(--color-fg)]"
                : "bg-transparent hover:bg-[var(--color-surface)]/60 text-[var(--color-muted)] hover:text-[var(--color-fg)] border border-transparent",
              isDisabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {/* Header: Level Indicator & Badges */}
            <div className="w-full flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex items-center justify-center size-6 rounded-lg text-xs font-bold font-mono tracking-tight",
                    isSelected
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-border)] text-[var(--color-muted)] group-hover:bg-[var(--color-border-strong)]"
                  )}
                >
                  L{levelNum}
                </span>
                <span className="font-semibold text-sm tracking-tight text-[var(--color-fg)]">
                  {tier.label}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {anomalyCount > 0 && tier.id === "level2_biomechanics" && (
                  <Badge
                    tone="warn"
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0 font-mono"
                  >
                    <AlertTriangle className="size-3 text-amber-500" />
                    <span>{anomalyCount}</span>
                  </Badge>
                )}
                <Badge
                  tone={isSelected ? "primary" : "neutral"}
                  className="text-[10px] px-2 py-0.5 tracking-wide uppercase font-medium"
                >
                  {tier.badge}
                </Badge>
              </div>
            </div>

            {/* Target Audience & Purpose */}
            <p className="text-xs text-[var(--color-muted)] leading-relaxed mb-1 line-clamp-2">
              {tier.description}
            </p>

            <span className="text-[11px] font-medium text-[var(--color-subtle)] mt-auto pt-1">
              For: {tier.targetAudience}
            </span>

            {/* Active Indicator Bar */}
            {isSelected && (
              <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-[var(--color-primary)] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

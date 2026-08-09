"use client";

import { Activity, Check, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type WorkflowStage = 1 | 2 | 3 | 4;

export interface WorkflowStageInfo {
  stage: WorkflowStage;
  number: number;
  title: string;
  shortTitle: string;
  description: string;
}

const WORKFLOW_STAGES: WorkflowStageInfo[] = [
  {
    stage: 1,
    number: 1,
    title: "Input / Sample",
    shortTitle: "Input",
    description: "Upload video or sample clip",
  },
  {
    stage: 2,
    number: 2,
    title: "Video Processing",
    shortTitle: "Processing",
    description: "Pose tracking & subject selection",
  },
  {
    stage: 3,
    number: 3,
    title: "Clinical Insights",
    shortTitle: "Insights",
    description: "Domain scores & kinematics",
  },
  {
    stage: 4,
    number: 4,
    title: "Export Report",
    shortTitle: "Export",
    description: "PDF report & sign-off",
  },
];

export interface WorkflowHeaderProps {
  currentStage: WorkflowStage;
  onSelectStage?: (stage: WorkflowStage) => void;
  hasResults?: boolean;
  onReset?: () => void;
  onOpenHistory?: () => void;
  fileName?: string | null;
  className?: string;
}

export function WorkflowHeader({
  currentStage,
  onSelectStage,
  hasResults = false,
  onReset,
  onOpenHistory,
  fileName,
  className,
}: WorkflowHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 w-full border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-md transition-colors",
        className,
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--color-primary)_15%,transparent)] text-[var(--color-primary)]">
              <Activity className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
                  Gait Lab
                </span>
                <Badge tone="primary" className="text-[10px] px-1.5 py-0 font-mono">
                  Clinical UX
                </Badge>
              </div>
              <p className="text-xs text-[var(--color-muted)] truncate max-w-xs sm:max-w-md">
                {fileName ? `File: ${fileName}` : "Quantitative Spatio-Temporal Gait Analysis"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenHistory && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onOpenHistory}
                aria-label="Open session history"
              >
                <Clock className="size-3.5" />
                <span className="hidden sm:inline">History</span>
              </Button>
            )}
            {onReset && currentStage > 1 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onReset}
                aria-label="Start new video"
              >
                <RotateCcw className="size-3.5" />
                <span className="hidden sm:inline">New Video</span>
              </Button>
            )}
          </div>
        </div>

        {/* Workflow Progression Navigation */}
        <nav aria-label="Workflow progression" className="w-full">
          <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {WORKFLOW_STAGES.map((s) => {
              const isActive = currentStage === s.stage;
              const isCompleted = currentStage > s.stage || (hasResults && s.stage < currentStage);
              // Stage switching is allowed if results exist or if moving to a previously unlocked stage
              const isSelectable =
                Boolean(onSelectStage) &&
                (isActive ||
                  isCompleted ||
                  (hasResults && (s.stage === 3 || s.stage === 4 || s.stage === 1 || s.stage === 2)));

              return (
                <li key={s.stage}>
                  <button
                    type="button"
                    onClick={() => isSelectable && onSelectStage?.(s.stage)}
                    disabled={!isSelectable}
                    aria-current={isActive ? "step" : undefined}
                    aria-label={`Stage ${s.number}: ${s.title} - ${s.description}`}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[var(--radius-md)] border p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                      isActive
                        ? "border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_12%,var(--color-surface))] font-semibold text-[var(--color-fg)] ring-1 ring-[var(--color-primary)]"
                        : isCompleted
                        ? "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-fg)] hover:bg-[var(--color-surface-3)] cursor-pointer"
                        : isSelectable
                        ? "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-fg)] hover:bg-[var(--color-surface-3)] cursor-pointer"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] opacity-50 cursor-not-allowed",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                        isActive
                          ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                          : isCompleted
                          ? "bg-[var(--color-success)] text-white"
                          : "bg-[var(--color-surface-3)] text-[var(--color-muted)]",
                      )}
                    >
                      {isCompleted && !isActive ? <Check className="size-3" /> : s.number}
                    </span>
                    <div className="min-w-0 flex-1 truncate">
                      <div className="truncate font-medium leading-none">
                        {s.title}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-[var(--color-subtle)] hidden lg:block">
                        {s.description}
                      </div>
                    </div>
                    {isActive && (
                      <Badge tone="primary" className="hidden md:inline-flex text-[9px] px-1.5 py-0 shrink-0">
                        Active
                      </Badge>
                    )}
                    {isCompleted && !isActive && (
                      <Badge tone="success" className="hidden md:inline-flex text-[9px] px-1.5 py-0 shrink-0">
                        Done
                      </Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </header>
  );
}

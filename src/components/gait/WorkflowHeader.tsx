"use client";

import { Activity, Check, Clock, Columns2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    title: "Capture",
    shortTitle: "Capture",
    description: "Upload, camera, or reference clip",
  },
  {
    stage: 2,
    number: 2,
    title: "Process",
    shortTitle: "Process",
    description: "Pose tracking & subject selection",
  },
  {
    stage: 3,
    number: 3,
    title: "Analyze",
    shortTitle: "Analyze",
    description: "Metrics, findings & kinematics",
  },
  {
    stage: 4,
    number: 4,
    title: "Report",
    shortTitle: "Report",
    description: "Clinical summary & export",
  },
];

export interface WorkflowHeaderProps {
  currentStage: WorkflowStage;
  onSelectStage?: (stage: WorkflowStage) => void;
  hasResults?: boolean;
  onReset?: () => void;
  onOpenHistory?: () => void;
  onOpenCompare?: () => void;
  fileName?: string | null;
  className?: string;
}

export function WorkflowHeader({
  currentStage,
  onSelectStage,
  hasResults = false,
  onReset,
  onOpenHistory,
  onOpenCompare,
  fileName,
  className,
}: WorkflowHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 w-full border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur-md",
        className,
      )}
    >
      {/* Single quiet bar — brand · session · actions */}
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-fg)] text-white">
            <Activity className="size-3.5" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
                Gait Lab
              </span>
              <span className="hidden text-[11px] text-[var(--color-subtle)] sm:inline">
                Not a medical device
              </span>
            </div>
            {fileName ? (
              <p className="truncate text-[12px] text-[var(--color-muted)] max-w-[14rem] sm:max-w-xs">
                Session: {fileName}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onOpenCompare && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenCompare}
              aria-label="Open session comparison view"
              data-testid="header-compare-button"
              className="text-[var(--color-muted)]"
            >
              <Columns2 className="size-3.5" />
              <span className="hidden sm:inline">Compare</span>
            </Button>
          )}
          {onOpenHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenHistory}
              aria-label="Open session history"
              className="text-[var(--color-muted)]"
            >
              <Clock className="size-3.5" />
              <span className="hidden sm:inline">History</span>
            </Button>
          )}
          {onReset && currentStage > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              aria-label="Start new session"
              className="text-[var(--color-muted)]"
            >
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">New session</span>
            </Button>
          )}
        </div>
      </div>

      {/* Linear step rail — not four competing cards */}
      <nav
        aria-label="Workflow progression"
        className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/80"
      >
        <ol className="mx-auto flex max-w-[1120px] items-stretch px-2 sm:px-4">
          {WORKFLOW_STAGES.map((s, index) => {
            const isActive = currentStage === s.stage;
            const isCompleted = currentStage > s.stage || (hasResults && s.stage < currentStage);
            const isSelectable =
              Boolean(onSelectStage) &&
              (isActive ||
                isCompleted ||
                (hasResults && (s.stage === 3 || s.stage === 4 || s.stage === 1 || s.stage === 2)));

            return (
              <li key={s.stage} className="relative flex min-w-0 flex-1">
                {index > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-0 top-1/2 h-px w-3 -translate-x-1.5 -translate-y-1/2 sm:w-4 sm:-translate-x-2",
                      isCompleted || isActive ? "bg-[var(--color-fg)]/25" : "bg-[var(--color-border)]",
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => isSelectable && onSelectStage?.(s.stage)}
                  disabled={!isSelectable}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Stage ${s.number}: ${s.title} - ${s.description}`}
                  className={cn(
                    "group flex w-full items-center justify-center gap-2 px-1 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] sm:justify-start sm:px-3",
                    isActive
                      ? "text-[var(--color-fg)]"
                      : isSelectable
                        ? "text-[var(--color-muted)] hover:text-[var(--color-fg)] cursor-pointer"
                        : "text-[var(--color-subtle)] opacity-50 cursor-not-allowed",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                      isActive
                        ? "bg-[var(--color-fg)] text-white"
                        : isCompleted
                          ? "bg-[var(--color-surface)] text-[var(--color-fg)] ring-1 ring-[var(--color-border-strong)]"
                          : "bg-transparent text-[var(--color-subtle)] ring-1 ring-[var(--color-border)]",
                    )}
                  >
                    {isCompleted && !isActive ? <Check className="size-3" strokeWidth={2.5} /> : s.number}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-[12px] leading-none sm:text-[13px]",
                        isActive ? "font-semibold" : "font-medium",
                      )}
                    >
                      {s.title}
                    </span>
                    <span className="mt-0.5 hidden truncate text-[10px] text-[var(--color-subtle)] lg:block">
                      {s.description}
                    </span>
                  </span>
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--color-fg)] sm:inset-x-4"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}

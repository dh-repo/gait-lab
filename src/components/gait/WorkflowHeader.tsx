"use client";

import { Activity, Check, Clock, Columns2, RotateCcw } from "lucide-react";
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
        "sticky top-0 z-30 w-full border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-sm transition-colors",
        className,
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2.5 px-4 py-3 sm:px-6">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-primary)]">
              <Activity className="size-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
                  Gait Lab
                </span>
                <span className="text-[11px] text-[var(--color-subtle)] hidden sm:inline">
                  Research / educational analysis · Not a medical device
                </span>
              </div>
              <p className="text-xs text-[var(--color-muted)] truncate max-w-xs sm:max-w-md">
                {fileName ? `Session: ${fileName}` : "Spatio-temporal gait analysis workstation"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenCompare && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenCompare}
                aria-label="Open session comparison view"
                data-testid="header-compare-button"
              >
                <Columns2 className="size-3.5" />
                <span className="hidden sm:inline">Compare</span>
              </Button>
            )}
            {onOpenHistory && (
              <Button
                variant="outline"
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
                variant="outline"
                size="sm"
                onClick={onReset}
                aria-label="Start new session"
              >
                <RotateCcw className="size-3.5" />
                <span className="hidden sm:inline">New session</span>
              </Button>
            )}
          </div>
        </div>

        {/* Mobile trust line */}
        <p className="text-[11px] text-[var(--color-subtle)] sm:hidden">
          Research / educational analysis · Not a medical device
        </p>

        {/* Workflow Progression Navigation */}
        <nav aria-label="Workflow progression" className="w-full">
          <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {WORKFLOW_STAGES.map((s) => {
              const isActive = currentStage === s.stage;
              const isCompleted = currentStage > s.stage || (hasResults && s.stage < currentStage);
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
                      "flex w-full items-center gap-2 rounded-[var(--radius-md)] border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                      isActive
                        ? "border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_8%,var(--color-surface))] font-semibold text-[var(--color-fg)]"
                        : isCompleted
                        ? "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] cursor-pointer"
                        : isSelectable
                        ? "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] cursor-pointer"
                        : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] opacity-60 cursor-not-allowed",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                        isActive
                          ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                          : isCompleted
                          ? "bg-[var(--color-surface-3)] text-[var(--color-primary)] border border-[var(--color-border)]"
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
                        Current
                      </Badge>
                    )}
                    {isCompleted && !isActive && (
                      <Badge tone="neutral" className="hidden md:inline-flex text-[9px] px-1.5 py-0 shrink-0">
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

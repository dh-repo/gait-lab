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

// eslint-disable-next-line react-refresh/only-export-components
export const WORKFLOW_STAGES: WorkflowStageInfo[] = [
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

export interface GoogleTopAppBarProps {
  currentStage: WorkflowStage;
  onSelectStage?: (stage: WorkflowStage) => void;
  hasResults?: boolean;
  onReset?: () => void;
  onOpenHistory?: () => void;
  onOpenCompare?: () => void;
  onWebcamClick?: () => void;
  onUploadClick?: () => void;
  onSaveClick?: () => void;
  isSaving?: boolean;
  saveSuccess?: boolean;
  saveError?: string | null;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  activeView?: "workstation" | "comparison" | "report";
  onViewChange?: (view: "workstation" | "comparison" | "report") => void;
  fileName?: string | null;
  className?: string;
  isSideNavCollapsed?: boolean;
  onToggleSideNav?: () => void;
}

/**
 * App chrome: one quiet bar + a linear step rail.
 * Intentionally not a Cloud Console shell — no side-rail toggle, no fake account, no tool clutter.
 */
export function GoogleTopAppBar({
  currentStage,
  onSelectStage,
  hasResults = false,
  onReset,
  onOpenHistory,
  onOpenCompare,
  searchQuery = "",
  onSearchChange,
  fileName,
  className,
  saveError,
}: GoogleTopAppBarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 w-full border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-md",
        className,
      )}
    >
      <div className="mx-auto flex h-12 max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
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
              <p className="truncate text-[11px] text-[var(--color-muted)] max-w-[14rem]">
                Session: {fileName}
              </p>
            ) : null}
          </div>
        </div>

        {/* Optional session filter — kept for API/tests; visually quiet */}
        {onSearchChange ? (
          <label className="relative hidden min-w-0 flex-1 max-w-xs md:block">
            <span className="sr-only">Search sessions</span>
            <input
              type="search"
              data-testid="top-app-bar-search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter sessions…"
              className="w-full rounded-full border border-transparent bg-[var(--color-surface-2)] px-3 py-1.5 text-[12px] text-[var(--color-fg)] outline-none placeholder:text-[var(--color-subtle)] focus:border-[var(--color-border)] focus:bg-[var(--color-surface)]"
            />
          </label>
        ) : null}

        <div className="flex shrink-0 items-center gap-0.5">
          {onOpenCompare && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenCompare}
              aria-label="Open session comparison view"
              data-testid="header-compare-button"
              className="min-h-11 min-w-11 text-[var(--color-muted)] sm:min-h-0 sm:min-w-0"
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
              className="min-h-11 min-w-11 text-[var(--color-muted)] sm:min-h-0 sm:min-w-0"
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
              className="min-h-11 min-w-11 text-[var(--color-muted)] sm:min-h-0 sm:min-w-0"
            >
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">New session</span>
            </Button>
          )}
        </div>
      </div>

      {saveError ? (
        <div
          role="alert"
          className="border-t border-[var(--color-danger)]/20 bg-[var(--color-danger-bg,#fef2f2)] px-5 py-1.5 text-[12px] text-[var(--color-danger)] sm:px-8"
        >
          {saveError}
        </div>
      ) : null}

      <nav
        aria-label="Workflow progression"
        className="border-t border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <ol className="mx-auto flex max-w-[1200px] items-stretch px-2 sm:px-4">
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
                {index > 0 ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-0 top-1/2 hidden h-px w-4 -translate-x-2 -translate-y-1/2 sm:block",
                      isCompleted || isActive
                        ? "bg-[var(--color-fg)]/20"
                        : "bg-[var(--color-border)]",
                    )}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => isSelectable && onSelectStage?.(s.stage)}
                  disabled={!isSelectable}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Stage ${s.number}: ${s.title} - ${s.description}`}
                  className={cn(
                    "relative flex min-h-11 w-full items-center justify-center gap-2 px-1 py-2.5 sm:min-h-0 sm:justify-start sm:px-3",
                    "text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]",
                    isActive
                      ? "text-[var(--color-fg)]"
                      : isSelectable
                        ? "cursor-pointer text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                        : "cursor-not-allowed text-[var(--color-subtle)] opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      isActive
                        ? "bg-[var(--color-fg)] text-white"
                        : isCompleted
                          ? "bg-[var(--color-surface-2)] text-[var(--color-fg)] ring-1 ring-[var(--color-border)]"
                          : "ring-1 ring-[var(--color-border)] text-[var(--color-subtle)]",
                    )}
                  >
                    {isCompleted && !isActive ? (
                      <Check className="size-3" strokeWidth={2.5} />
                    ) : (
                      s.number
                    )}
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
                  {isActive ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--color-fg)] sm:inset-x-4"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}

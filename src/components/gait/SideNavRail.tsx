"use client";

import {
  Activity,
  Brain,
  Camera,
  ChevronLeft,
  ChevronRight,
  FileText,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkflowStage } from "./GoogleTopAppBar";
import { cn } from "@/lib/utils";

export interface SideNavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  section: string;
  stageTarget?: WorkflowStage;
  actionKey?: "report";
  /** Maps to GaitApp analysis tab when stage is Analyze */
  tabTarget?: "clusters" | "metrics" | "fallrisk" | "report" | "guesses" | "guide";
}

const SIDE_NAV_SECTIONS = [
  {
    title: "WORKSTATION",
    items: [
      {
        id: "capture",
        label: "Capture",
        icon: Camera,
        section: "WORKSTATION",
        stageTarget: 1 as WorkflowStage,
      },
      {
        id: "process",
        label: "Process",
        icon: Users,
        section: "WORKSTATION",
        stageTarget: 2 as WorkflowStage,
      },
    ],
  },
  {
    title: "ANALYTICS & KINEMATICS",
    items: [
      {
        id: "spatiotemporal",
        label: "Findings",
        icon: Activity,
        section: "ANALYTICS & KINEMATICS",
        stageTarget: 3 as WorkflowStage,
        tabTarget: "clusters" as const,
      },
      {
        id: "trajectories",
        label: "Charts",
        icon: TrendingUp,
        section: "ANALYTICS & KINEMATICS",
        stageTarget: 3 as WorkflowStage,
        tabTarget: "metrics" as const,
      },
      {
        id: "dualtask",
        label: "Dual-task",
        icon: Brain,
        section: "ANALYTICS & KINEMATICS",
        stageTarget: 3 as WorkflowStage,
        tabTarget: "guesses" as const,
      },
      {
        id: "fallrisk",
        label: "Fall Risk",
        icon: ShieldAlert,
        section: "ANALYTICS & KINEMATICS",
        stageTarget: 3 as WorkflowStage,
        tabTarget: "fallrisk" as const,
      },
    ],
  },
  {
    title: "REPORTS & EXPORT",
    items: [
      {
        id: "report",
        label: "Report",
        icon: FileText,
        section: "REPORTS & EXPORT",
        stageTarget: 4 as WorkflowStage,
        actionKey: "report" as const,
        tabTarget: "report" as const,
      },
    ],
  },
];

export interface SideNavRailProps {
  activeNav?: string;
  onNavSelect?: (navId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  currentStage?: WorkflowStage;
  hasResults?: boolean;
  onOpenReport?: () => void;
  className?: string;
}

/**
 * Optional rail for deep links. Default product chrome uses the stage rail only;
 * this remains available for tests and dense multi-panel layouts.
 */
export function SideNavRail({
  activeNav = "spatiotemporal",
  onNavSelect,
  isCollapsed,
  onToggleCollapse,
  onOpenReport,
  className,
}: SideNavRailProps) {
  const handleItemClick = (item: SideNavItem) => {
    if (item.actionKey === "report" && onOpenReport) {
      onOpenReport();
    }
    onNavSelect?.(item.id);
  };

  return (
    <aside
      data-testid="side-nav-rail"
      className={cn(
        "hidden h-full shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200 lg:flex",
        isCollapsed ? "w-[72px]" : "w-64",
        className,
      )}
    >
      <div className="flex h-12 items-center justify-between border-b border-[var(--color-border)] px-2">
        {!isCollapsed && (
          <span className="section-eyebrow px-2">Navigate</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          data-testid="side-nav-toggle"
          aria-label={isCollapsed ? "Expand navigation rail" : "Collapse navigation rail"}
          className="size-9 rounded-full p-0 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
        >
          {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto py-3">
        {SIDE_NAV_SECTIONS.map((group) =>
          group.items.length === 0 ? null : (
            <div key={group.title} className="px-2">
              {!isCollapsed && (
                <h3 className="section-eyebrow px-2 pb-2.5">{group.title}</h3>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(item)}
                        title={isCollapsed ? item.label : undefined}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[13px] transition-colors duration-150",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
                          isCollapsed && "justify-center px-0",
                          isActive
                            ? "bg-[var(--color-info-bg)] font-semibold text-[var(--color-info-text)]"
                            : "font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
                        )}
                      >
                        <Icon className="size-5 shrink-0" strokeWidth={isActive ? 2.25 : 2} />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ),
        )}
      </div>
    </aside>
  );
}

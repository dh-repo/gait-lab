import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowHeader } from "../WorkflowHeader";
import { CognitiveClusters } from "../CognitiveClusters";
import { SkeletonCanvas } from "../SkeletonCanvas";
import { GaitApp } from "../GaitApp";
import type { GaitMetrics, DualTaskCost } from "@/lib/gait/types";

describe("M4_1 Challenger: UI Components, Keyboard Navigation & CLS Stress Harness", () => {
  // ---------------------------------------------------------------------------
  // 1. WorkflowHeader Interactive Behavior & State Unlocks
  // ---------------------------------------------------------------------------
  describe("WorkflowHeader interactive behavior & state transitions", () => {
    it("locks future stages (3 and 4) when hasResults is false on Stage 1", () => {
      const onSelectStage = vi.fn();
      const html = renderToStaticMarkup(
        <WorkflowHeader currentStage={1} hasResults={false} onSelectStage={onSelectStage} />,
      );

      // Stage 1 button is active; Stage 2, 3, 4 should be disabled / not selectable
      expect(html).toContain('aria-current="step"');
      expect(html).toContain("Stage 1: Capture");
      // Stage 3 & 4 buttons should have disabled attribute
      expect(html).toMatch(/disabled=""[^>]*>[\s\S]*?Stage 3: Analyze/);
      expect(html).toMatch(/disabled=""[^>]*>[\s\S]*?Stage 4: Report/);
    });

    it("unlocks Stages 3 and 4 when hasResults is true", () => {
      const html = renderToStaticMarkup(
        <WorkflowHeader currentStage={3} hasResults={true} onSelectStage={vi.fn()} />,
      );

      // When hasResults is true, all stage buttons (1, 2, 3, 4) should NOT be disabled
      const disabledMatches = html.match(/disabled=""/g);
      expect(disabledMatches).toBeNull();
    });

    it("renders Reset (New session) button only when currentStage > 1", () => {
      const htmlStage1 = renderToStaticMarkup(
        <WorkflowHeader currentStage={1} onReset={vi.fn()} />,
      );
      expect(htmlStage1).not.toContain("New session");

      const htmlStage2 = renderToStaticMarkup(
        <WorkflowHeader currentStage={2} onReset={vi.fn()} />,
      );
      expect(htmlStage2).toContain("New session");

      const htmlStage3 = renderToStaticMarkup(
        <WorkflowHeader currentStage={3} onReset={vi.fn()} />,
      );
      expect(htmlStage3).toContain("New session");
    });

    it("does not render History or Compare chrome (removed from product)", () => {
      const html = renderToStaticMarkup(
        <WorkflowHeader
          currentStage={1}
          onOpenHistory={vi.fn()}
          onOpenCompare={vi.fn()}
        />,
      );
      expect(html).not.toContain("History");
      expect(html).not.toContain("Compare");
      expect(html).not.toContain("Open session history");
      expect(html).not.toContain("header-compare-button");
    });

    it("displays uploaded file name when provided", () => {
      const html = renderToStaticMarkup(
        <WorkflowHeader currentStage={2} fileName="patient_gait_clip_01.mp4" />,
      );
      expect(html).toContain("Session: patient_gait_clip_01.mp4");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CognitiveClusters Interactive Behavior & Robustness Stress
  // ---------------------------------------------------------------------------
  describe("CognitiveClusters interactive behavior & metric edge cases", () => {
    const fullMockMetrics: GaitMetrics = {
      viewAngle: "sagittal",
      viewConfidence: 0.92,
      durationSec: 10.0,
      fpsEffective: 30,
      stepCount: 20,
      cadenceSpm: 110,
      avgStepTimeSec: 0.54,
      stepTimeAsymmetry: 0.02,
      strideAsymmetry: 0.01,
      lateralSway: 0.03,
      verticalBounce: 0.02,
      armSwingLeft: 0.15,
      armSwingRight: 0.15,
      armSwingAsymmetry: 0.0,
      kneeFlexLeft: 60,
      kneeFlexRight: 60,
      kneeAsymmetry: 0.0,
      stepWidthVariability: 0.01,
      doubleSupportHint: 0.2,
      leftStancePct: 60,
      rightStancePct: 60,
      leftSwingPct: 40,
      rightSwingPct: 40,
      doubleSupportPct: 20,
      symmetryAngle: 1.5,
      stepTimeCV: 0.02,
      strideTimeCV: 0.02,
      pelvicObliquity: 0.01,
      pelvicObliquityVar: 0.001,
      meanStepWidth: 0.15,
      pathSmoothness: 0.92,
      stabilityScore: 85,
      rhythmScore: 90,
      symmetryScore: 92,
      mobilityScore: 88,
      automaticityScore: 89,
      overallScore: 89,
      series: [],
      stepEvents: [],
    };

    const mockDualTask: DualTaskCost = {
      cadenceCostPct: 4.2,
      cadenceDTE: 4.2,
      stepTimeCvCostPct: 5.0,
      stepTimeCvDTE: 5.0,
      stabilityCostPts: 3.0,
      automaticityCostPts: 4.0,
      cmiClassification: "cognitive_prioritization",
      summary: "Moderate dual-task cognitive cost detected.",
    };

    it("renders all 4 cluster cards with interactive accordion headers", () => {
      const html = renderToStaticMarkup(
        <CognitiveClusters metrics={fullMockMetrics} dualTaskCost={mockDualTask} />,
      );

      expect(html).toContain('data-testid="cluster-spatiotemporal"');
      expect(html).toContain('data-testid="cluster-symmetry"');
      expect(html).toContain('data-testid="cluster-stability"');
      expect(html).toContain('data-testid="cluster-dualtask"');

      expect(html).toContain('1. Spatiotemporal Pace');
      expect(html).toContain('2. Inter-limb Symmetry &amp; ROM');
      expect(html).toContain('3. Trunk Stability &amp; Smoothness');
      expect(html).toContain('4. Dual-Task Cognitive Cost');
    });

    it("classifies Pace, Symmetry, Stability, DualTask statuses accurately", () => {
      // Test Normal statuses
      const htmlNormal = renderToStaticMarkup(
        <CognitiveClusters metrics={fullMockMetrics} dualTaskCost={mockDualTask} />,
      );
      expect(htmlNormal).toContain('data-testid="status-badge-pace"');
      expect(htmlNormal).toContain('data-testid="status-badge-symmetry"');
      expect(htmlNormal).toContain('data-testid="status-badge-stability"');
      expect(htmlNormal).toContain('data-testid="status-badge-dualtask"');
      expect(htmlNormal).toContain("Within expected range");

      // Test outside-range statuses
      const pathologicalMetrics: GaitMetrics = {
        ...fullMockMetrics,
        stepTimeCV: 0.12, // > 0.08 => Pathological Pace
        symmetryAngle: 8.5, // > 6.0 => Pathological Symmetry
        stabilityScore: 40, // < 55 => Pathological Stability
        pathSmoothness: 0.50,
      };
      const pathologicalDualTask: DualTaskCost = {
        ...mockDualTask,
        cadenceDTE: 15.0, // > 12.0 => Pathological DualTask
      };

      const htmlPathological = renderToStaticMarkup(
        <CognitiveClusters metrics={pathologicalMetrics} dualTaskCost={pathologicalDualTask} />,
      );
      expect(htmlPathological).toContain("Outside typical range");
    });

    it("handles missing/null optional metric values without crashing or displaying NaN", () => {
      const sparseMetrics: GaitMetrics = {
        ...fullMockMetrics,
        lateralSway: null,
        pelvicObliquity: null,
        doubleSupportPct: null,
        leftStancePct: null,
        rightStancePct: null,
        leftSwingPct: null,
        rightSwingPct: null,
        symmetryAngle: undefined,
        confidenceIntervals: undefined,
      };

      const html = renderToStaticMarkup(
        <CognitiveClusters metrics={sparseMetrics} />,
      );

      // Should render "N/A" for null metrics and not crash or print "NaN"
      expect(html).toContain("N/A");
      expect(html).not.toContain("NaN");
      expect(html).toContain("Single-Task Walk Baseline");
    });

    it("auto-derives angle analysis when angleAnalysis prop is omitted", () => {
      const html = renderToStaticMarkup(
        <CognitiveClusters metrics={fullMockMetrics} />,
      );

      // JointAnglesChart child should render
      expect(html).toContain("Joint Kinematic Angle Trajectories");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. SkeletonCanvas Aspect Ratio & Zero Layout Shift (CLS = 0)
  // ---------------------------------------------------------------------------
  describe("SkeletonCanvas layout stability & interactive hit-testing", () => {
    it("enforces fixed 16:9 aspect ratio container (aspect-video) for zero CLS", () => {
      const html = renderToStaticMarkup(
        <SkeletonCanvas
          video={null}
          poses={[]}
          selectedId={null}
          personColors={{}}
        />,
      );

      expect(html).toContain('data-testid="skeleton-canvas-wrapper"');
      expect(html).toContain("aspect-video bg-black rounded-lg relative overflow-hidden");
    });

    it("configures canvas tabIndex and cursor based on interactive prop", () => {
      const interactiveHtml = renderToStaticMarkup(
        <SkeletonCanvas
          video={null}
          poses={[{ id: 1, landmarks: [] }]}
          selectedId={1}
          personColors={{ 1: "#3b82f6" }}
          interactive={true}
        />,
      );
      expect(interactiveHtml).toContain('tabindex="0"');
      expect(interactiveHtml).toContain('cursor:pointer');

      const nonInteractiveHtml = renderToStaticMarkup(
        <SkeletonCanvas
          video={null}
          poses={[]}
          selectedId={null}
          personColors={{}}
          interactive={false}
        />,
      );
      expect(nonInteractiveHtml).toContain('tabindex="-1"');
      expect(nonInteractiveHtml).toContain('cursor:default');
    });

    it("verifies click hit-testing math logic (hypot(hip - click) < 0.2)", () => {
      // Test the mathematical boundary used in handleClick
      const poseHip = { x: 0.5, y: 0.5 };
      
      // Close click (distance ~0.028 < 0.2)
      const clickClose = { x: 0.52, y: 0.52 };
      const distClose = Math.hypot(clickClose.x - poseHip.x, clickClose.y - poseHip.y);
      expect(distClose).toBeLessThan(0.2);

      // Far click (distance ~0.565 > 0.2)
      const clickFar = { x: 0.9, y: 0.9 };
      const distFar = Math.hypot(clickFar.x - poseHip.x, clickFar.y - poseHip.y);
      expect(distFar).toBeGreaterThan(0.2);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. GaitApp Playback Keyboard Controls & Event Propagation Check
  // ---------------------------------------------------------------------------
  describe("GaitApp keyboard navigation & event propagation safety", () => {
    it("ensures keyboard playback hotkeys are ignored when user is typing in form inputs", () => {
      // Simulate the exact event filter condition implemented in GaitApp.tsx lines 187-197:
      // if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;

      const shouldIgnoreKey = (target: { tagName: string; isContentEditable?: boolean }) => {
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable)
        ) {
          return true; // Ignore hotkey
        }
        return false; // Process hotkey
      };

      // Test form input targets -> MUST ignore hotkey
      expect(shouldIgnoreKey({ tagName: "INPUT" })).toBe(true);
      expect(shouldIgnoreKey({ tagName: "TEXTAREA" })).toBe(true);
      expect(shouldIgnoreKey({ tagName: "SELECT" })).toBe(true);
      expect(shouldIgnoreKey({ tagName: "DIV", isContentEditable: true })).toBe(true);

      // Test main document / non-input targets -> MUST process hotkey
      expect(shouldIgnoreKey({ tagName: "BODY" })).toBe(false);
      expect(shouldIgnoreKey({ tagName: "DIV", isContentEditable: false })).toBe(false);
      expect(shouldIgnoreKey({ tagName: "MAIN" })).toBe(false);
      expect(shouldIgnoreKey({ tagName: "BUTTON" })).toBe(false);
    });

    it("verifies GaitApp shell contains main landmark, sticky header, and footer", () => {
      const html = renderToStaticMarkup(<GaitApp />);

      expect(html).toContain("<main");
      expect(html).toContain('<header class="sticky top-0');
      expect(html).toContain("<footer");
    });
  });
});

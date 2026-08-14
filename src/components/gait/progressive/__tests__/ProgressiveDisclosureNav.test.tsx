// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ProgressiveDisclosureNav, DEFAULT_TIERS } from "../ProgressiveDisclosureNav";
import type { DisclosureTier, TierConfig } from "../types";

afterEach(() => {
  cleanup();
});

describe("ProgressiveDisclosureNav Component", () => {
  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Primary Behavior / Happy Path)
  // =========================================================================

  describe("Tier 1: Feature Coverage", () => {
    it("renders all 3 disclosure tier tabs with labels and badges", () => {
      const onSelectTier = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level1_patient"
          onSelectTier={onSelectTier}
        />
      );

      // Check all 3 tabs are present
      const tabList = screen.getByRole("tablist");
      expect(tabList).toBeInTheDocument();

      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(3);

      // Verify labels / badges for Level 1, Level 2, Level 3
      expect(screen.getByText(/Patient/i)).toBeInTheDocument();
      expect(screen.getByText(/Biomechan/i)).toBeInTheDocument();
      expect(screen.getByText(/Specialist/i)).toBeInTheDocument();
    });

    it("displays target audience descriptions for progressive tiers", () => {
      const onSelectTier = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level1_patient"
          onSelectTier={onSelectTier}
        />
      );

      // Audience indicators or descriptions
      expect(screen.getByText(/Patient Friendly|Patient Overview|Layman/i)).toBeInTheDocument();
      expect(screen.getByText(/Clinical Telemetry|Biomechan|Waveforms/i)).toBeInTheDocument();
      expect(screen.getByText(/Specialist Workstation|Research|EHR/i)).toBeInTheDocument();
    });

    it("correctly indicates aria-selected on the active tier", () => {
      const onSelectTier = vi.fn();
      const { rerender } = render(
        <ProgressiveDisclosureNav
          activeTier="level1_patient"
          onSelectTier={onSelectTier}
        />
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs[0]).toHaveAttribute("aria-selected", "true");
      expect(tabs[1]).toHaveAttribute("aria-selected", "false");
      expect(tabs[2]).toHaveAttribute("aria-selected", "false");

      // Switch to level 2
      rerender(
        <ProgressiveDisclosureNav
          activeTier="level2_biomechanics"
          onSelectTier={onSelectTier}
        />
      );
      expect(tabs[0]).toHaveAttribute("aria-selected", "false");
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
      expect(tabs[2]).toHaveAttribute("aria-selected", "false");

      // Switch to level 3
      rerender(
        <ProgressiveDisclosureNav
          activeTier="level3_specialist"
          onSelectTier={onSelectTier}
        />
      );
      expect(tabs[0]).toHaveAttribute("aria-selected", "false");
      expect(tabs[1]).toHaveAttribute("aria-selected", "false");
      expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    });

    it("fires onSelectTier callback when a tab is clicked", () => {
      const onSelectTier = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level1_patient"
          onSelectTier={onSelectTier}
        />
      );

      const tabs = screen.getAllByRole("tab");

      // Click Level 2 tab
      fireEvent.click(tabs[1]);
      expect(onSelectTier).toHaveBeenCalledTimes(1);
      expect(onSelectTier).toHaveBeenCalledWith("level2_biomechanics");

      // Click Level 3 tab
      fireEvent.click(tabs[2]);
      expect(onSelectTier).toHaveBeenCalledTimes(2);
      expect(onSelectTier).toHaveBeenCalledWith("level3_specialist");

      // Click Level 1 tab
      fireEvent.click(tabs[0]);
      expect(onSelectTier).toHaveBeenCalledTimes(3);
      expect(onSelectTier).toHaveBeenCalledWith("level1_patient");
    });

    it("renders anomaly count badge or alert indicator when provided", () => {
      const onSelectTier = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level1_patient"
          onSelectTier={onSelectTier}
          anomalyCount={3}
        />
      );

      // Verify anomaly count badge
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Keyboard navigation, extremes, wraps)
  // =========================================================================

  describe("Tier 2: Boundary & Corner Cases", () => {
    it("handles keyboard navigation: ArrowRight advances to next tab and wraps around", () => {
      const onSelectTier = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level1_patient"
          onSelectTier={onSelectTier}
        />
      );

      const tabs = screen.getAllByRole("tab");
      tabs[0].focus();

      // Press ArrowRight -> moves to level 2
      fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
      expect(onSelectTier).toHaveBeenCalledWith("level2_biomechanics");

      // Press ArrowRight from last tab (level 3) -> wraps to level 1
      fireEvent.keyDown(tabs[2], { key: "ArrowRight" });
      expect(onSelectTier).toHaveBeenCalledWith("level1_patient");
    });

    it("handles keyboard navigation: ArrowLeft advances to previous tab and wraps around", () => {
      const onSelectTier = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level2_biomechanics"
          onSelectTier={onSelectTier}
        />
      );

      const tabs = screen.getAllByRole("tab");
      tabs[1].focus();

      // Press ArrowLeft from level 2 -> moves to level 1
      fireEvent.keyDown(tabs[1], { key: "ArrowLeft" });
      expect(onSelectTier).toHaveBeenCalledWith("level1_patient");

      // Press ArrowLeft from level 1 -> wraps to level 3
      fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
      expect(onSelectTier).toHaveBeenCalledWith("level3_specialist");
    });

    it("handles Home and End keys to jump to first and last tabs", () => {
      const onSelectTier = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level2_biomechanics"
          onSelectTier={onSelectTier}
        />
      );

      const tabs = screen.getAllByRole("tab");
      tabs[1].focus();

      // Press Home -> jump to Level 1
      fireEvent.keyDown(tabs[1], { key: "Home" });
      expect(onSelectTier).toHaveBeenCalledWith("level1_patient");

      // Press End -> jump to Level 3
      fireEvent.keyDown(tabs[1], { key: "End" });
      expect(onSelectTier).toHaveBeenCalledWith("level3_specialist");
    });

    it("handles rapid consecutive clicking without throwing or desyncing", () => {
      const onSelectTier = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level1_patient"
          onSelectTier={onSelectTier}
        />
      );

      const tabs = screen.getAllByRole("tab");

      // Rapid clicks across tabs
      for (let i = 0; i < 10; i++) {
        fireEvent.click(tabs[i % 3]);
      }
      expect(onSelectTier).toHaveBeenCalledTimes(10);
    });

    it("accepts custom className and maintains layout styling", () => {
      const onSelectTier = vi.fn();
      const { container } = render(
        <ProgressiveDisclosureNav
          activeTier="level1_patient"
          onSelectTier={onSelectTier}
          className="custom-nav-class"
        />
      );

      expect(container.firstChild).toHaveClass("custom-nav-class");
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS & ACCESSIBILITY
  // =========================================================================

  describe("Tier 3: Cross-Feature Combinations & Accessibility", () => {
    it("ensures correct tabIndex semantics (0 for active tab, -1 for inactive tabs)", () => {
      const onSelectTier = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level2_biomechanics"
          onSelectTier={onSelectTier}
        />
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs[0]).toHaveAttribute("tabindex", "-1");
      expect(tabs[1]).toHaveAttribute("tabindex", "0");
      expect(tabs[2]).toHaveAttribute("tabindex", "-1");
    });

    it("supports Enter and Space key activation on focused tabs", () => {
      const onSelectTier = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level1_patient"
          onSelectTier={onSelectTier}
        />
      );

      const tabs = screen.getAllByRole("tab");

      // Press Enter on tab 2
      fireEvent.keyDown(tabs[1], { key: "Enter" });
      expect(onSelectTier).toHaveBeenCalledWith("level2_biomechanics");

      // Press Space on tab 3
      fireEvent.keyDown(tabs[2], { key: " " });
      expect(onSelectTier).toHaveBeenCalledWith("level3_specialist");
    });

    it("renders custom tier configurations if custom tiers are provided", () => {
      const customTiers: TierConfig[] = [
        {
          id: "level1_patient",
          label: "Simple Overview",
          badge: "Patient",
          description: "Clear motion insights",
          targetAudience: "General Public",
        },
        {
          id: "level2_biomechanics",
          label: "Joint Telemetry",
          badge: "Clinical",
          description: "Waveforms & Angles",
          targetAudience: "Therapists",
        },
        {
          id: "level3_specialist",
          label: "Research Station",
          badge: "Specialist",
          description: "GPS & Exporters",
          targetAudience: "Researchers",
        },
      ];

      const onSelectTier = vi.fn();
      render(
        <ProgressiveDisclosureNav
          activeTier="level1_patient"
          onSelectTier={onSelectTier}
          tiers={customTiers}
        />
      );

      expect(screen.getByText("Simple Overview")).toBeInTheDocument();
      expect(screen.getByText("Joint Telemetry")).toBeInTheDocument();
      expect(screen.getByText("Research Station")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // =========================================================================

  describe("Tier 4: Real-World Application Scenarios", () => {
    it("Scenario: Clinician progressive navigation from Patient view to Biomechanics to Specialist note generation", () => {
      let currentTier: DisclosureTier = "level1_patient";
      const handleSelect = vi.fn((tier: DisclosureTier) => {
        currentTier = tier;
      });

      const { rerender } = render(
        <ProgressiveDisclosureNav
          activeTier={currentTier}
          onSelectTier={handleSelect}
          anomalyCount={2}
        />
      );

      // Step 1: Start at Level 1 (Patient view)
      const tabs = screen.getAllByRole("tab");
      expect(tabs[0]).toHaveAttribute("aria-selected", "true");

      // Step 2: Clinician notices 2 anomalies badge, clicks Level 2 (Biomechanics)
      fireEvent.click(tabs[1]);
      expect(handleSelect).toHaveBeenCalledWith("level2_biomechanics");

      rerender(
        <ProgressiveDisclosureNav
          activeTier="level2_biomechanics"
          onSelectTier={handleSelect}
          anomalyCount={2}
        />
      );
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");

      // Step 3: Clinician inspects waveforms and advances to Level 3 (Specialist Workstation)
      fireEvent.click(tabs[2]);
      expect(handleSelect).toHaveBeenCalledWith("level3_specialist");

      rerender(
        <ProgressiveDisclosureNav
          activeTier="level3_specialist"
          onSelectTier={handleSelect}
          anomalyCount={2}
        />
      );
      expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    });
  });
});

/// <reference types="@testing-library/jest-dom/vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ViewportHUD } from "../ViewportHUD";

afterEach(() => {
  cleanup();
});

describe("ViewportHUD Component", () => {
  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Status Indicators, Spirit Level, FPS, Phase)
  // =========================================================================

  describe("Tier 1: Feature Coverage", () => {
    it("renders core HUD telemetry metrics: FPS and Tracking Confidence", () => {
      render(
        <ViewportHUD
          fps={30}
          confidence={0.94}
          pitchDeg={1.2}
          rollDeg={0.5}
          currentPhase="Terminal Stance"
          defaultExpanded={true}
        />
      );

      // FPS
      expect(screen.getByText(/30.*FPS|30/i)).toBeInTheDocument();
      // Confidence (94%)
      expect(screen.getByText(/94%|Confidence/i)).toBeInTheDocument();
    });

    it("renders camera spirit level tilt indicators (Pitch & Roll)", () => {
      render(
        <ViewportHUD
          fps={30}
          confidence={0.90}
          pitchDeg={2.4}
          rollDeg={0.8}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText(/Pitch.*2\.4°|2\.4°/i)).toBeInTheDocument();
      expect(screen.getByText(/Roll.*0\.8°|0\.8°/i)).toBeInTheDocument();
    });

    it("displays active gait cycle phase badge", () => {
      render(
        <ViewportHUD
          currentPhase="Initial Contact"
          defaultExpanded={true}
        />
      );

      expect(screen.getByText(/Initial Contact/i)).toBeInTheDocument();
    });

    it("supports collapsible expansion and collapse on click", () => {
      render(
        <ViewportHUD
          fps={30}
          confidence={0.90}
          pitchDeg={1.0}
          rollDeg={0.2}
          currentPhase="Loading Response"
          isCollapsible={true}
          defaultExpanded={false}
        />
      );

      // Initially compact / collapsed
      const toggleButton = screen.getByRole("button", { name: /Toggle HUD|Expand HUD|HUD/i });
      expect(toggleButton).toHaveAttribute("aria-expanded", "false");

      // Click to expand
      fireEvent.click(toggleButton);
      expect(toggleButton).toHaveAttribute("aria-expanded", "true");

      // Now detailed telemetry should be visible
      expect(screen.getByText(/Loading Response/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Low confidence, High tilt, Missing values)
  // =========================================================================

  describe("Tier 2: Boundary & Corner Cases", () => {
    it("highlights warning badge when tracking confidence is low (< 0.5)", () => {
      render(
        <ViewportHUD
          fps={15}
          confidence={0.35}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText(/35%|Low Confidence|Warning/i)).toBeInTheDocument();
    });

    it("highlights alignment alert when tilt angle exceeds threshold (> 5°)", () => {
      render(
        <ViewportHUD
          fps={30}
          confidence={0.90}
          pitchDeg={7.8}
          rollDeg={6.2}
          defaultExpanded={true}
        />
      );

      // Should indicate tilt misalignment warning
      expect(screen.getByText(/7\.8°|Tilt Warning|Misaligned/i)).toBeInTheDocument();
    });

    it("handles zero or missing values gracefully without NaN or errors", () => {
      render(<ViewportHUD defaultExpanded={true} />);

      // Should render without throwing
      expect(screen.getByTestId("viewport-hud-container")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // =========================================================================

  describe("Tier 3: Cross-Feature Combinations", () => {
    it("expands on mouse hover and collapses on mouse leave when collapsible", () => {
      render(
        <ViewportHUD
          fps={30}
          confidence={0.95}
          isCollapsible={true}
          defaultExpanded={false}
        />
      );

      const container = screen.getByTestId("viewport-hud-container");

      // Mouse enter -> expands
      fireEvent.mouseEnter(container);
      const toggleButton = screen.getByRole("button", { name: /Toggle HUD|Expand HUD|HUD/i });
      expect(toggleButton).toHaveAttribute("aria-expanded", "true");

      // Mouse leave -> collapses
      fireEvent.mouseLeave(container);
      expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // =========================================================================

  describe("Tier 4: Real-World Application Scenarios", () => {
    it("Scenario: Realtime camera leveling check prior to clinical recording", () => {
      const { rerender } = render(
        <ViewportHUD
          fps={30}
          confidence={0.88}
          pitchDeg={8.5}
          rollDeg={4.2}
          defaultExpanded={true}
        />
      );

      // Clinician sees tilt warning
      expect(screen.getByText(/8\.5°|Tilt/i)).toBeInTheDocument();

      // Clinician levels camera: pitch drops to 1.1°
      rerender(
        <ViewportHUD
          fps={30}
          confidence={0.96}
          pitchDeg={1.1}
          rollDeg={0.3}
          defaultExpanded={true}
        />
      );

      // Level status confirmed
      expect(screen.getByText(/1\.1°/i)).toBeInTheDocument();
    });
  });
});

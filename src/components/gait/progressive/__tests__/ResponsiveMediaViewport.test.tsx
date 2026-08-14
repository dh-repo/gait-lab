/// <reference types="@testing-library/jest-dom/vitest" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ResponsiveMediaViewport } from "../ResponsiveMediaViewport";
import { ViewportHUD } from "../ViewportHUD";

afterEach(() => {
  cleanup();
});

describe("ResponsiveMediaViewport Component", () => {
  // =========================================================================
  // TIER 1: FEATURE COVERAGE (9:16 Portrait vs 16:9 Landscape, Centered Framing)
  // =========================================================================

  describe("Tier 1: Feature Coverage", () => {
    it("renders in 16:9 landscape aspect ratio by default or when specified", () => {
      const { container } = render(
        <ResponsiveMediaViewport aspectRatio="16:9">
          <div data-testid="test-canvas">Canvas 16:9</div>
        </ResponsiveMediaViewport>
      );

      expect(screen.getByTestId("test-canvas")).toBeInTheDocument();
      // Check for landscape aspect ratio styling / class
      const viewportContainer = container.firstChild as HTMLElement;
      expect(viewportContainer.className).toMatch(/aspect-video|aspect-\[16\/9\]|landscape/i);
    });

    it("renders in 9:16 portrait aspect ratio for mobile / vertical video recording", () => {
      const { container } = render(
        <ResponsiveMediaViewport aspectRatio="9:16" orientation="portrait">
          <div data-testid="test-mobile-canvas">Canvas 9:16</div>
        </ResponsiveMediaViewport>
      );

      expect(screen.getByTestId("test-mobile-canvas")).toBeInTheDocument();
      const viewportContainer = container.firstChild as HTMLElement;
      expect(viewportContainer.className).toMatch(/aspect-\[9\/16\]|portrait/i);
    });

    it("centers video / canvas framing with letterboxing / containment", () => {
      const { container } = render(
        <ResponsiveMediaViewport>
          <div data-testid="centered-content">Media Content</div>
        </ResponsiveMediaViewport>
      );

      const viewport = container.firstChild as HTMLElement;
      expect(viewport.className).toMatch(/flex|grid|items-center|justify-center|relative/i);
    });

    it("renders overlay slot for ViewportHUD or custom overlay controls", () => {
      render(
        <ResponsiveMediaViewport
          hudOverlay={<div data-testid="custom-hud-overlay">HUD Status</div>}
        >
          <div>Main Stream</div>
        </ResponsiveMediaViewport>
      );

      expect(screen.getByTestId("custom-hud-overlay")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Extreme dimensions, Empty state, Custom class)
  // =========================================================================

  describe("Tier 2: Boundary & Corner Cases", () => {
    it("handles auto aspect ratio with fallback styling", () => {
      const { container } = render(
        <ResponsiveMediaViewport aspectRatio="auto">
          <div>Auto Aspect</div>
        </ResponsiveMediaViewport>
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it("applies custom className and custom style attributes seamlessly", () => {
      const { container } = render(
        <ResponsiveMediaViewport className="custom-viewport-style">
          <div>Content</div>
        </ResponsiveMediaViewport>
      );

      expect(container.firstChild).toHaveClass("custom-viewport-style");
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (HUD Integration & Hover Expand)
  // =========================================================================

  describe("Tier 3: Cross-Feature Combinations", () => {
    it("integrates ViewportHUD overlay with hover expansion inside viewport", () => {
      render(
        <ResponsiveMediaViewport
          hudOverlay={
            <ViewportHUD
              fps={30}
              confidence={0.92}
              pitchDeg={1.5}
              rollDeg={0.4}
              currentPhase="Initial Contact"
              isCollapsible={true}
            />
          }
        >
          <div data-testid="video-stream">Video Stream</div>
        </ResponsiveMediaViewport>
      );

      expect(screen.getByTestId("video-stream")).toBeInTheDocument();
      expect(screen.getByText(/30.*FPS|30/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // =========================================================================

  describe("Tier 4: Real-World Application Scenarios", () => {
    it("Scenario: Smartphone vertical capture workflow in 9:16 orientation", () => {
      render(
        <ResponsiveMediaViewport
          aspectRatio="9:16"
          orientation="portrait"
          hudOverlay={
            <ViewportHUD
              fps={60}
              confidence={0.95}
              pitchDeg={0.8}
              rollDeg={0.2}
              currentPhase="Mid Stance"
            />
          }
        >
          <div data-testid="vertical-camera-canvas">Mobile Camera Viewport</div>
        </ResponsiveMediaViewport>
      );

      expect(screen.getByTestId("vertical-camera-canvas")).toBeInTheDocument();
      expect(screen.getByText(/60.*FPS|60/i)).toBeInTheDocument();
    });
  });
});

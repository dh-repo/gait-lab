import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SkeletonCanvas } from "../SkeletonCanvas";

describe("SkeletonCanvas Accessibility & Performance Wrapper", () => {
  it("renders fixed aspect-ratio wrapper to ensure zero layout shift (CLS = 0)", () => {
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

  it("renders canvas element with role='img' and descriptive aria-label", () => {
    const html = renderToStaticMarkup(
      <SkeletonCanvas
        video={null}
        poses={[{ id: 1, landmarks: [] }]}
        selectedId={1}
        personColors={{ 1: "#3b82f6" }}
        interactive={true}
      />,
    );

    expect(html).toContain('<canvas');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Pose estimation skeleton rendering canvas"');
    expect(html).toContain('tabindex="0"');
  });

  it("sets tabIndex='-1' when non-interactive", () => {
    const html = renderToStaticMarkup(
      <SkeletonCanvas
        video={null}
        poses={[]}
        selectedId={null}
        personColors={{}}
        interactive={false}
      />,
    );

    expect(html).toContain('tabindex="-1"');
  });
});

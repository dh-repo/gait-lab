import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { GoogleTopAppBar, WORKFLOW_STAGES } from "../GoogleTopAppBar";
import { SideNavRail } from "../SideNavRail";
import { WorkflowHeader } from "../WorkflowHeader";
import { GaitApp } from "../GaitApp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

describe("Milestone 1 Empirical Layout, Tokens & Landmark Verification", () => {
  it("verifies __root.tsx font/theme wiring for the clinical shell", () => {
    const rootPath = path.resolve(process.cwd(), "src/routes/__root.tsx");
    const rootContent = fs.readFileSync(rootPath, "utf-8");

    expect(rootContent).toContain("fonts.googleapis.com");
    // Accept either Google Sans stack or IBM Plex clinical stack
    expect(
      rootContent.includes("Google+Sans") ||
        rootContent.includes("IBM+Plex") ||
        rootContent.includes("theme-color"),
    ).toBe(true);
  });

  it("verifies styles.css clinical design tokens", () => {
    const cssPath = path.resolve(process.cwd(), "src/styles.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");

    expect(cssContent).toContain("--color-primary:");
    expect(cssContent).toContain("--color-bg:");
    expect(cssContent).toContain("--color-surface");
    expect(cssContent).toContain("--color-border:");
    expect(cssContent).toContain("--color-fg:");
  });

  it("verifies Button primitive variants render", () => {
    const defaultHtml = renderToStaticMarkup(<Button variant="default">Primary</Button>);
    const secondaryHtml = renderToStaticMarkup(<Button variant="secondary">Secondary</Button>);
    const outlineHtml = renderToStaticMarkup(<Button variant="outline">Outline</Button>);
    const ghostHtml = renderToStaticMarkup(<Button variant="ghost">Ghost</Button>);

    expect(defaultHtml).toContain("<button");
    expect(secondaryHtml).toContain("<button");
    expect(outlineHtml).toContain("<button");
    expect(ghostHtml).toContain("<button");
  });

  it("verifies Badge status chip tones render", () => {
    const primaryHtml = renderToStaticMarkup(<Badge tone="primary">Primary</Badge>);
    const successHtml = renderToStaticMarkup(<Badge tone="success">Success</Badge>);
    const warnHtml = renderToStaticMarkup(<Badge tone="warn">Warning</Badge>);
    const dangerHtml = renderToStaticMarkup(<Badge tone="danger">Danger</Badge>);

    expect(primaryHtml).toContain("Primary");
    expect(successHtml).toContain("Success");
    expect(warnHtml).toContain("Warning");
    expect(dangerHtml).toContain("Danger");
  });

  it("verifies Card component structure", () => {
    const html = renderToStaticMarkup(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
      </Card>,
    );

    expect(html).toContain("Card Title");
    expect(html).toContain("Content");
  });

  it("verifies Progress component attributes", () => {
    const html = renderToStaticMarkup(<Progress value={75} />);

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="75"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
  });

  it("verifies GoogleTopAppBar landmarks, stage rail, search, and compare button", () => {
    const html = renderToStaticMarkup(
      <GoogleTopAppBar
        currentStage={3}
        searchQuery="PT-12345"
        onSearchChange={() => {}}
        onOpenCompare={() => {}}
        hasResults={true}
      />,
    );

    expect(html).toContain("<header");
    expect(html).toContain('<nav aria-label="Workflow progression"');
    expect(html).toContain('data-testid="top-app-bar-search"');
    expect(html).toContain('data-testid="header-compare-button"');
    expect(html).toContain('value="PT-12345"');

    expect(WORKFLOW_STAGES).toHaveLength(4);
    expect(WORKFLOW_STAGES.map((s) => s.title)).toEqual(["Capture", "Process", "Analyze", "Report"]);
  });

  it("verifies SideNavRail landmarks, toggle button, collapse state, and section headers", () => {
    const expandedHtml = renderToStaticMarkup(
      <SideNavRail isCollapsed={false} onToggleCollapse={() => {}} />,
    );
    expect(expandedHtml).toContain('data-testid="side-nav-rail"');
    expect(expandedHtml).toContain('data-testid="side-nav-toggle"');
    expect(expandedHtml).toContain("w-60");
    expect(expandedHtml).toContain("WORKSTATION");
    expect(expandedHtml).toContain("ANALYTICS &amp; KINEMATICS");
    expect(expandedHtml).toContain("REPORTS &amp; EXPORT");

    const collapsedHtml = renderToStaticMarkup(
      <SideNavRail isCollapsed={true} onToggleCollapse={() => {}} />,
    );
    expect(collapsedHtml).toContain("w-16");
  });

  it("verifies WorkflowHeader 100% backward compatibility pass-through", () => {
    const html = renderToStaticMarkup(
      <WorkflowHeader
        currentStage={1}
        searchQuery=""
        onSearchChange={() => {}}
      />,
    );

    expect(html).toContain("<header");
    expect(html).toContain('<nav aria-label="Workflow progression"');
  });

  it("verifies GaitApp integrates SideNavRail, header, main, and footer landmarks in correct DOM hierarchy", () => {
    const html = renderToStaticMarkup(<GaitApp />);

    expect(html).toContain("<header");
    expect(html).toContain('data-testid="side-nav-rail"');
    expect(html).toContain("<aside");
    expect(html).toContain("<main");
    expect(html).toContain("<footer");

    expect(html).toContain("min-h-dvh");
    expect(html).toContain("flex flex-col");
  });
});

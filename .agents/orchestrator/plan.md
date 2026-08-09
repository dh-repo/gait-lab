# Master Plan: gait-lab UI Optimization

## Architecture & Layout Paradigm
Synthesized Hybrid Low-Cognitive-Load Clinical Interface combining:
1. 4-Stage Linear Workflow Header (1. Input -> 2. Video Processing -> 3. Clinical Insights -> 4. Export Report).
2. Phase-Driven Dynamic Views & Responsive Dual-Pane Workstation (50/50 split on desktop).
3. Above-the-fold Headline Clinical Indicators & 4 Cognitive Clusters (Pace, Symmetry, Trunk, Dual-Task).
4. Progressive Disclosure Accordion for diagnostic waveforms and 95% CIs.
5. WCAG 2.1 AA Contrast Compliance, Semantic HTML, ARIA Landmarks, Full Keyboard Nav, and 60 FPS Canvas Rendering.

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | 4-Stage Linear Workflow Progression & Header Navigation | Update `GaitApp.tsx` state machine, build `WorkflowHeader.tsx`, streamline Stage 1 & 2 views, fix `eslint.config.mjs` ignores. | none | PLANNED |
| M2 | Cognitive Clustering & Progressive Disclosure Components | Build `CognitiveClusters.tsx` (4 clusters), dual-pane layout, progressive accordion, write `ux_design_rationale.md`. | M1 | PLANNED |
| M3 | Accessibility, Semantic HTML, ARIA, & 60 FPS Layout Performance | WCAG AA contrast colors in `styles.css`, semantic layout, ARIA landmarks, keyboard nav, 60 FPS canvas loop, Stage 4 PDF export wiring. | M2 | PLANNED |
| M4 | E2E Integration, Test Suite Expansion, Forensic Audit & Verification | Unit & component tests for 4-stage workflow & clusters; multi-agent review swarm (2x Reviewers, 2x Challengers, 1x Forensic Auditor). | M3 | PLANNED |

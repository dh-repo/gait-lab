#!/usr/bin/env node
/**
 * Multi-viewport layout validation for Gait Lab.
 * Screenshots + overflow + touch probes under screenshots/mobile/.
 *
 * Usage:
 *   node scripts/viewport-validate.mjs [url]
 *   FLOW=1 node scripts/viewport-validate.mjs   # also load a sample (slow)
 *
 * Exit 0 = no document overflow and no pageerrors on capture stage.
 * Exit 1 = navigation/IO failure.
 * Exit 2 = overflow and/or pageerrors (see report.json).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";

const url = checkedUrl(process.argv[2] || "http://127.0.0.1:8080/");
const outDir = checkedOutputPath(
  join(process.cwd(), "screenshots", "mobile"),
  [process.cwd()],
);
const timeoutMs = Number(process.env.BROWSER_SMOKE_TIMEOUT_MS || 60000);
const runFlow = process.env.FLOW === "1" || process.env.FLOW === "true";
/** When FLOW=1, skip the 5-viewport capture matrix and only run process/analyze flow. */
const flowOnly = runFlow && process.env.FLOW_ONLY !== "0";

const VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 812 },
  { name: "iphone", width: 390, height: 844 },
  { name: "ipad", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "desktop-wide", width: 1440, height: 900 },
];

mkdirSync(outDir, { recursive: true });

async function probeLayout(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollW = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0);
    const clientW = doc.clientWidth;
    const overflow = scrollW > clientW + 1;

    const offenders = [];
    const all = document.querySelectorAll("body *");
    const limit = Math.min(all.length, 2500);
    for (let i = 0; i < limit; i++) {
      const el = all[i];
      if (!(el instanceof HTMLElement)) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.right > clientW + 2 && r.left < clientW) {
        const tag = el.tagName.toLowerCase();
        const cls = (el.className && typeof el.className === "string"
          ? el.className
          : ""
        )
          .slice(0, 80);
        const testId = el.getAttribute("data-testid") || "";
        offenders.push({
          tag,
          testId,
          cls,
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
        if (offenders.length >= 12) break;
      }
    }

    const touchFails = [];
    const selectors = [
      'header button',
      'nav[aria-label="Workflow progression"] button',
      'main button',
      '[role="tab"]',
    ];
    const seen = new Set();
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!(el instanceof HTMLElement)) continue;
        if (seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (r.height < 44 || r.width < 44) {
          const label =
            el.getAttribute("aria-label") ||
            (el.textContent || "").trim().slice(0, 40);
          touchFails.push({
            label,
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
        if (touchFails.length >= 20) break;
      }
    }

    const main = document.querySelector("main");
    const mainBox = main?.getBoundingClientRect();

    return {
      overflow,
      scrollW,
      clientW,
      offenders,
      touchFails,
      mainLeft: mainBox ? Math.round(mainBox.left) : null,
      mainRight: mainBox ? Math.round(mainBox.right) : null,
      mainWidth: mainBox ? Math.round(mainBox.width) : null,
    };
  });
}

async function shot(page, name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  const full = join(outDir, `${name}-full.png`);
  await page.screenshot({ path: full, fullPage: true });
  return { viewport: path, full };
}

const report = {
  url,
  startedAt: new Date().toISOString(),
  viewports: [],
  flow: null,
  ok: true,
};

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
  ],
});

try {
  if (!flowOnly) {
    for (const vp of VIEWPORTS) {
      const pageErrors = [];
      const consoleErrors = [];
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.width < 768,
        hasTouch: vp.width < 1024,
      });
      page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      const resp = await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
      await page.waitForTimeout(800);

      const layout = await probeLayout(page);
      const shots = await shot(page, `${vp.name}-capture`);

      const entry = {
        name: vp.name,
        width: vp.width,
        height: vp.height,
        status: resp?.status() ?? 0,
        stage: "capture",
        layout,
        screenshots: shots,
        pageErrors,
        consoleErrors: consoleErrors.slice(0, 15),
      };
      report.viewports.push(entry);

      if (layout.overflow || pageErrors.length || (resp?.status() ?? 0) >= 400) {
        report.ok = false;
      }

      await page.close();
    }
  }

  // Deep flow on phone + desktop only when FLOW=1
  if (runFlow) {
    report.flow = [];
    for (const vp of [
      { name: "iphone-se", width: 375, height: 812 },
      { name: "desktop", width: 1280, height: 800 },
    ]) {
      const pageErrors = [];
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.width < 768,
        hasTouch: vp.width < 1024,
      });
      page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));

      await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
      await page.waitForTimeout(500);

      // SamplePicker rows: accessible name is title + features + "Load"
      const loadBtn = page
        .locator('button')
        .filter({ hasText: /Load|Loading/i })
        .filter({ hasText: /Sagittal|Frontal|Follow|General|No video/i })
        .first();
      let flowStage = "capture";
      const loadVisible = await loadBtn.isVisible().catch(() => false);
      if (loadVisible) {
        await loadBtn.click();
        flowStage = "loading";
        // Wait through load → process → analyze (pose WASM + kinematics can be 1–2+ min)
        for (let i = 0; i < 180; i++) {
          await page.waitForTimeout(1000);
          const t = await page.locator("body").innerText().catch(() => "");

          if (/Could not|Try another|Failed to load/i.test(t) && i > 8) {
            flowStage = "error";
            break;
          }

          const hasResults =
            /Open report|Hypotheses|Fall Risk|Spatiotemporal Pace|Analysis tabs/i.test(t) ||
            (await page.getByRole("tab", { name: /Findings/i }).isVisible().catch(() => false));
          if (hasResults) {
            flowStage = "analyze";
            break;
          }

          if (
            /Pose tracking|Extracting|Loading pose|Select Subject|Person 1|TARGET TRACKED|Processing/i.test(
              t,
            )
          ) {
            flowStage = "process";
            const analyzeCta = page.getByRole("button", {
              name: /Analyze selected|Analyze Selected Person|Continue|Start analysis/i,
            });
            if (await analyzeCta.isVisible().catch(() => false)) {
              await analyzeCta.click().catch(() => {});
            }
            // keep looping until results or timeout
            continue;
          }
        }
        // Mid-flight screenshot already taken after loop via flowStage name
      }

      const layout = await probeLayout(page);
      const shots = await shot(page, `${vp.name}-flow-${flowStage}`);

      // If analyze, walk tabs
      if (flowStage === "analyze") {
        for (const tabName of ["Hypotheses", "Charts", "Guide", "Fall Risk", "Findings"]) {
          const tab = page.getByRole("tab", { name: tabName });
          if (await tab.isVisible().catch(() => false)) {
            await tab.click();
            await page.waitForTimeout(400);
            await shot(page, `${vp.name}-tab-${tabName.toLowerCase().replace(/\s+/g, "-")}`);
          }
        }
      }

      report.flow.push({
        name: vp.name,
        flowStage,
        layout,
        screenshots: shots,
        pageErrors,
      });
      if (layout.overflow || pageErrors.length) report.ok = false;
      await page.close();
    }
  }

  const reportPath = join(outDir, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, reportPath, summary: summarize(report) }, null, 2));

  if (!report.ok) process.exit(2);
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}

function summarize(r) {
  return {
    capture: r.viewports.map((v) => ({
      name: v.name,
      overflow: v.layout.overflow,
      scrollW: v.layout.scrollW,
      clientW: v.layout.clientW,
      offenders: v.layout.offenders.length,
      touchFails: v.layout.touchFails.length,
      pageErrors: v.pageErrors.length,
    })),
    flow: r.flow?.map((f) => ({
      name: f.name,
      stage: f.flowStage,
      overflow: f.layout.overflow,
    })),
  };
}

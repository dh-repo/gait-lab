#!/usr/bin/env node
/**
 * Hammer both tuning home clips through the live app and dump metrics JSON.
 * Uses all available CPU for parallel browsers when PARALLEL=1 (default).
 *
 *   npm run dev   # :8080
 *   node scripts/tune-gait-samples.mjs
 *   PARALLEL=0 node scripts/tune-gait-samples.mjs   # sequential
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { cpus } from "node:os";

const url = process.argv[2] || "http://127.0.0.1:8080/";
const outDir = join(process.cwd(), "screenshots", "tuning");
const parallel = process.env.PARALLEL !== "0";
const timeoutMs = Number(process.env.TUNE_TIMEOUT_MS || 420000);

mkdirSync(outDir, { recursive: true });

const SAMPLES = [
  {
    id: "tuning_3992",
    match: /Tuning: Home frontal \(single\)|Home frontal \(single\)/i,
  },
  {
    id: "tuning_3993",
    match: /Tuning: Home frontal \(multi\)|Home frontal \(multi\)/i,
  },
];

console.log(
  JSON.stringify({
    cpus: cpus().length,
    parallel,
    samples: SAMPLES.map((s) => s.id),
    url,
  }),
);

async function runOne(sample) {
  const t0 = Date.now();
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--enable-gpu",
      "--use-gl=angle",
      // Prefer Metal on macOS; fall back to SwiftShader if Metal unavailable
      "--use-angle=metal",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(timeoutMs);
  const logs = [];
  page.on("pageerror", (e) => logs.push("PAGE: " + String(e?.message || e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") logs.push("CON: " + msg.text());
  });

  const report = {
    id: sample.id,
    ok: false,
    ms: 0,
    people: 0,
    phase: "start",
    metrics: null,
    notes: [],
    logs: [],
    error: null,
  };

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(800);

    const row = page.locator("button").filter({ hasText: sample.match }).first();
    if (!(await row.isVisible().catch(() => false))) {
      // Fallback: Load buttons under reference clips
      const loads = page.locator("button").filter({ hasText: /Load|Tuning/i });
      const n = await loads.count();
      let clicked = false;
      for (let i = 0; i < n; i++) {
        const txt = await loads.nth(i).innerText();
        if (sample.match.test(txt)) {
          await loads.nth(i).click();
          clicked = true;
          logs.push("clicked row: " + txt.slice(0, 80));
          break;
        }
      }
      if (!clicked) throw new Error("Sample row not found for " + sample.id);
    } else {
      await row.click();
      logs.push("clicked sample row");
    }

    report.phase = "loading";
    const deadline = Date.now() + timeoutMs;
    let advanced = false;

    while (Date.now() < deadline) {
      await page.waitForTimeout(1000);
      const body = await page.locator("body").innerText();

      if (/No people|Could not|Failed to load|Analysis failed|Not enough pose/i.test(body)) {
        report.phase = "error";
        report.error = body.match(/(No people|Could not|Failed|Not enough)[^\n]{0,120}/i)?.[0] || "error";
        break;
      }

      if (/Analyze selected|Person \d/i.test(body) && !advanced) {
        report.phase = "select_person";
        const personBtns = page.locator("button").filter({ hasText: /Person \d/i });
        const pc = await personBtns.count();
        report.people = pc;
        logs.push("people=" + pc);
        if (pc > 0) {
          await personBtns.first().click();
          await page.waitForTimeout(300);
        }
        const analyze = page.getByRole("button", { name: /Analyze selected/i });
        if (await analyze.isVisible().catch(() => false)) {
          await analyze.click();
          advanced = true;
          report.phase = "analyzing";
          logs.push("clicked analyze");
        }
      }

      // Auto-analysis may skip select when single person
      if (/Extracting gait|Resampling|Computing metrics|Analysis complete|Findings|Open report/i.test(body)) {
        if (!advanced) {
          advanced = true;
          report.phase = "analyzing_or_results";
        }
      }

      // Only trust the debug export — body text matches side-nav labels too early
      const hasResult = await page
        .evaluate(() => Boolean(window.__GAIT_LAST_RESULT__?.metrics))
        .catch(() => false);
      if (hasResult) {
        await page.waitForTimeout(400);
        const result = await page.evaluate(() => {
          const r = window.__GAIT_LAST_RESULT__;
          if (!r?.metrics) return null;
          const m = r.metrics;
          return {
            viewAngle: m.viewAngle,
            viewConfidence: m.viewConfidence,
            durationSec: m.durationSec,
            stepCount: m.stepCount,
            cadenceSpm: m.cadenceSpm,
            stepTimeCV: m.stepTimeCV,
            overallScore: m.overallScore,
            stabilityScore: m.stabilityScore,
            symmetryScore: m.symmetryScore,
            mobilityScore: m.mobilityScore,
            rhythmScore: m.rhythmScore,
            automaticityScore: m.automaticityScore,
            lateralSway: m.lateralSway,
            verticalBounce: m.verticalBounce,
            analyzedFrames: r.analyzedFrames,
            notes: r.notes,
            guessCount: r.guesses?.length ?? 0,
          };
        });
        report.metrics = result;
        report.phase = "results";
        report.ok = Boolean(result);
        report.notes = result?.notes || [];
        break;
      }

      if (/Loading pose model|Scanning|Extracting|Resampling|Computing/i.test(body)) {
        report.phase = body.match(/(Loading pose model|Scanning|Extracting|Resampling|Computing)[^\n]{0,40}/i)?.[0] || report.phase;
      }
    }

    await page.screenshot({
      path: join(outDir, `${sample.id}.png`),
      fullPage: true,
    });
  } catch (e) {
    report.error = String(e?.message || e);
    report.phase = "exception";
  } finally {
    report.ms = Date.now() - t0;
    report.logs = logs.slice(0, 40);
    await browser.close().catch(() => {});
  }

  writeFileSync(join(outDir, `${sample.id}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ done: sample.id, ok: report.ok, ms: report.ms, phase: report.phase, metrics: report.metrics }, null, 2));
  return report;
}

const results = parallel
  ? await Promise.all(SAMPLES.map((s) => runOne(s)))
  : await (async () => {
      const out = [];
      for (const s of SAMPLES) out.push(await runOne(s));
      return out;
    })();

const summary = {
  at: new Date().toISOString(),
  cpus: cpus().length,
  results: results.map((r) => ({
    id: r.id,
    ok: r.ok,
    ms: r.ms,
    phase: r.phase,
    people: r.people,
    stepCount: r.metrics?.stepCount,
    cadenceSpm: r.metrics?.cadenceSpm,
    viewAngle: r.metrics?.viewAngle,
    overallScore: r.metrics?.overallScore,
    error: r.error,
  })),
};
writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 2 : 0);

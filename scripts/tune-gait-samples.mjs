#!/usr/bin/env node
/**
 * Hammer home tuning clips through the live app using maximum local resources.
 *
 * Prefers real Google Chrome (GPU) over stock Chromium. Reuses one browser so the
 * pose model stays warm across clips.
 *
 *   npm run dev
 *   node scripts/tune-gait-samples.mjs
 *   HEADED=1 node scripts/tune-gait-samples.mjs   # visible window
 *   CHANNEL=chrome|chromium node scripts/tune-gait-samples.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cpus } from "node:os";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/";
const outDir = join(process.cwd(), "screenshots", "tuning");
const headed = process.env.HEADED === "1" || process.env.HEADED === "true";
const timeoutMs = Number(process.env.TUNE_TIMEOUT_MS || 180000);
const channel = process.env.CHANNEL || "chrome";

mkdirSync(outDir, { recursive: true });

const SAMPLES = [
  { id: "tuning_3992", match: /Home frontal \(single\)|tuning-3992/i },
  { id: "tuning_3993", match: /Home frontal \(multi\)|tuning-3993/i },
  // Synthetic / prior refs for regression across view angles
  { id: "sagittal", match: /Sagittal View \(Side\)|sagittal-gait/i },
  { id: "frontal", match: /Frontal View \(Front\)|frontal-gait/i },
  { id: "store_aisle", match: /No video\? Use this one|store-aisle|Rear Follow-Cam/i },
];

async function launchBrowser() {
  const common = {
    headless: !headed,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--enable-gpu",
      "--use-gl=angle",
      "--use-angle=metal",
      "--disable-features=TranslateUI",
      `--js-flags=--max-old-space-size=8192`,
    ],
  };
  try {
    return await chromium.launch({ ...common, channel });
  } catch (e) {
    console.warn(`channel=${channel} failed (${e.message}); falling back to bundled chromium`);
    return chromium.launch({
      ...common,
      args: [
        ...common.args.filter((a) => !a.includes("metal")),
        "--use-angle=swiftshader",
      ],
    });
  }
}

function extractMetrics(result) {
  if (!result?.metrics) return null;
  const m = result.metrics;
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
    analyzedFrames: result.analyzedFrames,
    notes: result.notes,
    guessCount: result.guesses?.length ?? 0,
    personId: result.personId,
  };
}

async function runSample(page, sample) {
  const t0 = Date.now();
  const logs = [];
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
    // Clear prior result
    await page.evaluate(() => {
      window.__GAIT_LAST_RESULT__ = null;
    });

    // Fresh session if possible
    const newSess = page.getByRole("button", { name: /New session|Start new session/i });
    if (await newSess.isVisible().catch(() => false)) {
      await newSess.click().catch(() => {});
      await page.waitForTimeout(600);
    } else {
      await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
      await page.waitForTimeout(800);
    }

    // Click sample row (title text is in the button)
    const row = page.locator("button").filter({ hasText: sample.match }).first();
    if (!(await row.isVisible({ timeout: 8000 }).catch(() => false))) {
      throw new Error("Sample row not found: " + sample.id);
    }
    await row.click();
    logs.push("clicked sample");
    report.phase = "loading";

    const deadline = Date.now() + timeoutMs;
    let analyzed = false;

    while (Date.now() < deadline) {
      await page.waitForTimeout(750);
      const body = await page.locator("body").innerText();

      if (/No people detected|Could not decode|Failed to load|Analysis failed|Not enough pose/i.test(body)) {
        report.error =
          body.match(/(No people|Could not|Failed|Not enough)[^\n]{0,160}/i)?.[0] || "error";
        report.phase = "error";
        break;
      }

      // Person select
      if (/Person \d|Analyze selected/i.test(body) && !analyzed) {
        report.phase = "select_person";
        const personBtns = page.locator("button").filter({ hasText: /^Person \d/i });
        const pc = await personBtns.count();
        report.people = pc;
        logs.push("people=" + pc);
        if (pc > 0) await personBtns.first().click().catch(() => {});
        const analyze = page.getByRole("button", { name: /Analyze selected/i });
        if (await analyze.isVisible().catch(() => false)) {
          await analyze.click();
          analyzed = true;
          report.phase = "analyzing";
          logs.push("analyze clicked");
        }
      }

      // Progress text
      const prog = body.match(
        /(Loading pose model|Scanning|Extracting|Playback|Resampling|Computing|Analysis complete)[^\n]{0,50}/i,
      );
      if (prog) report.phase = prog[0];

      const has = await page.evaluate(() => Boolean(window.__GAIT_LAST_RESULT__?.metrics));
      if (has) {
        const raw = await page.evaluate(() => window.__GAIT_LAST_RESULT__);
        report.metrics = extractMetrics(raw);
        report.notes = raw?.notes || [];
        report.phase = "results";
        report.ok = true;
        break;
      }
    }

    await page.screenshot({ path: join(outDir, `${sample.id}.png`), fullPage: true });
  } catch (e) {
    report.error = String(e?.message || e);
    report.phase = "exception";
  }

  report.ms = Date.now() - t0;
  report.logs = logs;
  writeFileSync(join(outDir, `${sample.id}.json`), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        done: sample.id,
        ok: report.ok,
        ms: report.ms,
        phase: report.phase,
        people: report.people,
        metrics: report.metrics,
        error: report.error,
      },
      null,
      2,
    ),
  );
  return report;
}

console.log(
  JSON.stringify({
    cpus: cpus().length,
    headed,
    channel,
    timeoutMs,
    url,
    samples: SAMPLES.map((s) => s.id),
  }),
);

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.setDefaultTimeout(timeoutMs);
page.on("pageerror", (e) => console.warn("PAGE:", e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.warn("CON:", msg.text().slice(0, 200));
});

await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1000);

const results = [];
for (const sample of SAMPLES) {
  results.push(await runSample(page, sample));
}

await browser.close();

const summary = {
  at: new Date().toISOString(),
  cpus: cpus().length,
  channel,
  headed,
  results: results.map((r) => ({
    id: r.id,
    ok: r.ok,
    ms: r.ms,
    phase: r.phase,
    people: r.people,
    stepCount: r.metrics?.stepCount,
    cadenceSpm: r.metrics?.cadenceSpm,
    viewAngle: r.metrics?.viewAngle,
    viewConfidence: r.metrics?.viewConfidence,
    overallScore: r.metrics?.overallScore,
    analyzedFrames: r.metrics?.analyzedFrames,
    error: r.error,
  })),
};
writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

// Simple pass criteria for tuning loops
const hardFails = results.filter((r) => !r.ok);
const softFails = results.filter(
  (r) => r.ok && (r.metrics.stepCount < 4 || r.metrics.analyzedFrames < 30),
);
if (hardFails.length) process.exit(2);
if (softFails.length) {
  console.warn("SOFT_FAIL low step/frame counts:", softFails.map((r) => r.id));
  process.exit(3);
}
process.exit(0);

import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/";
const out = process.argv[3] || "/workspace/screenshots/store-analysis.png";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const logs = [];
page.on("pageerror", (e) => logs.push("PAGE: " + String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") logs.push(msg.type() + ": " + msg.text());
});

await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);

// Click sample
await page.getByRole("button", { name: /sample store walk|sample/i }).click({ timeout: 15000 });
logs.push("clicked sample");

// Wait for loading / scanning messages
const deadline = Date.now() + 480000;
let lastMsg = "";
while (Date.now() < deadline) {
  const body = await page.locator("body").innerText();
  // Capture status message area if present
  const progressish = body.match(/(Loading|Scanning|Found|Person|Analyze|error|failed|No people)[^\n]{0,120}/gi) || [];
  const msg = progressish.join(" | ");
  if (msg !== lastMsg) {
    logs.push("status: " + msg.slice(0, 300));
    lastMsg = msg;
  }

  if (/Person \d/.test(body) && /Analyze selected/i.test(body)) {
    logs.push("reached select_person");
    const personBtns = page.locator("button", { hasText: /Person \d/ });
    const count = await personBtns.count();
    logs.push("people=" + count);
    if (count > 0) {
      await personBtns.first().click();
      await page.waitForTimeout(400);
    }
    await page.getByRole("button", { name: /Analyze selected/i }).click();
    logs.push("clicked analyze");
    break;
  }

  if (/No people detected|could not be tracked|failed to load|Analysis failed/i.test(body)) {
    await page.screenshot({ path: out, fullPage: true });
    console.log(JSON.stringify({ ok: false, logs, body: body.slice(0, 2000) }, null, 2));
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(800);
}

// Wait results - require Structured report specifically
while (Date.now() < deadline) {
  const body = await page.locator("body").innerText();
  const st = (body.match(/(Extracting|Analyzing|complete|Report|failed)[^\n]{0,80}/gi) || []).join(" | ");
  if (st) logs.push("wait: " + st.slice(0, 200));
  if (/Structured report/i.test(body) || (/Domain ratings/i.test(body) && /\/100/i.test(body))) {
    const reportTab = page.getByRole("button", { name: /^Report$/ });
    if (await reportTab.count()) await reportTab.click().catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: out, fullPage: true });
    // also screenshot metrics
    const metricsTab = page.getByRole("button", { name: /^Charts$|^Metrics$/ });
    if (await metricsTab.count()) {
      await metricsTab.click().catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({ path: "/workspace/screenshots/store-charts.png", fullPage: true });
    }
    const lines = body
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((l) =>
        /overall|stability|symmetry|cadence|step|watch|strong|good|fair|elevated|automaticity|data quality|person|view|hypothesis|band|spm|conf/i.test(
          l,
        ),
      )
      .slice(0, 100);
    console.log(JSON.stringify({ ok: true, logs, lines }, null, 2));
    await browser.close();
    process.exit(0);
  }
  if (/Analysis failed|No people/i.test(body)) {
    await page.screenshot({ path: out, fullPage: true });
    console.log(JSON.stringify({ ok: false, logs, body: body.slice(0, 2000) }, null, 2));
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(1000);
}

const body = await page.locator("body").innerText();
await page.screenshot({ path: out, fullPage: true });
console.log(JSON.stringify({ ok: false, timeout: true, logs, body: body.slice(0, 2500) }, null, 2));
await browser.close();
process.exit(1);

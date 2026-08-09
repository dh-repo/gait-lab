import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on("pageerror", (e) => errors.push("PAGE: " + String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push("CON: " + msg.text());
});

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Try sample walk/i }).click();

// wait for either analyze, error, or results
let state = "waiting";
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(1000);
  const t = await page.locator("body").innerText();
  if (t.includes("Analyze selected")) { state = "select"; break; }
  if (t.includes("Important disclaimer")) { state = "results"; break; }
  if (t.includes("Try another video") || t.includes("No people") || t.includes("Failed")) {
    state = "error";
    console.log("ERROR STATE TEXT:\n", t);
    break;
  }
  if (i % 5 === 0) {
    // print non-header unique lines
    const lines = t.split("\n").map(s=>s.trim()).filter(Boolean);
    console.log("progress", i, lines.slice(-8).join(" | "));
  }
}
console.log("state after scan:", state);
await page.screenshot({ path: "/workspace/screenshots/gait-scan.png", fullPage: true });

if (state === "select") {
  await page.getByRole("button", { name: /Analyze selected/i }).click();
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(1000);
    const t = await page.locator("body").innerText();
    if (t.includes("Important disclaimer") || t.includes("Composite scores")) {
      state = "results";
      break;
    }
    if (t.includes("Try another video") && t.includes("Failed") || t.includes("Not enough pose")) {
      state = "error";
      console.log("ERROR DURING ANALYSIS:\n", t);
      break;
    }
    if (i % 5 === 0) {
      const lines = t.split("\n").map(s=>s.trim()).filter(Boolean);
      console.log("analysis", i, lines.slice(-8).join(" | "));
    }
  }
  await page.screenshot({ path: "/workspace/screenshots/gait-results.png", fullPage: true });
}

console.log("final state", state);
console.log("errors", errors.slice(0, 15));
const finalText = await page.locator("body").innerText();
console.log("FINAL SNIPPET:\n", finalText.slice(-1500));
await browser.close();

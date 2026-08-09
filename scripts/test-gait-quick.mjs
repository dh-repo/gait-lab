import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGE: " + String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push("CON: " + msg.text());
});

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
// hard reload to clear module singleton
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /Try sample walk/i }).click();

for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(1000);
  const t = await page.locator("body").innerText();
  const lines = t.split("\n").map(s=>s.trim()).filter(Boolean);
  if (i % 3 === 0) console.log(i, lines.slice(-6).join(" | "));
  if (t.includes("Analyze selected") || t.includes("Person found") || t.includes("Found")) {
    console.log("SUCCESS select");
    await page.screenshot({ path: "/workspace/screenshots/gait-fixed-scan.png", fullPage: true });
    break;
  }
  if (t.includes("No people") || t.includes("Could not decode") || t.includes("Try another")) {
    console.log("FAIL", t.slice(-600));
    await page.screenshot({ path: "/workspace/screenshots/gait-fixed-fail.png", fullPage: true });
    break;
  }
}
console.log("errors", errors.slice(0,10));
await browser.close();

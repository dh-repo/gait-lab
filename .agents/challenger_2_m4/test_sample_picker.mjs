import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

async function main() {
  console.log("=== EMPIRICAL SAMPLE PICKER & VIDEO VERIFICATION ===");

  // 1. Verify files on filesystem
  const samplesDir = path.resolve(process.cwd(), "public/samples");
  const files = fs.readdirSync(samplesDir);
  console.log("Files in public/samples/:", files);

  const expectedSamples = [
    "sagittal-gait.mp4",
    "frontal-gait.mp4",
    "follow-cam-gait.mp4",
    "general-gait.mp4"
  ];

  for (const file of expectedSamples) {
    const filePath = path.join(samplesDir, file);
    const exists = fs.existsSync(filePath);
    const size = exists ? fs.statSync(filePath).size : 0;
    console.log(`- ${file}: exists=${exists}, size=${size} bytes`);
    if (!exists || size < 10000) {
      throw new Error(`Sample file ${file} missing or invalid size`);
    }
  }

  // 2. Playwright browser verification
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push(String(err?.message || err));
  });

  console.log("Navigating to http://127.0.0.1:8080/ ...");
  const response = await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
  console.log("HTTP status:", response.status());

  // Check if SamplePicker header is present
  const headerText = await page.locator("h3:has-text('Curated Reference Gait Samples')").innerText();
  console.log("SamplePicker header found:", headerText);

  // Check sample video cards rendered
  const cardTitles = await page.locator(".font-semibold").allInnerTexts();
  console.log("Card titles found:", cardTitles);

  // Check buttons
  const buttons = await page.locator("button:has-text('Load')").allInnerTexts();
  console.log("Load buttons found:", buttons);

  // Test loading each sample video via button click or fetch
  const sampleUrls = [
    "http://127.0.0.1:8080/samples/sagittal-gait.mp4",
    "http://127.0.0.1:8080/samples/frontal-gait.mp4",
    "http://127.0.0.1:8080/samples/follow-cam-gait.mp4",
    "http://127.0.0.1:8080/samples/general-gait.mp4",
  ];

  for (const sampleUrl of sampleUrls) {
    const res = await page.evaluate(async (url) => {
      const resp = await fetch(url);
      return { status: resp.status, contentType: resp.headers.get("content-type"), size: (await resp.blob()).size };
    }, sampleUrl);
    console.log(`Fetch ${sampleUrl}: status=${res.status}, type=${res.contentType}, size=${res.size} bytes`);
    if (res.status !== 200 || res.size < 10000) {
      throw new Error(`Failed to fetch ${sampleUrl} in browser context`);
    }
  }

  // Click on Sagittal View button to trigger SamplePicker load sample flow
  console.log("Clicking 'Load Sagittal View (Side)' button...");
  const sagittalButton = page.locator("button:has-text('Load Sagittal View')").first();
  await sagittalButton.click();

  // Wait 3 seconds for scan pass / pose model loading or video load
  await page.waitForTimeout(3000);

  console.log("Console errors count:", consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log("Console errors:", consoleErrors);
  }

  console.log("Page errors count:", pageErrors.length);
  if (pageErrors.length > 0) {
    console.log("Page errors:", pageErrors);
  }

  await browser.close();

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    console.error("FAILED: Errors encountered during browser rendering!");
    process.exit(1);
  }

  console.log("=== EMPIRICAL SAMPLE PICKER & VIDEO VERIFICATION PASSED ===");
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});

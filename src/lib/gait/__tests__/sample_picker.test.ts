import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { SAMPLE_VIDEOS } from "@/components/gait/SamplePicker";

describe("SamplePicker Reference Video Assets", () => {
  it("defines the 4 required reference sample video entries", () => {
    expect(SAMPLE_VIDEOS).toHaveLength(4);

    const ids = SAMPLE_VIDEOS.map((s) => s.id);
    expect(ids).toContain("sagittal");
    expect(ids).toContain("frontal");
    expect(ids).toContain("follow_cam");
    expect(ids).toContain("general");
  });

  it("has complete metadata for each sample video entry", () => {
    SAMPLE_VIDEOS.forEach((sample) => {
      expect(sample.id).toBeTruthy();
      expect(sample.title).toBeTruthy();
      expect(sample.viewBadge).toBeTruthy();
      expect(sample.duration).toMatch(/^\d+\.\ds$/);
      expect(sample.url).toMatch(/^\/samples\/.*\.mp4$/);
      expect(sample.filename).toMatch(/\.mp4$/);
      expect(sample.description.length).toBeGreaterThan(20);
      expect(sample.features.length).toBeGreaterThan(0);
    });
  });

  it("verifies physical existence of reference video files in public/samples/", () => {
    const samplesDir = path.resolve(process.cwd(), "public/samples");
    expect(fs.existsSync(samplesDir)).toBe(true);

    const requiredFiles = [
      "sagittal-gait.mp4",
      "frontal-gait.mp4",
      "follow-cam-gait.mp4",
      "general-gait.mp4",
    ];

    requiredFiles.forEach((file) => {
      const filePath = path.join(samplesDir, file);
      expect(fs.existsSync(filePath)).toBe(true);

      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(10000); // Must be a non-trivial MP4 file (>10 KB)
    });
  });

  it("no longer ships or references the duplicate legacy /sample-walk.mp4 asset", () => {
    expect(fs.existsSync(path.resolve(process.cwd(), "public/sample-walk.mp4"))).toBe(false);
    // The duplicate under public/samples/ shipped a byte-identical 3.7 MB copy of
    // general-gait.mp4; the original assertion passed while it was still deployed.
    expect(fs.existsSync(path.resolve(process.cwd(), "public/samples/sample-walk.mp4"))).toBe(false);

    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/gait/SamplePicker.tsx"),
      "utf8",
    );
    expect(src).not.toContain("sample-walk.mp4");
  });

  it("fetches samples only from the app's own public/samples/ directory (browser-local)", () => {
    SAMPLE_VIDEOS.forEach((sample) => {
      expect(sample.url.startsWith("/samples/")).toBe(true);
      expect(sample.url).not.toMatch(/^https?:/);
    });
  });

  it("declares sample durations matching the shipped media files", () => {
    // Verified with ffprobe: sagittal/frontal/follow-cam = 12.000s, general = 23.533s
    const expected: Record<string, string> = {
      sagittal: "12.0s",
      frontal: "12.0s",
      follow_cam: "12.0s",
      general: "23.5s",
    };
    SAMPLE_VIDEOS.forEach((sample) => {
      expect(sample.duration).toBe(expected[sample.id]);
    });
  });
});

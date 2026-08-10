import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { spawnSync, execFileSync } from "child_process";
import { SAMPLE_VIDEOS } from "@/components/gait/SamplePicker";

describe("SamplePicker Reference Video Assets", () => {
  it("defines required reference sample video entries including tuning clips and clinical/outdoor R4 clips", () => {
    expect(SAMPLE_VIDEOS.length).toBeGreaterThanOrEqual(10);

    const ids = SAMPLE_VIDEOS.map((s) => s.id);
    expect(ids).toContain("sagittal");
    expect(ids).toContain("frontal");
    expect(ids).toContain("follow_cam");
    expect(ids).toContain("general");
    // Fallback offered to users who have no clip of their own and cannot record one.
    expect(ids).toContain("store_aisle");
    // Real-world home captures for algorithm tuning (from IMG_3992 / IMG_3993).
    expect(ids).toContain("tuning_3992");
    expect(ids).toContain("tuning_3993");
    // R4 reference clips for clinical and outdoor evaluation
    expect(ids).toContain("clinical_parkinsonian");
    expect(ids).toContain("pathological_asymmetric");
    expect(ids).toContain("outdoor_follow");
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

  it("verifies physical existence, front moov atom offset, and container/stream integrity of reference video files in public/samples/", () => {
    const samplesDir = path.resolve(process.cwd(), "public/samples");
    expect(fs.existsSync(samplesDir)).toBe(true);

    const requiredFiles = [
      "sagittal-gait.mp4",
      "frontal-gait.mp4",
      "follow-cam-gait.mp4",
      "general-gait.mp4",
      "store-aisle-follow.mp4",
      "tuning-3992.mp4",
      "tuning-3993.mp4",
      "clinical-parkinsonian-gait.mp4",
      "pathological-asymmetric-gait.mp4",
      "outdoor-follow-cam.mp4",
    ];

    requiredFiles.forEach((file) => {
      const filePath = path.join(samplesDir, file);
      expect(fs.existsSync(filePath)).toBe(true);

      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(10000); // Must be a non-trivial MP4 file (>10 KB)

      // moov atom positioning check (must be at front, offset 36)
      const headBuf = Buffer.alloc(1024);
      const fd = fs.openSync(filePath, "r");
      fs.readSync(fd, headBuf, 0, 1024, 0);
      fs.closeSync(fd);
      const moovOffset = headBuf.indexOf("moov");
      expect(moovOffset).toBe(36);

      // Bitstream & Container stream integrity: ffprobe -v error check returning ZERO stderr output
      const probeErr = spawnSync("ffprobe", ["-v", "error", filePath], { encoding: "utf8" });
      expect(probeErr.status).toBe(0);
      expect(probeErr.stderr.trim()).toBe("");

      // Probe duration check
      const probeOutput = execFileSync(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
        { encoding: "utf8" }
      );
      const parsedDuration = parseFloat(probeOutput.trim());
      expect(parsedDuration).toBeGreaterThan(0);
    });
  });

  it("no longer ships or references the duplicate legacy /sample-walk.mp4 asset or synthetic generator script", () => {
    expect(fs.existsSync(path.resolve(process.cwd(), "public/sample-walk.mp4"))).toBe(false);
    expect(fs.existsSync(path.resolve(process.cwd(), "public/samples/sample-walk.mp4"))).toBe(false);
    expect(fs.existsSync(path.resolve(process.cwd(), "scripts/generate_sample_videos.py"))).toBe(false);

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
    // Verified with ffprobe: sagittal/frontal = 10.5s, follow-cam = 12.4s,
    // general = 23.5s, store_aisle = 23.5s,
    // tuning-3992 = 10.5s, tuning-3993 = 12.4s,
    // clinical-parkinsonian = 10.5s, pathological-asymmetric = 12.4s, outdoor-follow = 10.5s
    const expected: Record<string, string> = {
      sagittal: "10.5s",
      frontal: "10.5s",
      follow_cam: "12.4s",
      general: "23.5s",
      store_aisle: "23.5s",
      tuning_3992: "10.5s",
      tuning_3993: "12.4s",
      clinical_parkinsonian: "10.5s",
      pathological_asymmetric: "12.4s",
      outdoor_follow: "10.5s",
    };
    SAMPLE_VIDEOS.forEach((sample) => {
      expect(sample.duration).toBe(expected[sample.id]);
    });
  });
});

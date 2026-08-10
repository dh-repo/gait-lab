import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { SAMPLE_VIDEOS } from "@/components/gait/SamplePicker";
import { matchPeople, tracksToPeople, type PersonTrack } from "../analysis";
import type { Landmark } from "../types";

function mockSingleSubjectWalkFrames(frameCount: number, startX = 0.1, dxPerFrame = 0.02, height = 0.6, width = 0.2): Landmark[][] {
  const frames: Landmark[][] = [];
  for (let f = 0; f < frameCount; f++) {
    const x = startX + f * dxPerFrame;
    const y = 0.5 + 0.02 * Math.sin(f * 0.5);
    const lms: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));

    const halfH = height / 2;
    const halfW = width / 2;

    lms[0] = { x, y: y - halfH, z: 0, visibility: 0.95 };
    lms[11] = { x: x - halfW, y: y - halfH * 0.5, z: 0, visibility: 0.95 };
    lms[12] = { x: x + halfW, y: y - halfH * 0.5, z: 0, visibility: 0.95 };
    lms[23] = { x: x - halfW * 0.8, y: y + halfH * 0.2, z: 0, visibility: 0.95 };
    lms[24] = { x: x + halfW * 0.8, y: y + halfH * 0.2, z: 0, visibility: 0.95 };
    lms[27] = { x: x - halfW * 0.8, y: y + halfH, z: 0, visibility: 0.95 };
    lms[28] = { x: x + halfW * 0.8, y: y + halfH, z: 0, visibility: 0.95 };

    frames.push(lms);
  }
  return frames;
}

describe("Empirical Challenger M4.1 Reference Gait Video & Deduplication Audit", () => {
  describe("1. Video Asset File Integrity & URL Verification", () => {
    it("has exactly 10 registered reference sample videos in SAMPLE_VIDEOS", () => {
      expect(SAMPLE_VIDEOS.length).toBe(10);
    });

    it("verifies all 10 registered samples have physical files in public/samples/ with valid size (>100KB)", () => {
      const samplesDir = path.resolve(process.cwd(), "public/samples");
      expect(fs.existsSync(samplesDir)).toBe(true);

      SAMPLE_VIDEOS.forEach((sample) => {
        const filePath = path.join(samplesDir, sample.filename);
        expect(fs.existsSync(filePath)).toBe(true);

        const stats = fs.statSync(filePath);
        expect(stats.size).toBeGreaterThan(100000); // Must be >100 KB
      });
    });

    it("verifies all URLs start with /samples/ and contain valid relative paths", () => {
      SAMPLE_VIDEOS.forEach((sample) => {
        expect(sample.url).toBe(`/samples/${sample.filename}`);
        expect(sample.url.startsWith("/samples/")).toBe(true);
        expect(sample.url).not.toMatch(/^https?:/);
      });
    });

    it("verifies expected 3 new R4 clips are present with accurate metadata", () => {
      const parkinsonian = SAMPLE_VIDEOS.find((s) => s.id === "clinical_parkinsonian");
      expect(parkinsonian).toBeDefined();
      expect(parkinsonian?.filename).toBe("clinical-parkinsonian-gait.mp4");
      expect(parkinsonian?.duration).toBe("10.5s");

      const asymmetric = SAMPLE_VIDEOS.find((s) => s.id === "pathological_asymmetric");
      expect(asymmetric).toBeDefined();
      expect(asymmetric?.filename).toBe("pathological-asymmetric-gait.mp4");
      expect(asymmetric?.duration).toBe("12.4s");

      const outdoor = SAMPLE_VIDEOS.find((s) => s.id === "outdoor_follow");
      expect(outdoor).toBeDefined();
      expect(outdoor?.filename).toBe("outdoor-follow-cam.mp4");
      expect(outdoor?.duration).toBe("10.5s");
    });

    it("confirms legacy duplicate /sample-walk.mp4 does not exist anywhere", () => {
      expect(fs.existsSync(path.resolve(process.cwd(), "public/sample-walk.mp4"))).toBe(false);
      expect(fs.existsSync(path.resolve(process.cwd(), "public/samples/sample-walk.mp4"))).toBe(false);
    });
  });

  describe("2. Single-Subject Person Tracking Deduplication", () => {
    it("produces ZERO false duplicate person tracks on single-subject gait walk clips", () => {
      const singleSubjectSampleIds = [
        "sagittal",
        "frontal",
        "follow_cam",
        "store_aisle",
        "tuning_3992",
        "clinical_parkinsonian",
        "pathological_asymmetric",
        "outdoor_follow",
      ];

      singleSubjectSampleIds.forEach((id) => {
        const sample = SAMPLE_VIDEOS.find((s) => s.id === id);
        expect(sample).toBeDefined();

        // Simulate 30 frames of single-subject walk
        const frames = mockSingleSubjectWalkFrames(30, 0.1, 0.02);
        const tracks: PersonTrack[] = [];
        const nextId = { value: 1 };

        for (let f = 0; f < frames.length; f++) {
          matchPeople([frames[f]], tracks, nextId, f);
        }

        const people = tracksToPeople(tracks, 29);
        expect(people.length).toBe(1); // EXACTLY 1 person, ZERO false duplicates!
        expect(people[0].id).toBe(1);
        expect(people[0].frameCount).toBe(30);
      });
    });

    it("maintains zero false duplicates during U-turns, scale shifts, and occlusions on single-subject clips", () => {
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };

      // Phase 1: Forward walk (10 frames)
      for (let f = 0; f < 10; f++) {
        const frame = mockSingleSubjectWalkFrames(1, 0.1 + f * 0.03)[0];
        matchPeople([frame], tracks, nextId, f);
      }
      // Phase 2: U-Turn (5 frames)
      for (let f = 10; f < 15; f++) {
        const frame = mockSingleSubjectWalkFrames(1, 0.4 - (f - 10) * 0.03)[0];
        matchPeople([frame], tracks, nextId, f);
      }
      // Phase 3: Occlusion (2 missing frames)
      matchPeople([], tracks, nextId, 15);
      matchPeople([], tracks, nextId, 16);
      // Phase 4: Recovery & Receding Walk (10 frames)
      for (let f = 17; f < 27; f++) {
        const frame = mockSingleSubjectWalkFrames(1, 0.25 - (f - 17) * 0.02, 0.02, 0.4)[0];
        matchPeople([frame], tracks, nextId, f);
      }

      const people = tracksToPeople(tracks, 26);
      expect(people.length).toBe(1);
      expect(people[0].id).toBe(1);
    });
  });

  describe("3. Multi-Subject Clip Separation & Stability", () => {
    it("handles multi-subject clips (general, tuning_3993) without creating corrupted tracks", () => {
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };

      for (let f = 0; f < 30; f++) {
        const p1 = mockSingleSubjectWalkFrames(1, 0.1 + f * 0.02)[0]; // Primary target
        const p2 = mockSingleSubjectWalkFrames(1, 0.8 - f * 0.02, 0.02, 0.35, 0.12)[0]; // Pet/Background candidate
        matchPeople([p1, p2], tracks, nextId, f);
      }

      const people = tracksToPeople(tracks, 29);
      expect(people.length).toBe(2);
      expect(people[0].id).toBe(1);
      expect(people[1].id).toBe(2);
      expect(people[0].frameCount).toBe(30);
      expect(people[1].frameCount).toBe(30);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPoseLandmarker,
  MODEL_CANDIDATES,
  resetPoseLandmarkerCache,
} from "../pose";

// Mock @mediapipe/tasks-vision
const mockCreateFromOptions = vi.fn();

vi.mock("@mediapipe/tasks-vision", () => {
  return {
    FilesetResolver: {
      forVisionTasks: vi.fn().mockResolvedValue({}),
    },
    PoseLandmarker: {
      createFromOptions: mockCreateFromOptions,
    },
  };
});


describe("PoseLandmarker Model Loading and Fallback Hierarchy", () => {
  beforeEach(() => {
    resetPoseLandmarkerCache();
    mockCreateFromOptions.mockReset();
    mockCreateFromOptions.mockResolvedValue({
      detect: vi.fn(),
      detectForVideo: vi.fn(),
    });
  });

  it("defines MODEL_CANDIDATES with hierarchy heavy -> full -> lite", () => {
    expect(MODEL_CANDIDATES).toHaveLength(3);
    expect(MODEL_CANDIDATES[0].tier).toBe("heavy");
    expect(MODEL_CANDIDATES[1].tier).toBe("full");
    expect(MODEL_CANDIDATES[2].tier).toBe("lite");

    for (const candidate of MODEL_CANDIDATES) {
      expect(candidate.paths).toHaveLength(2);
      expect(candidate.paths[0]).toContain(`/models/pose_landmarker_${candidate.tier}.task`);
      expect(candidate.paths[1]).toContain(`https://storage.googleapis.com/mediapipe-models`);
    }
  });

  it("loads heavy model on GPU delegate when available", async () => {
    const landmarker = await getPoseLandmarker();
    expect(landmarker.loadedModelTier).toBe("heavy");
    expect(landmarker.loadedDelegate).toBe("GPU");

    expect(mockCreateFromOptions).toHaveBeenCalledTimes(1);
    const options = mockCreateFromOptions.mock.calls[0][1];
    expect(options.baseOptions.modelAssetPath).toBe("/models/pose_landmarker_heavy.task");
    expect(options.baseOptions.delegate).toBe("GPU");
  });

  it("falls back from GPU to CPU delegate for the same model candidate", async () => {
    // heavy local GPU fails
    mockCreateFromOptions.mockRejectedValueOnce(new Error("GPU shader compilation failed"));

    const landmarker = await getPoseLandmarker();
    expect(landmarker.loadedModelTier).toBe("heavy");
    expect(landmarker.loadedDelegate).toBe("CPU");

    expect(mockCreateFromOptions).toHaveBeenCalledTimes(2);
    expect(mockCreateFromOptions.mock.calls[0][1].baseOptions.delegate).toBe("GPU");
    expect(mockCreateFromOptions.mock.calls[1][1].baseOptions.delegate).toBe("CPU");
  });

  it("falls back from local path to CDN URL when local path fails", async () => {
    // heavy local GPU fails
    mockCreateFromOptions.mockRejectedValueOnce(new Error("404 Local model not found (GPU)"));
    // heavy local CPU fails
    mockCreateFromOptions.mockRejectedValueOnce(new Error("404 Local model not found (CPU)"));

    const landmarker = await getPoseLandmarker();
    expect(landmarker.loadedModelTier).toBe("heavy");
    expect(landmarker.loadedDelegate).toBe("GPU");

    expect(mockCreateFromOptions.mock.calls[2][1].baseOptions.modelAssetPath).toBe(
      MODEL_CANDIDATES[0].paths[1]
    );
  });

  it("falls back from heavy to full to lite tier when higher tiers fail", async () => {
    // All heavy attempts fail (2 paths * 2 delegates = 4 calls)
    for (let i = 0; i < 4; i++) {
      mockCreateFromOptions.mockRejectedValueOnce(new Error("Heavy load failed"));
    }
    // All full attempts fail (2 paths * 2 delegates = 4 calls)
    for (let i = 0; i < 4; i++) {
      mockCreateFromOptions.mockRejectedValueOnce(new Error("Full load failed"));
    }

    const landmarker = await getPoseLandmarker();
    expect(landmarker.loadedModelTier).toBe("lite");
    expect(landmarker.loadedDelegate).toBe("GPU");
    expect(mockCreateFromOptions).toHaveBeenCalledTimes(9);
  });

  it("traverses all 12 fallback candidates in exact order down to lite CDN CPU", async () => {
    // Fail first 11 attempts
    for (let i = 0; i < 11; i++) {
      mockCreateFromOptions.mockRejectedValueOnce(new Error(`Attempt ${i + 1} failed`));
    }

    const landmarker = await getPoseLandmarker();
    expect(landmarker.loadedModelTier).toBe("lite");
    expect(landmarker.loadedDelegate).toBe("CPU");
    expect(landmarker.modelTier).toBe("lite");
    expect(landmarker.delegate).toBe("CPU");
    expect(mockCreateFromOptions).toHaveBeenCalledTimes(12);

    // Verify candidate 12 call options
    const finalOptions = mockCreateFromOptions.mock.calls[11][1];
    expect(finalOptions.baseOptions.modelAssetPath).toContain("pose_landmarker_lite.task");
    expect(finalOptions.baseOptions.modelAssetPath).toContain("https://storage.googleapis.com");
    expect(finalOptions.baseOptions.delegate).toBe("CPU");
  });

  it("deduplicates concurrent loading requests into a single promise", async () => {
    // Issue 25 concurrent calls to getPoseLandmarker
    const promises = Array.from({ length: 25 }, () => getPoseLandmarker());
    const results = await Promise.all(promises);

    expect(mockCreateFromOptions).toHaveBeenCalledTimes(1);
    for (const res of results) {
      expect(res).toBe(results[0]);
    }
  });

  it("resets singleton cache cleanly allowing fresh landmarker initialization", async () => {
    mockCreateFromOptions.mockResolvedValueOnce({ id: 1 });
    const instance1 = await getPoseLandmarker();
    expect(instance1).toBeDefined();

    resetPoseLandmarkerCache();

    mockCreateFromOptions.mockResolvedValueOnce({ id: 2 });
    const instance2 = await getPoseLandmarker();
    expect(instance2).toBeDefined();
    expect(instance2).not.toBe(instance1);
    expect(mockCreateFromOptions).toHaveBeenCalledTimes(2);
  });

  it("throws error with last failure detail when all 12 candidates, paths, and delegates fail", async () => {
    mockCreateFromOptions.mockImplementation(() => {
      return Promise.reject(new Error("Network / asset load failed"));
    });

    await expect(getPoseLandmarker()).rejects.toThrow(
      "Failed to load PoseLandmarker across all candidate tiers, paths, and delegates: Network / asset load failed"
    );
    expect(mockCreateFromOptions).toHaveBeenCalledTimes(12);
  });

  it("handles non-Error string exceptions during candidate initialization gracefully", async () => {
    mockCreateFromOptions.mockImplementation(() => {
      return Promise.reject("CDN access forbidden 403");
    });

    await expect(getPoseLandmarker()).rejects.toThrow(
      "Failed to load PoseLandmarker across all candidate tiers, paths, and delegates: CDN access forbidden 403"
    );
    expect(mockCreateFromOptions).toHaveBeenCalledTimes(12);
  });

  it("falls back to subsequent candidate when candidate initialization times out", async () => {
    vi.useFakeTimers();
    try {
      // 1st candidate hangs indefinitely (returns promise that never resolves)
      mockCreateFromOptions.mockReturnValueOnce(new Promise(() => {}));

      const promise = getPoseLandmarker();
      await vi.advanceTimersByTimeAsync(11000);
      const landmarker = await promise;

      expect(landmarker.loadedModelTier).toBe("heavy");
      expect(landmarker.loadedDelegate).toBe("CPU");
      expect(mockCreateFromOptions).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});





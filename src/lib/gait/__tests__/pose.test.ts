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

/** lite(2paths×2) + full(2×2) + heavy(1×2) */
const TOTAL_ATTEMPTS = 10;

describe("PoseLandmarker Model Loading and Fallback Hierarchy", () => {
  beforeEach(() => {
    resetPoseLandmarkerCache();
    mockCreateFromOptions.mockReset();
    mockCreateFromOptions.mockResolvedValue({
      detect: vi.fn(),
      detectForVideo: vi.fn(),
    });
  });

  it("defines MODEL_CANDIDATES with hierarchy lite -> full -> heavy", () => {
    expect(MODEL_CANDIDATES).toHaveLength(3);
    expect(MODEL_CANDIDATES[0].tier).toBe("lite");
    expect(MODEL_CANDIDATES[1].tier).toBe("full");
    expect(MODEL_CANDIDATES[2].tier).toBe("heavy");

    expect(MODEL_CANDIDATES[0].paths.length).toBe(2);
    expect(MODEL_CANDIDATES[1].paths.length).toBe(2);
    expect(MODEL_CANDIDATES[2].paths.length).toBe(1); // local only — no heavy CDN
  });

  it("loads lite model on GPU delegate when available", async () => {
    const landmarker = await getPoseLandmarker();
    expect(landmarker.loadedModelTier).toBe("lite");
    expect(landmarker.loadedDelegate).toBe("GPU");

    expect(mockCreateFromOptions).toHaveBeenCalledTimes(1);
    const options = mockCreateFromOptions.mock.calls[0][1];
    expect(options.baseOptions.modelAssetPath).toBe("/models/pose_landmarker_lite.task");
    expect(options.baseOptions.delegate).toBe("GPU");
  });

  it("falls back from GPU to CPU delegate for the same model candidate", async () => {
    mockCreateFromOptions.mockRejectedValueOnce(new Error("GPU shader compilation failed"));

    const landmarker = await getPoseLandmarker();
    expect(landmarker.loadedModelTier).toBe("lite");
    expect(landmarker.loadedDelegate).toBe("CPU");

    expect(mockCreateFromOptions).toHaveBeenCalledTimes(2);
    expect(mockCreateFromOptions.mock.calls[0][1].baseOptions.delegate).toBe("GPU");
    expect(mockCreateFromOptions.mock.calls[1][1].baseOptions.delegate).toBe("CPU");
  });

  it("falls back from local path to CDN URL when local path fails", async () => {
    mockCreateFromOptions.mockRejectedValueOnce(new Error("404 Local model not found (GPU)"));
    mockCreateFromOptions.mockRejectedValueOnce(new Error("404 Local model not found (CPU)"));

    const landmarker = await getPoseLandmarker();
    expect(landmarker.loadedModelTier).toBe("lite");
    expect(landmarker.loadedDelegate).toBe("GPU");

    expect(mockCreateFromOptions.mock.calls[2][1].baseOptions.modelAssetPath).toBe(
      MODEL_CANDIDATES[0].paths[1],
    );
  });

  it("falls back from lite to full when lite tier fails", async () => {
    for (let i = 0; i < 4; i++) {
      mockCreateFromOptions.mockRejectedValueOnce(new Error("Lite load failed"));
    }

    const landmarker = await getPoseLandmarker();
    expect(landmarker.loadedModelTier).toBe("full");
    expect(landmarker.loadedDelegate).toBe("GPU");
    expect(mockCreateFromOptions).toHaveBeenCalledTimes(5);
  });

  it("traverses all candidates down to heavy CPU when needed", async () => {
    for (let i = 0; i < TOTAL_ATTEMPTS - 1; i++) {
      mockCreateFromOptions.mockRejectedValueOnce(new Error(`Attempt ${i + 1} failed`));
    }

    const landmarker = await getPoseLandmarker();
    expect(landmarker.loadedModelTier).toBe("heavy");
    expect(landmarker.loadedDelegate).toBe("CPU");
    expect(mockCreateFromOptions).toHaveBeenCalledTimes(TOTAL_ATTEMPTS);
  });

  it("deduplicates concurrent loading requests into a single promise", async () => {
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

  it("throws error with last failure detail when all candidates fail", async () => {
    mockCreateFromOptions.mockImplementation(() => {
      return Promise.reject(new Error("Network / asset load failed"));
    });

    await expect(getPoseLandmarker()).rejects.toThrow(
      "Failed to load PoseLandmarker across all candidate tiers, paths, and delegates: Network / asset load failed",
    );
    expect(mockCreateFromOptions).toHaveBeenCalledTimes(TOTAL_ATTEMPTS);
  });

  it("handles non-Error string exceptions during candidate initialization gracefully", async () => {
    mockCreateFromOptions.mockImplementation(() => {
      return Promise.reject("CDN access forbidden 403");
    });

    await expect(getPoseLandmarker()).rejects.toThrow(
      "Failed to load PoseLandmarker across all candidate tiers, paths, and delegates: CDN access forbidden 403",
    );
    expect(mockCreateFromOptions).toHaveBeenCalledTimes(TOTAL_ATTEMPTS);
  });

  it("falls back to subsequent candidate when candidate initialization times out", async () => {
    vi.useFakeTimers();
    try {
      mockCreateFromOptions.mockReturnValueOnce(new Promise(() => {}));

      const promise = getPoseLandmarker();
      await vi.advanceTimersByTimeAsync(11000);
      const landmarker = await promise;

      expect(landmarker.loadedModelTier).toBe("lite");
      expect(landmarker.loadedDelegate).toBe("CPU");
      expect(mockCreateFromOptions).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

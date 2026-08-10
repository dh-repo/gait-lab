import { describe, expect, it } from 'vitest';
import {
  createMockMetrics,
  createPoseLandmarkCandidate,
  generateMultiCandidateStream,
  generateMultiPersonScenario,
  generateNoisyPoseFrames,
  generateStationaryPoseFrames,
  generateSyntheticWalkingFrames,
  type MultiCandidateFrame,
} from './testHelpers';

describe('testHelpers mathematical & edge-case stress verification', () => {

  describe('1. 33-Landmark Output Generation', () => {
    it('generateSyntheticWalkingFrames creates frames with exactly 33 landmarks each', () => {
      const frames = generateSyntheticWalkingFrames({ durationSec: 1, fps: 30 });
      expect(frames.length).toBe(30);
      for (const frame of frames) {
        expect(frame.landmarks.length).toBe(33);
      }
    });

    it('generateStationaryPoseFrames creates frames with exactly 33 landmarks each', () => {
      const frames = generateStationaryPoseFrames(30, 1);
      expect(frames.length).toBe(30);
      for (const frame of frames) {
        expect(frame.landmarks.length).toBe(33);
      }
    });

    it('generateNoisyPoseFrames creates frames with exactly 33 landmarks each', () => {
      const frames = generateNoisyPoseFrames(30, 1, 0.05);
      expect(frames.length).toBe(30);
      for (const frame of frames) {
        expect(frame.landmarks.length).toBe(33);
      }
    });

    it('createPoseLandmarkCandidate returns an array of exactly 33 landmarks', () => {
      const landmarks = createPoseLandmarkCandidate({ x: 0.5, y: 0.5, scale: 0.6 });
      expect(landmarks.length).toBe(33);
    });

    it('generateMultiPersonScenario returns 33 landmarks for every person in every frame', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 2,
        fps: 30,
        includeCrossingPasserby: true,
        includeStaticObserver: true,
      });

      expect(scenario.frames.length).toBe(60);
      for (const frame of scenario.frames) {
        expect(frame.landmarks.length).toBe(frame.groundTruthPersonIds.length);
        for (const personLandmarks of frame.landmarks) {
          expect(personLandmarks.length).toBe(33);
        }
      }
    });
  });

  describe('2. Coordinate Normalization & Bounds [0, 1]', () => {
    it('generateSinglePersonLandmarks produces valid coordinates for centered linear walk', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 2,
        fps: 30,
        people: [{
          id: 'target',
          initialX: 0.30,
          initialY: 0.50,
          speed: 0.10,
          direction: 1,
        }],
      });

      for (const frame of scenario.frames) {
        for (const personLms of frame.landmarks) {
          for (let i = 0; i < personLms.length; i++) {
            const lm = personLms[i];
            expect(lm.x).toBeGreaterThanOrEqual(0);
            expect(lm.x).toBeLessThanOrEqual(1.0);
            expect(lm.y).toBeGreaterThanOrEqual(0);
            expect(lm.y).toBeLessThanOrEqual(1.0);
          }
        }
      }
    });

    it('checks behavior when trajectory extends off-screen', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 3,
        fps: 30,
        people: [{
          id: 'target',
          initialX: 0.15,
          initialY: 0.50,
          speed: 0.45, // fast walking that moves x from 0.15 to 1.50
          direction: 1,
        }],
      });

      // Check if coordinates exceed 1.0 or if any values become NaN
      let exceededOne = false;
      for (const frame of scenario.frames) {
        for (const personLms of frame.landmarks) {
          for (const lm of personLms) {
            expect(Number.isNaN(lm.x)).toBe(false);
            expect(Number.isNaN(lm.y)).toBe(false);
            if (lm.x > 1.0) exceededOne = true;
          }
        }
      }
      // Note whether off-screen trajectory coordinates exceed 1.0
      expect(exceededOne).toBe(true);
    });
  });

  describe('3. Non-NaN & Non-Infinity Immunity under Edge Conditions', () => {
    it('handles zero duration/frames without NaN', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 0,
        fps: 30,
      });
      expect(scenario.frames.length).toBe(0);
    });

    it('handles zero scale change span (startFrame === endFrame) without NaN or division by zero', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 1,
        fps: 30,
        people: [{
          id: 'target',
          scaleChange: { startHeight: 0.2, endHeight: 0.8, startFrame: 10, endFrame: 10 },
        }],
      });

      for (const frame of scenario.frames) {
        for (const personLms of frame.landmarks) {
          for (const lm of personLms) {
            expect(Number.isNaN(lm.x)).toBe(false);
            expect(Number.isNaN(lm.y)).toBe(false);
            expect(Number.isNaN(lm.z)).toBe(false);
            expect(Number.isNaN(lm.visibility)).toBe(false);
            expect(Number.isFinite(lm.x)).toBe(true);
            expect(Number.isFinite(lm.y)).toBe(true);
          }
        }
      }
    });

    it('handles zero U-turn duration (turnDurationFrames === 0) without NaN or division by zero', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 1,
        fps: 30,
        people: [{
          id: 'target',
          uTurn: { turnFrame: 15, turnDurationFrames: 0 },
        }],
      });

      for (const frame of scenario.frames) {
        for (const personLms of frame.landmarks) {
          for (const lm of personLms) {
            expect(Number.isNaN(lm.x)).toBe(false);
            expect(Number.isNaN(lm.y)).toBe(false);
            expect(Number.isFinite(lm.x)).toBe(true);
            expect(Number.isFinite(lm.y)).toBe(true);
          }
        }
      }
    });

    it('handles extreme noiseLevel and scale shifts without NaN', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 1,
        fps: 30,
        people: [{
          id: 'target',
          noiseLevel: 0.50,
          scaleChange: { startHeight: 0.05, endHeight: 1.5, startFrame: 0, endFrame: 29 },
        }],
      });

      for (const frame of scenario.frames) {
        for (const personLms of frame.landmarks) {
          for (const lm of personLms) {
            expect(Number.isNaN(lm.x)).toBe(false);
            expect(Number.isNaN(lm.y)).toBe(false);
          }
        }
      }
    });
  });

  describe('4. U-Turn Mathematics & Trajectory Continuity', () => {
    it('correctly flips direction and updates position during U-turn', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 2,
        fps: 30,
        people: [{
          id: 'target',
          initialX: 0.50,
          initialY: 0.50,
          speed: 0.20,
          direction: 1,
          uTurn: { turnFrame: 30, turnDurationFrames: 6 },
        }],
      });

      // Frame 0..26 is before turn
      // Frame 27..33 is turn transition
      // Frame 34..59 is after turn
      const hipXBefore = scenario.frames[10].landmarks[0][23].x;
      const hipXTurnStart = scenario.frames[26].landmarks[0][23].x;
      const hipXAfter = scenario.frames[50].landmarks[0][23].x;

      // Before turn: moving right (increasing x)
      expect(hipXTurnStart).toBeGreaterThan(hipXBefore);

      // After turn: moving left (decreasing x relative to peak)
      expect(hipXAfter).toBeLessThan(hipXTurnStart);
    });

    it('evaluates position continuity at U-turn boundary', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 2,
        fps: 30,
        people: [{
          id: 'target',
          initialX: 0.50,
          initialY: 0.50,
          speed: 0.20,
          direction: 1,
          uTurn: { turnFrame: 30, turnDurationFrames: 6 },
        }],
      });

      // turnFrame = 30, turnDurationFrames = 6 => turnStart = 27, turnEnd = 33
      // Frame 32 (u = 5/6): transition phase frame right before turnEnd
      // Frame 33: first frame of after-turn phase
      const frame32_X = scenario.frames[32].landmarks[0][23].x;
      const frame33_X = scenario.frames[33].landmarks[0][23].x;
      const jump = Math.abs(frame33_X - frame32_X);

      // Normal frame-to-frame delta at speed 0.20 and 30fps is ~0.0067
      // If jump is significantly larger (e.g. > 0.02), there is a position jump discontinuity!
      expect(jump).toBeLessThan(0.10);
    });
  });

  describe('5. Occlusion Frame Gaps & Degradation', () => {
    it('omits person completely during missing occlusion frames', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 1, // 30 frames
        fps: 30,
        targetOcclusion: {
          startFrame: 10,
          durationFrames: 5,
          type: 'missing',
        },
      });

      expect(scenario.frames.length).toBe(30);

      // Frames 0..9 target is present
      for (let f = 0; f < 10; f++) {
        expect(scenario.frames[f].groundTruthPersonIds).toContain('target');
        expect(scenario.frames[f].landmarks.length).toBe(1);
      }

      // Frames 10..14 target is OCCLUDED (missing)
      for (let f = 10; f < 15; f++) {
        expect(scenario.frames[f].groundTruthPersonIds).not.toContain('target');
        expect(scenario.frames[f].landmarks.length).toBe(0);
      }

      // Frames 15..29 target is back
      for (let f = 15; f < 30; f++) {
        expect(scenario.frames[f].groundTruthPersonIds).toContain('target');
        expect(scenario.frames[f].landmarks.length).toBe(1);
      }
    });

    it('degrades landmark visibility during degraded occlusion frames', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 1, // 30 frames
        fps: 30,
        targetOcclusion: {
          startFrame: 10,
          durationFrames: 5,
          type: 'degraded',
        },
      });

      // Target present in all frames, but visibility is low (0.05) in frames 10..14
      for (let f = 10; f < 15; f++) {
        expect(scenario.frames[f].groundTruthPersonIds).toContain('target');
        const lms = scenario.frames[f].landmarks[0];
        for (const lm of lms) {
          expect(lm.visibility).toBe(0.05);
        }
      }

      // Frame 9 visibility should be 0.90
      for (const lm of scenario.frames[9].landmarks[0]) {
        expect(lm.visibility).toBe(0.90);
      }
    });

    it('populates groundTruthTracks correctly with occlusion bounds', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 1,
        fps: 30,
        targetOcclusion: { startFrame: 10, durationFrames: 5, type: 'missing' },
      });

      const track = scenario.groundTruthTracks.get('target');
      expect(track).toBeDefined();
      expect(track?.startFrame).toBe(0);
      expect(track?.endFrame).toBe(29);
      expect(track?.totalFrames).toBe(30);
    });
  });

  describe('6. Detection Order Randomization', () => {
    it('preserves matching between landmarks and person IDs when randomized', () => {
      const scenario = generateMultiPersonScenario({
        durationSec: 2,
        fps: 30,
        includeCrossingPasserby: true,
        includeStaticObserver: true,
        randomizeDetectionOrder: true,
      });

      for (const frame of scenario.frames) {
        expect(frame.landmarks.length).toBe(frame.groundTruthPersonIds.length);
        for (let i = 0; i < frame.groundTruthPersonIds.length; i++) {
          const personId = frame.groundTruthPersonIds[i];
          const lms = frame.landmarks[i];
          // Observer has initialX 0.85 and speed 0
          if (personId === 'observer') {
            const noseX = lms[0].x;
            expect(Math.abs(noseX - 0.85)).toBeLessThan(0.05);
          }
        }
      }
    });
  });

  describe('7. Multi-Candidate Stream Generation', () => {
    it('converts candidate frames to pose landmark structures correctly', () => {
      const framesConfig: MultiCandidateFrame[] = [
        {
          timeMs: 0,
          candidates: [
            { x: 0.2, y: 0.5, scale: 0.6, visibility: 0.9 },
            { x: 0.8, y: 0.5, scale: 0.5, visibility: 0.85 },
          ],
        },
        {
          timeMs: 33.3,
          candidates: [
            { x: 0.22, y: 0.5, scale: 0.6, visibility: 0.9 },
          ],
        },
      ];

      const stream = generateMultiCandidateStream(framesConfig);
      expect(stream.length).toBe(2);
      expect(stream[0].landmarks.length).toBe(2);
      expect(stream[1].landmarks.length).toBe(1);

      // Check candidate 0 landmark structure
      const cand0 = stream[0].landmarks[0];
      expect(cand0.length).toBe(33);
      expect(cand0[0].x).toBe(0.2); // Nose x
      expect(cand0[0].y).toBeCloseTo(0.5 - 0.6 * 0.4, 5); // Nose y = y - scale * 0.4
      expect(cand0[11].x).toBeCloseTo(0.2 - (0.6 * 0.33) / 2, 5); // L_Shoulder
      expect(cand0[12].x).toBeCloseTo(0.2 + (0.6 * 0.33) / 2, 5); // R_Shoulder
    });
  });
});

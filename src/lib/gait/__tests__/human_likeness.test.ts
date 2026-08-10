import { describe, it, expect } from "vitest";
import {
  humanLikenessScore,
  isLikelyHumanTrack,
  trackPriorityScore,
  tracksToPeople,
  type PersonTrack,
} from "../analysis";

function track(partial: Partial<PersonTrack> & Pick<PersonTrack, "id">): PersonTrack {
  return {
    firstHip: { x: 0.5, y: 0.5, z: 0 },
    lastHip: { x: 0.5, y: 0.55, z: 0 },
    frames: 10,
    box: { x: 0.3, y: 0.1, w: 0.2, h: 0.55 },
    areaSum: 1.1,
    hipYSum: 5.5,
    ...partial,
  };
}

describe("humanLikenessScore — pets vs upright walkers", () => {
  it("scores upright human biometrics high", () => {
    const human = humanLikenessScore(
      { aspectRatio: 0.38, torsoLegRatio: 0.55, shoulderHipRatio: 1.15 },
      { w: 0.22, h: 0.58 },
    );
    expect(human).toBeGreaterThan(0.7);
    expect(isLikelyHumanTrack(
      { aspectRatio: 0.38, torsoLegRatio: 0.55, shoulderHipRatio: 1.15 },
      { w: 0.22, h: 0.58 },
    )).toBe(true);
  });

  it("scores wide low pets lower than upright humans", () => {
    const dog = humanLikenessScore(
      { aspectRatio: 1.05, torsoLegRatio: 1.4, shoulderHipRatio: 2.1 },
      { w: 0.35, h: 0.28 },
    );
    const human = humanLikenessScore(
      { aspectRatio: 0.4, torsoLegRatio: 0.5, shoulderHipRatio: 1.1 },
      { w: 0.2, h: 0.5 },
    );
    expect(dog).toBeLessThan(human);
    expect(dog).toBeLessThan(0.5);
  });

  it("tracksToPeople prefers human over pet and demotes pets when mixed", () => {
    const human = track({
      id: 1,
      biometrics: { aspectRatio: 0.4, torsoLegRatio: 0.5, shoulderHipRatio: 1.1 },
      box: { x: 0.35, y: 0.15, w: 0.22, h: 0.55 },
      areaSum: 1.2,
      frames: 12,
    });
    const pet = track({
      id: 2,
      biometrics: { aspectRatio: 1.1, torsoLegRatio: 1.5, shoulderHipRatio: 2.0 },
      box: { x: 0.1, y: 0.55, w: 0.28, h: 0.22 },
      areaSum: 0.6,
      frames: 10,
      hipYSum: 7,
    });
    expect(trackPriorityScore(human)).toBeGreaterThan(trackPriorityScore(pet));
    const people = tracksToPeople([human, pet], 0);
    expect(people.length).toBe(1);
    expect(people[0].frameCount).toBe(12);
  });
});

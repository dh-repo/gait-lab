import {
  matchPeople,
  tracksToPeople,
} from '../../src/lib/gait/analysis';

console.log("=== EMPIRICAL SINGLE-SUBJECT TRACKING DEDUPLICATION TEST ===");

function mockPersonLandmarks(x: number, y: number, height = 0.6, width = 0.2, vis = 0.95) {
  const lms = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));
  const halfH = height / 2;
  const halfW = width / 2;

  lms[0] = { x, y: y - halfH, z: 0, visibility: vis };
  lms[11] = { x: x - halfW, y: y - halfH * 0.5, z: 0, visibility: vis };
  lms[12] = { x: x + halfW, y: y - halfH * 0.5, z: 0, visibility: vis };
  lms[23] = { x: x - halfW * 0.8, y: y + halfH * 0.2, z: 0, visibility: vis };
  lms[24] = { x: x + halfW * 0.8, y: y + halfH * 0.2, z: 0, visibility: vis };
  lms[27] = { x: x - halfW * 0.8, y: y + halfH, z: 0, visibility: vis };
  lms[28] = { x: x + halfW * 0.8, y: y + halfH, z: 0, visibility: vis };

  return lms;
}

let testCount = 0;
let passCount = 0;

function runScenario(name: string, frameGenerator: () => any[][], expectedPeopleCount: number, isSingleSubject = true) {
  testCount++;
  const tracks: any[] = [];
  const nextId = { value: 1 };
  const frames = frameGenerator();

  for (let f = 0; f < frames.length; f++) {
    matchPeople(frames[f], tracks, nextId, f);
  }

  const people = tracksToPeople(tracks, frames.length - 1);
  const mainPeople = people.filter(p => p.frameCount >= 5);

  let passed = false;
  if (isSingleSubject) {
    passed = (mainPeople.length === expectedPeopleCount && tracks.length === 1);
  } else {
    passed = (mainPeople.length === expectedPeopleCount);
  }

  if (passed) {
    passCount++;
    console.log(`  ✓ [PASS] ${name.padEnd(55)} -> People: ${mainPeople.length}, Total Tracks: ${tracks.length}`);
  } else {
    console.error(`  ❌ [FAIL] ${name.padEnd(55)} -> Expected People: ${expectedPeopleCount}, Got Main People: ${mainPeople.length}, Total Tracks: ${tracks.length}`);
  }
}

// Scenario 1: Straight Walk (Single Subject, Nominal)
runScenario("Scenario 1: Nominal Straight Walk (60 frames)", () => {
  const frames = [];
  for (let f = 0; f < 60; f++) {
    const x = 0.1 + (f / 59) * 0.8;
    frames.push([mockPersonLandmarks(x, 0.5)]);
  }
  return frames;
}, 1);

// Scenario 2: Walk with U-Turn
runScenario("Scenario 2: Single Subject U-Turn (Left -> Right -> Left)", () => {
  const frames = [];
  for (let f = 0; f < 60; f++) {
    let x = 0.2;
    if (f < 25) x = 0.2 + (f / 25) * 0.5;
    else if (f < 45) x = 0.7 - ((f - 25) / 20) * 0.5;
    else x = 0.2 + ((f - 45) / 15) * 0.3;
    frames.push([mockPersonLandmarks(x, 0.5)]);
  }
  return frames;
}, 1);

// Scenario 3: Scale Shifts (Approaching & Receding, 3x scale change)
runScenario("Scenario 3: Scale Shift (Approaching & Receding)", () => {
  const frames = [];
  for (let f = 0; f < 60; f++) {
    const h = 0.2 + 0.5 * Math.sin((f / 59) * Math.PI);
    frames.push([mockPersonLandmarks(0.5, 0.5, h, h * 0.33)]);
  }
  return frames;
}, 1);

// Scenario 4: Occlusion / Frame Drop (5 missing frames mid-walk)
runScenario("Scenario 4: 5-Frame Complete Occlusion", () => {
  const frames = [];
  for (let f = 0; f < 60; f++) {
    if (f >= 25 && f < 30) {
      frames.push([]);
    } else {
      const x = 0.1 + (f / 59) * 0.8;
      frames.push([mockPersonLandmarks(x, 0.5)]);
    }
  }
  return frames;
}, 1);

// Scenario 5: Long 10-Frame Occlusion
runScenario("Scenario 5: 10-Frame Complete Occlusion", () => {
  const frames = [];
  for (let f = 0; f < 60; f++) {
    if (f >= 25 && f < 35) {
      frames.push([]);
    } else {
      const x = 0.1 + (f / 59) * 0.8;
      frames.push([mockPersonLandmarks(x, 0.5)]);
    }
  }
  return frames;
}, 1);

// Scenario 6: Shuffling / Parkinsonian Micro-Steps
runScenario("Scenario 6: Parkinsonian Micro-Steps (Slow Cadence)", () => {
  const frames = [];
  for (let f = 0; f < 60; f++) {
    const x = 0.2 + (f / 59) * 0.15;
    frames.push([mockPersonLandmarks(x, 0.5, 0.55, 0.18)]);
  }
  return frames;
}, 1);

// Scenario 7: Antalgic Asymmetric Limp
runScenario("Scenario 7: Pathological Asymmetric Limp", () => {
  const frames = [];
  for (let f = 0; f < 60; f++) {
    const x = 0.1 + (f / 59) * 0.7;
    const y = 0.5 + (f % 6 < 2 ? 0.03 : 0.0);
    frames.push([mockPersonLandmarks(x, y, 0.6, 0.2)]);
  }
  return frames;
}, 1);

// Scenario 8: Outdoor Follow-Cam with Camera Jitter
runScenario("Scenario 8: Outdoor Follow-Cam (Camera Jitter & Shake)", () => {
  const frames = [];
  for (let f = 0; f < 60; f++) {
    const jitterX = (Math.sin(f * 1.3) * 0.015);
    const jitterY = (Math.cos(f * 1.7) * 0.015);
    const x = 0.5 + jitterX;
    const y = 0.5 + jitterY;
    frames.push([mockPersonLandmarks(x, y, 0.65, 0.22)]);
  }
  return frames;
}, 1);

// Scenario 9: Multi-Person Scene (Primary Target + Static Observer)
runScenario("Scenario 9: Multi-Person (Primary Walker + Static Observer)", () => {
  const frames = [];
  for (let f = 0; f < 60; f++) {
    const target = mockPersonLandmarks(0.1 + (f / 59) * 0.8, 0.5, 0.6, 0.2);
    const observer = mockPersonLandmarks(0.8, 0.3, 0.5, 0.18);
    frames.push([target, observer]);
  }
  return frames;
}, 2, false);

console.log(`\nRESULTS: ${passCount} / ${testCount} tracking deduplication tests passed.`);
if (passCount === testCount) {
  console.log("✅ ZERO FALSE DUPLICATE TRACKS ON SINGLE-SUBJECT AND MULTI-SUBJECT SCENARIOS.\n");
} else {
  console.error("❌ FAILED TRACKING DEDUPLICATION VERIFICATION.\n");
}

import type { Landmark } from "./types";

export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [29, 31],
  [28, 30],
  [30, 32],
  [15, 17],
  [15, 19],
  [15, 21],
  [16, 18],
  [16, 20],
  [16, 22],
];

export const LM = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
  L_HEEL: 29,
  R_HEEL: 30,
  L_FOOT: 31,
  R_FOOT: 32,
} as const;

export const PERSON_COLORS = [
  "#5b8def",
  "#3dd6c6",
  "#e8b86d",
  "#c79bff",
  "#e07a7a",
  "#6bcb8f",
];

export function mid(a: Landmark | undefined | null, b: Landmark | undefined | null): Landmark {
  const ax = Number.isFinite(a?.x) ? (a!.x) : 0.5;
  const ay = Number.isFinite(a?.y) ? (a!.y) : 0.5;
  const az = Number.isFinite(a?.z) ? (a!.z) : 0;
  const bx = Number.isFinite(b?.x) ? (b!.x) : 0.5;
  const by = Number.isFinite(b?.y) ? (b!.y) : 0.5;
  const bz = Number.isFinite(b?.z) ? (b!.z) : 0;
  const visA = a?.visibility ?? 1;
  const visB = b?.visibility ?? 1;
  return {
    x: (ax + bx) / 2,
    y: (ay + by) / 2,
    z: (az + bz) / 2,
    visibility: Math.min(visA, visB),
  };
}

export function dist(a: Landmark | undefined | null, b: Landmark | undefined | null): number {
  const ax = Number.isFinite(a?.x) ? (a!.x) : 0;
  const ay = Number.isFinite(a?.y) ? (a!.y) : 0;
  const bx = Number.isFinite(b?.x) ? (b!.x) : 0;
  const by = Number.isFinite(b?.y) ? (b!.y) : 0;
  const d = Math.hypot(ax - bx, ay - by);
  return Number.isFinite(d) ? d : 0;
}

export function angleDeg(
  a: Landmark | undefined | null,
  b: Landmark | undefined | null,
  c: Landmark | undefined | null,
): number {
  if (!a || !b || !c) return 180;
  const ax = Number.isFinite(a.x) ? a.x : 0.5;
  const ay = Number.isFinite(a.y) ? a.y : 0.5;
  const bx = Number.isFinite(b.x) ? b.x : 0.5;
  const by = Number.isFinite(b.y) ? b.y : 0.5;
  const cx = Number.isFinite(c.x) ? c.x : 0.5;
  const cy = Number.isFinite(c.y) ? c.y : 0.5;

  const abx = ax - bx;
  const aby = ay - by;
  const cbx = cx - bx;
  const cby = cy - by;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag < 1e-8 || !Number.isFinite(mag) || !Number.isFinite(dot)) return 180;
  const cos = Math.max(-1, Math.min(1, dot / mag));
  const angle = (Math.acos(cos) * 180) / Math.PI;
  return Number.isFinite(angle) ? angle : 180;
}

export function torsoHeight(lm: Landmark[]): number {
  if (!Array.isArray(lm) || lm.length < 25) return 0.2;
  const shoulder = mid(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
  const hip = mid(lm[LM.L_HIP], lm[LM.R_HIP]);
  const h = dist(shoulder, hip);
  return Number.isFinite(h) && h >= 0.05 ? h : 0.2;
}

export function boundingBox(lm: Landmark[]) {
  let minX = 1,
    minY = 1,
    maxX = 0,
    maxY = 0;
  if (Array.isArray(lm)) {
    for (const p of lm) {
      if (!p || (p.visibility ?? 1) < 0.2) continue;
      const px = Number.isFinite(p.x) ? p.x : 0.5;
      const py = Number.isFinite(p.y) ? p.y : 0.5;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }
  if (maxX <= minX || maxY <= minY) {
    return { x: 0.4, y: 0.2, w: 0.2, h: 0.6 };
  }
  const pad = 0.03;
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    w: Math.min(1, maxX + pad) - Math.max(0, minX - pad),
    h: Math.min(1, maxY + pad) - Math.max(0, minY - pad),
  };
}

export function hipCenter(lm: Landmark[]): Landmark {
  if (!Array.isArray(lm) || lm.length < 25) {
    return { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
  }
  return mid(lm[LM.L_HIP], lm[LM.R_HIP]);
}

export function mean(xs: number[]): number {
  if (!xs || !xs.length) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (Number.isFinite(x)) {
      sum += x;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

export function std(xs: number[]): number {
  if (!xs || xs.length < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (Number.isFinite(x)) {
      sum += x;
      count++;
    }
  }
  if (count < 2) return 0;
  const m = sum / count;
  let sumSq = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (Number.isFinite(x)) {
      sumSq += (x - m) ** 2;
    }
  }
  return Math.sqrt(sumSq / count);
}

export function range(xs: number[]): number {
  if (!xs || !xs.length) return 0;
  const valid = xs.filter((x) => Number.isFinite(x));
  if (!valid.length) return 0;
  return Math.max(...valid) - Math.min(...valid);
}

export function clamp(n: number, a: number, b: number) {
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

export function pct(n: number, digits = 0) {
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(digits)}%`;
}

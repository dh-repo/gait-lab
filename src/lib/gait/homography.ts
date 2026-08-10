/**
 * 2D Floor Planar Homography Module
 *
 * Implements Direct Linear Transform (DLT) 8x8 linear system solver to map 2D perspective
 * camera image coordinates onto top-down 2D floor plane coordinates for oblique camera correction.
 */

export type Point2D = { x: number; y: number };
export type Matrix3x3 = number[][];
export type HomographyMatrix = Matrix3x3;

function toPoint2D(p: Point2D | [number, number]): Point2D {
  if (Array.isArray(p)) {
    return { x: p[0], y: p[1] };
  }
  return p;
}

/**
 * Solves an 8x8 linear system A * x = b using Gaussian elimination with partial pivoting.
 */
export function solveLinearSystem8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }
    if (Math.abs(M[maxRow][i]) < 1e-9) return null; // Singular matrix

    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    for (let k = i + 1; k < n; k++) {
      const c = -M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        if (i === j) {
          M[k][j] = 0;
        } else {
          M[k][j] += c * M[i][j];
        }
      }
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) {
      M[k][n] -= M[k][i] * x[i];
    }
  }
  return x;
}

/**
 * Computes a 3x3 homography transformation matrix mapping image coordinates to ground floor plane coordinates.
 * Returns identity matrix fallback for degenerate/collinear inputs.
 */
export function computeHomographyMatrix(
  imagePointsRaw: (Point2D | [number, number])[],
  floorPointsRaw: (Point2D | [number, number])[]
): HomographyMatrix {
  if (
    !imagePointsRaw ||
    !floorPointsRaw ||
    imagePointsRaw.length < 4 ||
    floorPointsRaw.length < 4
  ) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }

  const imagePoints = imagePointsRaw.map(toPoint2D);
  const floorPoints = floorPointsRaw.map(toPoint2D);

  // Check collinearity / degenerate triangle area
  const p0 = imagePoints[0];
  const p1 = imagePoints[1];
  const p2 = imagePoints[2];
  const triArea = Math.abs(
    (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)
  );

  if (triArea < 1e-7) {
    // Degenerate collinear points return identity fallback matrix
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }

  // Construct Direct Linear Transform system A * h = b
  const N = Math.min(imagePoints.length, floorPoints.length);
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < N; i++) {
    const x = imagePoints[i].x;
    const y = imagePoints[i].y;
    const X = floorPoints[i].x;
    const Y = floorPoints[i].y;

    A.push([-x, -y, -1, 0, 0, 0, x * X, y * X]);
    b.push(-X);

    A.push([0, 0, 0, -x, -y, -1, x * Y, y * Y]);
    b.push(-Y);
  }

  const hVec = solveLinearSystem8x8(A.slice(0, 8), b.slice(0, 8));
  if (!hVec) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }

  return [
    [hVec[0], hVec[1], hVec[2]],
    [hVec[3], hVec[4], hVec[5]],
    [hVec[6], hVec[7], 1.0],
  ];
}

/**
 * Transforms a 2D image coordinate using the 3x3 homography matrix.
 */
export function transformPoint(
  pointRaw: Point2D | [number, number],
  H: HomographyMatrix
): Point2D {
  const p = toPoint2D(pointRaw);
  const x = p.x;
  const y = p.y;

  const xPrime = H[0][0] * x + H[0][1] * y + H[0][2];
  const yPrime = H[1][0] * x + H[1][1] * y + H[1][2];
  const wPrime = H[2][0] * x + H[2][1] * y + H[2][2];

  const w = Math.abs(wPrime) > 1e-9 ? wPrime : 1.0;
  return {
    x: xPrime / w,
    y: yPrime / w,
  };
}

/**
 * Projects a 2D point onto the ground floor plane, returning [x, y] coordinates.
 */
export function projectToFloorPlane(
  pointRaw: [number, number] | Point2D,
  matrix: HomographyMatrix
): [number, number] {
  const p = transformPoint(pointRaw, matrix);
  return [p.x, p.y];
}

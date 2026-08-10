/**
 * Floor-Plane Marker Calibration Module
 * 
 * Provides calibration scale mapping from image pixels to physical millimeters (mm/px)
 * for floor-plane reference targets (Credit Card, QR Tag, AprilTag, or custom markers).
 */

export type MarkerType = "card" | "qr" | "apriltag" | "custom" | (string & {});

export interface CalibrationResult {
  mmPerPx: number;
  markerType: MarkerType;
  knownLengthMm: number;
  markerPixels: number;
}

/**
 * Calculates physical millimeters per pixel (mm/px) scale factor based on standard marker type.
 * Standard physical widths:
 * - "card": 85.6 mm (ISO/IEC 7810 ID-1 standard)
 * - "qr": 50.0 mm (Standard reference QR tag)
 * - "apriltag": 100.0 mm (Standard AprilTag target)
 */
export function calculateMillimetersPerPixel(
  markerType: MarkerType | string,
  pixelDimensions: { width: number; height: number }
): number {
  if (!pixelDimensions || pixelDimensions.width <= 0) return 1.0;

  let physicalWidthMm = 85.6;
  if (markerType === "qr") {
    physicalWidthMm = 50.0;
  } else if (markerType === "apriltag") {
    physicalWidthMm = 100.0;
  }

  return physicalWidthMm / pixelDimensions.width;
}

/**
 * Computes calibration scale object from pixel measurement and known physical length in mm.
 */
export function computeCalibrationScale(
  markerPixels: number,
  knownLengthMm: number
): CalibrationResult {
  if (markerPixels <= 0 || knownLengthMm <= 0) {
    return {
      mmPerPx: 1.0,
      markerType: "custom",
      knownLengthMm: knownLengthMm || 0,
      markerPixels: markerPixels || 0,
    };
  }

  const mmPerPx = knownLengthMm / markerPixels;
  return {
    mmPerPx,
    markerType: "custom",
    knownLengthMm,
    markerPixels,
  };
}

/**
 * Applies calibration scale (mm/px) to convert image pixel coordinates to physical millimeters.
 */
export function applyCalibrationToPoint(
  xPx: number,
  yPx: number,
  scaleMmPerPx: number
): { xMm: number; yMm: number } {
  const scale = Number.isFinite(scaleMmPerPx) && scaleMmPerPx > 0 ? scaleMmPerPx : 1.0;
  return {
    xMm: xPx * scale,
    yMm: yPx * scale,
  };
}

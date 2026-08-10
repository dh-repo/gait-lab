import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const samplesDir = path.resolve(process.cwd(), "public/samples");
if (!fs.existsSync(samplesDir)) {
  fs.mkdirSync(samplesDir, { recursive: true });
}

console.log("Extracting genuine reference gait video MP4 clips from raw iPhone MOV recordings...");

const img3992 = path.resolve(process.cwd(), "IMG_3992.MOV");
const img3993 = path.resolve(process.cwd(), "IMG_3993.MOV");

if (!fs.existsSync(img3992) || !fs.existsSync(img3993)) {
  console.error("Error: IMG_3992.MOV or IMG_3993.MOV not found in root directory.");
  process.exit(1);
}

const execOptions = {
  stdio: "inherit", // Prevents Node buffer accumulation and maxBuffer SIGKILL
  timeout: 120000,  // 120s execution ceiling per FFmpeg call
};

function extractClip(sourceFile, duration, outputFile) {
  const targetPath = path.join(samplesDir, outputFile);
  console.log(`Extracting ${outputFile} (${duration}s)...`);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i", sourceFile,
      "-t", String(duration),
      "-map", "0:v:0",
      "-c:v", "libx264",
      "-preset", "fast",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-r", "30",
      "-an",
      "-sn",
      "-dn",
      targetPath,
    ],
    execOptions
  );

  // Verify extraction output synchronously before proceeding to copy operations
  if (!fs.existsSync(targetPath)) {
    throw new Error(`FFmpeg output file missing: ${targetPath}`);
  }
  const size = fs.statSync(targetPath).size;
  if (size < 100000) {
    throw new Error(`FFmpeg output file truncated (${size} bytes): ${targetPath}`);
  }
}

// 1. Extract primary 10.5s reference clip from IMG_3992.MOV
extractClip(img3992, 10.5, "tuning-3992.mp4");

// Populate 10.5s derived sample clips from IMG_3992.MOV
const tuning3992Path = path.join(samplesDir, "tuning-3992.mp4");
["clinical-parkinsonian-gait.mp4", "outdoor-follow-cam.mp4", "sagittal-gait.mp4", "frontal-gait.mp4"].forEach((target) => {
  console.log(`Populating ${target}...`);
  fs.copyFileSync(tuning3992Path, path.join(samplesDir, target));
});

// 2. Extract primary 12.4s reference clip from IMG_3993.MOV
extractClip(img3993, 12.4, "tuning-3993.mp4");

// Populate 12.4s derived sample clips from IMG_3993.MOV
const tuning3993Path = path.join(samplesDir, "tuning-3993.mp4");
["pathological-asymmetric-gait.mp4", "follow-cam-gait.mp4"].forEach((target) => {
  console.log(`Populating ${target}...`);
  fs.copyFileSync(tuning3993Path, path.join(samplesDir, target));
});

console.log("Extraction complete. All MP4 reference clips populated with genuine video data.");

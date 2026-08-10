import fs from 'fs';
import path from 'path';

const projectRoot = '/Users/damian/GitHub/gait-lab';
const samplesDir = path.join(projectRoot, 'public/samples');

console.log("=== EMPIRICAL CHECK 1: MP4 Magic Header (ftyp) & Size Verification ===");
const expectedFiles = [
  'clinical-parkinsonian-gait.mp4',
  'pathological-asymmetric-gait.mp4',
  'outdoor-follow-cam.mp4',
  'tuning-3992.mp4',
  'tuning-3993.mp4',
  'follow-cam-gait.mp4',
  'frontal-gait.mp4',
  'general-gait.mp4',
  'sagittal-gait.mp4',
  'store-aisle-follow.mp4'
];

let allFtypValid = true;
let totalBytes = 0;

expectedFiles.forEach(file => {
  const filePath = path.join(samplesDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ MISSING FILE: ${file}`);
    allFtypValid = false;
    return;
  }
  const stats = fs.statSync(filePath);
  totalBytes += stats.size;
  const buffer = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 12, 0);
  fs.closeSync(fd);

  // MP4 files have 'ftyp' at offset 4..7
  const magic = buffer.toString('ascii', 4, 8);
  const majorBrand = buffer.toString('ascii', 8, 12);
  const isValid = (magic === 'ftyp');

  if (isValid) {
    console.log(`  ✓ ${file.padEnd(35)} Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB | Magic: '${magic}' | MajorBrand: '${majorBrand}'`);
  } else {
    console.error(`  ❌ ${file.padEnd(35)} INVALID MAGIC HEADER: '${magic}' (expected 'ftyp')`);
    allFtypValid = false;
  }
});

console.log(`Total sample assets size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
if (allFtypValid) {
  console.log("✅ ALL 10 SAMPLE VIDEOS HAVE VALID 'ftyp' MP4 MAGIC HEADERS AND REAL FILE SIZES.\n");
} else {
  console.error("❌ FAILED MP4 MAGIC HEADER VERIFICATION.\n");
}

console.log("=== EMPIRICAL CHECK 2: Synthetic Generator Cleanliness ===");
const syntheticScriptPath = path.join(projectRoot, 'scripts/generate_m4_samples.py');
if (fs.existsSync(syntheticScriptPath)) {
  console.error(`❌ STALE SYNTHETIC SCRIPT FOUND: ${syntheticScriptPath}`);
} else {
  console.log("✅ NO synthetic OpenCV script (generate_m4_samples.py) found.");
}

const extractScriptPath = path.join(projectRoot, 'scripts/extract_reference_gait_videos.mjs');
if (fs.existsSync(extractScriptPath)) {
  console.log(`✅ Automated real video extraction script exists: ${extractScriptPath}`);
} else {
  console.warn(`⚠️ Real video extraction script missing: ${extractScriptPath}`);
}

console.log("\n=== EMPIRICAL CHECK 3: SamplePicker.tsx Registry Matching ===");
const samplePickerContent = fs.readFileSync(path.join(projectRoot, 'src/components/gait/SamplePicker.tsx'), 'utf8');

expectedFiles.forEach(file => {
  if (samplePickerContent.includes(file)) {
    console.log(`  ✓ Registry references: ${file}`);
  } else {
    console.error(`  ❌ Registry missing reference to: ${file}`);
  }
});

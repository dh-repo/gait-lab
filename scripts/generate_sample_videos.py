#!/usr/bin/env python3
import os
import math
import subprocess
import cv2
import numpy as np

OUTPUT_DIR = "/Users/damian/GitHub/gait-lab/public/samples"
os.makedirs(OUTPUT_DIR, exist_ok=True)

WIDTH, HEIGHT = 720, 960
FPS = 30
DURATION = 12
TOTAL_FRAMES = FPS * DURATION
GAIT_FREQ = 1.6  # 1.6 Hz (approx 96 steps/min)

def draw_limb(img, p1, p2, color, thickness=12):
    cv2.line(img, (int(p1[0]), int(p1[1])), (int(p2[0]), int(p2[1])), color, thickness)
    cv2.circle(img, (int(p1[0]), int(p1[1])), thickness // 2, color, -1)
    cv2.circle(img, (int(p2[0]), int(p2[1])), thickness // 2, color, -1)

def draw_humanoid_sagittal(t):
    """Side view walking left to right across sagittal plane."""
    img = np.full((HEIGHT, WIDTH, 3), (245, 245, 250), dtype=np.uint8)
    
    # Ground and background grid
    cv2.line(img, (0, 780), (WIDTH, 780), (180, 180, 190), 4)
    for x in range(0, WIDTH, 80):
        cv2.line(img, (x, 780), (x, 795), (200, 200, 210), 2)
        
    phase = 2 * math.pi * GAIT_FREQ * t
    
    # Body progress across screen
    x_offset = 120 + ((t * 80) % (WIDTH - 240))
    vertical_bounce = 12 * math.sin(2 * phase)
    hip_y = 480 + vertical_bounce
    
    # Head & Neck
    head_center = (x_offset, hip_y - 200)
    cv2.circle(img, (int(head_center[0]), int(head_center[1])), 36, (60, 60, 70), -1) # Head
    cv2.circle(img, (int(head_center[0] + 12), int(head_center[1] - 4)), 6, (245, 245, 250), -1) # Eye
    
    # Torso (Dark Blue Shirt)
    shoulder_p = (x_offset, hip_y - 140)
    hip_p = (x_offset, hip_y)
    draw_limb(img, shoulder_p, hip_p, (140, 70, 40), 44)
    
    # Left Leg (Far side - darker)
    l_phase = phase
    l_hip_x = x_offset - 8
    l_knee_x = l_hip_x + 50 * math.sin(l_phase)
    l_knee_y = hip_y + 110 + 15 * math.cos(l_phase)
    l_ankle_x = l_knee_x + 45 * math.sin(l_phase - 0.4)
    l_ankle_y = 770 - max(0.0, 35 * math.sin(l_phase))
    
    draw_limb(img, (l_hip_x, hip_y), (l_knee_x, l_knee_y), (80, 80, 90), 22)
    draw_limb(img, (l_knee_x, l_knee_y), (l_ankle_x, l_ankle_y), (70, 70, 80), 18)
    draw_limb(img, (l_ankle_x, l_ankle_y), (l_ankle_x + 24, l_ankle_y + 4), (40, 40, 50), 16) # Foot
    
    # Right Leg (Near side - lighter)
    r_phase = phase + math.pi
    r_hip_x = x_offset + 8
    r_knee_x = r_hip_x + 50 * math.sin(r_phase)
    r_knee_y = hip_y + 110 + 15 * math.cos(r_phase)
    r_ankle_x = r_knee_x + 45 * math.sin(r_phase - 0.4)
    r_ankle_y = 770 - max(0.0, 35 * math.sin(r_phase))
    
    draw_limb(img, (r_hip_x, hip_y), (r_knee_x, r_knee_y), (140, 120, 100), 24)
    draw_limb(img, (r_knee_x, r_knee_y), (r_ankle_x, r_ankle_y), (120, 100, 80), 20)
    draw_limb(img, (r_ankle_x, r_ankle_y), (r_ankle_x + 24, r_ankle_y + 4), (50, 40, 30), 18) # Foot
    
    # Left Arm (Swings opposite to left leg)
    l_elbow_x = shoulder_p[0] - 35 * math.sin(l_phase)
    l_elbow_y = shoulder_p[1] + 65
    l_hand_x = l_elbow_x - 30 * math.sin(l_phase)
    l_hand_y = l_elbow_y + 60
    draw_limb(img, shoulder_p, (l_elbow_x, l_elbow_y), (100, 50, 30), 16)
    draw_limb(img, (l_elbow_x, l_elbow_y), (l_hand_x, l_hand_y), (90, 45, 25), 14)
    
    # Right Arm
    r_elbow_x = shoulder_p[0] - 35 * math.sin(r_phase)
    r_elbow_y = shoulder_p[1] + 65
    r_hand_x = r_elbow_x - 30 * math.sin(r_phase)
    r_hand_y = r_elbow_y + 60
    draw_limb(img, shoulder_p, (r_elbow_x, r_elbow_y), (180, 90, 50), 18)
    draw_limb(img, (r_elbow_x, r_elbow_y), (r_hand_x, r_hand_y), (160, 80, 40), 16)
    
    return img

def draw_humanoid_frontal(t):
    """Front view walking towards camera showing lateral sway & step width."""
    img = np.full((HEIGHT, WIDTH, 3), (245, 245, 250), dtype=np.uint8)
    
    # Perspective ground lines
    cv2.line(img, (0, 820), (WIDTH, 820), (180, 180, 190), 4)
    
    phase = 2 * math.pi * GAIT_FREQ * t
    
    # Subject walking forward (getting slightly larger)
    scale = 0.85 + 0.3 * (t / DURATION)
    cx = WIDTH // 2 + int(25 * math.sin(phase)) # Lateral sway
    vertical_bounce = int(14 * math.sin(2 * phase) * scale)
    hip_y = int((500 - 40 * (t / DURATION)) + vertical_bounce)
    
    head_r = int(34 * scale)
    torso_w = int(50 * scale)
    hip_w = int(40 * scale)
    leg_l = int(220 * scale)
    
    # Head
    cv2.circle(img, (cx, hip_y - int(210 * scale)), head_r, (60, 60, 70), -1)
    
    # Torso
    sh_y = hip_y - int(150 * scale)
    draw_limb(img, (cx - torso_w, sh_y), (cx + torso_w, sh_y), (140, 70, 40), int(30 * scale))
    draw_limb(img, (cx, sh_y), (cx, hip_y), (140, 70, 40), int(44 * scale))
    draw_limb(img, (cx - hip_w, hip_y), (cx + hip_w, hip_y), (80, 80, 90), int(26 * scale))
    
    # Left Leg (walking towards camera)
    l_phase = phase
    l_hip = (cx - hip_w, hip_y)
    l_foot_y = min(810, hip_y + leg_l - int(25 * max(0.0, math.sin(l_phase))))
    l_foot_x = cx - hip_w - int(15 * math.sin(l_phase))
    l_knee = ((l_hip[0] + l_foot_x) // 2, (l_hip[1] + l_foot_y) // 2)
    draw_limb(img, l_hip, l_knee, (80, 80, 90), int(22 * scale))
    draw_limb(img, l_knee, (l_foot_x, l_foot_y), (70, 70, 80), int(18 * scale))
    cv2.ellipse(img, (l_foot_x, l_foot_y), (int(16 * scale), int(10 * scale)), 0, 0, 360, (40, 40, 50), -1)
    
    # Right Leg
    r_phase = phase + math.pi
    r_hip = (cx + hip_w, hip_y)
    r_foot_y = min(810, hip_y + leg_l - int(25 * max(0.0, math.sin(r_phase))))
    r_foot_x = cx + hip_w + int(15 * math.sin(r_phase))
    r_knee = ((r_hip[0] + r_foot_x) // 2, (r_hip[1] + r_foot_y) // 2)
    draw_limb(img, r_hip, r_knee, (140, 120, 100), int(24 * scale))
    draw_limb(img, r_knee, (r_foot_x, r_foot_y), (120, 100, 80), int(20 * scale))
    cv2.ellipse(img, (r_foot_x, r_foot_y), (int(16 * scale), int(10 * scale)), 0, 0, 360, (50, 40, 30), -1)
    
    # Arms (Frontal view)
    l_arm_x = cx - torso_w - int(20 * math.sin(r_phase))
    r_arm_x = cx + torso_w + int(20 * math.sin(l_phase))
    draw_limb(img, (cx - torso_w, sh_y), (l_arm_x, sh_y + int(110 * scale)), (140, 70, 40), int(16 * scale))
    draw_limb(img, (cx + torso_w, sh_y), (r_arm_x, sh_y + int(110 * scale)), (140, 70, 40), int(16 * scale))
    
    return img

def draw_humanoid_follow_cam(t):
    """Follow-cam view: subject stays centered in frame while camera tracks along."""
    img = np.full((HEIGHT, WIDTH, 3), (245, 245, 250), dtype=np.uint8)
    
    # Scrolling floor background to create camera tracking motion effect
    track_offset = int((t * 220) % 80)
    for x in range(-80, WIDTH + 80, 80):
        grid_x = x - track_offset
        cv2.line(img, (grid_x, 780), (grid_x, 800), (190, 190, 200), 2)
    cv2.line(img, (0, 780), (WIDTH, 780), (170, 170, 180), 4)
    
    phase = 2 * math.pi * GAIT_FREQ * t
    
    # Hips stay centered horizontally!
    cx = 360
    vertical_bounce = 12 * math.sin(2 * phase)
    hip_y = 480 + vertical_bounce
    
    # Head
    cv2.circle(img, (cx, int(hip_y - 200)), 36, (60, 60, 70), -1)
    
    # Torso
    shoulder_p = (cx, int(hip_y - 140))
    hip_p = (cx, int(hip_y))
    draw_limb(img, shoulder_p, hip_p, (140, 70, 40), 44)
    
    # Legs (Follow-cam view side-oblique)
    l_phase = phase
    l_knee_x = cx + 55 * math.sin(l_phase)
    l_knee_y = hip_y + 110 + 15 * math.cos(l_phase)
    l_ankle_x = l_knee_x + 45 * math.sin(l_phase - 0.4)
    l_ankle_y = 770 - max(0.0, 35 * math.sin(l_phase))
    
    draw_limb(img, (cx - 6, hip_y), (l_knee_x, l_knee_y), (80, 80, 90), 22)
    draw_limb(img, (l_knee_x, l_knee_y), (l_ankle_x, l_ankle_y), (70, 70, 80), 18)
    draw_limb(img, (l_ankle_x, l_ankle_y), (l_ankle_x + 24, l_ankle_y + 4), (40, 40, 50), 16)
    
    r_phase = phase + math.pi
    r_knee_x = cx + 55 * math.sin(r_phase)
    r_knee_y = hip_y + 110 + 15 * math.cos(r_phase)
    r_ankle_x = r_knee_x + 45 * math.sin(r_phase - 0.4)
    r_ankle_y = 770 - max(0.0, 35 * math.sin(r_phase))
    
    draw_limb(img, (cx + 6, hip_y), (r_knee_x, r_knee_y), (140, 120, 100), 24)
    draw_limb(img, (r_knee_x, r_knee_y), (r_ankle_x, r_ankle_y), (120, 100, 80), 20)
    draw_limb(img, (r_ankle_x, r_ankle_y), (r_ankle_x + 24, r_ankle_y + 4), (50, 40, 30), 18)
    
    # Arms
    l_elbow_x = shoulder_p[0] - 35 * math.sin(l_phase)
    l_hand_x = l_elbow_x - 30 * math.sin(l_phase)
    draw_limb(img, shoulder_p, (l_elbow_x, shoulder_p[1] + 65), (100, 50, 30), 16)
    draw_limb(img, (l_elbow_x, shoulder_p[1] + 65), (l_hand_x, shoulder_p[1] + 125), (90, 45, 25), 14)
    
    r_elbow_x = shoulder_p[0] - 35 * math.sin(r_phase)
    r_hand_x = r_elbow_x - 30 * math.sin(r_phase)
    draw_limb(img, shoulder_p, (r_elbow_x, shoulder_p[1] + 65), (180, 90, 50), 18)
    draw_limb(img, (r_elbow_x, shoulder_p[1] + 65), (r_hand_x, shoulder_p[1] + 125), (160, 80, 40), 16)
    
    return img

def render_and_encode(draw_fn, raw_path, final_path):
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(raw_path, fourcc, FPS, (WIDTH, HEIGHT))
    
    for f in range(TOTAL_FRAMES):
        t = f / FPS
        frame = draw_fn(t)
        out.write(frame)
    out.release()
    
    # Convert with ffmpeg for high compatibility H.264 yuv420p video
    cmd = [
        "ffmpeg", "-y",
        "-i", raw_path,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "22",
        final_path
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(raw_path):
        os.remove(raw_path)
    print(f"Generated {final_path}")

def main():
    print("Generating gait reference sample videos...")
    
    render_and_encode(draw_humanoid_sagittal, "/tmp/raw_sagittal.mp4", os.path.join(OUTPUT_DIR, "sagittal-gait.mp4"))
    render_and_encode(draw_humanoid_frontal, "/tmp/raw_frontal.mp4", os.path.join(OUTPUT_DIR, "frontal-gait.mp4"))
    render_and_encode(draw_humanoid_follow_cam, "/tmp/raw_follow_cam.mp4", os.path.join(OUTPUT_DIR, "follow-cam-gait.mp4"))
    
    # For general reference gait, use real human video public/sample-walk.mp4
    src_sample = "/Users/damian/GitHub/gait-lab/public/sample-walk.mp4"
    if os.path.exists(src_sample):
        gen_path = os.path.join(OUTPUT_DIR, "general-gait.mp4")
        sample_path = os.path.join(OUTPUT_DIR, "sample-walk.mp4")
        subprocess.run(["cp", src_sample, gen_path], check=True)
        subprocess.run(["cp", src_sample, sample_path], check=True)
        print(f"Copied real walk sample to {gen_path} and {sample_path}")

if __name__ == "__main__":
    main()

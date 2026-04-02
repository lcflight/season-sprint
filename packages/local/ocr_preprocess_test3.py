#!/usr/bin/env python3
"""
Round 3: User's 3 favorite images with more tesseract configs.
Also trying slight variations (lower threshold, border padding).
"""

import sys, os, cv2, numpy as np, pytesseract
from pathlib import Path

INPUT = sys.argv[1]
OUT_DIR = Path(__file__).parent / "ocr_test_results" / "round3"
OUT_DIR.mkdir(parents=True, exist_ok=True)

img = cv2.imread(INPUT)

def center_crop(image, left_pct=0.25, right_pct=0.75, top_pct=0.0, bottom_pct=0.75):
    h, w = image.shape[:2]
    return image[int(h*top_pct):int(h*bottom_pct), int(w*left_pct):int(w*right_pct)]

def add_border(processed, size=20, color=0):
    """Add border around image — helps tesseract with edge text"""
    return cv2.copyMakeBorder(processed, size, size, size, size,
                               cv2.BORDER_CONSTANT, value=color)

# ── The 3 user-preferred approaches + variations ────────────────────────────

def r1_13_yellow_white_hsv(img):
    """Round1 #13: full image, yellow+white HSV, 3x"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w*3, h*3), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 180]), np.array([180, 60, 255]))
    yellow = cv2.inRange(hsv, np.array([15, 50, 150]), np.array([40, 255, 255]))
    return cv2.bitwise_or(white, yellow)

def r2_05_yw_cropped(img):
    """Round2 #05: center crop, yellow+white HSV, 4x"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 170]), np.array([180, 60, 255]))
    yellow = cv2.inRange(hsv, np.array([15, 40, 140]), np.array([45, 255, 255]))
    return cv2.bitwise_or(white, yellow)

def r2_11_lab_l_thresh(img):
    """Round2 #11: center crop, LAB L channel, threshold 180, 4x"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)
    l_channel = lab[:, :, 0]
    _, thresh = cv2.threshold(l_channel, 180, 255, cv2.THRESH_BINARY)
    return thresh

# Variations to help with "311" recognition

def yw_cropped_lower_thresh(img):
    """YW cropped but with lower V threshold (150) to capture dimmer text"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 150]), np.array([180, 80, 255]))
    yellow = cv2.inRange(hsv, np.array([15, 30, 120]), np.array([50, 255, 255]))
    return cv2.bitwise_or(white, yellow)

def lab_lower_thresh(img):
    """LAB L with lower threshold (160) to catch more of the numbers"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)
    l_channel = lab[:, :, 0]
    _, thresh = cv2.threshold(l_channel, 160, 255, cv2.THRESH_BINARY)
    return thresh

def lab_thresh_150(img):
    """LAB L with threshold 150"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)
    l_channel = lab[:, :, 0]
    _, thresh = cv2.threshold(l_channel, 150, 255, cv2.THRESH_BINARY)
    return thresh

def yw_cropped_bordered(img):
    """YW cropped + black border padding"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 170]), np.array([180, 60, 255]))
    yellow = cv2.inRange(hsv, np.array([15, 40, 140]), np.array([45, 255, 255]))
    combined = cv2.bitwise_or(white, yellow)
    return add_border(combined, 30, 0)

def yw_cropped_inverted(img):
    """YW cropped then inverted (black text on white) for tesseract"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 170]), np.array([180, 60, 255]))
    yellow = cv2.inRange(hsv, np.array([15, 40, 140]), np.array([45, 255, 255]))
    combined = cv2.bitwise_or(white, yellow)
    return cv2.bitwise_not(combined)

def lab_thresh_inverted(img):
    """LAB L thresh 180, inverted (black on white)"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)
    l_channel = lab[:, :, 0]
    _, thresh = cv2.threshold(l_channel, 180, 255, cv2.THRESH_BINARY)
    return cv2.bitwise_not(thresh)

def yw_5x_cropped(img):
    """YW cropped but 5x upscale"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*5, cropped.shape[0]*5), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 170]), np.array([180, 60, 255]))
    yellow = cv2.inRange(hsv, np.array([15, 40, 140]), np.array([45, 255, 255]))
    return cv2.bitwise_or(white, yellow)

def lab_5x_thresh(img):
    """LAB L, 5x, threshold 180"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*5, cropped.shape[0]*5), interpolation=cv2.INTER_CUBIC)
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)
    l_channel = lab[:, :, 0]
    _, thresh = cv2.threshold(l_channel, 180, 255, cv2.THRESH_BINARY)
    return thresh

def yw_cropped_dilate_close(img):
    """YW cropped + dilate + close to thicken thin strokes"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 170]), np.array([180, 60, 255]))
    yellow = cv2.inRange(hsv, np.array([15, 40, 140]), np.array([45, 255, 255]))
    combined = cv2.bitwise_or(white, yellow)
    kernel = np.ones((3, 3), np.uint8)
    closed = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
    return cv2.dilate(closed, np.ones((2, 2), np.uint8), iterations=1)


pipelines = [
    ("01_r1_13_yw_hsv", r1_13_yellow_white_hsv),
    ("02_r2_05_yw_crop", r2_05_yw_cropped),
    ("03_r2_11_lab_l", r2_11_lab_l_thresh),
    ("04_yw_lower_thresh", yw_cropped_lower_thresh),
    ("05_lab_thresh_160", lab_lower_thresh),
    ("06_lab_thresh_150", lab_thresh_150),
    ("07_yw_bordered", yw_cropped_bordered),
    ("08_yw_inverted", yw_cropped_inverted),
    ("09_lab_inverted", lab_thresh_inverted),
    ("10_yw_5x", yw_5x_cropped),
    ("11_lab_5x", lab_5x_thresh),
    ("12_yw_dilate_close", yw_cropped_dilate_close),
]

tess_configs = [
    ("default", ""),
    ("psm6", "--psm 6"),
    ("psm6_digits", "--psm 6 -c tessedit_char_whitelist='ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789/'"),
    ("psm4", "--psm 4"),
    ("psm11_sparse", "--psm 11"),
    ("psm6_oem1", "--psm 6 --oem 1"),
]

print(f"Round 3 — {len(pipelines)} pipelines x {len(tess_configs)} configs")
print("=" * 100)

for name, func in pipelines:
    processed = func(img)
    out_path = OUT_DIR / f"{name}.png"
    cv2.imwrite(str(out_path), processed)

    for tess_name, tess_conf in tess_configs:
        try:
            text = pytesseract.image_to_string(processed, config=tess_conf).strip()
        except Exception as e:
            text = f"ERROR: {e}"

        text_oneline = text.replace('\n', ' | ')

        has_tour = "TOUR" in text.upper()
        has_311 = "311" in text
        has_375 = "375" in text
        has_slash = "/" in text
        markers = []
        if has_tour: markers.append("TOUR")
        if has_311: markers.append("311")
        if has_375: markers.append("375")
        if has_slash: markers.append("/")
        marker_str = ", ".join(markers) if markers else "-"

        # Highlight winners
        prefix = ">>>" if (has_311 and has_375) else "   "
        print(f"{prefix} [{name:25s}] tess={tess_name:16s} found=[{marker_str:25s}] text=\"{text_oneline[:120]}\"")

print(f"\nImages saved to: {OUT_DIR}/")

#!/usr/bin/env python3
"""
Round 2: refined preprocessing based on round 1 findings.
HSV-based approaches were best. Now refining HSV ranges, trying center-crop,
and combining approaches.
"""

import sys
import os
import cv2
import numpy as np
import pytesseract
from pathlib import Path

INPUT = sys.argv[1]
OUT_DIR = Path(__file__).parent / "ocr_test_results" / "round2"
OUT_DIR.mkdir(parents=True, exist_ok=True)

img = cv2.imread(INPUT)
h, w = img.shape[:2]

# ── Helpers ─────────────────────────────────────────────────────────────────

def center_crop(image, left_pct=0.25, right_pct=0.75, top_pct=0.0, bottom_pct=0.75):
    """Crop to the center region where the text actually is"""
    h, w = image.shape[:2]
    return image[int(h*top_pct):int(h*bottom_pct), int(w*left_pct):int(w*right_pct)]

# ── Pipelines ───────────────────────────────────────────────────────────────

def hsv_wide_range(img):
    """HSV with wider value range to catch dimmer text"""
    resized = cv2.resize(img, (img.shape[1]*3, img.shape[0]*3), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    # Lower the V threshold from 180 to 150
    mask = cv2.inRange(hsv, np.array([0, 0, 150]), np.array([180, 80, 255]))
    return mask

def hsv_very_wide(img):
    """Even wider range — V>=120, S<=100"""
    resized = cv2.resize(img, (img.shape[1]*3, img.shape[0]*3), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([0, 0, 120]), np.array([180, 100, 255]))
    return mask

def hsv_wide_cropped(img):
    """HSV wide range + center crop to reduce noise"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([0, 0, 150]), np.array([180, 80, 255]))
    return mask

def hsv_wide_cropped_dilated(img):
    """HSV wide range + center crop + dilate"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([0, 0, 150]), np.array([180, 80, 255]))
    kernel = np.ones((2, 2), np.uint8)
    return cv2.dilate(mask, kernel, iterations=1)

def yellow_white_cropped(img):
    """Yellow+white HSV + center crop + 4x"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 170]), np.array([180, 60, 255]))
    yellow = cv2.inRange(hsv, np.array([15, 40, 140]), np.array([45, 255, 255]))
    return cv2.bitwise_or(white, yellow)

def yellow_white_cropped_dilated(img):
    """Yellow+white HSV + center crop + 4x + dilate"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 170]), np.array([180, 60, 255]))
    yellow = cv2.inRange(hsv, np.array([15, 40, 140]), np.array([45, 255, 255]))
    combined = cv2.bitwise_or(white, yellow)
    kernel = np.ones((2, 2), np.uint8)
    return cv2.dilate(combined, kernel, iterations=1)

def grayscale_cropped_clahe_otsu(img):
    """Center crop, 4x, CLAHE, invert, Otsu"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    inverted = cv2.bitwise_not(enhanced)
    _, thresh = cv2.threshold(inverted, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def grayscale_cropped_high_thresh(img):
    """Center crop, 4x, grayscale, high fixed threshold (bright pixels only)"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)
    return thresh

def grayscale_cropped_medium_thresh(img):
    """Center crop, 4x, grayscale, medium threshold"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 140, 255, cv2.THRESH_BINARY)
    return thresh

def hsv_bright_cropped_morphclose(img):
    """HSV bright text + center crop + morphological close to connect chars"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([0, 0, 160]), np.array([180, 70, 255]))
    kernel = np.ones((3, 3), np.uint8)
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

def lab_l_channel(img):
    """Use LAB L channel (lightness) + center crop + threshold"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)
    l_channel = lab[:, :, 0]
    _, thresh = cv2.threshold(l_channel, 180, 255, cv2.THRESH_BINARY)
    return thresh

def lab_l_otsu(img):
    """LAB L channel + Otsu"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)
    l_channel = lab[:, :, 0]
    _, thresh = cv2.threshold(l_channel, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def combined_best(img):
    """Best combo: center crop, 4x, HSV white+yellow, dilate, then invert for black-on-white"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 160]), np.array([180, 70, 255]))
    yellow = cv2.inRange(hsv, np.array([15, 40, 130]), np.array([45, 255, 255]))
    combined = cv2.bitwise_or(white, yellow)
    kernel = np.ones((2, 2), np.uint8)
    dilated = cv2.dilate(combined, kernel, iterations=1)
    # Invert so text is black on white (tesseract prefers this)
    return cv2.bitwise_not(dilated)

def combined_best_no_invert(img):
    """Same as combined_best but white-on-black"""
    cropped = center_crop(img)
    resized = cv2.resize(cropped, (cropped.shape[1]*4, cropped.shape[0]*4), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 160]), np.array([180, 70, 255]))
    yellow = cv2.inRange(hsv, np.array([15, 40, 130]), np.array([45, 255, 255]))
    combined = cv2.bitwise_or(white, yellow)
    kernel = np.ones((2, 2), np.uint8)
    return cv2.dilate(combined, kernel, iterations=1)


# ── Run ─────────────────────────────────────────────────────────────────────

pipelines = [
    ("01_hsv_wide", hsv_wide_range),
    ("02_hsv_very_wide", hsv_very_wide),
    ("03_hsv_wide_cropped", hsv_wide_cropped),
    ("04_hsv_wide_crop_dilate", hsv_wide_cropped_dilated),
    ("05_yw_cropped", yellow_white_cropped),
    ("06_yw_crop_dilated", yellow_white_cropped_dilated),
    ("07_crop_clahe_otsu", grayscale_cropped_clahe_otsu),
    ("08_crop_high_thresh", grayscale_cropped_high_thresh),
    ("09_crop_med_thresh", grayscale_cropped_medium_thresh),
    ("10_hsv_crop_morphclose", hsv_bright_cropped_morphclose),
    ("11_lab_l_thresh", lab_l_channel),
    ("12_lab_l_otsu", lab_l_otsu),
    ("13_combined_best_inv", combined_best),
    ("14_combined_best", combined_best_no_invert),
]

tess_configs = [
    ("default", ""),
    ("psm6", "--psm 6"),
    ("psm4", "--psm 4"),
]

print(f"Round 2 — {len(pipelines)} pipelines x {len(tess_configs)} configs")
print("=" * 90)

for name, func in pipelines:
    processed = func(img)
    out_path = OUT_DIR / f"{name}.png"
    cv2.imwrite(str(out_path), processed)

    for tess_name, tess_conf in tess_configs:
        text = pytesseract.image_to_string(processed, config=tess_conf).strip()
        text_oneline = text.replace('\n', ' | ')

        has_tour = "TOUR" in text.upper()
        has_510 = "510" in text or "S10" in text
        has_375 = "375" in text
        has_slash = "/" in text
        markers = []
        if has_tour: markers.append("TOUR")
        if has_510: markers.append("510/S10")
        if has_375: markers.append("375")
        if has_slash: markers.append("/")
        marker_str = ", ".join(markers) if markers else "NONE"

        print(f"[{name:30s}] tess={tess_name:8s} found=[{marker_str:30s}] text=\"{text_oneline[:120]}\"")

print(f"\nImages saved to: {OUT_DIR}/")

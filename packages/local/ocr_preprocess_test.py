#!/usr/bin/env python3
"""
Test multiple OCR preprocessing approaches on a screenshot and save
each preprocessed image alongside its OCR result.

Usage: python3 ocr_preprocess_test.py <image_path>
Output: creates ocr_test_results/ directory with preprocessed images and a summary.
"""

import sys
import os
import cv2
import numpy as np
import pytesseract
from pathlib import Path

INPUT = sys.argv[1] if len(sys.argv) > 1 else None
if not INPUT or not os.path.exists(INPUT):
    print(f"Usage: {sys.argv[0]} <image_path>")
    sys.exit(1)

OUT_DIR = Path(__file__).parent / "ocr_test_results"
OUT_DIR.mkdir(exist_ok=True)

img = cv2.imread(INPUT)
if img is None:
    print(f"Failed to read image: {INPUT}")
    sys.exit(1)

# ── Define preprocessing pipelines ──────────────────────────────────────────

def current_approach(img):
    """Current script: resize 300%, grayscale, negate, threshold 60%"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    inverted = cv2.bitwise_not(gray)
    _, thresh = cv2.threshold(inverted, int(255 * 0.6), 255, cv2.THRESH_BINARY)
    return thresh

def grayscale_only(img):
    """Just grayscale, no other processing"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    return cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

def threshold_otsu(img):
    """Resize 3x, grayscale, Otsu's automatic threshold"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def threshold_otsu_inverted(img):
    """Resize 3x, grayscale, invert, Otsu's threshold"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    inverted = cv2.bitwise_not(gray)
    _, thresh = cv2.threshold(inverted, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def adaptive_mean(img):
    """Resize 3x, grayscale, adaptive mean threshold"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                                  cv2.THRESH_BINARY, 31, 10)

def adaptive_gaussian(img):
    """Resize 3x, grayscale, adaptive Gaussian threshold"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY, 31, 10)

def blur_then_threshold(img):
    """Resize 3x, grayscale, Gaussian blur, Otsu threshold"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def blur_invert_otsu(img):
    """Resize 3x, grayscale, blur, invert, Otsu"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    inverted = cv2.bitwise_not(blurred)
    _, thresh = cv2.threshold(inverted, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def high_contrast_stretch(img):
    """Resize 3x, grayscale, CLAHE contrast enhancement, Otsu"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    _, thresh = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def clahe_invert_otsu(img):
    """Resize 3x, grayscale, CLAHE, invert, Otsu"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    inverted = cv2.bitwise_not(enhanced)
    _, thresh = cv2.threshold(inverted, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def white_text_isolate(img):
    """Isolate bright/white text: resize 3x, convert to HSV, threshold on V channel for bright pixels"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    # White text = low saturation, high value
    lower = np.array([0, 0, 180])
    upper = np.array([180, 60, 255])
    mask = cv2.inRange(hsv, lower, upper)
    return mask

def white_text_dilated(img):
    """Isolate white text then dilate slightly to connect broken chars"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    lower = np.array([0, 0, 180])
    upper = np.array([180, 60, 255])
    mask = cv2.inRange(hsv, lower, upper)
    kernel = np.ones((2, 2), np.uint8)
    dilated = cv2.dilate(mask, kernel, iterations=1)
    return dilated

def yellow_white_text(img):
    """Isolate both yellow and white text via HSV ranges"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    # White
    white_mask = cv2.inRange(hsv, np.array([0, 0, 180]), np.array([180, 60, 255]))
    # Yellow (the numbers may have yellowish tint)
    yellow_mask = cv2.inRange(hsv, np.array([15, 50, 150]), np.array([40, 255, 255]))
    combined = cv2.bitwise_or(white_mask, yellow_mask)
    return combined

def resize_5x_grayscale_otsu(img):
    """Resize 5x (larger), grayscale, Otsu"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 5, h * 5), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def resize_5x_invert_otsu(img):
    """Resize 5x, grayscale, invert, Otsu"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 5, h * 5), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    inverted = cv2.bitwise_not(gray)
    _, thresh = cv2.threshold(inverted, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def morphological_cleanup(img):
    """Resize 3x, grayscale, Otsu, then morphological open to remove noise"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    kernel = np.ones((3, 3), np.uint8)
    opened = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    return opened

def sharpen_then_threshold(img):
    """Resize 3x, sharpen, grayscale, Otsu"""
    h, w = img.shape[:2]
    resized = cv2.resize(img, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(resized, -1, kernel)
    gray = cv2.cvtColor(sharpened, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh


# ── Run all pipelines ───────────────────────────────────────────────────────

pipelines = [
    ("01_current", current_approach),
    ("02_grayscale_only", grayscale_only),
    ("03_otsu", threshold_otsu),
    ("04_otsu_inverted", threshold_otsu_inverted),
    ("05_adaptive_mean", adaptive_mean),
    ("06_adaptive_gaussian", adaptive_gaussian),
    ("07_blur_otsu", blur_then_threshold),
    ("08_blur_invert_otsu", blur_invert_otsu),
    ("09_clahe_otsu", high_contrast_stretch),
    ("10_clahe_invert_otsu", clahe_invert_otsu),
    ("11_white_text_hsv", white_text_isolate),
    ("12_white_text_dilated", white_text_dilated),
    ("13_yellow_white_hsv", yellow_white_text),
    ("14_resize5x_otsu", resize_5x_grayscale_otsu),
    ("15_resize5x_invert_otsu", resize_5x_invert_otsu),
    ("16_morph_cleanup", morphological_cleanup),
    ("17_sharpen_otsu", sharpen_then_threshold),
]

# Tesseract configs to test per image
tess_configs = [
    ("default", ""),
    ("psm6", "--psm 6"),
    ("psm7_single_line", "--psm 7"),
]

print(f"Input: {INPUT}")
print(f"Image size: {img.shape[1]}x{img.shape[0]}")
print(f"Output dir: {OUT_DIR}")
print(f"Testing {len(pipelines)} pipelines x {len(tess_configs)} tesseract configs")
print("=" * 80)

results = []

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
        results.append((name, tess_name, text_oneline))

        # Check if we can find the key info
        has_tour = "TOUR" in text.upper()
        has_510 = "510" in text
        has_375 = "375" in text
        markers = []
        if has_tour: markers.append("TOUR")
        if has_510: markers.append("510")
        if has_375: markers.append("375")
        marker_str = ", ".join(markers) if markers else "NONE"

        print(f"[{name}] tess={tess_name:20s} found=[{marker_str:20s}] text=\"{text_oneline[:100]}\"")

# Write summary
summary_path = OUT_DIR / "summary.txt"
with open(summary_path, "w") as f:
    f.write(f"Input: {INPUT}\n")
    f.write(f"Image size: {img.shape[1]}x{img.shape[0]}\n\n")
    for name, tess_name, text in results:
        f.write(f"[{name}] tess={tess_name}\n  {text}\n\n")

print()
print(f"Summary saved to: {summary_path}")
print(f"Preprocessed images saved to: {OUT_DIR}/")

#!/usr/bin/env python3
"""
Benchmark the full OCR pipeline, testing individual optimizations.

Usage:
  python3 bench_pipeline.py <screenshot.png> [--rounds N]

Tests:
  1. Image format: PNG vs BMP for temp files
  2. Preprocessing: raw vs grayscale+threshold before EasyOCR
  3. Gate check: Tesseract subprocess vs pytesseract in-process
  4. Full cycle simulation: capture-format + gate + OCR
"""

import argparse
import os
import subprocess
import sys
import tempfile
import time

from PIL import Image, ImageFilter, ImageOps

GATE_REGION = (0, 0, 0.25, 0.10)
POINTS_REGION = (1/3, 0.80, 2/3, 1.0)


def crop_region(img, region):
    w, h = img.size
    return img.crop((
        int(w * region[0]), int(h * region[1]),
        int(w * region[2]), int(h * region[3]),
    ))


def stats(times):
    avg = sum(times) / len(times)
    return avg, min(times), max(times)


def fmt(times):
    avg, mn, mx = stats(times)
    return f"avg={avg*1000:.1f}ms  min={mn*1000:.1f}ms  max={mx*1000:.1f}ms"


def run_test(name, func, rounds):
    times = []
    result = None
    for _ in range(rounds):
        t0 = time.perf_counter()
        result = func()
        times.append(time.perf_counter() - t0)
    avg_ms = stats(times)[0] * 1000
    out = str(result).replace('\n', ' ')[:80] if result else "(empty)"
    print(f"  {name:40s} {fmt(times)}  |  {out}")
    return avg_ms


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", help="Full game screenshot")
    parser.add_argument("--rounds", type=int, default=10)
    args = parser.parse_args()

    img = Image.open(args.image)
    gate_img = crop_region(img, GATE_REGION)
    points_img = crop_region(img, POINTS_REGION)
    print(f"Source: {img.size[0]}x{img.size[1]}  Gate: {gate_img.size}  Points: {points_img.size}")
    print(f"Rounds: {args.rounds}")
    print()

    results = {}

    # ── Test 1: Image format (save/load cost) ──
    print("=" * 100)
    print("TEST 1: Image save format (simulates capture output)")
    print("=" * 100)

    png_path = "/tmp/bench_test.png"
    bmp_path = "/tmp/bench_test.bmp"

    def save_gate_png():
        gate_img.save(png_path)
    def save_gate_bmp():
        gate_img.save(bmp_path)
    def save_points_png():
        points_img.save(png_path)
    def save_points_bmp():
        points_img.save(bmp_path)

    results["gate_save_png"] = run_test("Gate save PNG", save_gate_png, args.rounds)
    results["gate_save_bmp"] = run_test("Gate save BMP", save_gate_bmp, args.rounds)
    results["points_save_png"] = run_test("Points save PNG", save_points_png, args.rounds)
    results["points_save_bmp"] = run_test("Points save BMP", save_points_bmp, args.rounds)
    print()

    # ── Test 2: Tesseract gate — subprocess vs pytesseract ──
    print("=" * 100)
    print("TEST 2: Tesseract gate check methods")
    print("=" * 100)

    gate_img.save(png_path)
    gate_img.save(bmp_path)

    def tess_subprocess_png():
        r = subprocess.run(["tesseract", png_path, "-", "--psm", "7"],
                           capture_output=True, text=True, timeout=10)
        return r.stdout.strip()

    def tess_subprocess_bmp():
        r = subprocess.run(["tesseract", bmp_path, "-", "--psm", "7"],
                           capture_output=True, text=True, timeout=10)
        return r.stdout.strip()

    try:
        import pytesseract
        has_pytesseract = True
    except ImportError:
        has_pytesseract = False

    def tess_pytesseract_pil():
        return pytesseract.image_to_string(gate_img, config="--psm 7").strip()

    # Grayscale + threshold for gate
    gate_gray = ImageOps.grayscale(gate_img)
    gate_thresh = gate_gray.point(lambda x: 255 if x > 180 else 0)

    def tess_subprocess_preprocessed():
        tmp = "/tmp/bench_gate_pre.bmp"
        gate_thresh.save(tmp)
        r = subprocess.run(["tesseract", tmp, "-", "--psm", "7"],
                           capture_output=True, text=True, timeout=10)
        return r.stdout.strip()

    def tess_pytesseract_preprocessed():
        return pytesseract.image_to_string(gate_thresh, config="--psm 7").strip()

    results["gate_tess_sub_png"] = run_test("Tesseract subprocess (PNG)", tess_subprocess_png, args.rounds)
    results["gate_tess_sub_bmp"] = run_test("Tesseract subprocess (BMP)", tess_subprocess_bmp, args.rounds)
    results["gate_tess_sub_pre"] = run_test("Tesseract subprocess (preprocessed BMP)", tess_subprocess_preprocessed, args.rounds)
    if has_pytesseract:
        results["gate_tess_pylib_pil"] = run_test("pytesseract in-process (PIL)", tess_pytesseract_pil, args.rounds)
        results["gate_tess_pylib_pre"] = run_test("pytesseract in-process (preprocessed)", tess_pytesseract_preprocessed, args.rounds)
    else:
        print("  (pytesseract not installed — skipping in-process tests)")
    print()

    # ── Test 3: EasyOCR with preprocessing ──
    print("=" * 100)
    print("TEST 3: EasyOCR points read — raw vs preprocessed")
    print("=" * 100)

    import easyocr
    import numpy as np
    t0 = time.perf_counter()
    reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    print(f"  Model load: {(time.perf_counter()-t0)*1000:.0f}ms")
    print()

    points_img.save(png_path)
    points_img.save(bmp_path)

    # Preprocessed versions
    pts_gray = ImageOps.grayscale(points_img)
    pts_thresh = pts_gray.point(lambda x: 255 if x > 160 else 0)
    pts_gray_path = "/tmp/bench_points_gray.bmp"
    pts_thresh_path = "/tmp/bench_points_thresh.bmp"
    pts_gray.save(pts_gray_path)
    pts_thresh.save(pts_thresh_path)

    def easyocr_png():
        return reader.readtext(png_path)
    def easyocr_bmp():
        return reader.readtext(bmp_path)
    def easyocr_gray():
        return reader.readtext(pts_gray_path)
    def easyocr_thresh():
        return reader.readtext(pts_thresh_path)
    def easyocr_numpy_gray():
        return reader.readtext(np.array(pts_gray))
    def easyocr_numpy_thresh():
        return reader.readtext(np.array(pts_thresh))

    results["easyocr_png"] = run_test("EasyOCR from PNG file", easyocr_png, args.rounds)
    results["easyocr_bmp"] = run_test("EasyOCR from BMP file", easyocr_bmp, args.rounds)
    results["easyocr_gray"] = run_test("EasyOCR from grayscale BMP", easyocr_gray, args.rounds)
    results["easyocr_thresh"] = run_test("EasyOCR from threshold BMP", easyocr_thresh, args.rounds)
    results["easyocr_np_gray"] = run_test("EasyOCR from numpy grayscale", easyocr_numpy_gray, args.rounds)
    results["easyocr_np_thresh"] = run_test("EasyOCR from numpy threshold", easyocr_numpy_thresh, args.rounds)
    print()

    # ── Test 4: Full cycle simulation ──
    print("=" * 100)
    print("TEST 4: Full cycle simulation (save + gate + OCR)")
    print("=" * 100)

    def cycle_current():
        """Current approach: PNG gate + PNG EasyOCR"""
        gate_img.save(png_path)
        r = subprocess.run(["tesseract", png_path, "-", "--psm", "7"],
                           capture_output=True, text=True, timeout=10)
        if "WORLD TOUR" not in r.stdout.upper():
            return "gate_fail"
        points_img.save(png_path)
        results = reader.readtext(png_path)
        return [t for (_, t, _) in results]

    def cycle_optimized():
        """Optimized: BMP gate + preprocessed numpy EasyOCR"""
        gate_thresh.save(bmp_path)
        r = subprocess.run(["tesseract", bmp_path, "-", "--psm", "7"],
                           capture_output=True, text=True, timeout=10)
        if "WORLD TOUR" not in r.stdout.upper():
            return "gate_fail"
        results = reader.readtext(np.array(pts_gray))
        return [t for (_, t, _) in results]

    if has_pytesseract:
        def cycle_optimized_pytess():
            """Optimized: pytesseract gate + preprocessed numpy EasyOCR"""
            text = pytesseract.image_to_string(gate_thresh, config="--psm 7")
            if "WORLD TOUR" not in text.upper():
                return "gate_fail"
            results = reader.readtext(np.array(pts_gray))
            return [t for (_, t, _) in results]

    results["cycle_current"] = run_test("Current (PNG + subprocess tess)", cycle_current, args.rounds)
    results["cycle_optimized"] = run_test("Optimized (BMP + preprocess)", cycle_optimized, args.rounds)
    if has_pytesseract:
        results["cycle_pytess"] = run_test("Optimized (pytesseract + preprocess)", cycle_optimized_pytess, args.rounds)
    print()

    # ── Summary ──
    print("=" * 100)
    print("SUMMARY — Key comparisons")
    print("=" * 100)
    print(f"  Image format savings (gate):    PNG {results['gate_save_png']:.1f}ms -> BMP {results['gate_save_bmp']:.1f}ms")
    print(f"  Image format savings (points):  PNG {results['points_save_png']:.1f}ms -> BMP {results['points_save_bmp']:.1f}ms")
    print(f"  Gate Tesseract (PNG vs BMP):     {results['gate_tess_sub_png']:.1f}ms -> {results['gate_tess_sub_bmp']:.1f}ms")
    print(f"  EasyOCR (PNG vs numpy gray):     {results['easyocr_png']:.1f}ms -> {results['easyocr_np_gray']:.1f}ms")
    print(f"  Full cycle (current vs opt):     {results['cycle_current']:.1f}ms -> {results['cycle_optimized']:.1f}ms")
    if has_pytesseract:
        print(f"  Full cycle (pytesseract opt):    {results['cycle_pytess']:.1f}ms")
    print()

    for p in [png_path, bmp_path, pts_gray_path, pts_thresh_path, "/tmp/bench_gate_pre.bmp"]:
        if os.path.exists(p):
            os.unlink(p)


if __name__ == "__main__":
    main()

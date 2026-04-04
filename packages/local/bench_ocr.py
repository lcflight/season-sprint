#!/usr/bin/env python3
"""
Benchmark Tesseract vs EasyOCR on the gate region (top-left) and
points region (bottom-center) of a game screenshot.

Usage:
  python3 bench_ocr.py <screenshot.png> [--rounds N]
"""

import argparse
import subprocess
import time
import os
import sys

from PIL import Image

# Region ratios matching season-tracker.sh geometry calculations
GATE_REGION = (0, 0, 0.25, 0.10)        # top-left: left quarter, top tenth
POINTS_REGION = (1/3, 0.80, 2/3, 1.0)   # bottom-center: middle third, bottom fifth


def crop_region(img, region):
    w, h = img.size
    x1 = int(w * region[0])
    y1 = int(h * region[1])
    x2 = int(w * region[2])
    y2 = int(h * region[3])
    return img.crop((x1, y1, x2, y2))


def bench_tesseract(img_path, rounds):
    """Benchmark tesseract on a cropped image."""
    times = []
    output = ""
    for i in range(rounds):
        t0 = time.perf_counter()
        result = subprocess.run(
            ["tesseract", img_path, "-", "--psm", "7"],
            capture_output=True, text=True, timeout=10,
        )
        elapsed = time.perf_counter() - t0
        times.append(elapsed)
        output = result.stdout.strip()
    return times, output


def bench_easyocr(img_path, reader, rounds):
    """Benchmark EasyOCR on a cropped image."""
    times = []
    texts = []
    for i in range(rounds):
        t0 = time.perf_counter()
        results = reader.readtext(img_path)
        elapsed = time.perf_counter() - t0
        times.append(elapsed)
        texts = [t for (_, t, _) in results]
    return times, " | ".join(texts)


def stats(times):
    avg = sum(times) / len(times)
    mn = min(times)
    mx = max(times)
    return avg, mn, mx


def print_results(label, times, output):
    avg, mn, mx = stats(times)
    print(f"  {label}:")
    print(f"    avg={avg*1000:.1f}ms  min={mn*1000:.1f}ms  max={mx*1000:.1f}ms  (n={len(times)})")
    print(f"    output: {output[:120]}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Benchmark Tesseract vs EasyOCR")
    parser.add_argument("image", help="Path to a full game screenshot")
    parser.add_argument("--rounds", type=int, default=10, help="Number of iterations (default: 10)")
    args = parser.parse_args()

    if not os.path.exists(args.image):
        print(f"ERROR: {args.image} not found", file=sys.stderr)
        sys.exit(1)

    img = Image.open(args.image)
    print(f"Source image: {args.image} ({img.size[0]}x{img.size[1]})")
    print(f"Rounds: {args.rounds}")
    print()

    # Crop and save temp regions
    gate_img = crop_region(img, GATE_REGION)
    points_img = crop_region(img, POINTS_REGION)

    gate_path = "/tmp/bench_gate.png"
    points_path = "/tmp/bench_points.png"
    gate_img.save(gate_path)
    points_img.save(points_path)
    print(f"Gate region:   {gate_img.size[0]}x{gate_img.size[1]}px")
    print(f"Points region: {points_img.size[0]}x{points_img.size[1]}px")
    print()

    # -- Tesseract benchmarks --
    print("=" * 60)
    print("TESSERACT")
    print("=" * 60)

    t_gate, t_gate_out = bench_tesseract(gate_path, args.rounds)
    print_results("Gate region (top-left)", t_gate, t_gate_out)

    t_points, t_points_out = bench_tesseract(points_path, args.rounds)
    print_results("Points region (bottom-center)", t_points, t_points_out)

    # -- EasyOCR benchmarks --
    print("=" * 60)
    print("EASYOCR  (loading model...)")
    print("=" * 60)

    import easyocr
    t_load = time.perf_counter()
    reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    load_time = time.perf_counter() - t_load
    print(f"  Model load: {load_time*1000:.0f}ms")
    print()

    e_gate, e_gate_out = bench_easyocr(gate_path, reader, args.rounds)
    print_results("Gate region (top-left)", e_gate, e_gate_out)

    e_points, e_points_out = bench_easyocr(points_path, reader, args.rounds)
    print_results("Points region (bottom-center)", e_points, e_points_out)

    # -- Summary --
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    t_gate_avg = stats(t_gate)[0] * 1000
    e_gate_avg = stats(e_gate)[0] * 1000
    t_pts_avg = stats(t_points)[0] * 1000
    e_pts_avg = stats(e_points)[0] * 1000

    print(f"  Gate check:   Tesseract {t_gate_avg:.1f}ms  vs  EasyOCR {e_gate_avg:.1f}ms  ({e_gate_avg/t_gate_avg:.1f}x slower)")
    print(f"  Points read:  Tesseract {t_pts_avg:.1f}ms  vs  EasyOCR {e_pts_avg:.1f}ms  ({e_pts_avg/t_pts_avg:.1f}x slower)")
    print()
    print(f"  Two-stage (gate+points): {t_gate_avg + e_pts_avg:.1f}ms  (Tesseract gate, EasyOCR points)")
    print(f"  EasyOCR only (current):  {e_pts_avg:.1f}ms")
    print(f"  Gate-only (not on WT):   {t_gate_avg:.1f}ms  (skips EasyOCR entirely)")
    print()

    os.unlink(gate_path)
    os.unlink(points_path)


if __name__ == "__main__":
    main()

@echo off
REM season-tracker Windows PoC — setup and launcher.
REM
REM First run: creates a .venv, installs deps, launches the tracker.
REM Subsequent runs: reuses the venv and just launches.
REM
REM Double-click this file, or run from cmd.exe / Windows Terminal.

setlocal enabledelayedexpansion
pushd "%~dp0"

REM ── 1. Check for Python ──────────────────────────────────────────────────
where py >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Python not found on PATH.
    echo.
    echo Install Python 3.11 or newer from https://www.python.org/downloads/
    echo and make sure "Add python.exe to PATH" is checked during install.
    echo.
    echo Or from an elevated PowerShell / cmd:
    echo     winget install Python.Python.3.12
    echo.
    pause
    popd & exit /b 1
)

REM ── 2. Create venv if missing ─────────────────────────────────────────────
if not exist ".venv\Scripts\python.exe" (
    echo Creating virtual environment in .venv ...
    py -3 -m venv .venv
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to create venv. Check Python install.
        pause
        popd & exit /b 1
    )
)

REM ── 3. Install / upgrade dependencies ─────────────────────────────────────
echo Checking dependencies ^(first run downloads ~1GB of PyTorch^) ...
.venv\Scripts\python.exe -m pip install --upgrade pip >nul
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR: pip install failed. See output above.
    pause
    popd & exit /b 1
)

REM ── 4. Run the tracker ────────────────────────────────────────────────────
echo.
echo Starting tracker. Press Ctrl+C to stop.
echo.
.venv\Scripts\python.exe season_tracker.py

popd
endlocal

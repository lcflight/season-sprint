@echo off
REM season-tracker Windows PoC — setup and launcher.
REM
REM First run: installs Python (via winget) if missing, creates a .venv,
REM installs deps, launches the tracker.
REM Subsequent runs: reuses the venv and just launches.
REM
REM Double-click this file, or run from cmd.exe / Windows Terminal.

setlocal enabledelayedexpansion
pushd "%~dp0"

set "PY_EXE="

REM ── 1. Find Python already on PATH ───────────────────────────────────────
for /f "usebackq delims=" %%I in (`where py 2^>nul`) do (
    set "PY_EXE=%%I"
    goto :have_python
)
for /f "usebackq delims=" %%I in (`where python 2^>nul`) do (
    "%%I" -c "import sys; sys.exit(0 if sys.version_info >= (3,9) else 1)" >nul 2>&1
    if not errorlevel 1 (
        set "PY_EXE=%%I"
        goto :have_python
    )
)

REM ── 2. Not installed — try winget ────────────────────────────────────────
where winget >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Python not found, and winget is unavailable.
    echo   Install Python 3.11+ from https://www.python.org/downloads/
    echo   ^(check "Add python.exe to PATH"^) and re-run this script.
    echo.
    pause & popd & endlocal & exit /b 1
)

echo.
echo Python 3 not found. Installing via winget ^(user scope, no admin needed^)...
echo This usually takes 1-2 minutes.
echo.
winget install --silent --accept-source-agreements --accept-package-agreements --scope user --id Python.Python.3.12
if errorlevel 1 (
    echo.
    echo ERROR: winget install failed. Possible causes:
    echo   - App Installer needs updating from the Microsoft Store
    echo   - No network connection
    echo Install Python manually and re-run setup.bat.
    echo.
    pause & popd & endlocal & exit /b 1
)

REM ── 3. Locate the just-installed Python ──────────────────────────────────
REM winget modifies PATH but not for THIS running shell, so probe known dirs.
for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Launcher\py.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%PROGRAMFILES%\Python312\python.exe"
    "%PROGRAMFILES%\Python313\python.exe"
    "C:\Windows\py.exe"
) do (
    if exist "%%~P" (
        set "PY_EXE=%%~P"
        goto :have_python
    )
)

echo.
echo Python installed but not found in expected locations.
echo Close this window, open a fresh cmd.exe, and re-run setup.bat.
echo.
pause & popd & endlocal & exit /b 1

:have_python
echo Using Python: %PY_EXE%

REM ── 4. Create venv if missing ─────────────────────────────────────────────
if not exist ".venv\Scripts\python.exe" (
    echo Creating virtual environment in .venv ...
    "%PY_EXE%" -m venv .venv
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to create venv.
        pause & popd & endlocal & exit /b 1
    )
)

REM ── 5. Install / upgrade dependencies ─────────────────────────────────────
echo Checking dependencies ^(first run downloads ~1GB of PyTorch^) ...
.venv\Scripts\python.exe -m pip install --upgrade pip >nul
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR: pip install failed. See output above.
    pause & popd & endlocal & exit /b 1
)

REM ── 6. Run the tracker ────────────────────────────────────────────────────
echo.
echo Starting tracker. Press Ctrl+C to stop.
echo.
.venv\Scripts\python.exe season_tracker.py

popd
endlocal

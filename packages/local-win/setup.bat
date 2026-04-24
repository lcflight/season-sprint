@echo off
REM season-tracker Windows PoC — setup and launcher.
REM
REM First run: installs Python (via winget) if missing, creates a venv at
REM %USERPROFILE%\.season-sprint\venv, installs deps, launches the tracker.
REM Subsequent runs: reuses the venv and just launches.
REM
REM The venv lives OUTSIDE the repo on purpose: PyTorch's header tree
REM exceeds Windows' 260-char MAX_PATH limit when the repo itself is in
REM a deep folder like Downloads\<long-name>. A short, stable venv path
REM (~17 chars of prefix) buys back the headroom so pip install succeeds
REM regardless of where the repo was unzipped.
REM
REM Double-click this file, or run from cmd.exe / Windows Terminal.

setlocal enabledelayedexpansion
pushd "%~dp0"

set "PY_EXE="
set "VENV_DIR=%USERPROFILE%\.season-sprint\venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"

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

REM ── 4. Create venv (short path outside repo) if missing ──────────────────
if not exist "%VENV_PY%" (
    echo Creating virtual environment at %VENV_DIR% ...
    if not exist "%USERPROFILE%\.season-sprint" mkdir "%USERPROFILE%\.season-sprint"
    "%PY_EXE%" -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to create venv at %VENV_DIR%.
        pause & popd & endlocal & exit /b 1
    )
)

REM ── 5. Install / upgrade dependencies ─────────────────────────────────────
echo Checking dependencies ^(first run downloads ~1GB of PyTorch^) ...
"%VENV_PY%" -m pip install --upgrade pip >nul
"%VENV_PY%" -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR: pip install failed. See output above.
    pause & popd & endlocal & exit /b 1
)

REM ── 6. Run the tracker ────────────────────────────────────────────────────
echo.
echo Starting tracker. Press Ctrl+C to stop.
echo.
"%VENV_PY%" season_tracker.py

popd
endlocal

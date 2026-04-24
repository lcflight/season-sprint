@echo off
REM install-deps.bat — noninteractive dependency setup.
REM
REM Ensures Python, MSVC Redistributable, the venv at
REM %USERPROFILE%\.season-sprint\venv, and the Python requirements are all
REM installed. Designed to be run silently from the Inno Setup installer
REM (with the runhidden flag) so the user sees the wizard's progress bar
REM instead of a raw cmd window. Also safe to call from setup.bat.
REM
REM Idempotent: each step no-ops if already satisfied.

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
    echo ERROR: Python not found, and winget is unavailable.
    echo   Install Python 3.11+ from https://www.python.org/downloads/
    popd & endlocal & exit /b 1
)

winget install --silent --accept-source-agreements --accept-package-agreements --scope user --id Python.Python.3.12
if errorlevel 1 (
    echo ERROR: winget Python install failed.
    popd & endlocal & exit /b 1
)

REM ── 3. Locate the just-installed Python ──────────────────────────────────
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

echo ERROR: Python installed but not located.
popd & endlocal & exit /b 1

:have_python

REM ── 3b. Ensure MSVC Redistributable (PyTorch links against vcruntime140*)
where winget >nul 2>&1
if not errorlevel 1 (
    winget install --silent --accept-source-agreements --accept-package-agreements --id Microsoft.VCRedist.2015+.x64
)

REM ── 4. Create venv (short path outside repo) if missing ──────────────────
if not exist "%VENV_PY%" (
    if not exist "%USERPROFILE%\.season-sprint" mkdir "%USERPROFILE%\.season-sprint"
    "%PY_EXE%" -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo ERROR: Failed to create venv at %VENV_DIR%.
        popd & endlocal & exit /b 1
    )
)

REM ── 5. Install / upgrade dependencies (no-op if satisfied) ───────────────
"%VENV_PY%" -m pip install --upgrade pip >nul
"%VENV_PY%" -m pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed.
    popd & endlocal & exit /b 1
)

popd
endlocal
exit /b 0

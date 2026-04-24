@echo off
REM season-tracker Windows PoC — standalone setup + launcher.
REM
REM Delegates dependency install to install-deps.bat (idempotent), then
REM launches the tracker.
REM
REM Flags:
REM   --install-only    Runs deps install + first-run config prompt, then
REM                     exits without entering the polling loop. Used by
REM                     the Inno Setup installer.
REM   (no flag)         Runs deps install, then starts the polling loop
REM                     interactively. Ctrl+C to quit.

setlocal
pushd "%~dp0"

echo Ensuring dependencies (Python, VC++ Redist, venv, pip) ...
call install-deps.bat
if errorlevel 1 (
    echo.
    echo ERROR: dependency install failed. See output above.
    pause & popd & endlocal & exit /b 1
)

set "VENV_PY=%USERPROFILE%\.season-sprint\venv\Scripts\python.exe"

if /i "%~1"=="--install-only" (
    echo.
    echo Running first-time config ^(prompts only; no polling loop^)...
    echo.
    "%VENV_PY%" season_tracker.py --setup-only
    echo.
    echo Setup complete.
) else (
    echo.
    echo Starting tracker. Press Ctrl+C to stop.
    echo.
    "%VENV_PY%" season_tracker.py

    echo.
    echo Tracker exited. Press any key to close this window.
    pause >nul
)

popd
endlocal

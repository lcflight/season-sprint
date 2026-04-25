@echo off
REM Steam launch wrapper for the Season Sprint tracker.
REM
REM Steam invokes this as: "launch.bat" %command%
REM Effect: start the tracker headless (pythonw.exe, no console window),
REM run the game synchronously, then stop the tracker by PID when the game
REM exits. The tracker writes .tracker-pid on startup; we consume it here.
REM
REM If invoked with no args (e.g. double-clicked), this is a misuse —
REM print a helpful message and offer to run the tracker in foreground
REM with a visible console so the user can verify the install.

setlocal
pushd "%~dp0"

set "VENV_DIR=%USERPROFILE%\.season-sprint\venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "VENV_PYW=%VENV_DIR%\Scripts\pythonw.exe"

if not exist "%VENV_PY%" (
    echo.
    echo ERROR: Tracker venv not found at:
    echo   %VENV_DIR%
    echo.
    echo Run setup.bat first to install Python + dependencies.
    echo.
    pause
    popd & endlocal & exit /b 1
)

REM No game args = not invoked by Steam. Run the tracker in foreground
REM so the user can see output, then exit.
if "%~1"=="" (
    echo.
    echo This file is a Steam launch wrapper, not a standalone launcher.
    echo Steam invokes it as: "launch.bat" %%command%%
    echo.
    echo To use it with a game, paste this into Steam ^> Properties ^>
    echo Launch Options:
    echo.
    echo     "%~dp0launch.bat" %%command%%
    echo.
    echo Running the tracker now in this window so you can verify the
    echo install. Press Ctrl+C to stop.
    echo.
    "%VENV_PY%" "%~dp0season_tracker.py"
    popd & endlocal & exit /b 0
)

REM Start the tracker headless in the background.
start "" /B "%VENV_PYW%" "%~dp0season_tracker.py"

REM Run the game and wait for it to exit. %* is the game exe + its args.
%*

REM Game exited — stop the tracker by its PID if the file is present.
REM Filter on IMAGENAME=pythonw.exe so a stale .tracker-pid pointing at a
REM reused PID can't accidentally kill an unrelated process the user owns.
if exist "%~dp0.tracker-pid" (
    for /f "usebackq" %%P in ("%~dp0.tracker-pid") do taskkill /F /FI "IMAGENAME eq pythonw.exe" /FI "PID eq %%P" >nul 2>&1
    del "%~dp0.tracker-pid" >nul 2>&1
)

popd
endlocal

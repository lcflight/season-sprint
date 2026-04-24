@echo off
REM Steam launch wrapper for the Season Sprint tracker.
REM
REM Steam invokes this as: "launch.bat" %command%
REM Effect: start the tracker headless (pythonw.exe, no console window),
REM run the game synchronously, then stop the tracker by PID when the game
REM exits. The tracker writes .tracker-pid on startup; we consume it here.

setlocal
pushd "%~dp0"

set "VENV_PYW=%USERPROFILE%\.season-sprint\venv\Scripts\pythonw.exe"

REM Start the tracker headless in the background.
start "" /B "%VENV_PYW%" "%~dp0season_tracker.py"

REM Run the game and wait for it to exit. %* is the game exe + its args.
%*

REM Game exited — stop the tracker by its PID if the file is present.
if exist "%~dp0.tracker-pid" (
    for /f %%P in (%~dp0.tracker-pid) do taskkill /F /PID %%P >nul 2>&1
    del "%~dp0.tracker-pid" >nul 2>&1
)

popd
endlocal

@echo off
REM Steam launch wrapper for the Season Sprint tracker.
REM
REM Steam invokes this as: "launch.bat" %command%
REM Effect: start the tracker in the background as pythonw.exe (no console
REM window), run the game synchronously, then stop the tracker when the
REM game exits.

setlocal
pushd "%~dp0"

REM Start tracker headless. pythonw.exe = GUI subsystem, no cmd window.
start "" /B ".venv\Scripts\pythonw.exe" "%~dp0season_tracker.py"

REM Run the game and wait for it. %* is "gamepath.exe" + any Steam-provided args.
%*

REM Game exited — stop the tracker by matching its command line.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='pythonw.exe'\" | Where-Object { $_.CommandLine -like '*season_tracker.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

popd
endlocal

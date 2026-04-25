@echo off
REM Live tail of tracker.log so you can verify the tracker is working
REM while the game runs.
REM
REM Usage: double-click after launching the game via Steam (with the
REM        launch.bat option set). A window opens and prints each new
REM        log line as it arrives — you should see [ocr Xms] lines
REM        repeating every few seconds, and "Pushed winPoints=N" when
REM        the tracker detects a new score.
REM
REM Close the window when you're done watching; the tracker keeps running
REM regardless.

title Season Sprint Tracker - Live Log
pushd "%~dp0"

if not exist "tracker.log" (
    echo.
    echo No tracker.log yet.
    echo.
    echo Launch the game through Steam first ^(with the launch.bat Steam
    echo Launch Option set^), then re-run this file. The log appears as
    echo soon as the tracker starts polling.
    echo.
    pause
    popd & exit /b 0
)

echo Tailing tracker.log. Press Ctrl+C or close this window to stop watching.
echo.
powershell -NoProfile -Command "Get-Content -Path .\tracker.log -Wait -Tail 100"

popd

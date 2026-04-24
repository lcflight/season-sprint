@echo off
REM Season Sprint Tracker — Windows setup.
REM
REM Installs Python + dependencies (via install-deps.bat), prompts for
REM your server URL + API token + monitor (via season_tracker.py
REM --setup-only), and prints the exact Steam Launch Options line you
REM need to paste into your game's Properties.
REM
REM Re-runnable: every step is idempotent. Re-run any time to reconfigure
REM or to recover from a partial install.

setlocal
pushd "%~dp0"

echo Ensuring dependencies (Python, VC++ Redist, venv, pip) ...
echo This is fast on a re-run; first install takes ~3-5 minutes.
echo.
call install-deps.bat
if errorlevel 1 (
    echo.
    echo ERROR: dependency install failed. See output above.
    echo.
    pause
    popd & endlocal & exit /b 1
)

set "VENV_PY=%USERPROFILE%\.season-sprint\venv\Scripts\python.exe"

echo.
echo Configuring your account...
echo.
"%VENV_PY%" season_tracker.py --setup-only
if errorlevel 1 (
    echo.
    echo ERROR: configuration failed. See output above.
    echo.
    pause
    popd & endlocal & exit /b 1
)

echo.
echo ================================================================
echo   Setup complete!
echo.
echo   To start the tracker automatically when you launch the game:
echo.
echo     1. In Steam, right-click your game then select Properties
echo     2. Go to General then Launch Options
echo     3. Paste this line exactly (you can select and copy below):
echo.
echo        "%~dp0launch.bat" %%command%%
echo.
echo   That's it. The tracker will start when the game starts and stop
echo   when the game exits, no other action needed.
echo ================================================================
echo.
echo Press any key to close this window after copying the line above.
pause >nul

popd
endlocal

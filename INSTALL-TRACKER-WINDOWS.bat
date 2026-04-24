@echo off
REM Season Sprint Tracker — top-level launcher for the source-zip path.
REM
REM If you downloaded the source code as a zip from GitHub, just
REM double-click this file. It navigates into packages\local-win\ and
REM runs setup.bat, which installs Python + EasyOCR + creates a venv,
REM prompts for your server URL and API token, and tells you the exact
REM line to paste into Steam.

title Season Sprint Tracker - Installer
cd /d "%~dp0packages\local-win"
if not exist "setup.bat" (
    echo.
    echo ERROR: setup.bat not found at packages\local-win\setup.bat.
    echo This file expects to live at the root of the extracted source zip
    echo alongside the packages\ folder.
    echo.
    pause
    exit /b 1
)
call setup.bat

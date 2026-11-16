@echo off
setlocal
cd /d "%~dp0"
title Stasiun Mati - Jakarta LRT 3D FPS

set "PY_CMD="
python --version >nul 2>nul && set "PY_CMD=python"
if not defined PY_CMD (
    py -3 --version >nul 2>nul && set "PY_CMD=py -3"
)
if not defined PY_CMD (
    echo [ERROR] Python 3 was not found in PATH.
    echo Install Python 3 or add it to PATH, then try again.
    pause
    exit /b 1
)

echo Launching local HTTP server and opening browser...
echo Keep this window open while playing. Press Ctrl+C or close this window to stop.
echo.
%PY_CMD% serve.py --port 8080 --auto-port --open
if errorlevel 1 (
    echo.
    echo [ERROR] Local server stopped with an error.
    pause
    exit /b 1
)

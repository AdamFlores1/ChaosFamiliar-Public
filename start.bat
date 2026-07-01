@echo off
title Chaos Familiar — Local Server
cd /d "%~dp0"

echo ============================================
echo  Chaos Familiar — Public Version
echo ============================================
echo.
echo Starting local server...
echo.

REM Try Python 3 first, then fall back to python
where python3 >nul 2>&1
if not errorlevel 1 (
    start "Chaos Familiar Server" python3 -m http.server 8000
) else (
    where python >nul 2>&1
    if not errorlevel 1 (
        start "Chaos Familiar Server" python -m http.server 8000
    ) else (
        echo ERROR: Python is not installed or not in your PATH.
        echo.
        echo Install Python from https://www.python.org/downloads/
        echo Make sure to check "Add Python to PATH" during install.
        pause
        exit /b 1
    )
)

echo Waiting for server to start...
timeout /t 2 /nobreak >nul
start "" http://localhost:8000
echo.
echo Server running at http://localhost:8000
echo Close the server window to stop.
echo Press any key to close this launcher (server keeps running).
pause >nul

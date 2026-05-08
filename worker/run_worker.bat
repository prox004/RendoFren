@echo off
title RendoFren Secure GPU Render Worker
echo ==========================================
echo RendoFren Secure GPU Render Worker Launcher
echo ==========================================
echo.

cd /d "%~dp0"

if not exist venv (
    echo Error: Python virtual environment not found!
    echo Please run installation first or recreate venv.
    pause
    exit /b 1
)

echo Activating Virtual Environment...
echo Starting PyQt6 GUI Dashboard in background mode...
echo (You can close this command window, the worker minimizes to system tray.)
echo.

start "" "venv\Scripts\pythonw.exe" -m src.main
if %ERRORLEVEL% NEQ 0 (
    echo Error launching worker GUI. Re-trying with console output for diagnostics...
    "venv\Scripts\python.exe" -m src.main
    pause
)

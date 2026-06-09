@echo off
cd /d "%~dp0"
title Data Consolidator Runner
echo ==========================================================
echo               DATA CONSOLIDATOR LAUNCHER
echo ==========================================================
echo.
echo [1/3] Checking dependencies...
echo - Checking Node.js version...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH! Please install Node.js first.
    pause
    exit /b 1
)
echo - Checking Python version...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH! Please install Python first.
    pause
    exit /b 1
)

echo.
echo [2/3] Starting Backend (FastAPI on Port 8000)...
:: Check if virtual environment exists and activate it
if exist "backend\venv\Scripts\activate.bat" (
    echo - Found virtual environment in backend\venv, activating...
    start "Data Consolidator Backend" cmd /k "call backend\venv\Scripts\activate && python -m uvicorn backend.app.main:app --reload --port 8000"
) else if exist "venv\Scripts\activate.bat" (
    echo - Found virtual environment in root venv, activating...
    start "Data Consolidator Backend" cmd /k "call venv\Scripts\activate && python -m uvicorn backend.app.main:app --reload --port 8000"
) else (
    echo - No virtual environment found. Running with global python...
    echo - (Note: If this fails, run 'pip install -r backend/requirements.txt' first.)
    start "Data Consolidator Backend" cmd /k "python -m uvicorn backend.app.main:app --reload --port 8000"
)

echo.
echo [3/3] Starting Frontend (Next.js on Port 3000)...
start "Data Consolidator Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ==========================================================
echo LAUNCH SUCCESSFUL!
echo.
echo Backend URL:  http://localhost:8000
echo Frontend URL: http://localhost:3000
echo.
echo Feel free to close this loader window. 
echo To stop the servers, close the individual command prompts.
echo ==========================================================
pause

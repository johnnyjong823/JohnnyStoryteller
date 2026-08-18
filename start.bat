@echo off
REM ============================================================
REM  Johnny Storyteller - local test server
REM
REM  This file is deliberately PURE ASCII.
REM  cmd.exe parses .bat files byte-by-byte, so UTF-8 Chinese
REM  characters desync the parser and break the script.
REM  All Chinese output lives in scripts\start.mjs instead.
REM ============================================================

chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Johnny Storyteller - Local Test

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [X] Node.js not found.
    echo.
    echo       Install it from https://nodejs.org/
    echo       then close this window and run start.bat again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo.
    echo   [..] First run - installing packages ^(about 1 minute, only this once^)
    echo.
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        echo.
        echo   [X] npm install failed. Send me the error above.
        echo.
        pause
        exit /b 1
    )
)

node scripts\start.mjs

echo.
echo   Server stopped.
pause

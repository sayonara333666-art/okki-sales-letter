@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Customer Letter Assistant
echo.
echo   Customer Letter Assistant
echo   ================================
echo   Version: 1.3.1030
echo   Local service: 127.0.0.1:8788
echo   Data: DesktopCustomer Letter Assistant Data
echo   Keep this window open. Close it to stop the service.
echo.
node service.js
echo.
echo Service stopped.
pause

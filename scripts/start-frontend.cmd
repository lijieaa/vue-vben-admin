@echo off
REM Double-click launcher for SCADA frontend (web-ele :5777)
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-frontend.ps1" %*
if errorlevel 1 pause

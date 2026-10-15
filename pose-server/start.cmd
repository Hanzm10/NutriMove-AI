@echo off
rem Double-click this (or run it from Command Prompt) to start the laptop pose server + tunnel on Windows.
rem It runs start.ps1 with PowerShell, so .ps1 files opening in Notepad doesn't matter.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
pause

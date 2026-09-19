@echo off
REM Run this from any terminal (cmd, PowerShell, Windows Terminal) or double-click it.
REM It bootstraps launch-all-executors.ps1, which opens 4 SEPARATE Windows
REM Terminal windows, one per executor (ws-executor-1..4) running opencode.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-all-executors.ps1"
@echo off
echo [Slickk] Waiting for Windows and Tailscale to become ready...
timeout /t 30 /nobreak >nul

call "%~dp0start-slickk-online.cmd"

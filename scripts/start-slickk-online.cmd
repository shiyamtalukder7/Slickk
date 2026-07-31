@echo off
setlocal EnableExtensions

for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"

set "PYTHON=%PROJECT_ROOT%\.venv\Scripts\python.exe"
set "TAILSCALE=C:\Program Files\Tailscale\tailscale.exe"
set "ONLINE_URL=https://desktop-9191ol2.tailb228f7.ts.net"

echo.
echo ========================================
echo       Slickk Online AI Launcher
echo ========================================
echo.

if not exist "%PYTHON%" (
    echo [ERROR] Slickk Python environment was not found:
    echo %PYTHON%
    pause
    exit /b 1
)

if not exist "%TAILSCALE%" (
    echo [ERROR] Tailscale was not found:
    echo %TAILSCALE%
    pause
    exit /b 1
)

pushd "%PROJECT_ROOT%" || exit /b 1

echo [Slickk] Checking Tailscale...

"%TAILSCALE%" status > "%TEMP%\slickk-tailscale-status.txt" 2>&1

findstr /i /c:"Logged out" "%TEMP%\slickk-tailscale-status.txt" >nul

if not errorlevel 1 (
    echo.
    echo [ERROR] This laptop is logged out of Tailscale.
    echo Open Tailscale and sign in first.
    echo.
    del "%TEMP%\slickk-tailscale-status.txt" >nul 2>&1
    popd
    pause
    exit /b 1
)

del "%TEMP%\slickk-tailscale-status.txt" >nul 2>&1

echo [Slickk] Tailscale connected.
echo [Slickk] Ensuring private HTTPS access...

"%TAILSCALE%" serve --bg http://127.0.0.1:11435

if errorlevel 1 (
    echo.
    echo [ERROR] Tailscale Serve could not be started.
    popd
    pause
    exit /b 1
)

echo.
echo [Slickk] Online address:
echo %ONLINE_URL%
echo.
echo [Slickk] Starting the AI server...
echo [Slickk] Loading slickk-edu-local...
echo [Slickk] Keep this window open while using the app.
echo.

"%PYTHON%" -m slickk_server serve ^
    --host 127.0.0.1 ^
    --port 11435 ^
    --model slickk-edu-local

set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo [Slickk] Online server stopped.
popd
pause
exit /b %EXIT_CODE%

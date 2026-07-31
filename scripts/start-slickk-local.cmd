@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
set "PYTHON=%PROJECT_ROOT%\.venv\Scripts\python.exe"

echo.
echo ========================================
echo        Slickk Local AI Launcher
echo ========================================
echo.

if not exist "%PYTHON%" (
    echo [ERROR] Python virtual environment was not found:
    echo %PYTHON%
    pause
    exit /b 1
)

if not exist "%ADB%" (
    echo [ERROR] Android ADB was not found:
    echo %ADB%
    pause
    exit /b 1
)

pushd "%PROJECT_ROOT%" || exit /b 1

echo [Slickk] Checking Android connection...
"%ADB%" start-server >nul 2>&1

set "DEVICE_SERIAL="

for /f "skip=1 tokens=1,2" %%A in ('"%ADB%" devices') do (
    if "%%B"=="device" (
        if not defined DEVICE_SERIAL set "DEVICE_SERIAL=%%A"
    )
)

if not defined DEVICE_SERIAL (
    echo.
    echo [ERROR] No authorized Android device was detected.
    echo.
    echo 1. Connect the phone using USB.
    echo 2. Unlock the phone.
    echo 3. Enable USB debugging.
    echo 4. Accept the debugging authorization prompt.
    echo.
    popd
    pause
    exit /b 1
)

echo [Slickk] Android device: !DEVICE_SERIAL!
echo [Slickk] Creating ADB tunnel...

"%ADB%" -s "!DEVICE_SERIAL!" reverse tcp:11435 tcp:11435

if errorlevel 1 (
    echo [ERROR] ADB reverse tunnel could not be created.
    popd
    pause
    exit /b 1
)

echo [Slickk] Tunnel ready: phone 127.0.0.1:11435 to laptop 11435
echo [Slickk] Starting server and loading slickk-edu-local...
echo [Slickk] Keep this window open while using the app.
echo.

"%PYTHON%" -m slickk_server serve ^
    --host 127.0.0.1 ^
    --port 11435 ^
    --model slickk-edu-local

set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo [Slickk] Server stopped.
popd
pause
exit /b %EXIT_CODE%

@echo off
setlocal

set ROOT=%~dp0..
set LAUNCHER=%~dp0
set DIST=%LAUNCHER%dist
set TMP=%LAUNCHER%build-tmp
set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
set NODE=C:\Program Files\nodejs\node.exe
set ZIP=%TMP%\runtime-package.zip
set EXE=%DIST%\InternalDocReviewLauncher.exe
set ICON=%TMP%\launcher-icon.ico

if exist "%TMP%" rmdir /s /q "%TMP%"
if exist "%DIST%" rmdir /s /q "%DIST%"
mkdir "%TMP%"
mkdir "%DIST%"
mkdir "%TMP%\package"
mkdir "%TMP%\package\.next"

pushd "%ROOT%"
call npm.cmd run build
if errorlevel 1 exit /b 1
popd

xcopy "%ROOT%\.next\standalone\*" "%TMP%\package\" /E /I /Y >nul
xcopy "%ROOT%\.next\static\*" "%TMP%\package\.next\static\" /E /I /Y >nul
xcopy "%ROOT%\public\*" "%TMP%\package\public\" /E /I /Y >nul
xcopy "%ROOT%\schemas\*" "%TMP%\package\schemas\" /E /I /Y >nul
copy "%NODE%" "%TMP%\package\node.exe" >nul

powershell.exe -NoProfile -Command "Compress-Archive -Path '%TMP%\package\*' -DestinationPath '%ZIP%' -Force"
if errorlevel 1 exit /b 1

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%generate-icon.ps1" -ProjectRoot "%ROOT%" -OutputIcoPath "%ICON%"
if errorlevel 1 exit /b 1

"%CSC%" /nologo /target:winexe /out:"%EXE%" /win32icon:"%ICON%" /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Core.dll "%LAUNCHER%InternalDocReviewLauncher.cs" /resource:"%ZIP%",InternalDocReviewLauncher.RuntimePackage
if errorlevel 1 exit /b 1

echo Built: %EXE%

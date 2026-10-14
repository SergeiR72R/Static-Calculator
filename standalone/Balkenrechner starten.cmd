@echo off
rem Balkenrechner (promaintain) - startet die Anwendung ohne Installation und ohne Administratorrechte
rem in einem eigenen Fenster (Microsoft Edge oder Google Chrome im App-Modus), sonst im Standardbrowser.
setlocal
set "APP=%~dp0Balkenrechner.html"
if not exist "%APP%" (
  echo Balkenrechner.html nicht gefunden: %APP%
  pause
  exit /b 1
)
set "URL=file:///%APP:\=/%"
for %%K in (HKCU HKLM) do (
  reg query "%%K\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" >nul 2>&1 && (
    start "" msedge --app="%URL%" --window-size=1440,900
    exit /b 0
  )
)
for %%K in (HKCU HKLM) do (
  reg query "%%K\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>&1 && (
    start "" chrome --app="%URL%" --window-size=1440,900
    exit /b 0
  )
)
start "" "%APP%"

@echo off
rem Installs the Simplify panel for the current Windows user.
setlocal
set "SRC=%~dp0..\extension"
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.simplify.ae"

if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy "%SRC%" "%DEST%\" /e /i /q /y /h >nul
if errorlevel 1 (
  echo Copy failed. Close After Effects and try again.
  exit /b 1
)

rem The panel is not signed yet, so After Effects only loads it with the CEP debug flag set.
for %%v in (11 12 13) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

echo Simplify installed to: %DEST%
echo Restart After Effects, then open Window ^> Extensions ^> Simplify.
endlocal

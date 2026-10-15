@echo off
title Microsoft Project 2010 (PT-BR)
echo ========================================================
echo   Iniciando Microsoft Project 2010 (Clone PT-BR)
echo ========================================================

set "NODE_DIR=C:\Users\iesus.candido\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v22.23.2-win-x64"
if exist "%NODE_DIR%" (
    set "PATH=%NODE_DIR%;%PATH%"
)

cd /d "%~dp0"

echo Abrindo navegador...
start http://localhost:4173

echo Iniciando servidor local...
call npx vite preview --port 4173
pause

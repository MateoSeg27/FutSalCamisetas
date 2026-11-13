@echo off
title FutSal Camisetas
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto sinnode
if not exist node_modules (
  echo Instalando lo necesario, solo la primera vez...
  call npm install --omit=dev
  if errorlevel 1 goto errornpm
)
echo Iniciando FutSal Camisetas...
start "" /min cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
if exist .env (
  node --env-file=.env server.js
) else (
  node server.js
)
pause
exit /b

:errornpm
echo.
echo No se pudo instalar. Revisa tu conexion a internet y volve a intentar.
pause
exit /b

:sinnode
echo.
echo No se encontro Node.js en esta computadora.
echo.
echo 1. Entra a https://nodejs.org y descarga la version LTS.
echo 2. Instalalo con las opciones por defecto.
echo 3. Volve a abrir este archivo.
echo.
pause

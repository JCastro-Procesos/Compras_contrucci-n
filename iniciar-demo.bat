@echo off
REM Arranca la herramienta con datos de demostracion (clave de todos los usuarios demo: demo1234)
REM Requiere Node.js 22.5 o superior instalado (nodejs.org, version LTS)
set SEED_DEMO=1
set PORT=3000
set ADMIN_EMAIL=admin@itm.local
set ADMIN_PASSWORD=Cambiar-esta-clave-1
start "" http://localhost:3000
node server/index.js
pause

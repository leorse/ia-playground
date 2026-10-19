@echo off
rem Installe les dependances (si besoin) puis lance l'application RH sur http://localhost:3000
cd /d "%~dp0app"
if not exist node_modules call npm install
call npm start

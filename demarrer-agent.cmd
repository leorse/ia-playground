@echo off
rem Installe les dependances (si besoin) puis lance l'agent autonome (webhook sur http://localhost:4000)
cd /d "%~dp0agent"
if not exist node_modules call npm install
if not exist .env copy .env.example .env >nul
call npm start

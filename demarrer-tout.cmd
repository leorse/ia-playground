@echo off
rem Installe les dependances (si besoin) puis lance application, messagerie et agent autonome
cd /d "%~dp0"
for %%d in (app mail agent) do if not exist "%%d\node_modules" call npm --prefix %%d install
if not exist agent\.env copy agent\.env.example agent\.env >nul
call npm run start:all

@echo off
rem Lance le faux serveur de messagerie sur http://localhost:5000
cd /d "%~dp0mail"
if not exist node_modules call npm install
call npm start

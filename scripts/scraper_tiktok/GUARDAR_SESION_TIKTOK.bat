@echo off
chcp 65001 > nul
echo.
echo ============================================================
echo   GUARDAR SESION DE TIKTOK
echo ============================================================
echo.
echo Se va a abrir Chrome con TikTok.
echo Inicia sesion con la cuenta de la marca (@brujeriacapilar).
echo El navegador se cierra solo cuando detecta que iniciaste sesion.
echo.
"C:\Users\maria\AppData\Local\Programs\Python\Python312\python.exe" "%~dp0login.py"
echo.
pause

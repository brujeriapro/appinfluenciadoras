@echo off
echo ============================================================
echo   SCRAPER FACEBOOK — Brujeria Capilar
echo ============================================================
echo.

set PYTHON=C:\Users\maria\AppData\Local\Programs\Python\Python312\python.exe
set VENV=%~dp0..\scraper_tiktok\venv_logistica\Scripts\activate.bat

cd /d "%~dp0"

if exist "%VENV%" (
    call "%VENV%"
)

echo Iniciando scraper...
echo (Se abre un browser — no lo cierres mientras corre)
echo.
"%PYTHON%" run.py --max 15
echo.
pause

@echo off
chcp 65001 > nul
echo.
echo ============================================================
echo   DM WATCHER - Brujeria Capilar
echo ============================================================
echo.
echo Revisa cada 20 segundos si hay candidatas aprobadas.
echo Cuando apruebes una en el dashboard, el DM se envia solo.
echo.
echo Cierra esta ventana para detener.
echo.
"C:\Users\maria\AppData\Local\Programs\Python\Python312\python.exe" "%~dp0dm_watcher.py"
pause

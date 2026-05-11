@echo off
chcp 65001 > nul
echo.
echo ============================================================
echo   INSTALAR DM WATCHER EN INICIO DE WINDOWS
echo ============================================================
echo.
echo Esto configura el DM Watcher para que arranque solo
echo cada vez que enciendes tu computador.
echo.

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SCRIPT_DIR=%~dp0"
set "PYTHON=C:\Users\maria\AppData\Local\Programs\Python\Python312\python.exe"
set "VBS=%STARTUP%\dm_watcher_creadoras.vbs"

echo Instalando en:
echo %VBS%
echo.

(
echo Set WShell = CreateObject^("WScript.Shell"^)
echo WShell.Run "cmd /c cd /d ""%SCRIPT_DIR%"" ^&^& ""%PYTHON%"" ""%SCRIPT_DIR%dm_watcher.py"" ^> ""%SCRIPT_DIR%dm_watcher.log"" 2^>^&1", 7, False
) > "%VBS%"

if exist "%VBS%" (
    echo OK instalado.
    echo.
    echo Desde ahora, cada vez que enciendas el computador
    echo el watcher arranca automaticamente en segundo plano.
    echo Los logs quedan en dm_watcher.log en esta carpeta.
    echo.
    echo Para DESINSTALAR, borra este archivo:
    echo %VBS%
) else (
    echo ERROR: No se pudo crear el archivo.
    echo Intenta correr este bat como Administrador.
)
echo.
pause

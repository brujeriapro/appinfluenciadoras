@echo off
echo ============================================================
echo   PASO 1: Guardar sesion de Facebook
echo ============================================================
echo.
echo 1. Se va a abrir Chrome con Facebook
echo 2. Inicia sesion con tu cuenta de Brujeria Capilar
echo 3. Instala la extension Cookie-Editor si no la tienes:
echo    https://chrome.google.com/webstore/detail/cookie-editor/
echo 4. En Cookie-Editor, haz clic en Export ^> Export as JSON
echo 5. Guarda el archivo como facebook_cookies.json
echo    en esta carpeta: %~dp0
echo.
echo Abriendo Facebook en Chrome...
start chrome "https://www.facebook.com"
echo.
pause

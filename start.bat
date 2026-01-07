@echo off
echo ============================================
echo   Demarrage de l'application Badge
echo ============================================
echo.

REM Vérifier si le venv existe
if not exist ".venv" (
    echo Creation de l'environnement virtuel...
    python -m venv .venv
    echo.
)

REM Activer l'environnement virtuel
echo Activation de l'environnement virtuel...
call .venv\Scripts\activate.bat
echo.

REM Installer les dépendances Python si requirements.txt existe
if exist "requirements.txt" (
    echo Installation des dependances Python...
    pip install -r requirements.txt
    echo.
)

REM Installer les dépendances npm si package.json existe
if exist "package.json" (
    echo Installation des dependances npm...
    call npm install
    echo.
)

REM Démarrer l'application
echo Demarrage de l'application...
echo.
call npm start

pause
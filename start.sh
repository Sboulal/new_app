#!/bin/bash

echo "============================================"
echo "   Démarrage de l'application Badge"
echo "============================================"
echo ""

# Vérifier si le venv existe
if [ ! -d ".venv" ]; then
    echo "Création de l'environnement virtuel..."
    python3 -m venv .venv
    echo ""
fi

# Activer l'environnement virtuel
echo "Activation de l'environnement virtuel..."
source .venv/bin/activate
echo ""

# Installer les dépendances Python si requirements.txt existe
if [ -f "requirements.txt" ]; then
    echo "Installation des dépendances Python..."
    pip install -r requirements.txt
    echo ""
fi

# Installer les dépendances npm si package.json existe
if [ -f "package.json" ]; then
    echo "Installation des dépendances npm..."
    npm install
    echo ""
fi

# Démarrer l'application
echo "Démarrage de l'application..."
echo ""
npm start
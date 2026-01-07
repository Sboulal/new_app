/**
 * Badge Management System - Electron Main Process (IMPROVED)
 * Gère la fenêtre, le serveur Flask et l'intégration système
 */

const { app, BrowserWindow, ipcMain, Menu, Tray, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const Store = require('electron-store');

// Configuration store
const store = new Store();

// Variables globales
let mainWindow = null;
let tray = null;
let flaskProcess = null;
const FLASK_PORT = process.env.FLASK_PORT || 5000;
const FLASK_HOST = process.env.FLASK_HOST || '127.0.0.1';
const isDev = !app.isPackaged;

// Charger les variables d'environnement depuis .env
function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const envVars = {};
        
        envContent.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    envVars[key.trim()] = valueParts.join('=').trim();
                }
            }
        });
        
        console.log('Environment variables loaded from .env');
        return envVars;
    }
    console.warn('.env file not found, using defaults');
    return {};
}

const envVars = loadEnvFile();

// Chemin vers Python et le script Flask
function getPythonPath() {
    // Essayer plusieurs chemins Python
    const pythonCommands = process.platform === 'win32' 
        ? ['python', 'python3', 'py'] 
        : ['python3', 'python'];
    
    for (const cmd of pythonCommands) {
        try {
            const { execSync } = require('child_process');
            execSync(`${cmd} --version`, { stdio: 'ignore' });
            console.log(`Using Python command: ${cmd}`);
            return cmd;
        } catch (e) {
            continue;
        }
    }
    
    throw new Error('Python not found. Please install Python 3.7+');
}

function getFlaskScriptPath() {
    const scriptPath = path.join(__dirname, 'api_server.py');
    console.log(`Checking Flask script at: ${scriptPath}`);
    console.log(`File exists: ${fs.existsSync(scriptPath)}`);
    return scriptPath;
}

// Vérifier si Flask répond
function checkFlaskServer(maxRetries = 10, retryDelay = 1000) {
    return new Promise((resolve, reject) => {
        let retries = 0;
        
        const check = () => {
            const options = {
                hostname: FLASK_HOST,
                port: FLASK_PORT,
                path: '/',
                method: 'GET',
                timeout: 2000
            };
            
            const req = http.request(options, (res) => {
                if (res.statusCode === 200) {
                    console.log('✓ Flask server is responding');
                    resolve(true);
                } else {
                    retryCheck();
                }
            });
            
            req.on('error', () => {
                retryCheck();
            });
            
            req.on('timeout', () => {
                req.destroy();
                retryCheck();
            });
            
            req.end();
        };
        
        const retryCheck = () => {
            retries++;
            if (retries < maxRetries) {
                console.log(`Waiting for Flask server... (${retries}/${maxRetries})`);
                setTimeout(check, retryDelay);
            } else {
                reject(new Error('Flask server did not respond in time'));
            }
        };
        
        check();
    });
}

// Créer la fenêtre principale
function createWindow() {
    let windowIcon = null;
    const iconPath = path.join(__dirname, 'assets/icon.ico');
    
    if (fs.existsSync(iconPath)) {
        windowIcon = iconPath;
    }

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        icon: windowIcon,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false
        },
        backgroundColor: '#667eea',
        show: false,
        frame: true,
        titleBarStyle: 'default'
    });

    const htmlPath = path.join(__dirname, 'renderer.html');
    if (fs.existsSync(htmlPath)) {
        mainWindow.loadFile(htmlPath);
    } else {
        console.error(`renderer.html not found at: ${htmlPath}`);
        mainWindow.loadURL('data:text/html,<h1>Error: renderer.html not found</h1>');
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        // Envoyer l'URL du serveur Flask au renderer
        mainWindow.webContents.send('flask-server-ready', {
            url: `http://${FLASK_HOST}:${FLASK_PORT}`,
            host: FLASK_HOST,
            port: FLASK_PORT
        });
        
        // if (isDev) {
        //     mainWindow.webContents.openDevTools();
        // }
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    createMenu();
}

/**
 * Afficher la boîte de dialogue de configuration d'imprimante
 */
function showPrinterConfigDialog() {
    const currentConfig = store.get('printer', {
        model: 'Brother QL-820NWB',
        identifier: 'USB',
        labelSize: '62mm',
        port: 'USB001',
        dpi: 300
    });
    
    const configWindow = new BrowserWindow({
        width: 500,
        height: 650,
        parent: mainWindow,
        modal: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        title: 'Configuration de l\'imprimante',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const configHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                padding: 20px;
                background: #f5f5f5;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
                color: #667eea;
                margin-bottom: 30px;
                font-size: 24px;
            }
            .form-group {
                margin-bottom: 20px;
            }
            label {
                display: block;
                margin-bottom: 8px;
                color: #333;
                font-weight: 500;
            }
            input, select {
                width: 100%;
                padding: 10px;
                border: 2px solid #e0e0e0;
                border-radius: 5px;
                font-size: 14px;
                transition: border-color 0.3s;
            }
            input:focus, select:focus {
                outline: none;
                border-color: #667eea;
            }
            .button-group {
                display: flex;
                gap: 10px;
                margin-top: 30px;
            }
            button {
                flex: 1;
                padding: 12px;
                border: none;
                border-radius: 5px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s;
            }
            .btn-primary {
                background: #667eea;
                color: white;
            }
            .btn-primary:hover {
                background: #5568d3;
            }
            .btn-secondary {
                background: #e0e0e0;
                color: #333;
            }
            .btn-secondary:hover {
                background: #d0d0d0;
            }
            .info-box {
                background: #e8eaf6;
                padding: 15px;
                border-radius: 5px;
                margin-top: 20px;
                font-size: 13px;
                color: #555;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>⚙️ Configuration de l'imprimante</h1>
            
            <form id="printerForm">
                <div class="form-group">
                    <label for="model">Modèle d'imprimante</label>
                    <select id="model">
                        <option value="Brother QL-820NWB">Brother QL-820NWB</option>
                        <option value="Brother QL-800">Brother QL-800</option>
                        <option value="Brother QL-700">Brother QL-700</option>
                        <option value="Zebra ZD410">Zebra ZD410</option>
                        <option value="Dymo LabelWriter 450">Dymo LabelWriter 450</option>
                        <option value="Autre">Autre</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="identifier">Type de connexion</label>
                    <select id="identifier">
                        <option value="USB">USB</option>
                        <option value="Network">Réseau</option>
                        <option value="Bluetooth">Bluetooth</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="port">Port / Adresse</label>
                    <input type="text" id="port" placeholder="Ex: USB001 ou 192.168.1.100">
                </div>

                <div class="form-group">
                    <label for="labelSize">Taille d'étiquette</label>
                    <select id="labelSize">
                        <option value="62mm">62mm (standard)</option>
                        <option value="29mm">29mm (petite)</option>
                        <option value="102mm">102mm (grande)</option>
                        <option value="12mm">12mm (très petite)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="dpi">Résolution (DPI)</label>
                    <select id="dpi">
                        <option value="203">203 DPI</option>
                        <option value="300">300 DPI</option>
                        <option value="600">600 DPI</option>
                    </select>
                </div>

                <div class="info-box">
                    💡 <strong>Astuce :</strong> Pour les imprimantes Brother QL, utilisez USB et 300 DPI pour une qualité optimale.
                </div>

                <div class="button-group">
                    <button type="button" class="btn-secondary" onclick="window.close()">
                        Annuler
                    </button>
                    <button type="submit" class="btn-primary">
                        Enregistrer
                    </button>
                </div>
            </form>
        </div>

        <script>
            const { ipcRenderer } = require('electron');
            const config = ${JSON.stringify(currentConfig)};
            
            document.getElementById('model').value = config.model;
            document.getElementById('identifier').value = config.identifier;
            document.getElementById('port').value = config.port;
            document.getElementById('labelSize').value = config.labelSize;
            document.getElementById('dpi').value = config.dpi;

            document.getElementById('printerForm').addEventListener('submit', (e) => {
                e.preventDefault();
                
                const newConfig = {
                    model: document.getElementById('model').value,
                    identifier: document.getElementById('identifier').value,
                    port: document.getElementById('port').value,
                    labelSize: document.getElementById('labelSize').value,
                    dpi: parseInt(document.getElementById('dpi').value)
                };

                ipcRenderer.send('save-printer-config', newConfig);
            });
        </script>
    </body>
    </html>
    `;

    configWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(configHTML));
}

/**
 * Afficher la configuration actuelle de l'imprimante
 */
function showCurrentPrinterConfig() {
    const config = store.get('printer', {
        model: 'Non configuré',
        identifier: 'N/A',
        labelSize: 'N/A',
        port: 'N/A',
        dpi: 0
    });

    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Configuration actuelle',
        message: 'Configuration de l\'imprimante',
        detail: `📌 Modèle: ${config.model}\n🔌 Connexion: ${config.identifier}\n📍 Port: ${config.port}\n📏 Taille étiquette: ${config.labelSize}\n🎨 Résolution: ${config.dpi} DPI`,
        buttons: ['OK', 'Modifier'],
        defaultId: 0
    }).then(result => {
        if (result.response === 1) {
            showPrinterConfigDialog();
        }
    });
}

/**
 * Tester l'imprimante
 */
function testPrinter() {
    const config = store.get('printer');
    
    if (!config) {
        dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Aucune configuration',
            message: 'Veuillez d\'abord configurer votre imprimante',
            buttons: ['OK', 'Configurer maintenant']
        }).then(result => {
            if (result.response === 1) {
                showPrinterConfigDialog();
            }
        });
        return;
    }

    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Test d\'impression',
        message: 'Test de l\'imprimante',
        detail: `Une page de test va être envoyée à:\n${config.model} (${config.identifier})\n\nAssurez-vous que l'imprimante est allumée et connectée.`,
        buttons: ['Annuler', 'Imprimer la page de test']
    }).then(result => {
        if (result.response === 1) {
            if (mainWindow) {
                mainWindow.webContents.send('print-test-page', config);
            }
        }
    });
}

// Créer le menu de l'application
function createMenu() {
    const template = [
        {
            label: 'Fichier',
            submenu: [
                {
                    label: 'Nouveau Badge',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('menu-action', 'new-badge');
                        }
                    }
                },
                {
                    label: 'Importer Excel',
                    accelerator: 'CmdOrCtrl+I',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('menu-action', 'import-excel');
                        }
                    }
                },
                {
                    label: 'Exporter Excel',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('menu-action', 'export-excel');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quitter',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        app.isQuitting = true;
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Édition',
            submenu: [
                { role: 'undo', label: 'Annuler' },
                { role: 'redo', label: 'Rétablir' },
                { type: 'separator' },
                { role: 'cut', label: 'Couper' },
                { role: 'copy', label: 'Copier' },
                { role: 'paste', label: 'Coller' },
                { role: 'selectAll', label: 'Tout sélectionner' }
            ]
        },
        {
            label: 'Affichage',
            submenu: [
                {
                    label: 'Actualiser',
                    accelerator: 'F5',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('menu-action', 'refresh');
                        }
                    }
                },
                { type: 'separator' },
                { role: 'resetZoom', label: 'Zoom par défaut' },
                { role: 'zoomIn', label: 'Zoom +' },
                { role: 'zoomOut', label: 'Zoom -' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Plein écran' }
            ]
        },
        {
            label: 'Imprimante',
            submenu: [
                {
                    label: 'Configurer l\'imprimante',
                    accelerator: 'CmdOrCtrl+P',
                    click: () => {
                        showPrinterConfigDialog();
                    }
                },
                {
                    label: 'Voir la configuration',
                    click: () => {
                        showCurrentPrinterConfig();
                    }
                },
                { type: 'separator' },
                {
                    label: 'Tester l\'imprimante',
                    click: () => {
                        testPrinter();
                    }
                }
            ]
        },
        {
            label: 'Aide',
            submenu: [
                {
                    label: 'Documentation',
                    click: () => {
                        shell.openExternal('https://github.com/your-repo');
                    }
                },
                {
                    label: 'Ouvrir les logs',
                    click: () => {
                        const logPath = path.join(app.getPath('userData'), 'logs');
                        shell.openPath(logPath);
                    }
                },
                { type: 'separator' },
                {
                    label: 'À propos',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'À propos',
                            message: 'Badge Management System',
                            detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChrome: ${process.versions.chrome}\n\nServeur Flask: http://${FLASK_HOST}:${FLASK_PORT}`
                        });
                    }
                }
            ]
        }
    ];

    if (isDev) {
        template.push({
            label: 'Développeur',
            submenu: [
                { role: 'reload', label: 'Recharger' },
                { role: 'forceReload', label: 'Forcer le rechargement' },
                { role: 'toggleDevTools', label: 'Outils de développement' },
                { type: 'separator' },
                {
                    label: 'Ouvrir Console Flask',
                    click: () => {
                        shell.openExternal(`http://${FLASK_HOST}:${FLASK_PORT}`);
                    }
                }
            ]
        });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Créer l'icône dans le system tray
function createTray() {
    try {
        let trayIcon = null;
        const iconPath = path.join(__dirname, 'assets', 
            process.platform === 'win32' ? 'icon.ico' : 'icon.png'
        );
        
        if (fs.existsSync(iconPath)) {
            trayIcon = nativeImage.createFromPath(iconPath);
        } else {
            console.log('Icon file not found, using fallback');
            trayIcon = nativeImage.createEmpty();
        }
        
        tray = new Tray(trayIcon);
        
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Afficher',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                    }
                }
            },
            {
                label: 'Nouveau Badge',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.webContents.send('menu-action', 'new-badge');
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'Configuration Imprimante',
                click: () => {
                    showPrinterConfigDialog();
                }
            },
            { type: 'separator' },
            {
                label: 'Quitter',
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                }
            }
        ]);
        
        tray.setToolTip('Badge Management System');
        tray.setContextMenu(contextMenu);
        
        tray.on('double-click', () => {
            if (mainWindow) {
                mainWindow.show();
            }
        });
        
        console.log('System tray created successfully');
    } catch (error) {
        console.error('Error creating tray:', error);
    }
}

// Démarrer le serveur Flask
function startFlaskServer() {
    return new Promise((resolve, reject) => {
        try {
            const pythonPath = getPythonPath();
            const scriptPath = getFlaskScriptPath();
            
            console.log(`Démarrage du serveur Flask...`);
            console.log(`Python: ${pythonPath}`);
            console.log(`Script: ${scriptPath}`);
            
            if (!fs.existsSync(scriptPath)) {
                const error = new Error(`Script Flask introuvable: ${scriptPath}`);
                console.error(error.message);
                reject(error);
                return;
            }
            
            // Combiner les variables d'environnement
            const flaskEnv = {
                ...process.env,
                ...envVars,
                FLASK_PORT: FLASK_PORT.toString(),
                FLASK_HOST: FLASK_HOST,
                FLASK_DEBUG: isDev ? 'True' : 'False',
                PYTHONUNBUFFERED: '1'  // Pour voir les logs en temps réel
            };
            
            flaskProcess = spawn(pythonPath, [scriptPath], {
                cwd: path.dirname(scriptPath),
                env: flaskEnv,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let serverStarted = false;
            let startupOutput = '';
            
            flaskProcess.stdout.on('data', (data) => {
                const output = data.toString();
                startupOutput += output;
                console.log(`[Flask] ${output.trim()}`);
                
                // Détecter le démarrage réussi
                if ((output.includes('Running on') || 
                     output.includes('Serving Flask') ||
                     output.includes('Server starting')) && !serverStarted) {
                    serverStarted = true;
                    
                    // Vérifier que le serveur répond réellement
                    checkFlaskServer(10, 1000)
                        .then(() => {
                            console.log('✓ Flask server verified and responding');
                            resolve();
                        })
                        .catch((err) => {
                            console.error('Flask server not responding:', err);
                            reject(err);
                        });
                }
            });
            
            flaskProcess.stderr.on('data', (data) => {
                const output = data.toString();
                console.error(`[Flask Error] ${output.trim()}`);
                
                // Certaines erreurs critiques
                if (output.includes('Address already in use') ||
                    output.includes('Permission denied') ||
                    output.includes('ModuleNotFoundError') ||
                    output.includes('ImportError')) {
                    if (!serverStarted) {
                        reject(new Error(output));
                    }
                }
            });
            
            flaskProcess.on('error', (error) => {
                console.error('Erreur de processus Flask:', error);
                if (!serverStarted) {
                    reject(error);
                }
            });
            
            flaskProcess.on('close', (code) => {
                console.log(`Serveur Flask arrêté avec le code ${code}`);
                if (code !== 0 && code !== null) {
                    console.error('Flask startup output:', startupOutput);
                }
                flaskProcess = null;
            });
            
            // Timeout de secours
            setTimeout(() => {
                if (!serverStarted) {
                    console.log('Timeout: Vérification manuelle du serveur Flask...');
                    checkFlaskServer(5, 1000)
                        .then(() => {
                            console.log('✓ Flask server responding after timeout');
                            serverStarted = true;
                            resolve();
                        })
                        .catch((err) => {
                            console.error('Flask server failed to start in time');
                            console.error('Startup output:', startupOutput);
                            reject(new Error('Flask server did not start in time'));
                        });
                }
            }, 15000);
            
        } catch (error) {
            console.error('Error in startFlaskServer:', error);
            reject(error);
        }
    });
}

// Arrêter le serveur Flask
function stopFlaskServer() {
    if (flaskProcess) {
        console.log('Arrêt du serveur Flask...');
        
        // Essayer d'arrêter proprement d'abord
        flaskProcess.kill('SIGTERM');
        
        // Force kill après 5 secondes si toujours en cours
        setTimeout(() => {
            if (flaskProcess) {
                console.log('Force kill du serveur Flask...');
                flaskProcess.kill('SIGKILL');
                flaskProcess = null;
            }
        }, 5000);
    }
}

// Vérifier si le port est disponible
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();
        
        server.once('error', () => {
            resolve(false);
        });
        
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        
        server.listen(port, FLASK_HOST);
    });
}

// IPC Handlers
ipcMain.handle('get-app-path', () => {
    return app.getPath('userData');
});

ipcMain.handle('get-flask-url', () => {
    return `http://${FLASK_HOST}:${FLASK_PORT}`;
});

ipcMain.handle('open-file-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
});

ipcMain.handle('save-file-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
});

ipcMain.handle('show-message', (event, options) => {
    return dialog.showMessageBox(mainWindow, options);
});

ipcMain.handle('get-printer-config', () => {
    return store.get('printer', null);
});

ipcMain.on('save-printer-config', (event, config) => {
    try {
        store.set('printer', config);
        
        dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
            type: 'info',
            title: 'Configuration enregistrée',
            message: 'La configuration de l\'imprimante a été enregistrée avec succès !',
            buttons: ['OK']
        }).then(() => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow && focusedWindow !== mainWindow) {
                focusedWindow.close();
            }
            
            if (mainWindow) {
                mainWindow.webContents.send('printer-config-updated', config);
            }
        });
    } catch (error) {
        dialog.showErrorBox('Erreur', 'Impossible d\'enregistrer la configuration: ' + error.message);
    }
});

// Événements de l'application
app.whenReady().then(async () => {
    console.log('='.repeat(60));
    console.log('Application Badge Management System');
    console.log('='.repeat(60));
    console.log(`Mode: ${isDev ? 'DÉVELOPPEMENT' : 'PRODUCTION'}`);
    console.log(`Plateforme: ${process.platform}`);
    console.log(`Flask Host: ${FLASK_HOST}`);
    console.log(`Flask Port: ${FLASK_PORT}`);
    console.log(`__dirname: ${__dirname}`);
    console.log('='.repeat(60));
    
    // Vérifier si le port est disponible
    const portAvailable = await isPortAvailable(FLASK_PORT);
    if (!portAvailable) {
        const choice = dialog.showMessageBoxSync({
            type: 'error',
            title: 'Port occupé',
            message: `Le port ${FLASK_PORT} est déjà utilisé.`,
            detail: 'Voulez-vous fermer l\'application qui utilise ce port et réessayer ?',
            buttons: ['Quitter', 'Réessayer']
        });
        
        if (choice === 0) {
            app.quit();
            return;
        }
    }
    
    // Démarrer Flask
    try {
        console.log('Démarrage du serveur Flask...');
        await startFlaskServer();
        console.log('✓ Serveur Flask démarré avec succès');
        console.log(`✓ Serveur accessible sur http://${FLASK_HOST}:${FLASK_PORT}`);
    } catch (error) {
        console.error('✗ Erreur au démarrage de Flask:', error);
        
        const choice = dialog.showMessageBoxSync({
            type: 'error',
            title: 'Erreur de démarrage Flask',
            message: 'Impossible de démarrer le serveur Flask',
            detail: `${error.message}\n\nVérifiez que :\n- Python est installé\n- Les dépendances sont installées (pip install -r requirements.txt)\n- Le fichier api_server.py existe\n- Le port ${FLASK_PORT} est disponible`,
            buttons: ['Quitter', 'Continuer sans serveur']
        });
        
        if (choice === 0) {
            app.quit();
            return;
        }
    }
    
    // Créer la fenêtre et le tray
    createWindow();
    createTray();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else if (mainWindow) {
            mainWindow.show();
        }
    });
});

app.on('before-quit', () => {
    app.isQuitting = true;
    stopFlaskServer();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    dialog.showErrorBox('Erreur critique', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Badge Management System - Main process loaded');
/**
 * Badge Management System - Preload Script
 * Expose les APIs sécurisées au renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

// API sécurisée exposée au renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Chemins et configuration
    getAppPath: () => ipcRenderer.invoke('get-app-path'),
    getFlaskUrl: () => ipcRenderer.invoke('get-flask-url'),
    
    // Dialogues de fichiers
    openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
    saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
    showMessage: (options) => ipcRenderer.invoke('show-message', options),
    
    // Configuration imprimante
    getPrinterConfig: () => ipcRenderer.invoke('get-printer-config'),
    savePrinterConfig: (config) => ipcRenderer.send('save-printer-config', config),
    
    // Événements du menu
    onMenuAction: (callback) => {
        ipcRenderer.on('menu-action', (event, action) => callback(action));
    },
    
    // Événements de l'imprimante
    onPrintTestPage: (callback) => {
        ipcRenderer.on('print-test-page', (event, config) => callback(config));
    },
    
    onPrinterConfigUpdated: (callback) => {
        ipcRenderer.on('printer-config-updated', (event, config) => callback(config));
    },
    
    // Événement Flask prêt
    onFlaskServerReady: (callback) => {
        ipcRenderer.on('flask-server-ready', (event, data) => callback(data));
    },
    
    // API Flask (helper functions)
    flask: {
        /**
         * Fait une requête GET à l'API Flask
         */
        get: async (endpoint) => {
            const baseUrl = await ipcRenderer.invoke('get-flask-url');
            const url = `${baseUrl}${endpoint}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        },
        
        /**
         * Fait une requête POST à l'API Flask
         */
        post: async (endpoint, data) => {
            const baseUrl = await ipcRenderer.invoke('get-flask-url');
            const url = `${baseUrl}${endpoint}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        },
        
        /**
         * Fait une requête PUT à l'API Flask
         */
        put: async (endpoint, data) => {
            const baseUrl = await ipcRenderer.invoke('get-flask-url');
            const url = `${baseUrl}${endpoint}`;
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        },
        
        /**
         * Fait une requête DELETE à l'API Flask
         */
        delete: async (endpoint) => {
            const baseUrl = await ipcRenderer.invoke('get-flask-url');
            const url = `${baseUrl}${endpoint}`;
            const response = await fetch(url, {
                method: 'DELETE'
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        },
        
        /**
         * Télécharge un fichier depuis Flask
         */
        downloadFile: async (endpoint) => {
            const baseUrl = await ipcRenderer.invoke('get-flask-url');
            const url = `${baseUrl}${endpoint}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.blob();
        }
    }
});

console.log('Preload script loaded - electronAPI exposed to renderer');
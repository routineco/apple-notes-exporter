const { contextBridge, ipcRenderer, shell } = require('electron');

// Keep track of registered callbacks
let progressCallback = null;
let scriptOutputCallback = null;

contextBridge.exposeInMainWorld(
    'electron',
    {
        scan: () => ipcRenderer.invoke('scan-notes'),
        onScriptOutput: (callback) => ipcRenderer.on('script-output', (_, data) => callback(data)),
        exportNote: (paths) => ipcRenderer.invoke('export-note', paths),
        onExportProgress: (callback) => ipcRenderer.on('export-progress', (_, data) => callback(data)),
        exportToPDF: (html, outputPath) => ipcRenderer.invoke('export-to-pdf', { html, outputPath }),
        selectDirectory: () => ipcRenderer.invoke('select-directory'),
        checkDirectory: (path) => ipcRenderer.invoke('check-directory', path),
        checkContentDir: () => ipcRenderer.invoke('check-content-dir'),
        catalogContentDir: () => ipcRenderer.invoke('catalog-content-dir'),
        clearContentDir: () => ipcRenderer.invoke('clear-content-dir'),
        openExternal: (url) => ipcRenderer.invoke('open-external', url)
    }
); 
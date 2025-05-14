const { contextBridge, ipcRenderer, shell } = require('electron');

// Keep track of registered callbacks
let progressCallback = null;
let scriptOutputCallback = null;

contextBridge.exposeInMainWorld(
    'electron',
    {
        scan: () => ipcRenderer.invoke('scan-notes'),
        onScriptOutput: (callback) => ipcRenderer.on('script-output', (_, data) => callback(data)),
        exportNotes: (paths) => ipcRenderer.invoke('export-notes', paths),
        onExportProgress: (callback) => ipcRenderer.on('export-progress', (_, data) => callback(data)),
        exportToMarkdown: (html, outputPath) => ipcRenderer.invoke('export-to-markdown', { html, outputPath }),
        exportToRTF: (html, outputPath) => ipcRenderer.invoke('export-to-rtf', { html, outputPath }),
        exportToPDF: (html, outputPath) => ipcRenderer.invoke('export-to-pdf', { html, outputPath }),
        selectDirectory: () => ipcRenderer.invoke('select-directory'),
        checkDirectory: (path) => ipcRenderer.invoke('check-directory', path),
        openExternal: (url) => shell.openExternal(url)
    }
); 
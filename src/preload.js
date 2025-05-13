const { contextBridge, ipcRenderer } = require('electron');

// Keep track of registered callbacks
let progressCallback = null;

contextBridge.exposeInMainWorld('electron', {
    listNotes: () => ipcRenderer.invoke('list-notes'),
    exportNotes: (paths) => ipcRenderer.invoke('export-notes', paths),
    onExportProgress: (callback) => {
        // Remove previous listener if it exists
        if (progressCallback) {
            ipcRenderer.removeListener('export-progress', progressCallback);
        }
        // Register new listener
        progressCallback = (_, data) => callback(data);
        ipcRenderer.on('export-progress', progressCallback);
    },
    exportToMarkdown: (html, outputPath) => ipcRenderer.invoke('export-to-markdown', { html, outputPath }),
    exportToRTF: (html, outputPath) => ipcRenderer.invoke('export-to-rtf', { html, outputPath }),
    exportToPDF: (html, outputPath) => ipcRenderer.invoke('export-to-pdf', { html, outputPath }),
}); 
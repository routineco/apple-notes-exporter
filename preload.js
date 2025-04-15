const { contextBridge, ipcRenderer } = require('electron');

// Keep track of registered callbacks
let progressCallback = null;

contextBridge.exposeInMainWorld('electron', {
    listNotes: () => ipcRenderer.invoke('list-notes'),
    exportNotes: () => ipcRenderer.invoke('export-notes'),
    onExportProgress: (callback) => {
        // Remove previous listener if it exists
        if (progressCallback) {
            ipcRenderer.removeListener('export-progress', progressCallback);
        }
        // Register new listener
        progressCallback = (_, data) => callback(data);
        ipcRenderer.on('export-progress', progressCallback);
    }
}); 
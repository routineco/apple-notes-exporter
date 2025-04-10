const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    exportNotes: () => ipcRenderer.invoke('export-notes'),
    onExportProgress: (callback) => ipcRenderer.on('export-progress', (_, data) => callback(data))
}); 
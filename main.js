const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle export request
ipcMain.handle('export-notes', async () => {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'export_notes.jxa');
        const osascript = spawn('osascript', ['-l', 'JavaScript', scriptPath]);

        let totalNotes = 0;
        let currentNote = 0;
        let errorOutput = '';

        osascript.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('PROGRESS:')) {
                    const [_, progress, title] = line.split(':');
                    const [current, total] = progress.split('/').map(Number);
                    
                    if (!totalNotes) totalNotes = total;
                    currentNote = current;
                    
                    mainWindow.webContents.send('export-progress', {
                        progress: Math.round((current / total) * 100),
                        notesProcessed: current,
                        totalNotes: total,
                        currentNote: title
                    });
                }
                console.log('Script output:', line);
            }
        });

        osascript.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error('Script error:', data.toString());
        });

        osascript.on('close', (code) => {
            if (code === 0 && !errorOutput) {
                resolve({
                    success: true,
                    message: `Successfully exported ${currentNote} of ${totalNotes} notes to Documents/ExportedNotes`
                });
            } else {
                resolve({
                    success: false,
                    message: errorOutput || 'Export failed. Please make sure Notes app is closed.'
                });
            }
        });

        osascript.on('error', (error) => {
            reject({
                success: false,
                message: `Failed to start export: ${error.message}`
            });
        });
    });
}); 

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let isExporting = false;

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
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle export request
ipcMain.handle('export-notes', async () => {
    // Prevent multiple simultaneous exports
    if (isExporting) {
        return {
            success: false,
            message: 'Export already in progress'
        };
    }

    isExporting = true;

    try {
        return await new Promise((resolve, reject) => {
            const scriptPath = path.join(__dirname, 'export_notes.jxa');
            const osascript = spawn('osascript', ['-l', 'JavaScript', scriptPath]);

            let totalNotes = 0;
            let errorOutput = '';

            osascript.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('PROGRESS:')) {
                        const [_, current, title] = line.split(':');
                        const currentNote = parseInt(current);
                        
                        mainWindow.webContents.send('export-progress', {
                            progress: currentNote,
                            notesProcessed: currentNote,
                            currentNote: title
                        });
                    } else if (line.startsWith('Found ')) {
                        const match = line.match(/Found (\d+) notes/);
                        if (match) {
                            const count = parseInt(match[1]);
                            totalNotes += count;
                            mainWindow.webContents.send('export-progress', {
                                totalNotes: totalNotes
                            });
                        }
                    }
                    console.log('Script output:', line);
                }
            });

            osascript.stderr.on('data', (data) => {
                const line = data.toString();
                // Only log actual errors, not the "Script error:" prefix
                if (!line.startsWith('Script error:')) {
                    errorOutput += line;
                    console.error('Script error:', line);
                }
            });

            osascript.on('close', (code) => {
                isExporting = false;
                if (code === 0 && !errorOutput) {
                    resolve({
                        success: true,
                        message: `Successfully exported ${totalNotes} notes to Documents/ExportedNotes`
                    });
                } else {
                    resolve({
                        success: false,
                        message: errorOutput || 'Export failed. Please make sure Notes app is closed.'
                    });
                }
            });

            osascript.on('error', (error) => {
                isExporting = false;
                reject({
                    success: false,
                    message: `Failed to start export: ${error.message}`
                });
            });
        });
    } catch (error) {
        isExporting = false;
        throw error;
    }
}); 

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

// Handle list notes request
ipcMain.handle('list-notes', async () => {
    try {
        return await new Promise((resolve, reject) => {
            const scriptPath = path.join(__dirname, 'list_notes.jxa');
            const osascript = spawn('osascript', ['-l', 'JavaScript', scriptPath]);

            let output = '';
            let errorOutput = '';

            osascript.stdout.on('data', (data) => {
                output += data.toString();
            });

            osascript.stderr.on('data', (data) => {
                const line = data.toString();
                if (!line.startsWith('Script error:')) {
                    errorOutput += line;
                    console.error('Script error:', line);
                }
            });

            osascript.on('close', (code) => {
                if (code === 0 && !errorOutput) {
                    resolve(output);
                } else {
                    reject(new Error(errorOutput || 'Failed to list notes'));
                }
            });

            osascript.on('error', (error) => {
                reject(new Error(`Failed to start script: ${error.message}`));
            });
        });
    } catch (error) {
        throw error;
    }
});

// Handle export request
ipcMain.handle('export-notes', async () => {
    if (isExporting) {
        throw new Error('Export already in progress');
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
                if (!line.startsWith('Script error:')) {
                    errorOutput += line;
                    console.error('Script error:', line);
                }
            });

            osascript.on('close', (code) => {
                isExporting = false;
                if (code === 0 && !errorOutput) {
                    resolve(totalNotes.toString());
                } else {
                    reject(new Error(errorOutput || 'Export failed. Please make sure Notes app is closed.'));
                }
            });

            osascript.on('error', (error) => {
                isExporting = false;
                reject(new Error(`Failed to start export: ${error.message}`));
            });
        });
    } catch (error) {
        isExporting = false;
        throw error;
    }
}); 

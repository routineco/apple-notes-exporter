const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs').promises;
const { catalog } = require('./utils');
const { CONTENT_DIR } = require('./constants');
require('@electron/remote/main').initialize();

// Helper function to log script execution
function logScriptExecution(scriptPath, args) {
    console.log('[script]', scriptPath, args.join(' '));
}

let mainWindow;
let isExporting = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    require('@electron/remote/main').enable(mainWindow.webContents);
    mainWindow.loadFile('src/index.html');
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

// Handle opening external URLs
ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
});

// Handle list notes request
ipcMain.handle('scan-notes', async () => {
    try {
        return await new Promise((resolve, reject) => {
            const scriptPath = path.join(__dirname, '..', 'scripts', 'scan.applescript');
            logScriptExecution(scriptPath, [CONTENT_DIR]);
            
            const osascript = spawn('osascript', [scriptPath, CONTENT_DIR]);

            let errorOutput = '';

            osascript.stderr.on('data', (data) => {
                const output = data.toString();
                // Emit the script output event
                mainWindow.webContents.send('script-output', output);
                // Only treat as error if it's not an informational log
                if (!output.includes('[error]') && !output.includes('[warning]')) {
                    errorOutput += output;
                }
                console.log('AppleScript log:', output);
            });

            osascript.stdout.on('data', (data) => {
                const output = data.toString();
                mainWindow.webContents.send('script-output', output);
                console.log('AppleScript output:', output);
            });

            osascript.on('close', async (code) => {
                console.log('AppleScript finished with code:', code);
                if (code === 0) {
                    try {
                        // Browse the CONTENT_DIR hierarchy and build the record
                        const structure = await catalog(CONTENT_DIR);
                        const jsonString = JSON.stringify(structure);

                        console.log('JSON string:', jsonString);
                        resolve(jsonString);
                    } catch (e) {
                        console.error('Error processing output file:', e);
                        reject(new Error(`Failed to process output file: ${e.message}`));
                    }
                } else {
                    console.error('Script failed:', errorOutput);
                    reject(new Error(errorOutput || 'Failed to list notes'));
                }
            });

            osascript.on('error', (error) => {
                console.error('Failed to start script:', error);
                reject(new Error(`Failed to start script: ${error.message}`));
            });
        });
    } catch (error) {
        console.error('Top level error:', error);
        throw error;
    }
});

// Helper function to create directory recursively
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

// Helper function to get relative note path
function getRelativeNotePath(notePath) {
    const parts = notePath.split('/');
    // Keep the account name in the path
    return parts.join('/');
}

// Handle export request
ipcMain.handle('export-note', async (event, [notePath, outputDir, format]) => {
    if (isExporting) {
        throw new Error('Export already in progress');
    }

    if (!notePath || !outputDir) {
        throw new Error('Invalid parameters: notePath and outputDir are required');
    }

    console.log('Exporting note:', notePath);
    console.log('To directory:', outputDir);
    console.log('Format:', format);
    isExporting = true;

    try {
        // Validate note path components
        const pathComponents = notePath.split('/').filter(Boolean);
        if (pathComponents.length < 2) {
            throw new Error(`Invalid note path: ${notePath}. Path must include account and note name.`);
        }

        const accountName = pathComponents[0];
        const noteName = pathComponents[pathComponents.length - 1];
        console.log('Path components:', {
            account: accountName,
            folders: pathComponents.slice(1, -1),
            note: noteName
        });

        // Use existing HTML file from CONTENT_DIR
        const sourceHtmlPath = path.join(CONTENT_DIR, `${notePath}.html`);
        console.log('Source HTML file:', sourceHtmlPath);

        // Check if the HTML file exists
        try {
            await fs.access(sourceHtmlPath);
        } catch (error) {
            throw new Error(`HTML file not found: ${sourceHtmlPath}`);
        }

        // Default to HTML if format is undefined
        const exportFormat = format || 'html';
        console.log('Using export format:', exportFormat);

        // Create the target path
        const extension = exportFormat === 'html' ? '.html' : 
                         exportFormat === 'pdf' ? '.pdf' : '.md';
        
        // Keep the complete folder hierarchy including the Notes folder
        const targetFolderPath = pathComponents.slice(1, -1).join('/');
            
        // Construct the final target path
        const targetPath = targetFolderPath
            ? path.join(outputDir, accountName, targetFolderPath, noteName + extension)
            : path.join(outputDir, accountName, noteName + extension);
        
        console.log('Target path:', targetPath);
        
        // Ensure the target directory exists
        await ensureDirectoryExists(path.dirname(targetPath));

        if (exportFormat === 'html') {
            // For HTML, just copy the file to the right location
            console.log('Copying HTML file to:', targetPath);
            await fs.copyFile(sourceHtmlPath, targetPath);
        } else if (exportFormat === 'markdown') {
            // For Markdown, convert the HTML file
            const htmlToMdScript = path.join(__dirname, '..', 'scripts', 'html-to-md.js');
            logScriptExecution(htmlToMdScript, [sourceHtmlPath, targetPath]);
            
            await new Promise((resolve, reject) => {
                const node = spawn('node', [htmlToMdScript, sourceHtmlPath, targetPath]);

                let errorOutput = '';

                node.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                node.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(errorOutput || 'Failed to convert HTML to Markdown'));
                    }
                });

                node.on('error', (error) => {
                    reject(new Error(`Failed to start HTML to Markdown conversion: ${error.message}`));
                });
            });
        } else if (exportFormat === 'pdf') {
            // For PDF, convert the HTML file using html-to-pdf.js
            const htmlToPdfScript = path.join(__dirname, '..', 'scripts', 'html-to-pdf.js');
            logScriptExecution(htmlToPdfScript, [sourceHtmlPath, targetPath]);
            
            await new Promise((resolve, reject) => {
                const node = spawn('node', [htmlToPdfScript, sourceHtmlPath, targetPath]);

                let errorOutput = '';

                node.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                node.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(errorOutput || 'Failed to convert HTML to PDF'));
                    }
                });

                node.on('error', (error) => {
                    reject(new Error(`Failed to start HTML to PDF conversion: ${error.message}`));
                });
            });
        }

        return 'Success';
    } catch (error) {
        console.error('Export error:', error);
        throw error;
    } finally {
        isExporting = false;
    }
});

// Handle directory selection
ipcMain.handle('select-directory', () => {
    return dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory']
    });
});

// Handle directory check
ipcMain.handle('check-directory', async (event, directoryPath) => {
    try {
        const files = await fs.readdir(directoryPath);
        return files;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
});

// Handle CONTENT_DIR check
ipcMain.handle('check-content-dir', async () => {
    try {
        const files = await fs.readdir(CONTENT_DIR);
        return files.length > 0;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
});

// Handle cataloging existing CONTENT_DIR
ipcMain.handle('catalog-content-dir', async () => {
    try {
        const structure = await catalog(CONTENT_DIR);
        return JSON.stringify(structure);
    } catch (error) {
        console.error('Error cataloging content directory:', error);
        throw error;
    }
});

// Handle clearing CONTENT_DIR
ipcMain.handle('clear-content-dir', async () => {
    try {
        // Check if directory exists
        try {
            await fs.access(CONTENT_DIR);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Directory doesn't exist, nothing to clear
                return true;
            }
            throw error;
        }

        // Read directory contents
        const files = await fs.readdir(CONTENT_DIR);
        
        // Delete all files and subdirectories
        for (const file of files) {
            const filePath = path.join(CONTENT_DIR, file);
            const stat = await fs.stat(filePath);
            
            if (stat.isDirectory()) {
                // Recursively delete directory
                await fs.rmdir(filePath, { recursive: true });
            } else {
                // Delete file
                await fs.unlink(filePath);
            }
        }
        
        console.log('Content directory cleared successfully');
        return true;
    } catch (error) {
        console.error('Error clearing content directory:', error);
        throw error;
    }
});

// Add to your existing IPC handlers
ipcMain.handle('export-to-pdf', async (event, { html, outputPath }) => {
  try {
    const htmlToMdScript = path.join(__dirname, '..', 'scripts', 'html-to-pdf.js');
    const tempHtmlPath = path.join(os.tmpdir(), `${Date.now()}.html`);
    
    // Write HTML to temp file
    await fs.writeFile(tempHtmlPath, html);
    
    // Convert to PDF using the script
    await new Promise((resolve, reject) => {
      const node = spawn('node', [htmlToMdScript, tempHtmlPath, outputPath]);

      let errorOutput = '';

      node.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      node.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(errorOutput || 'Failed to convert HTML to PDF'));
        }
      });

      node.on('error', (error) => {
        reject(new Error(`Failed to start HTML to PDF conversion: ${error.message}`));
      });
    });

    // Clean up temp file
    await fs.unlink(tempHtmlPath);
    
    return { success: true };
  } catch (error) {
    console.error('PDF export error:', error);
    return { success: false, error: error.message };
  }
});

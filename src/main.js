const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs').promises;
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

// Handle list notes request
ipcMain.handle('scan-notes', async () => {
    try {
        // Create temporary file path
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apple-notes-'));
        const outputPath = path.join(tempDir, 'notes-hierarchy.json');
        console.log('Created temporary file at:', outputPath);

        return await new Promise((resolve, reject) => {
            const scriptPath = path.join(__dirname, '..', 'scripts', 'list.applescript');
            logScriptExecution(scriptPath, [outputPath]);
            
            const osascript = spawn('osascript', [scriptPath, outputPath]);

            let errorOutput = '';

            osascript.stderr.on('data', (data) => {
                const output = data.toString();
                // Emit the script output event
                mainWindow.webContents.send('script-output', output);
                // Only treat as error if it's not an informational log
                if (!output.includes('Starting Notes export') && 
                    !output.includes('Found') && 
                    !output.includes('Processing') && 
                    !output.includes('Checking folder') && 
                    !output.includes('Folder path') && 
                    !output.includes('child folder') && 
                    !output.includes('notes in folder')) {
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
                        // Read the JSON file with explicit UTF-8 encoding and BOM handling
                        let jsonContent = await fs.readFile(outputPath, { encoding: 'utf8' });
                        
                        // Remove BOM if present
                        if (jsonContent.charCodeAt(0) === 0xFEFF) {
                            jsonContent = jsonContent.slice(1);
                        }
                        
                        console.log('Read JSON file content:', jsonContent);
                        
                        // Parse JSON and ensure proper encoding of special characters
                        const parsed = JSON.parse(jsonContent);
                        
                        // Convert the parsed object back to a JSON string with proper encoding
                        const jsonString = JSON.stringify(parsed, (key, value) => {
                            if (typeof value === 'string') {
                                // Ensure proper encoding of special characters
                                return value.normalize('NFC');
                            }
                            return value;
                        });
                        
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
ipcMain.handle('export-notes', async (event, [notePath, outputDir, format]) => {
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

    let tempDir = null;
    try {
        // Create temporary directory
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-export-'));
        console.log('Created temp directory:', tempDir);

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

        const scriptPath = path.join(__dirname, '..', 'scripts', 'export.applescript');
        logScriptExecution(scriptPath, [notePath, tempDir]);
        
        // Export to HTML in temp directory
        await new Promise((resolve, reject) => {
            const osascript = spawn('osascript', [
                scriptPath,
                notePath,
                tempDir
            ]);

            let errorOutput = '';
            let scriptOutput = '';

            osascript.stdout.on('data', (data) => {
                const output = data.toString();
                scriptOutput += output;
                console.log('Script output:', output.trim());
            });

            osascript.stderr.on('data', (data) => {
                const error = data.toString();
                if (!error.includes('Looking for') && 
                    !error.includes('Available') && 
                    !error.includes('Found target') &&
                    !error.includes('Created output') &&
                    !error.includes('Successfully created') &&
                    !error.includes('Opening file') &&
                    !error.includes('Writing note') &&
                    !error.includes('Closing file') &&
                    !error.includes('Export completed')) {
                    errorOutput += error;
                    console.error('AppleScript error:', error);
                }
            });

            osascript.on('close', (code) => {
                if (code === 0) {
                    if (scriptOutput.includes('Successfully exported')) {
                        resolve();
                    } else if (errorOutput) {
                        reject(new Error(errorOutput.trim()));
                    } else {
                        reject(new Error('Failed to export note - no success message received'));
                    }
                } else {
                    const error = errorOutput || scriptOutput || `Failed to export note: ${notePath}`;
                    reject(new Error(error.trim()));
                }
            });

            osascript.on('error', (error) => {
                reject(new Error(`Failed to start export for ${notePath}: ${error.message}`));
            });
        });

        // Get the HTML file name from the temp directory
        const files = await fs.readdir(tempDir);
        console.log('Files in temp directory:', files);
        
        const htmlFile = files.find(f => f.endsWith('.html'));
        if (!htmlFile) {
            throw new Error('HTML file not found in temp directory');
        }

        const tempFilePath = path.join(tempDir, htmlFile);
        console.log('Found HTML file at:', tempFilePath);

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
            // For HTML, just move the file to the right location
            console.log('Copying HTML file to:', targetPath);
            await fs.copyFile(tempFilePath, targetPath);
        } else if (exportFormat === 'markdown') {
            // For Markdown, convert the HTML file
            const htmlToMdScript = path.join(__dirname, '..', 'scripts', 'html-to-md.js');
            logScriptExecution(htmlToMdScript, [tempFilePath, targetPath]);
            
            await new Promise((resolve, reject) => {
                const node = spawn('node', [htmlToMdScript, tempFilePath, targetPath]);

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
            logScriptExecution(htmlToPdfScript, [tempFilePath, targetPath]);
            
            await new Promise((resolve, reject) => {
                const node = spawn('node', [htmlToPdfScript, tempFilePath, targetPath]);

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
        if (tempDir) {
            try {
                await fs.rm(tempDir, { recursive: true });
                console.log('Cleaned up temp directory:', tempDir);
            } catch (error) {
                console.error('Failed to clean up temp directory:', error);
            }
        }
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

// Make sure to cleanup when the app quits
app.on('before-quit', async () => {
  // Placeholder for the removed pdfExporter.cleanup()
}); 
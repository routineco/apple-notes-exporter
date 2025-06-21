const fs = require('fs').promises;
const path = require('path');

/**
 * Catalogs the directory structure of Apple Notes exports
 * @param {string} dirPath - The root directory path to scan
 * @returns {Promise<Object>} - Object with accounts, folders, subfolders, and notes
 */
async function catalog(dirPath) {
    const accounts = [];
    
    try {
        const accountDirs = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const accountDir of accountDirs) {
            if (accountDir.isDirectory()) {
                const accountPath = path.join(dirPath, accountDir.name);
                const account = {
                    name: accountDir.name,
                    folders: []
                };
                
                // Recursively process folders
                const processFolders = async (folderPath, parentName = '') => {
                    const items = await fs.readdir(folderPath, { withFileTypes: true });
                    const folders = [];
                    const notes = [];
                    
                    for (const item of items) {
                        const itemPath = path.join(folderPath, item.name);
                        
                        if (item.isDirectory()) {
                            const subfolderResult = await processFolders(itemPath, item.name);
                            folders.push({
                                name: item.name,
                                subfolders: subfolderResult.folders,
                                notes: subfolderResult.notes
                            });
                        } else if (item.isFile() && item.name.endsWith('.html')) {
                            try {
                                const stats = await fs.stat(itemPath);
                                const noteName = item.name.replace('.html', '').replace(/_/g, ' ');
                                notes.push({
                                    name: noteName,
                                    size: stats.size,
                                    path: itemPath
                                });
                            } catch (error) {
                                console.error(`Error getting stats for ${itemPath}:`, error);
                            }
                        }
                    }
                    
                    return { folders, notes };
                };
                
                const accountResult = await processFolders(accountPath);
                account.folders = accountResult.folders;
                
                // Add root-level notes if any
                if (accountResult.notes.length > 0) {
                    account.folders.unshift({
                        name: 'Root',
                        subfolders: [],
                        notes: accountResult.notes
                    });
                }
                
                accounts.push(account);
            }
        }
    } catch (error) {
        console.error('Error reading directory structure:', error);
    }
    
    return { accounts };
}

module.exports = { catalog }; 
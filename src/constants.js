const { app } = require('electron');
const path = require('path');

// Application data paths
const CONTENT_DIR = path.join(app.getPath('userData'), 'content');

module.exports = {
    CONTENT_DIR
}; 